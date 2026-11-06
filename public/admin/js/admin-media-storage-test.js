"use strict";

// Settings page: "ทดสอบการเชื่อมต่อที่เก็บรูป" (spec T11, criterion 13; task 12). super_admin only: for any other role
// nothing is shown and nothing is sent (the server refuses them too). One press = one request; the server writes,
// checks, deletes and re-checks a tiny file under a fresh name, so pressing again is always safe. Shows ผ่าน/ไม่ผ่าน
// per step with a reason, never a key, file name or secret (the API client also refuses any extra field).
(function createAdminMediaStorageTest(global) {
  const STEP_LABELS = Object.freeze({ PUT: "เขียนไฟล์ทดสอบ", EXISTS: "ตรวจว่ามีไฟล์", DELETE: "ลบไฟล์ทดสอบ", GONE: "ตรวจว่าไฟล์หายไป" });
  const UNCERTAIN = Object.freeze(["TIMEOUT", "NETWORK_ERROR", "HTTP_ERROR", "MALFORMED_RESPONSE", "REDIRECT_BOUNCE", "OUTCOME_UNKNOWN"]);
  const ICONS = Object.freeze({ ok: "✓", warn: "⚠", error: "✕", info: "ℹ" });
  // Storage events (task 15, 5 Nov): the server's last retried or failed storage calls, newest first.
  const EVENT_ACTIONS = Object.freeze({ PUT: "อัปโหลด", DELETE: "ลบ", HEAD: "ตรวจ" });
  const EVENT_FILES = Object.freeze({ "1600": "รูปใหญ่", "800": "รูปเล็ก", health: "ไฟล์ทดสอบ" });
  const THAI_MONTHS = Object.freeze(["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]);

  function make(tag, className, text) {
    const node = global.document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function logError(step, error) {
    const code = error && typeof error.code === "string" ? error.code : error && error.name ? error.name : "ERROR";
    if (global.console && typeof global.console.warn === "function") global.console.warn("[media storage test] " + step + ": " + code);
  }

  function stepReason(status) {
    if (status === "CONFIG") return "ตั้งค่าไม่ครบ";
    if (status === "NETWORK") return "เชื่อมต่อไม่ได้";
    return "รหัส " + status;
  }

  // "5 พ.ย. 14:36:46" in Bangkok time (UTC+7, no daylight saving), without depending on the browser's locale data.
  function bangkokTime(iso) {
    const date = new Date(Date.parse(iso) + 7 * 3600000);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getUTCDate()} ${THAI_MONTHS[date.getUTCMonth()]} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }

  function eventLine(event) {
    const [action, file] = event.step.split(" ");
    const attempts = event.attempts.split(", ").map((value) => (value === "network" ? "เชื่อมต่อไม่ได้" : value)).join(", ");
    return [bangkokTime(event.at), (EVENT_ACTIONS[action] || action) + (EVENT_FILES[file] || file), event.ok ? "สำเร็จเมื่อลองซ้ำ" : "ไม่สำเร็จ",
      "ผลแต่ละครั้ง " + attempts, (event.ms / 1000).toFixed(1) + " วินาที"].join(" · ");
  }

  function failureHint(steps) {
    if (steps.some((step) => step.status === "CONFIG")) return "ตั้งค่า R2_* ใน Script Properties ไม่ครบหรือชื่อผิด";
    if (steps.some((step) => step.status === "NETWORK")) return "เชื่อมต่อ Cloudflare R2 ไม่ได้ กรุณาลองใหม่ภายหลัง";
    if (steps.some((step) => [400, 401, 403].includes(step.status))) return "ตรวจ R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY ใน Script Properties และสิทธิ์ของ token";
    return "ตรวจการตั้งค่า R2 และลองใหม่อีกครั้ง";
  }

  function init(options) {
    const root = options && options.root;
    if (!root) return null;
    if (options.role !== "super_admin") { root.replaceChildren(); root.hidden = true; return null; }
    const api = options.api, token = options.token;
    const title = make("h2", "", "ทดสอบการเชื่อมต่อที่เก็บรูป");
    title.id = "admin-media-test-title";
    const help = make("p", "admin-media-test__help", "ระบบจะเขียนไฟล์ทดสอบขนาดเล็ก ตรวจว่ามีไฟล์ ลบไฟล์ แล้วตรวจว่าไฟล์หายไป ไม่เปลี่ยนข้อมูลของเว็บ และไม่แสดงกุญแจหรือชื่อไฟล์");
    const runButton = make("button", "button admin-media-test__run", "ทดสอบการเชื่อมต่อ");
    runButton.type = "button";
    const result = make("div", "admin-media-test__result");
    result.setAttribute("role", "status"); result.setAttribute("aria-live", "polite"); result.setAttribute("aria-atomic", "true");
    result.hidden = true;
    const resultIcon = make("span", "admin-media-test__result-icon");
    resultIcon.setAttribute("aria-hidden", "true");
    const resultText = make("span", "admin-media-test__result-text");
    result.append(resultIcon, resultText);
    const steps = make("ol", "admin-media-test__steps");
    steps.setAttribute("aria-label", "ผลแต่ละขั้น");
    steps.hidden = true;
    const events = make("div", "admin-media-test__events");
    events.hidden = true;
    const eventsTitle = make("h3", "", "เหตุขัดข้องล่าสุดของที่เก็บรูป");
    eventsTitle.id = "admin-media-test-events-title";
    events.setAttribute("role", "region");
    events.setAttribute("aria-labelledby", eventsTitle.id);
    const eventsHelp = make("p", "admin-media-test__help", "การอัปโหลดหรือลบรูปที่ต้องลองซ้ำหรือไม่สำเร็จ 20 ครั้งล่าสุด (ใหม่สุดอยู่บน) ใช้แจ้งผู้ดูแลระบบได้");
    const eventsEmpty = make("p", "admin-media-test__events-empty", "ยังไม่มีเหตุขัดข้องที่บันทึกไว้");
    const eventsList = make("ol", "admin-media-test__events-list");
    events.append(eventsTitle, eventsHelp, eventsEmpty, eventsList);
    root.replaceChildren(title, help, runButton, result, steps, events);
    root.hidden = false;

    function show(text, tone) {
      const kind = ICONS[tone] ? tone : "info";
      resultText.textContent = text;
      resultIcon.textContent = ICONS[kind];
      result.dataset.tone = kind;
      result.className = "admin-media-test__result admin-media-test__result--" + kind;
      result.hidden = false;
    }

    function showSteps(list) {
      steps.replaceChildren(...list.map((step) => {
        const li = make("li", "admin-media-test__step admin-media-test__step--" + (step.ok ? "ok" : "fail"));
        li.append(make("span", "admin-media-test__step-name", STEP_LABELS[step.step] || step.step),
          make("span", "admin-media-test__step-state", step.ok ? "ผ่าน" : "ไม่ผ่าน (" + stepReason(step.status) + ")"));
        return li;
      }));
      steps.hidden = list.length === 0;
    }

    // null = an older server that sends no events: the section stays hidden.
    function showEvents(list) {
      if (!Array.isArray(list)) { events.hidden = true; eventsList.replaceChildren(); return; }
      eventsList.replaceChildren(...list.map((event) => make("li", "admin-media-test__event admin-media-test__event--" + (event.ok ? "ok" : "fail"), eventLine(event))));
      eventsEmpty.hidden = list.length > 0;
      eventsList.hidden = list.length === 0;
      events.hidden = false;
    }

    let running = false;
    async function run() {
      if (running) return;
      running = true;
      runButton.disabled = true;
      showSteps([]);
      showEvents(null);
      show("กำลังทดสอบ…", "info");
      try {
        const data = await api.testMediaStorage(token);
        showSteps(data.steps);
        showEvents(data.events);
        if (data.ok) show("เชื่อมต่อที่เก็บรูปได้ปกติ ผ่านครบ " + data.steps.length + " ขั้น", "ok");
        else show("เชื่อมต่อที่เก็บรูปไม่ได้ · " + failureHint(data.steps), "error");
      } catch (error) {
        logError("run", error);
        if (error && UNCERTAIN.includes(error.code)) show("ไม่แน่ใจผล · กดทดสอบอีกครั้งได้ (การทดสอบไม่เปลี่ยนข้อมูลของเว็บ)", "warn");
        else if (error && error.code === "FORBIDDEN") show("บัญชีนี้ไม่มีสิทธิ์ทดสอบการเชื่อมต่อ", "error");
        else if (error && error.code === "UNAUTHORIZED") show("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", "error");
        else show("ทดสอบไม่สำเร็จ · เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่", "error");
      } finally {
        running = false;
        runButton.disabled = false;
      }
    }
    runButton.addEventListener("click", run);
    return Object.freeze({ run });
  }

  global.TakhunAdminMediaStorageTest = Object.freeze({ init, STEP_LABELS });
})(typeof window !== "undefined" ? window : globalThis);
