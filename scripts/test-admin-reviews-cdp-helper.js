"use strict";

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const {
  CdpClient,
  validateLoopbackHttpUrl,
  validateLoopbackWebSocketUrl,
  fetchLoopbackJson
} = require("./test-admin-reviews-cdp.js");

async function test(name, fn) {
  try { await fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

(async () => {
  await test("CDP endpoint validators accept only loopback HTTP and WebSocket URLs", () => {
    assert.equal(validateLoopbackHttpUrl("http://127.0.0.1:9222/json/version").hostname, "127.0.0.1");
    assert.equal(validateLoopbackHttpUrl("http://[::1]:9222/json/version").hostname, "[::1]");
    assert.equal(validateLoopbackWebSocketUrl("ws://localhost:9222/devtools/browser/id").hostname, "localhost");
    for (const value of ["https://127.0.0.1/x", "http://example.com/x", "http://0.0.0.0/x", "file:///x"]) assert.throws(() => validateLoopbackHttpUrl(value));
    for (const value of ["wss://127.0.0.1/x", "ws://example.com/x", "ws://0.0.0.0/x", "http://127.0.0.1/x"]) assert.throws(() => validateLoopbackWebSocketUrl(value));
  });

  await test("CDP discovery rejects redirects and validates the returned WebSocket endpoint", async () => {
    let options;
    await assert.rejects(() => fetchLoopbackJson("http://127.0.0.1:9222/json/version", {
      timeoutMs: 100,
      fetchImpl: async (_url, received) => { options = received; return { status: 302, ok: false, headers: new Map([["location", "http://example.com/"]]) }; }
    }), /redirect/i);
    assert.equal(options.redirect, "manual");
    await assert.rejects(() => fetchLoopbackJson("http://127.0.0.1:9222/json/version", {
      timeoutMs: 100,
      fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ webSocketDebuggerUrl: "ws://example.com/devtools/browser/id" }) })
    }), /WebSocket.*loopback/i);
  });

  await test("closing CDP rejects pending commands and event waiters", async () => {
    class FakeSocket extends EventTarget {
      send() {}
      close() { this.dispatchEvent(new Event("close")); }
    }
    const client = new CdpClient(new FakeSocket(), 1000);
    const command = client.send("Runtime.evaluate");
    const event = client.waitForEvent("Page.loadEventFired");
    client.close();
    await assert.rejects(command, /closed/i);
    await assert.rejects(event, /closed/i);
  });

  await test("asynchronous browser spawn errors use controlled cleanup without lingering handles", () => {
    const helperPath = path.join(__dirname, "test-admin-reviews-cdp.js");
    const script = `
      "use strict";
      const cp = require("node:child_process");
      const fs = require("node:fs");
      const { EventEmitter } = require("node:events");
      let profile = "";
      cp.spawn = (_executable, args) => {
        profile = args.find(value => value.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
        const child = new EventEmitter();
        child.pid = undefined;
        child.exitCode = null;
        process.nextTick(() => child.emit("error", new Error("simulated asynchronous OS launch failure")));
        return child;
      };
      const { withCdpBrowser } = require(${JSON.stringify(helperPath)});
      (async () => {
        try {
          await withCdpBrowser("suite-browser.exe", { timeoutMs: 1000, commandTimeoutMs: 100 }, async () => {});
          throw new Error("spawn failure unexpectedly succeeded");
        } catch (error) {
          if (!/simulated asynchronous OS launch failure/.test(String(error && error.message))) throw error;
          if (!profile || fs.existsSync(profile)) throw new Error("suite-owned profile was not removed");
          process.stdout.write("CONTROLLED_SPAWN_ERROR_CLEANUP_OK\\n");
        }
      })().catch(error => { process.stderr.write(String(error && error.stack || error)); process.exitCode = 2; });
    `;
    const result = cp.spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 3000, windowsHide: true });
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, `subprocess status ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /CONTROLLED_SPAWN_ERROR_CLEANUP_OK/);
    assert.doesNotMatch(result.stderr, /Unhandled 'error' event|node:events/);
  });

  await test("synchronous browser spawn failures still remove their suite-owned profile", async () => {
    const { withCdpBrowser } = require("./test-admin-reviews-cdp.js");
    const fs = require("node:fs");
    let profile = "";
    await assert.rejects(() => withCdpBrowser("suite-browser.exe", {
      timeoutMs: 100,
      commandTimeoutMs: 100,
      spawn: (_executable, args) => {
        profile = args.find(value => value.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
        throw new Error("simulated synchronous OS launch failure");
      }
    }, async () => {}), /simulated synchronous OS launch failure/);
    assert.ok(profile);
    assert.equal(fs.existsSync(profile), false);
  });

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write("Admin Reviews CDP helper verification passed.\n");
})();
