"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
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
      assert.equal(result.code, null);
      assert.match(result.stderr, /timed out after 150 ms/);
      assert.equal(fs.existsSync(profile), false);
      assert.equal(sentinel.exitCode, null, "unrelated Node process must remain alive");
    } finally {
      await terminateProcessTree(sentinel);
    }
  });

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write("Admin native browser runner verification passed.\n");
})();
