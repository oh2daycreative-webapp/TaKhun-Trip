"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { terminateProcessTree } = require("./test-admin-content-browser-runner.js");

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function validateUrl(value, protocol, label) {
  let parsed;
  try { parsed = new URL(value); } catch (_error) { throw new Error(`${label} is not a valid URL.`); }
  if (parsed.protocol !== protocol || !LOOPBACK_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error(`${label} must use ${protocol} on a loopback host.`);
  }
  return parsed;
}

function validateLoopbackHttpUrl(value) { return validateUrl(value, "http:", "CDP HTTP endpoint"); }
function validateLoopbackWebSocketUrl(value) { return validateUrl(value, "ws:", "CDP WebSocket endpoint"); }

function deadline(promise, timeoutMs, label, onTimeout, signal, onAbort) {
  return new Promise((resolve, reject) => {
    let timer, settled = false, abortListener;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (signal && abortListener) signal.removeEventListener("abort", abortListener);
      ok ? resolve(value) : reject(value);
    };
    Promise.resolve(promise).then(value => finish(true, value), error => finish(false, error));
    abortListener = () => {
      try { if (onAbort) onAbort(); } catch (_error) { /* The cancellation reason remains authoritative. */ }
      finish(false, signal.reason || new Error(`${label} was cancelled.`));
    };
    if (signal) {
      if (signal.aborted) { abortListener(); return; }
      signal.addEventListener("abort", abortListener, { once: true });
    }
    timer = setTimeout(() => {
      try { if (onTimeout) onTimeout(); } catch (_error) { /* The timeout remains authoritative. */ }
      finish(false, new Error(`${label} timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
  });
}

async function fetchLoopbackJson(endpoint, options = {}) {
  const url = validateLoopbackHttpUrl(endpoint);
  const timeoutMs = options.timeoutMs || 2000;
  const controller = new AbortController();
  const externalSignal = options.signal;
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  if (externalSignal && externalSignal.aborted) throw externalSignal.reason || new Error("CDP discovery was cancelled.");
  try {
    response = await deadline(
      fetchImpl(url.href, { redirect: "manual", signal: controller.signal }),
      timeoutMs,
      "CDP discovery",
      () => controller.abort(),
      externalSignal,
      () => controller.abort(externalSignal.reason)
    );
  } catch (error) {
    if (error && /timed out/.test(error.message)) throw error;
    throw new Error(`CDP discovery failed: ${error && error.message || error}`);
  }
  if (externalSignal && externalSignal.aborted) throw externalSignal.reason || new Error("CDP discovery was cancelled.");
  if (response.status >= 300 && response.status < 400) throw new Error("CDP discovery redirect was rejected.");
  if (!response.ok) throw new Error(`CDP discovery returned HTTP ${response.status}.`);
  const value = await deadline(
    Promise.resolve(response.json()),
    timeoutMs,
    "CDP discovery JSON",
    () => controller.abort(),
    externalSignal,
    () => controller.abort(externalSignal.reason)
  );
  if (!value || typeof value.webSocketDebuggerUrl !== "string") throw new Error("CDP discovery omitted its WebSocket endpoint.");
  validateLoopbackWebSocketUrl(value.webSocketDebuggerUrl);
  return value;
}

class CdpClient {
  constructor(socket, commandTimeoutMs) {
    this.socket = socket;
    this.commandTimeoutMs = commandTimeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.eventWaiters = new Set();
    this.shutdownListeners = new Set();
    this.closed = false;
    this.shutdownError = null;
    socket.addEventListener("message", event => this.onMessage(event));
    socket.addEventListener("close", () => this.shutdown(new Error("CDP WebSocket closed.")));
    socket.addEventListener("error", () => this.shutdown(new Error("CDP WebSocket failed.")));
  }

  onMessage(event) {
    let message;
    try { message = JSON.parse(String(event.data)); } catch (_error) { return; }
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`CDP ${pending.method} failed: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }
    const listeners = this.listeners.get(message.method);
    if (listeners) for (const listener of [...listeners]) listener(message);
  }

  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error("CDP WebSocket is closed."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out after ${this.commandTimeoutMs} ms.`)); }, this.commandTimeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.socket.send(JSON.stringify(Object.assign({ id, method, params }, sessionId ? { sessionId } : {})));
      } catch (error) {
        this.pending.delete(id); clearTimeout(timer); reject(error);
      }
    });
  }

  waitForEvent(method, predicate = () => true, timeoutMs = this.commandTimeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = { timer: null, reject };
      const listener = message => {
        if (!predicate(message)) return;
        clearTimeout(waiter.timer); this.eventWaiters.delete(waiter); this.off(method, listener); resolve(message.params || {});
      };
      this.on(method, listener);
      waiter.timer = setTimeout(() => { this.eventWaiters.delete(waiter); this.off(method, listener); reject(new Error(`CDP event ${method} timed out after ${timeoutMs} ms.`)); }, timeoutMs);
      this.eventWaiters.add(waiter);
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
  }

  off(method, listener) {
    const listeners = this.listeners.get(method); if (!listeners) return;
    listeners.delete(listener); if (!listeners.size) this.listeners.delete(method);
  }

  onShutdown(listener) {
    if (this.closed) { listener(this.shutdownError || new Error("CDP client closed.")); return; }
    this.shutdownListeners.add(listener);
  }

  offShutdown(listener) { this.shutdownListeners.delete(listener); }

  shutdown(error = new Error("CDP client closed.")) {
    if (this.closed) return;
    this.closed = true;
    this.shutdownError = error;
    for (const listener of [...this.shutdownListeners]) listener(error);
    this.shutdownListeners.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    for (const waiter of this.eventWaiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.pending.clear(); this.eventWaiters.clear(); this.listeners.clear();
  }

  close() {
    this.shutdown();
    try { this.socket.close(); } catch (_error) { /* Socket is already closed. */ }
  }
}

class CdpTargetSession {
  constructor(browserClient, sessionId, commandTimeoutMs) {
    this.browserClient = browserClient;
    this.sessionId = sessionId;
    this.commandTimeoutMs = commandTimeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.eventWaiters = new Set();
    this.closed = false;
    this.closeError = null;
    this.receive = message => this.onMessage(message);
    this.detach = message => {
      const params = message && message.params;
      if (params && params.sessionId === this.sessionId) this.close(new Error("CDP target session detached."));
    };
    this.transportShutdown = error => this.close(error || new Error("CDP browser transport closed."));
    browserClient.on("Target.receivedMessageFromTarget", this.receive);
    browserClient.on("Target.detachedFromTarget", this.detach);
    if (typeof browserClient.onShutdown === "function") browserClient.onShutdown(this.transportShutdown);
  }

  onMessage(message) {
    const params = message && message.params;
    if (!params || params.sessionId !== this.sessionId || typeof params.message !== "string") return;
    let inner;
    try { inner = JSON.parse(params.message); } catch (_error) { return; }
    if (inner.id && this.pending.has(inner.id)) {
      const pending = this.pending.get(inner.id); this.pending.delete(inner.id); clearTimeout(pending.timer);
      if (inner.error) pending.reject(new Error(`CDP ${pending.method} failed: ${inner.error.message}`));
      else pending.resolve(inner.result || {});
      return;
    }
    const listeners = this.listeners.get(inner.method);
    if (listeners) for (const listener of [...listeners]) listener(inner.params || {});
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(this.closeError || new Error("CDP target session is closed."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out after ${this.commandTimeoutMs} ms.`)); }, this.commandTimeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.browserClient.send("Target.sendMessageToTarget", {
        sessionId:this.sessionId,
        message:JSON.stringify({ id, method, params })
      }).catch(error => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id); clearTimeout(pending.timer); pending.reject(error);
      });
    });
  }

  waitForEvent(method, predicate = () => true, timeoutMs = this.commandTimeoutMs) {
    if (this.closed) return Promise.reject(this.closeError || new Error("CDP target session is closed."));
    return new Promise((resolve, reject) => {
      const waiter = { timer:null, reject };
      const listener = params => {
        if (!predicate(params)) return;
        clearTimeout(waiter.timer); this.eventWaiters.delete(waiter); this.off(method, listener); resolve(params);
      };
      this.on(method, listener);
      waiter.timer = setTimeout(() => { this.eventWaiters.delete(waiter); this.off(method, listener); reject(new Error(`CDP event ${method} timed out after ${timeoutMs} ms.`)); }, timeoutMs);
      this.eventWaiters.add(waiter);
    });
  }

  on(method, listener) { if (!this.listeners.has(method)) this.listeners.set(method, new Set()); this.listeners.get(method).add(listener); }
  off(method, listener) { const listeners=this.listeners.get(method);if(!listeners)return;listeners.delete(listener);if(!listeners.size)this.listeners.delete(method); }
  close(error = new Error("CDP target session closed.")) {
    if (this.closed) return;
    this.closed = true;
    this.closeError = error;
    this.browserClient.off("Target.receivedMessageFromTarget", this.receive);
    this.browserClient.off("Target.detachedFromTarget", this.detach);
    if (typeof this.browserClient.offShutdown === "function") this.browserClient.offShutdown(this.transportShutdown);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    for (const waiter of this.eventWaiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.pending.clear(); this.eventWaiters.clear(); this.listeners.clear();
  }
}

async function connectWebSocket(url, timeoutMs, signal) {
  validateLoopbackWebSocketUrl(url);
  if (signal && signal.aborted) throw signal.reason || new Error("CDP WebSocket connection was cancelled.");
  const socket = new WebSocket(url);
  let cleanup = () => {};
  const connection = new Promise((resolve, reject) => {
    const opened = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("CDP WebSocket connection failed.")); };
    cleanup = () => { socket.removeEventListener("open", opened); socket.removeEventListener("error", failed); };
    socket.addEventListener("open", opened); socket.addEventListener("error", failed);
  });
  try {
    await deadline(
      connection,
      timeoutMs,
      "CDP WebSocket connection",
      () => { try { socket.close(); } catch (_error) {} },
      signal,
      () => { try { socket.close(); } catch (_error) {} }
    );
  } catch (error) {
    cleanup();
    try { socket.close(); } catch (_error) {}
    throw error;
  }
  if (signal && signal.aborted) {
    try { socket.close(); } catch (_error) {}
    throw signal.reason || new Error("CDP WebSocket connection was cancelled.");
  }
  return new CdpClient(socket, timeoutMs);
}

function keyEventSpec(key) {
  if (key === "Tab") return { key:"Tab", code:"Tab", keyIdentifier:"U+0009", windowsVirtualKeyCode:9, nativeVirtualKeyCode:9 };
  if (key === "Enter") return { key:"Enter", code:"Enter", keyIdentifier:"Enter", text:"\r", unmodifiedText:"\r", windowsVirtualKeyCode:13, nativeVirtualKeyCode:13 };
  if (key === "Space") return { key:" ", code:"Space", keyIdentifier:"U+0020", text:" ", unmodifiedText:" ", windowsVirtualKeyCode:32, nativeVirtualKeyCode:32 };
  throw new Error(`Unsupported CDP key: ${key}`);
}

async function createActivePageTarget(client) {
  const created = await client.send("Target.createTarget", { url:"about:blank" });
  if (!created || typeof created.targetId !== "string" || !created.targetId) throw new Error("CDP target creation omitted its target ID.");
  await client.send("Target.activateTarget", { targetId:created.targetId });
  const described = await client.send("Target.getTargetInfo", { targetId:created.targetId });
  const target = described && described.targetInfo;
  if (!target || target.targetId !== created.targetId || target.type !== "page" || target.url !== "about:blank") throw new Error("CDP created page target did not reach the expected lifecycle state.");
  const attached = await client.send("Target.attachToTarget", { targetId:created.targetId, flatten:false });
  if (!attached || typeof attached.sessionId !== "string" || !attached.sessionId) throw new Error("CDP target attach omitted its session ID.");
  return { targetId:created.targetId, sessionId:attached.sessionId };
}

async function discover(profile, timeoutMs, signal) {
  const activePort = path.join(profile, "DevToolsActivePort");
  return new Promise((resolve, reject) => {
    let watcher, busy = false, settled = false, onAbort;
    const timer = setTimeout(() => finish(new Error(`CDP endpoint discovery timed out after ${timeoutMs} ms.`)), timeoutMs);
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (watcher) watcher.close(); if (signal && onAbort) signal.removeEventListener("abort", onAbort); error ? reject(error) : resolve(value); };
    const inspect = async () => {
      if (busy || !fs.existsSync(activePort)) return;
      busy = true;
      try {
        const lines = fs.readFileSync(activePort, "utf8").trim().split(/\r?\n/);
        const port = Number(lines[0]);
        if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid DevTools port.");
        const endpoint = validateLoopbackHttpUrl(`http://127.0.0.1:${port}/json/version`).href;
        const version = await fetchLoopbackJson(endpoint, { timeoutMs, signal });
        const webSocket = validateLoopbackWebSocketUrl(version.webSocketDebuggerUrl);
        if (Number(webSocket.port) !== port) throw new Error("CDP WebSocket port does not match the discovered HTTP endpoint.");
        finish(null, { endpoint, webSocketUrl: webSocket.href, version });
      } catch (_error) { busy = false; }
    };
    onAbort = () => finish(signal.reason || new Error("CDP browser launch failed."));
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    watcher = fs.watch(profile, inspect);
    inspect();
  });
}

function removeProfile(profile) {
  const resolved = path.resolve(profile), temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(temporaryRoot) || !path.basename(resolved).startsWith("takhun-cdp-")) throw new Error("Refusing to clean a non-suite CDP profile.");
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (fs.existsSync(resolved)) throw new Error("Suite-owned CDP profile cleanup was not confirmed.");
}

async function withCdpBrowser(executable, options, callback) {
  const timeoutMs = options.timeoutMs || 15000, commandTimeoutMs = options.commandTimeoutMs || 3000;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-cdp-reviews-"));
  const spawn = options.spawn || cp.spawn;
  const launchAbort = new AbortController();
  let child, client, targetSession, callbackError, cleanupError, childError, onChildError, terminationConfirmed = false;
  try {
    child = spawn(executable, [
      "--headless=new", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
      "--disable-gpu", "--disable-gpu-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--no-first-run", "--no-default-browser-check", "about:blank"
    ], { windowsHide: true, stdio: "ignore" });
    const childFailure = new Promise((_, reject) => {
      onChildError = error => {
        childError = error instanceof Error ? error : new Error(String(error));
        launchAbort.abort(childError);
        if (targetSession) targetSession.close(childError);
        if (client) client.shutdown(childError);
        reject(childError);
      };
      child.on("error", onChildError);
    });
    const sessionWork = (async () => {
      const discovery = await discover(profile, timeoutMs, launchAbort.signal);
      client = await connectWebSocket(discovery.webSocketUrl, commandTimeoutMs, launchAbort.signal);
      const attached = await createActivePageTarget(client);
      const sessionId = attached.sessionId;
      targetSession = new CdpTargetSession(client, sessionId, commandTimeoutMs);
      const evaluationValue = result => {
        if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text}`);
        return result.result && result.result.value;
      };
      const session = {
        discovery,
        send: (method, params) => targetSession.send(method, params),
        waitForEvent: (method, predicate, eventTimeoutMs) => targetSession.waitForEvent(method, predicate, eventTimeoutMs),
        evaluate: async expression => {
          const result = await targetSession.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
          return evaluationValue(result);
        },
        beginEvaluation: async expression => {
          const started = await targetSession.send("Runtime.evaluate", { expression, awaitPromise: false });
          if (started.exceptionDetails) throw new Error(`Browser evaluation failed: ${started.exceptionDetails.text}`);
          const objectId = started.result && started.result.objectId;
          if (!objectId) throw new Error("Browser evaluation did not return an awaitable object.");
          return async () => evaluationValue(await targetSession.send("Runtime.awaitPromise", { promiseObjectId: objectId, returnByValue: true }));
        },
        press: async key => {
          const spec = keyEventSpec(key);
          await targetSession.send("Input.dispatchKeyEvent", Object.assign({ type: "keyDown" }, spec));
          await targetSession.send("Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, spec, { text: "", unmodifiedText: "" }));
        }
      };
      return callback(session);
    })();
    return await Promise.race([sessionWork, childFailure]);
  } catch (error) { callbackError = error; throw error; }
  finally {
    launchAbort.abort(callbackError || childError || new Error("CDP browser session ended."));
    if (targetSession) targetSession.close(callbackError || childError || new Error("CDP browser session ended."));
    if (client) {
      try { await client.send("Browser.close"); } catch (_error) { /* Bounded process termination below remains authoritative. */ }
      client.close();
    }
    if (child && child.exitCode === null) {
      try {
        const termination = await terminateProcessTree(child, { timeoutMs: 2000 });
        if (!termination.ok) throw new Error(termination.error);
        terminationConfirmed = true;
      } catch (error) { cleanupError = error; }
    }
    try { removeProfile(profile); } catch (error) { cleanupError = cleanupError || error; }
    const noProcessWasCreated = childError && (!child || !Number.isSafeInteger(child.pid) || child.pid < 1);
    if (child && onChildError && (child.exitCode !== null || terminationConfirmed || noProcessWasCreated)) child.removeListener("error", onChildError);
    const primaryError = callbackError || childError;
    if (cleanupError && primaryError) {
      const combined = new Error(`${primaryError.message}\nCleanup failed: ${cleanupError.message}`);
      combined.cause = primaryError;
      combined.cleanupFailed = true;
      throw combined;
    }
    if (cleanupError) throw cleanupError;
    if (childError && !callbackError) throw childError;
  }
}

module.exports = {
  CdpClient,
  CdpTargetSession,
  createActivePageTarget,
  keyEventSpec,
  validateLoopbackHttpUrl,
  validateLoopbackWebSocketUrl,
  fetchLoopbackJson,
  withCdpBrowser
};
