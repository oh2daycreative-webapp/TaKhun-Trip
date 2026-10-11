"use strict";

const assert = require("node:assert/strict");
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

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write("Admin Reviews CDP helper verification passed.\n");
})();
