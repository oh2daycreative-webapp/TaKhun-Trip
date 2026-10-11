"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

function safeCleanup(directory) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(temporaryRoot) || !path.basename(resolved).startsWith("takhun-")) {
    throw new Error("Refusing to clean a non-suite temporary directory.");
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function terminateProcessTree(child) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid < 1 || child.exitCode !== null) return Promise.resolve();
  if (process.platform !== "win32") {
    try { child.kill("SIGKILL"); } catch (_killError) { /* The process may already have exited. */ }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    const directKill = () => {
      if (child.exitCode === null) { try { child.kill("SIGKILL"); } catch (_killError) { /* Reported by the caller if close never follows. */ } }
      if (child.exitCode !== null) done();
    };
    child.once("close", done);
    const killer = cp.spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", directKill);
    killer.on("close", code => { if (code !== 0) directKill(); else if (child.exitCode !== null) done(); });
  });
}

function runBoundedProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) return Promise.reject(new Error("A positive timeout is required."));
  return new Promise((resolve, reject) => {
    let child;
    let stdout = "", stderr = "", timedOut = false, settled = false;
    function append(current, chunk) { const next = current + String(chunk); return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next; }
    function cleanup() { if (options.cleanupDir) safeCleanup(options.cleanupDir); }
    function finish(error, result) {
      if (settled) return;settled = true;clearTimeout(timer);
      try { cleanup(); } catch (cleanupError) { if (!error) error = cleanupError; }
      if (error) reject(error); else resolve(result);
    }
    try { child = cp.spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { try { cleanup(); } catch (_cleanupError) { /* Preserve spawn error. */ } reject(error); return; }
    child.stdout.on("data", chunk => { stdout = append(stdout, chunk); });
    child.stderr.on("data", chunk => { stderr = append(stderr, chunk); });
    child.on("error", error => finish(error));
    child.on("close", code => finish(null, { code: timedOut ? null : code, stdout, stderr, timedOut }));
    const timer = setTimeout(async () => {
      timedOut = true;
      stderr = append(stderr, `Process timed out after ${timeoutMs} ms.`);
      try { await terminateProcessTree(child); }
      catch (error) { finish(error); }
    }, timeoutMs);
  });
}

module.exports = { runBoundedProcess, terminateProcessTree };
