"use strict";

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const {
  CdpClient,
  CdpTargetSession,
  keyEventSpec,
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

  await test("CDP discovery cancellation covers pending fetch and already-aborted transitions", async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort(new Error("already cancelled"));
    let fetchCalls = 0;
    await assert.rejects(() => fetchLoopbackJson("http://127.0.0.1:9222/json/version", {
      timeoutMs: 1000,
      signal: alreadyAborted.signal,
      fetchImpl: async () => { fetchCalls++; }
    }), /already cancelled/);
    assert.equal(fetchCalls, 0);

    const pending = new AbortController();
    let underlyingAborted = false;
    const pendingFetch = fetchLoopbackJson("http://127.0.0.1:9222/json/version", {
      timeoutMs: 1000,
      signal: pending.signal,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          underlyingAborted = true;
          reject(options.signal.reason || new Error("fetch aborted"));
        }, { once: true });
      })
    });
    pending.abort(new Error("cancel pending fetch"));
    await assert.rejects(pendingFetch, /cancel pending fetch/);
    assert.equal(underlyingAborted, true);

    const betweenStages = new AbortController();
    let jsonCalls = 0;
    await assert.rejects(() => fetchLoopbackJson("http://127.0.0.1:9222/json/version", {
      timeoutMs: 1000,
      signal: betweenStages.signal,
      fetchImpl: async () => {
        betweenStages.abort(new Error("cancel between discovery stages"));
        return { status: 200, ok: true, json: async () => { jsonCalls++; return {}; } };
      }
    }), /cancel between discovery stages/);
    assert.equal(jsonCalls, 0);
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

  await test("non-flatten target sessions route commands responses events and closure through the browser transport", async () => {
    class FakeBrowserClient {
      constructor() { this.listeners=new Map();this.sent=[];this.innerId=0; }
      on(method,listener){if(!this.listeners.has(method))this.listeners.set(method,new Set());this.listeners.get(method).add(listener);}
      off(method,listener){const listeners=this.listeners.get(method);if(listeners)listeners.delete(listener);}
      emit(method,params){for(const listener of this.listeners.get(method)||[])listener({method,params});}
      async send(method,params){
        this.sent.push({method,params});
        assert.equal(method,"Target.sendMessageToTarget");
        assert.equal(params.sessionId,"SESSION-1");
        const inner=JSON.parse(params.message);this.innerId=inner.id;
        queueMicrotask(()=>this.emit("Target.receivedMessageFromTarget",{sessionId:"OTHER",message:JSON.stringify({id:inner.id,result:{wrong:true}})}));
        queueMicrotask(()=>this.emit("Target.receivedMessageFromTarget",{sessionId:"SESSION-1",message:JSON.stringify({id:inner.id,result:{enabled:true}})}));
        return {};
      }
    }
    const browser=new FakeBrowserClient(),session=new CdpTargetSession(browser,"SESSION-1",1000);
    assert.deepEqual(await session.send("Page.enable"),{enabled:true});
    assert.deepEqual(JSON.parse(browser.sent[0].params.message),{id:1,method:"Page.enable",params:{}});
    const event=session.waitForEvent("Page.loadEventFired",value=>value.marker===1,1000);
    browser.emit("Target.receivedMessageFromTarget",{sessionId:"SESSION-1",message:JSON.stringify({method:"Page.loadEventFired",params:{marker:0}})});
    browser.emit("Target.receivedMessageFromTarget",{sessionId:"SESSION-1",message:JSON.stringify({method:"Page.loadEventFired",params:{marker:1}})});
    assert.deepEqual(await event,{marker:1});
    const pending=session.send("Runtime.evaluate");
    session.close(new Error("target ended"));
    await assert.rejects(pending,/target ended/);
  });

  await test("non-flatten target sessions preserve protocol errors", async () => {
    const listeners=new Set(),browser={on(_method,listener){listeners.add(listener);},off(_method,listener){listeners.delete(listener);},async send(_method,params){const inner=JSON.parse(params.message);queueMicrotask(()=>{for(const listener of listeners)listener({params:{sessionId:"SESSION-2",message:JSON.stringify({id:inner.id,error:{code:-32000,message:"blocked"}})}});});return{};}};
    const session=new CdpTargetSession(browser,"SESSION-2",1000);
    await assert.rejects(session.send("Page.enable"),/CDP Page\.enable failed: blocked/);
    session.close();
  });

  await test("native key routing distinguishes Tab from Space and Enter", () => {
    assert.deepEqual(keyEventSpec("Tab"),{key:"Tab",code:"Tab",keyIdentifier:"U+0009",windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
    assert.equal(keyEventSpec("Enter").windowsVirtualKeyCode,13);
    assert.equal(keyEventSpec("Space").windowsVirtualKeyCode,32);
    assert.throws(()=>keyEventSpec("Escape"),/Unsupported CDP key/);
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

  await test("delayed browser error cancels pending discovery JSON without retaining its deadline", () => {
    const helperPath = path.join(__dirname, "test-admin-reviews-cdp.js");
    const script = `
      "use strict";
      const cp = require("node:child_process");
      const fs = require("node:fs");
      const path = require("node:path");
      const { EventEmitter } = require("node:events");
      let profile = "", caughtAt = 0;
      global.fetch = async (_url, options) => ({
        status: 200,
        ok: true,
        json: () => {
          process.stdout.write("JSON_PENDING\\n");
          return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason || new Error("HTTP body aborted")), { once: true }));
        }
      });
      cp.spawn = (_executable, args) => {
        profile = args.find(value => value.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
        fs.writeFileSync(path.join(profile, "DevToolsActivePort"), "9222\\n");
        const child = new EventEmitter();
        child.pid = undefined;
        child.exitCode = null;
        setTimeout(() => child.emit("error", new Error("simulated delayed child error during JSON")), 150);
        return child;
      };
      const { withCdpBrowser } = require(${JSON.stringify(helperPath)});
      (async () => {
        try {
          await withCdpBrowser("suite-browser.exe", { timeoutMs: 1400, commandTimeoutMs: 100 }, async () => {});
          throw new Error("delayed spawn failure unexpectedly succeeded");
        } catch (error) {
          caughtAt = Date.now();
          if (!/simulated delayed child error during JSON/.test(String(error && error.message))) throw error;
          if (!profile || fs.existsSync(profile)) throw new Error("suite-owned profile was not removed");
          process.stdout.write("CONTROLLED_DELAYED_ERROR_CLEANUP_OK\\n");
        }
      })().catch(error => { process.stderr.write(String(error && error.stack || error)); process.exitCode = 2; });
      process.on("beforeExit", () => {
        if (!caughtAt) return;
        const afterErrorMs = Date.now() - caughtAt;
        process.stdout.write("ERROR_TO_EXIT_MS=" + afterErrorMs + "\\n");
        if (afterErrorMs >= 500) process.exitCode = 3;
      });
    `;
    const result = cp.spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, `subprocess status ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /JSON_PENDING/);
    assert.match(result.stdout, /CONTROLLED_DELAYED_ERROR_CLEANUP_OK/);
    const timing = /ERROR_TO_EXIT_MS=(\d+)/.exec(result.stdout);
    assert.ok(timing, `missing error-to-exit timing\n${result.stdout}`);
    assert.ok(Number(timing[1]) < 500, `process retained discovery work for ${timing[1]} ms after the controlled error`);
    assert.doesNotMatch(result.stderr, /Unhandled 'error' event|node:events/);
  });

  await test("delayed browser error cancels the transition from discovery to CDP", () => {
    const helperPath = path.join(__dirname, "test-admin-reviews-cdp.js");
    const script = `
      "use strict";
      const cp = require("node:child_process");
      const fs = require("node:fs");
      const path = require("node:path");
      const { EventEmitter } = require("node:events");
      let profile = "", caughtAt = 0;
      global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/test" }) });
      global.WebSocket = class extends EventTarget {
        constructor() { super(); this.hold = setTimeout(() => {}, 1400); process.stdout.write("CDP_CONNECT_PENDING\\n"); }
        close() { clearTimeout(this.hold); this.dispatchEvent(new Event("close")); }
      };
      cp.spawn = (_executable, args) => {
        profile = args.find(value => value.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
        fs.writeFileSync(path.join(profile, "DevToolsActivePort"), "9222\\n");
        const child = new EventEmitter(); child.pid = undefined; child.exitCode = null;
        setTimeout(() => child.emit("error", new Error("simulated delayed child error during CDP connect")), 150);
        return child;
      };
      const { withCdpBrowser } = require(${JSON.stringify(helperPath)});
      (async () => {
        try {
          await withCdpBrowser("suite-browser.exe", { timeoutMs: 1400, commandTimeoutMs: 1400 }, async () => {});
          throw new Error("CDP transition failure unexpectedly succeeded");
        } catch (error) {
          caughtAt = Date.now();
          if (!/simulated delayed child error during CDP connect/.test(String(error && error.message))) throw error;
          if (!profile || fs.existsSync(profile)) throw new Error("suite-owned profile was not removed");
          process.stdout.write("CONTROLLED_CDP_TRANSITION_ERROR_OK\\n");
        }
      })().catch(error => { process.stderr.write(String(error && error.stack || error)); process.exitCode = 2; });
      process.on("beforeExit", () => {
        if (!caughtAt) return;
        const afterErrorMs = Date.now() - caughtAt;
        process.stdout.write("CDP_ERROR_TO_EXIT_MS=" + afterErrorMs + "\\n");
        if (afterErrorMs >= 500) process.exitCode = 3;
      });
    `;
    const result = cp.spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, `subprocess status ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /CDP_CONNECT_PENDING/);
    assert.match(result.stdout, /CONTROLLED_CDP_TRANSITION_ERROR_OK/);
    const timing = /CDP_ERROR_TO_EXIT_MS=(\d+)/.exec(result.stdout);
    assert.ok(timing && Number(timing[1]) < 500, `CDP transition retained work after the controlled error\n${result.stdout}`);
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
