"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const TIMEOUT_EXIT_CODE = 124;
const TERMINATION_EXIT_CODE = 125;
const DEFAULT_TERMINATION_TIMEOUT_MS = 2000;

function safeCleanup(directory) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(temporaryRoot) || !path.basename(resolved).startsWith("takhun-")) {
    throw new Error("Refusing to clean a non-suite temporary directory.");
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (fs.existsSync(resolved)) throw new Error("Suite temporary directory still exists after cleanup.");
}

function releaseStream(stream, dataListener) {
  if (!stream) return;
  if (dataListener && typeof stream.removeListener === "function") stream.removeListener("data", dataListener);
  if (typeof stream.destroy === "function") { try { stream.destroy(); } catch (_destroyError) { /* Best-effort release of a suite-owned stream. */ } }
  if (typeof stream.unref === "function") { try { stream.unref(); } catch (_unrefError) { /* Best-effort release of a suite-owned stream. */ } }
}

function releaseOwnedProcessHandles(child, listeners = {}) {
  if (!child) return;
  if (typeof child.removeListener === "function") {
    if (listeners.error) child.removeListener("error", listeners.error);
    if (listeners.close) child.removeListener("close", listeners.close);
  }
  releaseStream(child.stdout, listeners.stdout);
  releaseStream(child.stderr, listeners.stderr);
  releaseStream(child.stdin);
  if (child.connected && typeof child.disconnect === "function") { try { child.disconnect(); } catch (_disconnectError) { /* Best-effort release of suite-owned IPC. */ } }
  if (typeof child.unref === "function") { try { child.unref(); } catch (_unrefError) { /* Best-effort release of a suite-owned child handle. */ } }
}

function spawnFailure(primaryError, cleanupError) {
  const error = new Error(cleanupError ? "Process spawn failed. Profile cleanup failed." : "Process spawn failed.");
  error.name = "BrowserRunnerError";
  error.exitCode = cleanupError ? TERMINATION_EXIT_CODE : 1;
  error.spawnFailed = true;
  error.cleanupFailed = Boolean(cleanupError);
  error.failures = cleanupError ? ["SPAWN_ERROR", "PROFILE_CLEANUP_FAILED"] : ["SPAWN_ERROR"];
  error.spawnCause = primaryError && primaryError.code ? String(primaryError.code) : "SPAWN_ERROR";
  error.cleanupCause = cleanupError ? "PROFILE_CLEANUP_FAILED" : null;
  return error;
}

async function runProcessEntrypoint(operation, validate, writeError = message => process.stderr.write(message)) {
  try {
    const result = await operation();
    if (!result || !Number.isSafeInteger(result.code)) throw new Error("Browser runner returned an invalid result.");
    if (result.code !== 0) {
      if (result.stderr) writeError(`${result.stderr}\n`);
      return result.code;
    }
    validate(result);
    return 0;
  } catch (error) {
    writeError(`${error && (error.stack || error.message) || error}\n`);
    return Number.isSafeInteger(error && error.exitCode) ? error.exitCode : 1;
  }
}

function terminateProcessTree(child, options = {}) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid < 1 || child.exitCode !== null) return Promise.resolve({ ok: true });
  const spawn = options.spawn || cp.spawn;
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TERMINATION_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false, killer = null, deadline = null;
    let targetClosed = child.exitCode !== null, helperClosed = false, helperKillAttempted = false;
    const settle = (ok, error) => {
      if (settled) return;
      settled = true;
      if (deadline !== null) clearTimeout(deadline);
      child.removeListener("close", onChildClose);
      if (killer) {
        killer.removeListener("error", onKillerError);
        killer.removeListener("close", onKillerClose);
        releaseOwnedProcessHandles(killer);
      }
      resolve({ ok, error });
    };
    const stopHelper = () => {
      if (!killer || helperClosed || helperKillAttempted || killer.exitCode !== null) return;
      helperKillAttempted = true;
      try { killer.kill("SIGKILL"); } catch (_killerError) { /* The deadline reports unconfirmed cleanup. */ }
    };
    const maybeSettle = () => {
      if (targetClosed && (!killer || helperClosed)) settle(true);
    };
    const onChildClose = () => {
      targetClosed = true;
      stopHelper();
      maybeSettle();
    };
    const directKill = () => {
      if (child.exitCode === null) {
        try {
          if (typeof options.killChild === "function") options.killChild(child);
          else child.kill("SIGKILL");
        } catch (_killError) { /* Reported by the caller if close never follows. */ }
      }
      if (child.exitCode !== null) {
        targetClosed = true;
        stopHelper();
        maybeSettle();
      }
    };
    const onKillerError = () => {
      if (!Number.isSafeInteger(killer && killer.pid)) helperClosed = true;
      directKill();
      maybeSettle();
    };
    const onKillerClose = code => {
      helperClosed = true;
      if (code !== 0) directKill();
      if (child.exitCode !== null) targetClosed = true;
      maybeSettle();
    };
    deadline = setTimeout(() => {
      stopHelper();
      directKill();
      const error = targetClosed && killer && !helperClosed
        ? `Termination helper cleanup did not complete within ${timeoutMs} ms.`
        : `Process termination did not complete within ${timeoutMs} ms.`;
      settle(false, error);
    }, timeoutMs);
    child.once("close", onChildClose);
    if (process.platform !== "win32") { directKill(); return; }
    try {
      killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.once("error", onKillerError);
      killer.once("close", onKillerClose);
    } catch (_taskkillError) { directKill(); }
  });
}

function runBoundedProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) return Promise.reject(new Error("A positive timeout is required."));
  return new Promise((resolve, reject) => {
    let child, timer = null;
    let stdout = "", stderr = "", timedOut = false, terminating = false, settled = false;
    const spawn = options.spawn || cp.spawn;
    const onStdout = chunk => { stdout = append(stdout, chunk); };
    const onStderr = chunk => { stderr = append(stderr, chunk); };
    function append(current, chunk) { const next = current + String(chunk); return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next; }
    function cleanup() { if (typeof options.cleanup === "function") options.cleanup(); else if (options.cleanupDir) safeCleanup(options.cleanupDir); }
    function detachChildListeners() {
      if (!child) return;
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      if (child.stdout && typeof child.stdout.removeListener === "function") child.stdout.removeListener("data", onStdout);
      if (child.stderr && typeof child.stderr.removeListener === "function") child.stderr.removeListener("data", onStderr);
    }
    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      detachChildListeners();
      try { cleanup(); }
      catch (cleanupError) {
        result.code = TERMINATION_EXIT_CODE;
        result.stderr = append(result.stderr, `\nProfile cleanup failed: ${cleanupError && cleanupError.message || "unknown error"}`);
        result.cleanupFailed = true;
      }
      resolve(result);
    }
    function onError(error) {
      if (settled || terminating) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      detachChildListeners();
      releaseOwnedProcessHandles(child, { stdout: onStdout, stderr: onStderr });
      let cleanupError = null;
      try { cleanup(); } catch (caughtCleanupError) { cleanupError = caughtCleanupError; }
      reject(spawnFailure(error, cleanupError));
    }
    function onClose(code) {
      if (settled || terminating) return;
      finish({ code, stdout, stderr, timedOut: false, cleanupFailed: false });
    }
    try { child = spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) {
      let cleanupError = null;
      try { cleanup(); } catch (caughtCleanupError) { cleanupError = caughtCleanupError; }
      reject(spawnFailure(error, cleanupError));
      return;
    }
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("close", onClose);
    timer = setTimeout(async () => {
      if (settled) return;
      timedOut = true;
      terminating = true;
      stderr = append(stderr, `Process timed out after ${timeoutMs} ms.`);
      const termination = await terminateProcessTree(child, { spawn, killChild: options.killChild, timeoutMs: options.terminationTimeoutMs });
      if (!termination.ok) stderr = append(stderr, `\n${termination.error}`);
      if (!termination.ok) releaseOwnedProcessHandles(child, { error: onError, close: onClose, stdout: onStdout, stderr: onStderr });
      finish({ code: termination.ok ? TIMEOUT_EXIT_CODE : TERMINATION_EXIT_CODE, stdout, stderr, timedOut, cleanupFailed: false, residualProcess: !termination.ok });
    }, timeoutMs);
  });
}

module.exports = { runBoundedProcess, runProcessEntrypoint, terminateProcessTree };
