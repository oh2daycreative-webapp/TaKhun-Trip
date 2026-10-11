"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { runBoundedProcess, runProcessEntrypoint } = require("./test-admin-content-browser-runner.js");

const root = path.join(__dirname, "..");
const pageSource = fs.readFileSync(path.join(root, "public/admin/reviews.html"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "public/admin/js/admin-reviews.js"), "utf8");
const browser = [
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe"),
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")
].find(candidate => candidate && fs.existsSync(candidate));

assert.ok(browser, "Chrome or Edge is required for native Admin Reviews regressions");

function installMocks() {
  const details = {
    "review-a": { review_id: "review-a", place_id: "place-a", rating: 5, reviewer_name: "Alice <b>owner</b>", comment: "Hello <img src=x onerror=window.__unsafe=1>", status: "pending", admin_reply: "", created_at: "2026-10-11T00:00:00.000Z", updated_at: "2026-10-11T00:00:00.000Z", revision: "rev-a1" },
    "review-b": { review_id: "review-b", place_id: "place-b", rating: 4, reviewer_name: "Bob", comment: "Second review", status: "pending", admin_reply: "", created_at: "2026-10-10T00:00:00.000Z", updated_at: "2026-10-10T00:00:00.000Z", revision: "rev-b1" }
  };
  let role = "viewer", pending = null, revision = 1;
  const copy = value => JSON.parse(JSON.stringify(value));
  const listItem = record => ({ review_id: record.review_id, place_id: record.place_id, rating: record.rating, reviewer_name: record.reviewer_name, comment: record.comment, status: record.status, created_at: record.created_at, updated_at: record.updated_at, revision: record.revision });
  function mutation(action, payload, wait) {
    const execute = () => {
      const record = details[payload.review_id];
      if (action === "approve") record.status = "approved";
      if (action === "hide") record.status = "hidden";
      if (action === "reply") record.admin_reply = payload.admin_reply;
      if (action === "clearReply") record.admin_reply = "";
      if (action === "delete") record.status = "deleted";
      record.revision = "rev-" + (++revision);
      record.updated_at = "2026-10-11T00:00:0" + revision + ".000Z";
      return Object.assign(copy(record), { audit_status: "recorded" });
    };
    if (!wait) return Promise.resolve(execute());
    return new Promise(resolve => { pending = () => resolve(execute()); });
  }
  window.__reviewsFixture = {
    setRole(value) { role = value; },
    reset() {
      details["review-a"].status = "pending"; details["review-a"].admin_reply = ""; details["review-a"].revision = "rev-a1";
      details["review-b"].status = "pending"; details["review-b"].admin_reply = ""; details["review-b"].revision = "rev-b1";
      pending = null; window.__unsafe = 0;
    },
    resolveMutation() { const complete = pending; pending = null; if (complete) complete(); },
    hasPending() { return !!pending; }
  };
  window.TakhunAdminShell = { init: async () => {
    document.body.classList.remove("admin-auth-pending");
    const shell = document.querySelector("[data-admin-shell]"), content = document.querySelector("[data-admin-reviews]");
    shell.hidden = false; shell.setAttribute("aria-hidden", "false");
    content.hidden = false; content.setAttribute("aria-hidden", "false");
    return { status: "authenticated", admin: { role } };
  } };
  window.TakhunAdminAuth = { readSession: () => ({ token: "TEST_TOKEN", role }) };
  window.TakhunAdminApi = {
    getReviews: async () => ({ items: Object.values(details).map(listItem), total: 2, page: 1, page_size: 20, total_pages: 1 }),
    getReviewDetail: async (_token, payload) => copy(details[payload.review_id]),
    approveReview: (_token, payload) => mutation("approve", payload, true),
    hideReview: (_token, payload) => mutation("hide", payload, true),
    replyReview: (_token, payload) => mutation("reply", payload, false),
    clearReviewReply: (_token, payload) => mutation("clearReply", payload, false),
    deleteReview: (_token, payload) => mutation("delete", payload, false)
  };
}

async function runBrowserChecks() {
  const fail = message => { throw new Error(message); };
  const check = (condition, message) => { if (!condition) fail(message); };
  const waitFor = async (predicate, message) => {
    const deadline = performance.now() + 1500;
    while (performance.now() < deadline) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    fail(message);
  };
  const visible = element => element && !element.hidden && element.getClientRects().length > 0;
  let minimumTarget = { width: Infinity, height: Infinity, label: "" };
  const assertLayout = label => {
    check(document.documentElement.scrollWidth <= window.innerWidth, label + " document horizontal overflow");
    check(document.body.scrollWidth <= window.innerWidth, label + " body horizontal overflow");
    const main = document.querySelector("[data-admin-main]"), shell = document.querySelector("[data-admin-shell]"), header = document.querySelector("[data-admin-header]");
    const mainBox = main.getBoundingClientRect(), headerBox = header.getBoundingClientRect();
    if (window.innerWidth >= 900) {
      check(mainBox.x >= headerBox.x && Math.abs(mainBox.y - headerBox.bottom) < 1, label + " main is not in desktop content row/column");
    }
    check(mainBox.right <= window.innerWidth, label + " main extends beyond viewport");
    document.querySelectorAll("[data-admin-reviews] button, [data-admin-reviews] input, [data-admin-reviews] select, [data-admin-reviews] textarea").forEach(control => {
      if (!visible(control)) return;
      const box = control.getBoundingClientRect();
      if (box.width < minimumTarget.width || box.height < minimumTarget.height) minimumTarget = { width: Math.min(minimumTarget.width, box.width), height: Math.min(minimumTarget.height, box.height), label: control.tagName + "[name=" + (control.name || "") + "]" };
      const filters = root.querySelector("[data-review-filters]"), sidebar = document.querySelector("[data-admin-sidebar]");
      const mainBox = main.getBoundingClientRect(), headerBox = header.getBoundingClientRect(), sidebarBox = sidebar.getBoundingClientRect();
      const shellStyle = getComputedStyle(shell);
      check(box.width >= 44 && box.height >= 44, label + " undersized control " + control.tagName + "[name=" + (control.name || "") + "] " + box.width + "x" + box.height + " viewport=" + window.innerWidth + "x" + window.innerHeight + " main=" + JSON.stringify({ x: mainBox.x, y: mainBox.y, width: mainBox.width }) + " header=" + JSON.stringify({ x: headerBox.x, y: headerBox.y, bottom: headerBox.bottom }) + " sidebar=" + JSON.stringify({ x: sidebarBox.x, y: sidebarBox.y, width: sidebarBox.width }) + " shell=" + shellStyle.gridTemplateColumns + "/" + shellStyle.gridTemplateRows + " filters=" + filters.getBoundingClientRect().width + " columns=" + getComputedStyle(filters).gridTemplateColumns);
    });
  };
  const root = document.querySelector("[data-admin-reviews]");
  const template = root.innerHTML;
  const expected = { viewer: 0, reviewer: 2, editor: 3, super_admin: 4 };
  const shell = document.querySelector("[data-admin-shell]"), main = document.querySelector("[data-admin-main]"), header = document.querySelector("[data-admin-header]");
  const report = { viewport: [window.innerWidth, window.innerHeight], breakpoint: window.innerWidth >= 900 ? "desktop" : window.innerWidth <= 699 ? "narrow-mobile" : "tablet", roles: {} };
  let comprehensiveDone = false;

  for (const role of ["viewer", "reviewer", "editor", "super_admin"]) {
    window.__reviewsFixture.reset(); window.__reviewsFixture.setRole(role); root.innerHTML = template;
    await window.TakhunAdminReviews.init();
    await waitFor(() => root.querySelectorAll("[data-review-id]").length === 2, role + " list did not render");
    const cards = root.querySelectorAll("[data-review-id]");
    check(cards[0].textContent.includes("<img src=x"), role + " list lost HTML-like text");
    check(!cards[0].querySelector("img"), role + " list parsed user HTML");
    cards[0].focus();
    check(cards[0].tagName === "BUTTON" && document.activeElement === cards[0], role + " list item is not a keyboard-focusable native button");
    cards[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    cards[0].click();
    await waitFor(() => visible(root.querySelector("[data-review-detail]")), role + " detail did not open");
    const title = root.querySelector("[data-review-detail-title]"), comment = root.querySelector("[data-review-comment]");
    check(document.activeElement === title, role + " focus did not transfer into detail");
    check(comment.textContent === "Hello <img src=x onerror=window.__unsafe=1>", role + " detail text changed");
    check(!comment.querySelector("img") && window.__unsafe === 0, role + " detail parsed user HTML");
    const actions = root.querySelector("[data-review-actions]");
    check(actions.querySelectorAll("button").length === expected[role], role + " permission controls mismatch");
    check(root.querySelector("[data-review-reply-editor]").hidden === !(role === "editor" || role === "super_admin"), role + " reply editor permission mismatch");
    actions.querySelectorAll("button").forEach(button => check(button.tabIndex >= 0, role + " action is not keyboard reachable"));
    assertLayout(role + " detail");

    if (!comprehensiveDone && role === "editor") {
      comprehensiveDone = true;
      const reply = root.querySelector("[data-review-reply]");
      reply.focus(); reply.value = "draft A"; reply.dispatchEvent(new Event("input", { bubbles: true }));
      check(document.activeElement === reply, "reply editor is not keyboard focusable");
      const approve = actions.querySelector("button"); approve.focus();
      approve.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); approve.click();
      check(window.__reviewsFixture.hasPending(), "approve did not start");
      check(reply.disabled && Array.from(actions.querySelectorAll("button")).every(button => button.disabled), "pending controls did not disable immediately");
      window.__reviewsFixture.resolveMutation();
      await waitFor(() => !reply.disabled, "approve did not settle");
      check(reply.value === "draft A", "approve discarded dirty draft");
      let confirms = 0; window.confirm = () => { confirms++; return false; };
      cards[1].click(); await new Promise(resolve => setTimeout(resolve, 0));
      check(confirms === 1 && root.querySelector("[data-review-detail-title]").textContent.includes("Alice"), "dirty draft moved to another review");
      const hide = actions.querySelector("button"); hide.focus(); window.confirm = () => true; hide.click();
      check(window.__reviewsFixture.hasPending(), "hide did not start");
      window.__reviewsFixture.resolveMutation();
      await waitFor(() => !reply.disabled, "hide did not settle");
      check(reply.value === "draft A", "hide discarded dirty draft");
      const replyAction = actions.querySelectorAll("button")[1];
      replyAction.focus(); replyAction.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); replyAction.click();
      await waitFor(() => root.querySelector("[data-review-current-reply]").textContent === "draft A", "reply action was not operable");
    }

    const back = root.querySelector("[data-review-back]"); back.focus(); back.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); back.click();
    await waitFor(() => document.activeElement && document.activeElement.getAttribute("data-review-id") === "review-a", role + " focus did not restore to originating item");
    assertLayout(role + " list");
    report.roles[role] = { actions: expected[role], focusRestored: true };
  }
  const mainBox = main.getBoundingClientRect(), headerBox = header.getBoundingClientRect(), shellStyle = getComputedStyle(shell);
  report.layout = { main: { x: mainBox.x, y: mainBox.y, width: mainBox.width, right: mainBox.right }, header: { x: headerBox.x, bottom: headerBox.bottom }, columns: shellStyle.gridTemplateColumns, rows: shellStyle.gridTemplateRows, minimumTarget };
  document.body.innerHTML = "<pre id=result>PASS " + JSON.stringify(report) + "</pre>";
}

function fixtureHtml() {
  const base = pathToFileURL(path.join(root, "public/admin") + path.sep).href;
  const withoutScripts = pageSource.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const scripts = `<script>(${installMocks.toString()})();</script><script>${controllerSource}</script><script>(${runBrowserChecks.toString()})().catch(error=>{document.body.innerHTML='<pre id="result">FAIL '+String(error&&error.stack||error).replace(/[<&]/g,value=>value==='<'?'&lt;':'&amp;')+'</pre>';});</script>`;
  return withoutScripts.replace("<head>", `<head><base href="${base}">`).replace("</body>", `${scripts}</body>`);
}

async function runViewport(width, height) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `takhun-reviews-browser-${width}-`));
  const file = path.join(directory, "reviews-test.html");
  fs.writeFileSync(file, fixtureHtml());
  const result = await runBoundedProcess(browser, [
    "--headless=new", `--window-size=${width},${height}`, `--user-data-dir=${path.join(directory, "profile")}`,
    "--disable-gpu", "--disable-gpu-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=10000", "--dump-dom",
    pathToFileURL(file).href
  ], { timeoutMs: 15000, cleanupDir: directory });
  return result;
}

runProcessEntrypoint(async () => {
  let output = "";
  const reports = [];
  for (const viewport of [[1280, 900], [360, 800]]) {
    const result = await runViewport(viewport[0], viewport[1]);
    if (result.code !== 0) return result;
    assert.match(result.stdout, /<pre id="result">PASS /, `Reviews native browser failed at ${viewport.join("x")}: ${result.stdout.match(/<pre id="result">[\s\S]*?<\/pre>/)?.[0] || "missing result"}`);
    const match = result.stdout.match(/<pre id="result">PASS ([\s\S]*?)<\/pre>/);
    assert.ok(match, `Reviews native browser report missing at ${viewport.join("x")}`);
    const report = JSON.parse(match[1]);
    if (viewport[0] >= 900) assert.equal(report.breakpoint, "desktop", "desktop run did not reach desktop breakpoint");
    else assert.equal(report.breakpoint, "narrow-mobile", "mobile run did not reach the Reviews narrow-mobile breakpoint");
    reports.push(report);
    output += result.stdout;
  }
  return { code: 0, stdout: output, stderr: "", timedOut: false, cleanupFailed: false, reports };
}, result => {
  result.reports.forEach(report => process.stdout.write(`Reviews ${report.breakpoint} viewport/layout: ${JSON.stringify(report)}\n`));
  process.stdout.write(`Admin Reviews native browser regressions passed with ${path.basename(browser)}.\n`);
}).then(code => { process.exitCode = code; });
