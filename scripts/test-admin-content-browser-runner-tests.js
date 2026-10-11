"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
const { runBoundedProcess, runProcessEntrypoint, terminateProcessTree } = require("./test-admin-content-browser-runner.js");

async function test(name, operation) {
  try { await operation(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

function temporaryProfile(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `takhun-${label}-`));
  fs.writeFileSync(path.join(directory, "owned.txt"), "owned");
  return directory;
}

function waitForClose(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      if (error) reject(error); else resolve(value);
    };
    const onError = error => finish(error);
    const onClose = code => finish(null, code);
    const timer = setTimeout(() => finish(new Error(`Subprocess did not close within ${timeoutMs} ms.`)), timeoutMs);
    child.once("error", onError);
    child.once("close", onClose);
  });
}

function killOwnedPid(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return;
  try {
    if (process.platform === "win32") cp.spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 2000 });
    else process.kill(pid, "SIGKILL");
  } catch (_cleanupError) { /* The process may already have exited. */ }
}

(async () => {
  await test("bounded runner returns captured success and cleans only its profile", async () => {
    const profile = temporaryProfile("runner-success");
    const result = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('PASS')"], { timeoutMs: 2000, cleanupDir: profile });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "PASS");
    assert.equal(result.timedOut, false);
    assert.equal(fs.existsSync(profile), false);
  });

  await test("bounded runner preserves a real nonzero exit as failure evidence", async () => {
    const profile = temporaryProfile("runner-failure");
    const result = await runBoundedProcess(process.execPath, ["-e", "process.stderr.write('boom');process.exit(7)"], { timeoutMs: 2000, cleanupDir: profile });
    assert.equal(result.code, 7);
    assert.equal(result.stderr, "boom");
    assert.equal(result.timedOut, false);
    assert.equal(fs.existsSync(profile), false);
  });

  await test("timeout kills only the spawned process tree and reports failure", async () => {
    const sentinel = cp.spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { windowsHide: true, stdio: "ignore" });
    const profile = temporaryProfile("runner-timeout");
    try {
      const result = await runBoundedProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 150, cleanupDir: profile });
      assert.equal(result.timedOut, true);
      assert.equal(result.code, 124);
      assert.match(result.stderr, /timed out after 150 ms/);
      assert.equal(fs.existsSync(profile), false);
      assert.equal(sentinel.exitCode, null, "unrelated Node process must remain alive");
    } finally {
      await terminateProcessTree(sentinel);
    }
  });

  await test("termination deadline settles when taskkill succeeds but child never closes", async () => {
    const child = new EventEmitter(); child.pid = 12345; child.exitCode = null; child.kill = () => true;
    const killer = new EventEmitter();
    const started = Date.now(); let cleanups = 0;
    const resultPromise = runBoundedProcess("fake", [], { timeoutMs: 10, terminationTimeoutMs: 30,
      cleanup() { cleanups += 1; },
      spawn(command) { if (command === "fake") { child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); return child; } setTimeout(() => killer.emit("close", 0), 0); return killer; }
    });
    const result = await resultPromise;
    assert.equal(result.code, 125);
    assert.equal(result.timedOut, true);
    assert.match(result.stderr, /termination did not complete/i);
    assert.ok(Date.now() - started < 500, "secondary deadline must remain bounded");
    assert.equal(cleanups, 1, "runner settles and cleans exactly once");
    assert.equal(child.listenerCount("close"), 0);
    assert.equal(child.listenerCount("error"), 0);
  });

  await test("termination deadline bounds a hanging taskkill process", async () => {
    const child = new EventEmitter(); child.pid = 12346; child.exitCode = null; child.kill = () => true;
    const killer = new EventEmitter(); killer.exitCode = null; let killerKills = 0; killer.kill = () => { killerKills += 1; return true; };
    const result = await runBoundedProcess("fake", [], { timeoutMs: 10, terminationTimeoutMs: 30,
      spawn(command) { if (command === "fake") { child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); return child; } return killer; }
    });
    assert.equal(result.code, 125);
    assert.match(result.stderr, /termination did not complete/i);
    assert.equal(killerKills, 1, "runner must terminate its own hanging taskkill helper");
  });

  await test("real wrapper exits after an unconfirmed termination releases only its owned handles", async () => {
    const runnerPath = path.join(__dirname, "test-admin-content-browser-runner.js");
    const wrapperSource = `(async () => {
      const cp = require("node:child_process");
      const { EventEmitter } = require("node:events");
      const { runBoundedProcess } = require(${JSON.stringify(runnerPath)});
      const owned = cp.spawn(process.execPath, ["-e", "process.stdout.write('held');setInterval(()=>{},1000)"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      process.stdout.write("OWNED_PID=" + owned.pid + "\\n");
      owned.kill = () => false;
      const result = await runBoundedProcess("owned-target", [], {
        timeoutMs: 20,
        terminationTimeoutMs: 40,
        killChild() { return false; },
        spawn(command) {
          if (command === "owned-target") return owned;
          const taskkill = new EventEmitter();
          taskkill.exitCode = 0;
          taskkill.kill = () => false;
          setImmediate(() => taskkill.emit("close", 0));
          return taskkill;
        }
      });
      process.stdout.write("RESULT=" + JSON.stringify(result) + "\\n");
      process.exitCode = result.code;
    })().catch(error => { process.stderr.write(error.stack + "\\n"); process.exitCode = 1; });`;
    const wrapper = cp.spawn(process.execPath, ["--input-type=commonjs", "-e", wrapperSource], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", ownedPid = null;
    wrapper.stdout.on("data", chunk => {
      stdout += String(chunk);
      const match = stdout.match(/OWNED_PID=(\d+)/);
      if (match) ownedPid = Number(match[1]);
    });
    wrapper.stderr.on("data", chunk => { stderr += String(chunk); });
    try {
      const code = await waitForClose(wrapper, 4000);
      assert.equal(code, 125, `wrapper output: ${stdout}\n${stderr}`);
      assert.match(stdout, /"residualProcess":true/);
      assert.match(stdout, /termination did not complete/i);
    } finally {
      if (wrapper.exitCode === null) killOwnedPid(wrapper.pid);
      killOwnedPid(ownedPid);
    }
  });

  await test("real helper is bounded when the target closes first", async () => {
    const runnerPath = path.join(__dirname, "test-admin-content-browser-runner.js");
    const wrapperSource = `(async () => {
      const cp = require("node:child_process");
      const { runBoundedProcess } = require(${JSON.stringify(runnerPath)});
      const target = cp.spawn(process.execPath, ["-e", "setTimeout(()=>process.exit(0),80)"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      process.stdout.write("TARGET_PID=" + target.pid + "\\n");
      const result = await runBoundedProcess("owned-target", [], {
        timeoutMs: 20,
        terminationTimeoutMs: 500,
        killChild() { return false; },
        spawn(command) {
          if (command === "owned-target") return target;
          const helper = cp.spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
          process.stdout.write("HELPER_PID=" + helper.pid + "\\n");
          return helper;
        }
      });
      process.stdout.write("RESULT=" + JSON.stringify(result) + "\\n");
      process.exitCode = result.code;
    })().catch(error => { process.stderr.write(error.stack + "\\n"); process.exitCode = 1; });`;
    const wrapper = cp.spawn(process.execPath, ["--input-type=commonjs", "-e", wrapperSource], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", targetPid = null, helperPid = null;
    wrapper.stdout.on("data", chunk => {
      stdout += String(chunk);
      const targetMatch = stdout.match(/TARGET_PID=(\d+)/), helperMatch = stdout.match(/HELPER_PID=(\d+)/);
      if (targetMatch) targetPid = Number(targetMatch[1]);
      if (helperMatch) helperPid = Number(helperMatch[1]);
    });
    wrapper.stderr.on("data", chunk => { stderr += String(chunk); });
    try {
      const code = await waitForClose(wrapper, 4000);
      assert.equal(code, 124, `wrapper output: ${stdout}\n${stderr}`);
      assert.match(stdout, /"residualProcess":false/);
    } finally {
      if (wrapper.exitCode === null) killOwnedPid(wrapper.pid);
      killOwnedPid(targetPid);
      killOwnedPid(helperPid);
    }
  });

  await test("target-first close reports unconfirmed helper cleanup as 125", async () => {
    const child = new EventEmitter(); child.pid = 12348; child.exitCode = null; child.kill = () => false;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    const helper = new EventEmitter(); helper.pid = 22348; helper.exitCode = null; helper.kill = () => false;
    const resultPromise = runBoundedProcess("fake", [], { timeoutMs: 10, terminationTimeoutMs: 40,
      killChild() { return false; },
      spawn(command) { return command === "fake" ? child : helper; }
    });
    setTimeout(() => { child.exitCode = 0; child.emit("close", 0); }, 20);
    const result = await resultPromise;
    assert.equal(result.code, 125);
    assert.equal(result.residualProcess, true);
    assert.match(result.stderr, /termination helper cleanup did not complete/i);
    assert.equal(helper.listenerCount("close"), 0);
    assert.equal(helper.listenerCount("error"), 0);
  });

  await test("normal child close during termination settles before the secondary deadline", async () => {
    let directKills = 0; const child = new EventEmitter(); child.pid = 12347; child.exitCode = null; child.kill = () => { directKills += 1; return true; };
    const killer = new EventEmitter();
    const result = await runBoundedProcess("fake", [], { timeoutMs: 10, terminationTimeoutMs: 200,
      spawn(command) { if (command === "fake") { child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); return child; } setTimeout(() => { killer.emit("close", 1); child.exitCode = 1; child.emit("close", 1); }, 5); return killer; }
    });
    assert.equal(result.code, 124);
    assert.doesNotMatch(result.stderr, /termination did not complete/i);
    assert.equal(directKills, 1, "taskkill failure must fall back only to the owned child");
  });

  await test("duplicate and late target/helper events settle and clean exactly once", async () => {
    const child = new EventEmitter(); child.pid = 12349; child.exitCode = null; child.kill = () => true;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    const helper = new EventEmitter(); helper.pid = 22349; helper.exitCode = null; helper.kill = () => true;
    let cleanups = 0;
    const resultPromise = runBoundedProcess("fake", [], { timeoutMs: 10, terminationTimeoutMs: 200,
      cleanup() { cleanups += 1; },
      spawn(command) { return command === "fake" ? child : helper; }
    });
    setTimeout(() => {
      helper.exitCode = 0; helper.emit("close", 0); helper.emit("close", 0);
      child.exitCode = 0; child.emit("close", 0); child.emit("close", 0);
    }, 20);
    const result = await resultPromise;
    assert.equal(result.code, 124);
    assert.equal(result.residualProcess, false);
    assert.equal(cleanups, 1);
    assert.equal(child.listenerCount("close"), 0);
    assert.equal(child.listenerCount("error"), 0);
    assert.equal(helper.listenerCount("close"), 0);
    assert.equal(helper.listenerCount("error"), 0);
  });

  await test("residual profile cleanup failure is an explicit nonzero result", async () => {
    const result = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('PASS')"], {
      timeoutMs: 2000,
      cleanup() { throw new Error("profile remains"); }
    });
    assert.equal(result.code, 125);
    assert.equal(result.cleanupFailed, true);
    assert.match(result.stderr, /Profile cleanup failed: profile remains/);
  });

  await test("synchronous spawn and cleanup failures are both reported", async () => {
    await assert.rejects(
      runBoundedProcess("fake", [], {
        timeoutMs: 100,
        spawn() { throw new Error("simulated synchronous spawn failure"); },
        cleanup() { throw new Error("simulated profile cleanup failure"); }
      }),
      error => {
        assert.equal(error.exitCode, 125);
        assert.equal(error.spawnFailed, true);
        assert.equal(error.cleanupFailed, true);
        assert.deepEqual(error.failures, ["SPAWN_ERROR", "PROFILE_CLEANUP_FAILED"]);
        assert.match(error.message, /spawn failed/i);
        assert.match(error.message, /profile cleanup failed/i);
        return true;
      }
    );
  });

  await test("asynchronous child error and cleanup failures are both reported", async () => {
    const child = new EventEmitter();
    child.pid = undefined; child.exitCode = null;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    await assert.rejects(
      runBoundedProcess("fake", [], {
        timeoutMs: 100,
        spawn() { setImmediate(() => child.emit("error", new Error("simulated asynchronous spawn failure"))); return child; },
        cleanup() { throw new Error("simulated profile cleanup failure"); }
      }),
      error => {
        assert.equal(error.exitCode, 125);
        assert.equal(error.spawnFailed, true);
        assert.equal(error.cleanupFailed, true);
        assert.deepEqual(error.failures, ["SPAWN_ERROR", "PROFILE_CLEANUP_FAILED"]);
        assert.match(error.message, /spawn failed/i);
        assert.match(error.message, /profile cleanup failed/i);
        return true;
      }
    );
  });

  await test("spawn plus cleanup failure exits a real wrapper with status 125", async () => {
    const runnerPath = path.join(__dirname, "test-admin-content-browser-runner.js");
    const wrapperSource = `(async () => {
      const { runBoundedProcess } = require(${JSON.stringify(runnerPath)});
      await runBoundedProcess("fake", [], {
        timeoutMs: 100,
        spawn() { throw new Error("simulated synchronous spawn failure"); },
        cleanup() { throw new Error("simulated profile cleanup failure"); }
      });
    })().catch(error => {
      process.stderr.write(error.message + "\\n");
      process.exitCode = Number.isSafeInteger(error && error.exitCode) ? error.exitCode : 1;
    });`;
    const result = cp.spawnSync(process.execPath, ["--input-type=commonjs", "-e", wrapperSource], { windowsHide: true, encoding: "utf8", timeout: 4000 });
    assert.equal(result.status, 125, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Process spawn failed/);
    assert.match(result.stderr, /Profile cleanup failed/);
  });

  await test("production entrypoint mapping preserves runner codes and assertion diagnostics", async () => {
    const messages = [];
    const writeError = message => { messages.push(message); };
    assert.equal(await runProcessEntrypoint(async () => ({ code: 124, stderr: "confirmed timeout" }), () => { throw new Error("must not validate failures"); }, writeError), 124);
    assert.equal(await runProcessEntrypoint(async () => ({ code: 125, stderr: "residual process" }), () => { throw new Error("must not validate failures"); }, writeError), 125);
    assert.equal(await runProcessEntrypoint(async () => { const error = new Error("cleanup failed"); error.exitCode = 125; throw error; }, () => {}, writeError), 125);
    assert.equal(await runProcessEntrypoint(async () => ({ code: 0, stdout: "bad output", stderr: "" }), () => { throw new Error("browser assertion failed"); }, writeError), 1);
    assert.match(messages.join("\n"), /confirmed timeout/);
    assert.match(messages.join("\n"), /residual process/);
    assert.match(messages.join("\n"), /cleanup failed/);
    assert.match(messages.join("\n"), /browser assertion failed/);
  });

  await test("production entrypoint mapper drives real process exit statuses", async () => {
    const runnerPath = path.join(__dirname, "test-admin-content-browser-runner.js");
    for (const [scenario, expected] of [["timeout", 124], ["residual", 125], ["assertion", 1]]) {
      const source = `
        const { runProcessEntrypoint } = require(${JSON.stringify(runnerPath)});
        const scenario = ${JSON.stringify(scenario)};
        runProcessEntrypoint(
          async () => scenario === "timeout" ? { code: 124, stderr: "confirmed timeout" } : scenario === "residual" ? { code: 125, stderr: "unconfirmed termination" } : { code: 0, stderr: "" },
          () => { if (scenario === "assertion") throw new Error("browser assertion failed"); }
        ).then(code => { process.exitCode = code; });`;
      const result = cp.spawnSync(process.execPath, ["--input-type=commonjs", "-e", source], { windowsHide: true, encoding: "utf8", timeout: 4000 });
      assert.equal(result.status, expected, `${scenario}: ${result.stdout}\n${result.stderr}`);
      if (scenario === "timeout") assert.match(result.stderr, /confirmed timeout/);
      if (scenario === "residual") assert.match(result.stderr, /unconfirmed termination/);
      if (scenario === "assertion") assert.match(result.stderr, /browser assertion failed/);
    }
  });

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write("Admin native browser runner verification passed.\n");
})();
