"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runBoundedProcess } = require("./test-admin-content-browser-runner.js");

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "public/admin/settings.html"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "public/admin/js/admin-settings.js"), "utf8");
const shellSource = fs.readFileSync(path.join(root, "public/admin/js/admin-shell.js"), "utf8");
const cssSource = ["main.css", "components.css", "mobile.css", "admin.css"]
  .map(file => fs.readFileSync(path.join(root, "public/css", file), "utf8")).join("\n");
const browsers = [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")
];
const browser = browsers.find(candidate => candidate && fs.existsSync(candidate));
assert.ok(browser, "Chrome or Edge is required for native Admin Settings browser regressions");

const roles = ["super_admin", "editor", "reviewer", "viewer"];
assert.deepEqual(roles, ["super_admin", "editor", "reviewer", "viewer"], "native matrix must cover the four authenticated roles");
const viewports = [[1280, 900], [390, 844], [360, 800]];
const values = {
  site_name: "ตาขุนทริป",
  site_slogan_th: "เที่ยวสุราษฎร์อย่างรู้ใจ",
  site_slogan_en: "Discover Surat Thani",
  default_language: "th",
  main_email: "hello@example.test",
  main_phone: "+66 77 123 456",
  facebook_url: "https://example.test/facebook",
  line_url: "https://example.test/line",
  logo_url: "https://example.test/logo.png",
  hero_image_url: "https://example.test/hero.jpg",
  reviews_enabled: true,
  events_enabled: false
};

function fixture(role, width, height) {
  const body = page
    .replace(/<link[^>]+rel="stylesheet"[^>]*>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace("</head>", `<style>${cssSource}</style></head>`)
    .replace("</body>", `<script>
      window.stats={writes:0,confirms:0};
      window.confirm=()=>{stats.confirms++;return false};
      window.TakhunAdminAuth={
        readSession:()=>({token:"TOKEN",role:${JSON.stringify(role)}}),logout:async()=>{},
        guardProtectedPage:async({onAuthenticated})=>{const result={status:"authenticated",admin:{role:${JSON.stringify(role)},display_name:"Test Admin"}};onAuthenticated(result);return result}
      };
      window.TakhunAdminApi={
        getSettings:async()=>({settings:${JSON.stringify(values)},revision:"r1-${"a".repeat(64)}"}),
        updateSettings:async(_token,payload)=>{stats.writes++;return {settings:payload.settings,revision:"r1-${"b".repeat(64)}",audit_status:"recorded"}}
      };
      eval(atob(${JSON.stringify(Buffer.from(shellSource).toString("base64"))}));
      eval(atob(${JSON.stringify(Buffer.from(controllerSource).toString("base64"))}));
      (async()=>{
        const check=(condition,message)=>{if(!condition)throw Error(message)};
        const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
        await window.TakhunAdminSettings.init();await pause();
        const form=document.querySelector("[data-settings-form]");
        const fields=Array.from(form.elements).filter(field=>field.name);
        const canWrite=${JSON.stringify(role === "super_admin")};
        check(window.innerWidth===${width}&&window.innerHeight===${height},"viewport "+window.innerWidth+"x"+window.innerHeight);
        const overflow=Array.from(document.querySelectorAll("*")).filter(node=>node.getBoundingClientRect().right>window.innerWidth+1).map(node=>node.tagName+"."+node.className+":"+Math.round(node.getBoundingClientRect().right)).slice(0,4).join(",");
        check(document.documentElement.scrollWidth<=window.innerWidth,"horizontal overflow "+document.documentElement.scrollWidth+"/"+window.innerWidth+" "+overflow);
        check(fields.length===12,"expected 12 canonical fields");
        check(fields.every(field=>field.disabled===!canWrite),"role write boundary");
        for(const control of document.querySelectorAll("[data-admin-settings] button,[data-admin-settings] input,[data-admin-settings] select,.admin-drawer-toggle,.admin-drawer-close,.admin-nav__link")){
          if(control.disabled||control.hidden||control.offsetParent===null)continue;
          const rect=control.getBoundingClientRect();
          check(rect.height>=44,"short control "+(control.name||control.textContent.trim()));
        }
        if(canWrite){
          const name=form.elements.site_name;
          name.value="แบบร่าง";name.dispatchEvent(new Event("input",{bubbles:true}));
          document.querySelector("a[href='dashboard.html']").click();
          check(stats.confirms===1,"dirty navigation was not guarded");
          name.value="";name.dispatchEvent(new Event("input",{bubbles:true}));form.requestSubmit();await pause();
          check(stats.writes===0,"invalid form mutated");
          check(document.activeElement===name,"invalid field was not focused");
          name.value="ชื่อใหม่";name.dispatchEvent(new Event("input",{bubbles:true}));form.requestSubmit();await pause();
          check(stats.writes===1,"valid save did not mutate once");
        }
        document.body.innerHTML="<pre id=result>PASS ${role} ${width}x${height}</pre>";
      })().catch(error=>{document.body.innerHTML="<pre id=result>FAIL "+error.message+"</pre>"});
    </script></body>`);
  return body;
}

async function runCase(role, width, height) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-settings-browser-"));
  const appFile = path.join(directory, "app.html");
  const file = path.join(directory, "test.html");
  fs.writeFileSync(appFile, fixture(role, width, height));
  fs.writeFileSync(file, `<!doctype html><html><body><iframe src="app.html" style="border:0;width:${width}px;height:${height}px"></iframe><script>
    const frame=document.querySelector("iframe");
    const poll=setInterval(()=>{const result=frame.contentDocument&&frame.contentDocument.querySelector("#result");if(result){clearInterval(poll);document.body.innerHTML=result.outerHTML}},10);
  </script></body></html>`);
  const result = await runBoundedProcess(browser, [
    "--headless=new", `--user-data-dir=${path.join(directory, "profile")}`, "--no-sandbox",
    "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--disable-extensions", "--disable-sync", "--metrics-recording-only", "--disable-gpu",
    "--allow-file-access-from-files",
    "--disable-gpu-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1",
    `--window-size=${Math.max(width + 18, 518)},${height + 152}`, "--virtual-time-budget=5000", "--dump-dom",
    `file:///${file.replace(/\\/g, "/")}`
  ], { timeoutMs: 15000, cleanupDir: directory });
  assert.equal(result.timedOut, false, result.stderr);
  const expected = `<pre id="result">PASS ${role} ${width}x${height}</pre>`;
  assert.ok(result.stdout.includes(expected), result.stdout.match(/<pre id="result">[^<]*/)?.[0] || `browser result missing: ${result.stdout.slice(-1200)}`);
}

(async()=>{
  for(const [width,height] of viewports)for(const role of roles)await runCase(role,width,height);
  console.log("Admin Settings native browser regressions passed at 1280x900, 390x844, and 360x800.");
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
