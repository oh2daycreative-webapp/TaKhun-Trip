"use strict";

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const {
  CdpClient,
  CdpTargetSession,
  createActivePageTarget,
  keyEventSpec,
  validateLoopbackHttpUrl,
  validateLoopbackWebSocketUrl,
  fetchLoopbackJson
} = require("./test-admin-reviews-cdp.js");

async function test(name, fn) {
  try { await fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

class RoutedSocket extends EventTarget {
  constructor(options={}) { super();this.sent=[];this.sendCount=0;this.autoAck=options.autoAck!==false; }
  send(raw) {
    this.sendCount+=1;
    const message=JSON.parse(raw);this.sent.push(message);
    if(this.autoAck)queueMicrotask(()=>this.frame({id:message.id,result:{}}));
  }
  frame(message) { this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(message)})); }
  fail() { this.dispatchEvent(new Event("error")); }
  close() { this.dispatchEvent(new Event("close")); }
}

function targetFrame(socket,sessionId,inner) {
  socket.frame({method:"Target.receivedMessageFromTarget",params:{sessionId,message:JSON.stringify(inner)}});
}

function innerCommand(socket,index=socket.sent.length-1) {
  return JSON.parse(socket.sent[index].params.message);
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

  await test("post-shutdown client operations retain the first cause and create no work", async () => {
    const socket=new RoutedSocket(),client=new CdpClient(socket,20),cause=new Error("first causal shutdown");
    client.shutdown(cause);client.shutdown(new Error("later shutdown"));client.close();
    const sent=client.send("Target.getTargets"),event=client.waitForEvent("Target.targetCreated");
    const sentError=sent.catch(error=>error),eventError=event.catch(error=>error);
    assert.equal(socket.sendCount,0);assert.equal(client.pending.size,0);assert.equal(client.eventWaiters.size,0);
    assert.equal(client.listeners.size,0);assert.equal(client.shutdownListeners.size,0);assert.equal(client.shutdownError,cause);
    assert.equal(await sentError,cause);assert.equal(await eventError,cause);
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

  await test("serialized production routing correlates target responses events and duplicate frames", async () => {
    const socket=new RoutedSocket(),browser=new CdpClient(socket,1000),session=new CdpTargetSession(browser,"SESSION-ROUTED",1000);
    const command=session.send("Page.enable"),inner=innerCommand(socket);
    targetFrame(socket,"OTHER",{id:inner.id,result:{wrong:true}});assert.equal(session.pending.size,1);
    targetFrame(socket,"SESSION-ROUTED",{id:inner.id,result:{enabled:true}});
    targetFrame(socket,"SESSION-ROUTED",{id:inner.id,result:{duplicate:true}});
    assert.deepEqual(await command,{enabled:true});
    const event=session.waitForEvent("Page.loadEventFired",value=>value.marker===1,1000);
    targetFrame(socket,"SESSION-ROUTED",{method:"Page.loadEventFired",params:{marker:0}});
    targetFrame(socket,"SESSION-ROUTED",{method:"Page.loadEventFired",params:{marker:1}});
    targetFrame(socket,"SESSION-ROUTED",{method:"Page.loadEventFired",params:{marker:2}});
    assert.deepEqual(await event,{marker:1});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(browser.pending.size,0);assert.equal(session.pending.size,0);assert.equal(session.eventWaiters.size,0);
    session.close();browser.shutdown();
  });

  await test("serialized matching detach closes only its target session and releases production subscriptions", async () => {
    const socket=new RoutedSocket(),browser=new CdpClient(socket,1000),session=new CdpTargetSession(browser,"SESSION-DETACH-ROUTED",1000);
    const command=session.send("Page.enable"),event=session.waitForEvent("Page.loadEventFired");
    const commandError=command.catch(error=>error),eventError=event.catch(error=>error);
    socket.frame({method:"Target.detachedFromTarget",params:{sessionId:"OTHER"}});assert.equal(session.closed,false);
    socket.frame({method:"Target.detachedFromTarget",params:{sessionId:"SESSION-DETACH-ROUTED",reason:"target_closed"}});
    assert.match((await commandError).message,/target session detached/i);assert.match((await eventError).message,/target session detached/i);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(session.closed,true);assert.equal(session.pending.size,0);assert.equal(session.eventWaiters.size,0);
    assert.equal(browser.pending.size,0);assert.equal(browser.shutdownListeners.size,0);
    assert.equal(browser.listeners.has("Target.receivedMessageFromTarget"),false);assert.equal(browser.listeners.has("Target.detachedFromTarget"),false);
    browser.shutdown();
  });

  await test("serialized timeout ignores a late response and a later command still correlates", async () => {
    const socket=new RoutedSocket(),browser=new CdpClient(socket,20),session=new CdpTargetSession(browser,"SESSION-TIMEOUT",20);
    const timed=session.send("Page.enable"),first=innerCommand(socket);
    await assert.rejects(timed,/Page\.enable timed out/);
    targetFrame(socket,"SESSION-TIMEOUT",{id:first.id,result:{late:true}});
    const next=session.send("Runtime.enable"),second=innerCommand(socket);
    targetFrame(socket,"SESSION-TIMEOUT",{id:second.id,result:{enabled:true}});
    assert.deepEqual(await next,{enabled:true});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(browser.pending.size,0);assert.equal(session.pending.size,0);assert.equal(session.eventWaiters.size,0);
    session.close();browser.shutdown();
  });

  await test("serialized outer rejection rejects the inner command once and clears both pending maps", async () => {
    const socket=new RoutedSocket({autoAck:false}),browser=new CdpClient(socket,1000),session=new CdpTargetSession(browser,"SESSION-OUTER-ROUTED",1000);
    const command=session.send("Page.enable"),outer=socket.sent[0];
    socket.frame({id:outer.id,error:{code:-32000,message:"outer blocked"}});
    await assert.rejects(command,/Target\.sendMessageToTarget failed: outer blocked/);
    assert.equal(browser.pending.size,0);assert.equal(session.pending.size,0);
    session.close();browser.shutdown();
  });

  await test("serialized detach and transport shutdown races preserve the first target cause and settle once", async () => {
    const socket=new RoutedSocket(),browser=new CdpClient(socket,1000),session=new CdpTargetSession(browser,"SESSION-RACE-ROUTED",1000);
    const command=session.send("Page.enable"),event=session.waitForEvent("Page.loadEventFired");
    const commandError=command.catch(error=>error),eventError=event.catch(error=>error);
    socket.frame({method:"Target.detachedFromTarget",params:{sessionId:"SESSION-RACE-ROUTED"}});socket.fail();socket.close();
    assert.match((await commandError).message,/target session detached/i);assert.match((await eventError).message,/target session detached/i);
    assert.match(session.closeError.message,/target session detached/i);assert.match(browser.shutdownError.message,/WebSocket failed/i);
    assert.equal(browser.pending.size,0);assert.equal(browser.eventWaiters.size,0);assert.equal(browser.listeners.size,0);assert.equal(browser.shutdownListeners.size,0);
    assert.equal(session.pending.size,0);assert.equal(session.eventWaiters.size,0);assert.equal(session.listeners.size,0);
  });

  await test("matching target detach immediately rejects pending command and event while other sessions are ignored", async () => {
    const listeners=new Map(),browser={closed:false,on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);},off(method,listener){const set=listeners.get(method);if(set)set.delete(listener);},onShutdown(){},offShutdown(){},async send(){return{};}};
    const emit=(method,params)=>{for(const listener of listeners.get(method)||[])listener({method,params});};
    const session=new CdpTargetSession(browser,"SESSION-DETACH",1000);
    const command=session.send("Page.enable"),event=session.waitForEvent("Page.loadEventFired");
    const commandRejected=assert.rejects(command,/target session detached/i),eventRejected=assert.rejects(event,/target session detached/i);
    emit("Target.detachedFromTarget",{sessionId:"OTHER"});
    assert.equal(session.closed,false);
    emit("Target.detachedFromTarget",{sessionId:"SESSION-DETACH",reason:"target_closed"});
    await Promise.all([commandRejected,eventRejected]);
    assert.equal(session.closed,true);
    assert.equal(session.pending.size,0);assert.equal(session.eventWaiters.size,0);
  });

  await test("browser transport close propagates its cause after outer acknowledgement", async () => {
    class FakeSocket extends EventTarget {
      send(raw){const message=JSON.parse(raw);queueMicrotask(()=>this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify({id:message.id,result:{}})})));}
      close(){this.dispatchEvent(new Event("close"));}
    }
    const socket=new FakeSocket(),browser=new CdpClient(socket,1000),session=new CdpTargetSession(browser,"SESSION-CLOSE",1000);
    const command=session.send("Page.enable"),event=session.waitForEvent("Page.loadEventFired");
    const commandRejected=assert.rejects(command,/WebSocket closed/i),eventRejected=assert.rejects(event,/WebSocket closed/i);
    await new Promise(resolve=>setImmediate(resolve));
    socket.dispatchEvent(new Event("close"));
    await Promise.all([commandRejected,eventRejected]);
    assert.equal(session.closed,true);
    assert.equal(browser.shutdownListeners.size,0);
  });

  await test("browser transport error and already-closed setup retain the causal failure", async () => {
    class FakeSocket extends EventTarget { send(){} close(){} }
    const socket=new FakeSocket(),browser=new CdpClient(socket,1000),session=new CdpTargetSession(browser,"SESSION-ERROR",1000);
    const pending=session.send("Runtime.evaluate"),event=session.waitForEvent("Runtime.executionContextCreated");
    const pendingRejected=assert.rejects(pending,/WebSocket failed/i),eventRejected=assert.rejects(event,/WebSocket failed/i);
    socket.dispatchEvent(new Event("error"));
    await Promise.all([pendingRejected,eventRejected]);
    const lateSession=new CdpTargetSession(browser,"SESSION-LATE",1000);
    await assert.rejects(lateSession.send("Page.enable"),/WebSocket failed/i);
    assert.equal(lateSession.closed,true);
  });

  await test("outer send rejection immediately clears target pending work", async () => {
    const listeners=new Map(),failure=new Error("outer send rejected"),browser={closed:false,on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);},off(method,listener){const set=listeners.get(method);if(set)set.delete(listener);},onShutdown(){},offShutdown(){},send(){return Promise.reject(failure);}};
    const session=new CdpTargetSession(browser,"SESSION-OUTER",1000);
    await assert.rejects(session.send("Page.enable"),error=>error===failure);
    assert.equal(session.pending.size,0);
    session.close();
  });

  await test("a synchronous production transport send failure clears outer and inner pending work", async () => {
    const failure=new Error("socket send failed");
    class ThrowingSocket extends EventTarget { send(){throw failure;}close(){} }
    const browser=new CdpClient(new ThrowingSocket(),1000),session=new CdpTargetSession(browser,"SESSION-SEND",1000);
    await assert.rejects(session.send("Page.enable"),error=>error===failure);
    assert.equal(browser.pending.size,0);assert.equal(session.pending.size,0);
    session.close();browser.close();
  });

  await test("target command timeout ignores late and duplicate responses without retaining listeners", async () => {
    const listeners=new Map(),messages=[],browser={closed:false,on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);},off(method,listener){const set=listeners.get(method);if(set)set.delete(listener);},onShutdown(){},offShutdown(){},async send(_method,params){messages.push(JSON.parse(params.message));return{};}};
    const emit=inner=>{for(const listener of listeners.get("Target.receivedMessageFromTarget")||[])listener({params:{sessionId:"SESSION-LATE",message:JSON.stringify(inner)}});};
    const session=new CdpTargetSession(browser,"SESSION-LATE",20);
    await assert.rejects(session.send("Page.enable"),/timed out/);
    emit({id:messages[0].id,result:{late:true}});
    const next=session.send("Runtime.enable");
    emit({id:messages[1].id,result:{ok:true}});emit({id:messages[1].id,result:{duplicate:true}});
    assert.deepEqual(await next,{ok:true});assert.equal(session.pending.size,0);
    const event=session.waitForEvent("Page.loadEventFired",()=>true,1000);
    emit({method:"Page.loadEventFired",params:{marker:1}});emit({method:"Page.loadEventFired",params:{marker:2}});
    assert.deepEqual(await event,{marker:1});assert.equal(session.eventWaiters.size,0);
    session.close();
  });

  await test("close detach and shutdown races are idempotent and release every subscription", () => {
    const listeners=new Map(),shutdown=new Set(),browser={closed:false,on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);},off(method,listener){const set=listeners.get(method);if(set)set.delete(listener);},onShutdown(listener){shutdown.add(listener);},offShutdown(listener){shutdown.delete(listener);},async send(){return{};}};
    const session=new CdpTargetSession(browser,"SESSION-RACE",1000);
    session.close(new Error("manual close"));session.close(new Error("duplicate close"));
    for(const listener of shutdown)listener(new Error("late shutdown"));
    for(const listener of listeners.get("Target.detachedFromTarget")||[])listener({params:{sessionId:"SESSION-RACE"}});
    assert.equal((listeners.get("Target.receivedMessageFromTarget")||new Set()).size,0);
    assert.equal((listeners.get("Target.detachedFromTarget")||new Set()).size,0);
    assert.equal(shutdown.size,0);
  });

  await test("production orchestration creates activates validates and then attaches its page target", async () => {
    const calls=[];
    const client={async send(method,params){calls.push({method,params});if(method==="Target.createTarget")return{targetId:"created-page"};if(method==="Target.getTargetInfo")return{targetInfo:{targetId:"created-page",type:"page",url:"about:blank"}};if(method==="Target.attachToTarget")return{sessionId:"SESSION-1"};return{};}};
    assert.deepEqual(await createActivePageTarget(client),{targetId:"created-page",sessionId:"SESSION-1"});
    assert.deepEqual(calls.map(call=>call.method),["Target.createTarget","Target.activateTarget","Target.getTargetInfo","Target.attachToTarget"]);
    assert.deepEqual(calls[1].params,{targetId:"created-page"});
    assert.deepEqual(calls[3].params,{targetId:"created-page",flatten:false});
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
