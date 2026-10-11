"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
const { runBoundedProcess, terminateProcessTree } = require("./test-admin-content-browser-runner.js");

async function test(name, operation) {
  try { await operation(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

function temporaryProfile(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `takhun-${label}-`));
  fs.writeFileSync(path.join(directory, "owned.txt"), "owned");
  return directory;
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

  await test("residual profile cleanup failure is an explicit nonzero result", async () => {
    const result = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('PASS')"], {
      timeoutMs: 2000,
      cleanup() { throw new Error("profile remains"); }
    });
    assert.equal(result.code, 125);
    assert.equal(result.cleanupFailed, true);
    assert.match(result.stderr, /Profile cleanup failed: profile remains/);
  });

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write("Admin native browser runner verification passed.\n");
})();
