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

function terminateProcessTree(child, options = {}) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid < 1 || child.exitCode !== null) return Promise.resolve({ ok: true });
  const spawn = options.spawn || cp.spawn;
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TERMINATION_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false, killer = null;
    const settle = (ok, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      child.removeListener("close", onChildClose);
      if (killer) { killer.removeListener("error", onKillerError); killer.removeListener("close", onKillerClose); }
      resolve({ ok, error });
    };
    const onChildClose = () => settle(true);
    const directKill = () => {
      if (child.exitCode === null) { try { child.kill("SIGKILL"); } catch (_killError) { /* Reported by the caller if close never follows. */ } }
      if (child.exitCode !== null) settle(true);
    };
    const onKillerError = () => directKill();
    const onKillerClose = code => { if (code !== 0) directKill(); else if (child.exitCode !== null) settle(true); };
    const deadline = setTimeout(() => {
      if (killer && killer.exitCode === null) { try { killer.kill("SIGKILL"); } catch (_killerError) { /* Deadline result remains authoritative. */ } }
      directKill();
      settle(false, `Process termination did not complete within ${timeoutMs} ms.`);
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
    function append(current, chunk) { const next = current + String(chunk); return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next; }
    function cleanup() { if (typeof options.cleanup === "function") options.cleanup(); else if (options.cleanupDir) safeCleanup(options.cleanupDir); }
    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
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
      try { cleanup(); } catch (_cleanupError) { /* Preserve the spawn error. */ }
      settled = true;
      if (timer !== null) clearTimeout(timer);
      reject(error);
    }
    function onClose(code) {
      if (settled || terminating) return;
      finish({ code, stdout, stderr, timedOut: false, cleanupFailed: false });
    }
    try { child = spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { try { cleanup(); } catch (_cleanupError) { /* Preserve spawn error. */ } reject(error); return; }
    child.stdout.on("data", chunk => { stdout = append(stdout, chunk); });
    child.stderr.on("data", chunk => { stderr = append(stderr, chunk); });
    child.once("error", onError);
    child.once("close", onClose);
    timer = setTimeout(async () => {
      if (settled) return;
      timedOut = true;
      terminating = true;
      stderr = append(stderr, `Process timed out after ${timeoutMs} ms.`);
      const termination = await terminateProcessTree(child, { spawn, timeoutMs: options.terminationTimeoutMs });
      if (!termination.ok) stderr = append(stderr, `\n${termination.error}`);
      finish({ code: termination.ok ? TIMEOUT_EXIT_CODE : TERMINATION_EXIT_CODE, stdout, stderr, timedOut, cleanupFailed: false });
    }, timeoutMs);
  });
}

module.exports = { runBoundedProcess, terminateProcessTree };
