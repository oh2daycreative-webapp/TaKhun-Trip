"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const REVIEW_HEADERS = ["review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment", "admin_reply", "status", "created_at", "updated_at", "approved_at", "approved_by"];
const AUDIT_HEADERS = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];
const roles = ["super_admin", "editor", "reviewer", "viewer"];
const plain = value => JSON.parse(JSON.stringify(value));

function baseRows() {
  return [
    { review_id:"REV-P", place_id:"P-1", reviewer_name:"Alice", is_anonymous:false, rating:5, comment:"Great", admin_reply:"", status:"pending", created_at:"2026-10-01 10:00:00", updated_at:"2026-10-01 10:00:00", approved_at:"", approved_by:"" },
    { review_id:"REV-A", place_id:"P-1", reviewer_name:"'@Anon", is_anonymous:true, rating:4, comment:"'=Safe", admin_reply:"'+Thanks", status:"approved", created_at:"2026-10-02 10:00:00", updated_at:"2026-10-03 10:00:00", approved_at:"2026-10-03 10:00:00", approved_by:"ADM-EDITOR" },
    { review_id:"REV-H", place_id:"P-1", reviewer_name:"Hidden", is_anonymous:false, rating:3, comment:"Hidden", admin_reply:"", status:"hidden", created_at:"2026-10-04 10:00:00", updated_at:"2026-10-04 10:00:00", approved_at:"", approved_by:"" },
    { review_id:"REV-D", place_id:"P-1", reviewer_name:"Deleted", is_anonymous:false, rating:2, comment:"Deleted", admin_reply:"", status:"deleted", created_at:"2026-10-05 10:00:00", updated_at:"2026-10-05 10:00:00", approved_at:"", approved_by:"" }
  ];
}

function load(options = {}) {
  const state = {
    reviews: plain(options.reviews || baseRows()),
    places: plain(options.places || [{ place_id:"P-1", name_th:"เขื่อน", status:"published" }]),
    audits: [], epoch: 7, writes: 0, bumps: 0, authCalls: [], flushes: 0
  };
  const role = options.role || "super_admin";
  const lock = { held:false, acquisitions:0, releases:0, tryLock(ms){ assert.equal(ms,10000);assert.equal(this.held,false,"nested script-lock acquisition");this.acquisitions++;if(options.lockFail)return false;this.held=true;return true; }, releaseLock(){assert.equal(this.held,true);this.releases++;this.held=false;} };
  function table(name) {
    const source = name === "reviews" ? state.reviews : name === "places" ? state.places : state.audits;
    const headers = name === "reviews" ? REVIEW_HEADERS : name === "places" ? ["place_id","name_th","status"] : AUDIT_HEADERS;
    return { headers:[...headers], rows:source.map((values,index)=>({sourceRowNumber:index+2,values:{...values}})) };
  }
  const sheets = {
    reviews:{ getLastRow:()=>state.reviews.length+1, getRange:()=>({ getFormulas:()=>[REVIEW_HEADERS.map(()=>"")] }) },
    activity_logs:{ getLastRow:()=>state.audits.length+1, getRange:()=>({ getFormulas:()=>[AUDIT_HEADERS.map(()=>"")] }) }
  };
  const context = {
    JSON,Object,Array,String,Number,Boolean,Date,Math,RegExp,Map,Set,isFinite,encodeURIComponent,
    AuthService_requireAdmin_(token){ state.authCalls.push(token); if(token!=="TOKEN"||options.unauthorized)throw Error("UNAUTHORIZED"); return {admin_id:`ADM-${role.toUpperCase()}`,role}; },
    LockService:{getScriptLock:()=>lock}, Utilities:{getUuid:()=>`uuid-${state.audits.length+1}`,formatDate:()=>"2026-10-11 12:34:56"}, Session:{getScriptTimeZone:()=>"Asia/Bangkok"},
    CryptoService_utf8Bytes_(value){ return [...Buffer.from(value,"utf8")]; }, CryptoService_sha256_(bytes){ return [...crypto.createHash("sha256").update(Buffer.from(bytes)).digest()]; },
    SheetService_readTable_:table, SheetService_getSheet_:name=>sheets[name], SheetService_prepareAppendDestination_:()=>({}),
    SheetService_replaceObjectAtRow_(name,row,record){ if(options.failWrite)throw Error("sheet failed"); const index=row-2; const written=plain(record);
      // sheetsSemantics: like setValues — a leading apostrophe marks text and is not stored; a bare =… becomes a live formula.
      if(options.sheetsSemantics)for(const [key,value] of Object.entries(written)){ if(typeof value!=="string")continue; if(value.startsWith("'"))written[key]=value.slice(1); else if(value.startsWith("=")){state.formulas=(state.formulas||0)+1;written[key]="#FORMULA-RESULT";} }
      state[name][index]={...state[name][index],...written}; state.writes++; if(options.corruptWrite)state[name][index].status="pending"; },
    SheetService_appendObjectWithRow_(name,headers,record){ if(options.auditFail)throw Error("audit failed"); state.audits.push(plain(record)); },
    SpreadsheetApp:{flush(){state.flushes++; if(options.flushFail&&state.flushes===1)throw Error("flush failed");}},
    PlaceService_cacheEpoch_:()=>state.epoch, PlaceService_bumpCacheEpoch_(){ if(options.cacheFail)throw Error("cache failed"); state.epoch++;state.bumps++;return state.epoch; }
  };
  vm.createContext(context);
  const file = path.join(root,"apps-script/AdminReviewService.gs");
  vm.runInContext(fs.existsSync(file)?fs.readFileSync(file,"utf8"):"",context,{filename:"apps-script/AdminReviewService.gs"});
  return {context,state,lock};
}

function test(name,fn){try{fn();process.stdout.write(`PASS ${name}\n`);}catch(error){process.stderr.write(`FAIL ${name}\n${error.stack}\n`);process.exitCode=1;}}
function call(env,name,payload){assert.equal(typeof env.context[name],"function",`${name} must exist`);return plain(env.context[name]("TOKEN",payload));}
function detail(env,id="REV-P"){return call(env,"adminGetReviewDetail_",{review_id:id});}

test("all roles read strict safe list and detail projections",()=>{
  for(const role of roles){const env=load({role});const list=call(env,"adminGetReviews_",{status:"",place_id:"P-1",page:1,page_size:20});assert.equal(list.ok,true);assert.deepEqual(Object.keys(list.data),["items","page","page_size","total","total_pages","warning"]);assert.equal(list.data.warning,null);assert.equal(list.data.items.length,4);const item=detail(env,"REV-A").data;assert.equal(item.reviewer_name,"นักท่องเที่ยว");assert.equal(item.comment,"=Safe");assert.equal(item.admin_reply,"+Thanks");assert.match(item.revision,/^r1-[a-f0-9]{64}$/);assert.equal("sourceRowNumber" in item,false);}
});

test("list skips invalid and duplicate rows while targets fail closed independently",()=>{
  const rows=baseRows();
  rows[0].reviewer_name="";
  rows.push({...rows[0],review_id:"REV-BAD",comment:"nul\0bad"});
  rows.push({...rows[0],review_id:"REV-DUP",comment:"first"});
  rows.push({...rows[0],review_id:"REV-DUP",comment:"second"});
  const env=load({role:"super_admin",reviews:rows});
  const list=call(env,"adminGetReviews_",{page:2,page_size:2});
  assert.equal(list.ok,true);
  assert.deepEqual(list.data.items.map(item=>item.review_id),["REV-H","REV-D"]);
  assert.equal(list.data.total,4);
  assert.equal(list.data.total_pages,2);
  assert.deepEqual(list.data.warning,{code:"SKIPPED_INVALID_REVIEWS",skipped_count:3});
  assert.equal(detail(env,"REV-P").data.reviewer_name,"");
  assert.equal(detail(env,"REV-BAD").error.code,"SERVER_ERROR");
  assert.equal(detail(env,"REV-DUP").error.code,"SERVER_ERROR");
  const before=detail(env,"REV-H").data;
  assert.equal(call(env,"deleteReview_",{review_id:"REV-H",expected_revision:before.revision}).ok,true);
  const writes=env.state.writes;
  assert.equal(call(env,"deleteReview_",{review_id:"REV-BAD",expected_revision:"r1-"+"0".repeat(64)}).ok,false);
  assert.equal(call(env,"deleteReview_",{review_id:"REV-DUP",expected_revision:"r1-"+"0".repeat(64)}).ok,false);
  assert.equal(env.state.writes,writes);
});

test("permissions are enforced independently for every action",()=>{
  const matrix={approveReview_:["super_admin","editor","reviewer"],hideReview_:["super_admin","editor","reviewer"],replyReview_:["super_admin","editor"],clearReviewReply_:["super_admin","editor"],deleteReview_:["super_admin"]};
  for(const [action,allowed] of Object.entries(matrix))for(const role of roles){const env=load({role});const reviewId=action==="clearReviewReply_"?"REV-A":"REV-P";const before=detail(env,reviewId).data;const payload={review_id:reviewId,expected_revision:before.revision};if(action==="replyReview_")payload.admin_reply="ขอบคุณ";const result=call(env,action,payload);assert.equal(result.ok,allowed.includes(role),`${action} ${role}`);assert.equal(env.state.writes,allowed.includes(role)?1:0);}
});

test("lifecycle transitions and deleted terminal behavior are exact",()=>{
  for(const [action,id,status] of [["approveReview_","REV-P","approved"],["approveReview_","REV-H","approved"],["hideReview_","REV-P","hidden"],["hideReview_","REV-A","hidden"],["deleteReview_","REV-H","deleted"]]){const env=load();const rev=detail(env,id).data.revision;const result=call(env,action,{review_id:id,expected_revision:rev});assert.equal(result.ok,true,`${action} ${id}`);assert.equal(result.data.status,status);}
  for(const action of ["approveReview_","hideReview_","replyReview_","clearReviewReply_","deleteReview_"]){const env=load();const rev=detail(env,"REV-D").data.revision;const payload={review_id:"REV-D",expected_revision:rev};if(action==="replyReview_")payload.admin_reply="x";const result=call(env,action,payload);assert.equal(result.error.code,"INVALID_TRANSITION",action);assert.equal(env.state.writes,0);}
  const unpublished=load({places:[{place_id:"P-1",name_th:"Draft",status:"draft"}]});const rev=detail(unpublished).data.revision;assert.equal(call(unpublished,"approveReview_",{review_id:"REV-P",expected_revision:rev}).error.code,"INVALID_TRANSITION");
});

test("reply preserves formula-leading Unicode and rejects unsafe text before writes",()=>{
  for(const value of ["=SUM(A1)","+plus","-minus","@mention","'ordinary","ขอบคุณ 🧭"]){const env=load({role:"editor"});const rev=detail(env).data.revision;assert.equal(call(env,"replyReview_",{review_id:"REV-P",expected_revision:rev,admin_reply:value}).ok,true);assert.equal(detail(env).data.admin_reply,value);}
  for(const value of ["nul\0bad","\ud800","x".repeat(2001),"😀".repeat(2001)]){const env=load({role:"editor"});const rev=detail(env).data.revision;const result=call(env,"replyReview_",{review_id:"REV-P",expected_revision:rev,admin_reply:value});assert.equal(result.error.code,"VALIDATION_ERROR");assert.equal(env.state.writes,0);}
  for(const value of ["'=ambiguous","'+ambiguous","'-ambiguous","'@ambiguous"]){const env=load({role:"editor"});const rev=detail(env).data.revision;const result=call(env,"replyReview_",{review_id:"REV-P",expected_revision:rev,admin_reply:value});assert.equal(result.error.code,"VALIDATION_ERROR");assert.equal(env.state.writes,0);}
});

test("revision conflict lock reauthentication and strict payloads write nothing",()=>{
  const env=load({role:"editor"});assert.equal(call(env,"hideReview_",{review_id:"REV-P",expected_revision:"r1-"+"0".repeat(64)}).error.code,"CONFLICT");assert.equal(env.state.writes,0);assert.equal(env.state.authCalls.length,2);
  for(const payload of [{review_id:"REV-P"},{review_id:"REV-P",expected_revision:detail(load()).data.revision,extra:true},null]){const item=load({role:"editor"});assert.equal(call(item,"hideReview_",payload).error.code,"VALIDATION_ERROR");assert.equal(item.state.writes,0);}
  const busy=load({role:"editor",lockFail:true});const rev=detail(busy).data.revision;assert.equal(call(busy,"hideReview_",{review_id:"REV-P",expected_revision:rev}).error.code,"CONTENT_LOCK");
});

test("revisions and updated_at advance through ABA cycles within one wall-clock second",()=>{
  const approvedRows=baseRows();
  approvedRows[1].approved_at="2026-10-11 12:34:56";
  approvedRows[1].approved_by="ADM-SUPER_ADMIN";
  approvedRows[1].updated_at="2026-10-11 12:34:56";
  const moderation=load({reviews:approvedRows});
  const initial=detail(moderation,"REV-A").data;
  const hidden=call(moderation,"hideReview_",{review_id:"REV-A",expected_revision:initial.revision}).data;
  const approved=call(moderation,"approveReview_",{review_id:"REV-A",expected_revision:hidden.revision}).data;
  assert.notEqual(hidden.revision,initial.revision);
  assert.notEqual(approved.revision,initial.revision);
  assert.equal(hidden.updated_at,"2026-10-11 12:34:57");
  assert.equal(approved.updated_at,"2026-10-11 12:34:58");
  assert.equal(call(moderation,"hideReview_",{review_id:"REV-A",expected_revision:initial.revision}).error.code,"CONFLICT");

  const replies=load({role:"editor"});
  const empty=detail(replies,"REV-P").data;
  const replied=call(replies,"replyReview_",{review_id:"REV-P",expected_revision:empty.revision,admin_reply:"answer"}).data;
  const cleared=call(replies,"clearReviewReply_",{review_id:"REV-P",expected_revision:replied.revision}).data;
  assert.notEqual(cleared.revision,empty.revision);
  assert.equal(replied.updated_at,"2026-10-11 12:34:56");
  assert.equal(cleared.updated_at,"2026-10-11 12:34:57");
  assert.equal(call(replies,"replyReview_",{review_id:"REV-P",expected_revision:empty.revision,admin_reply:"stale"}).error.code,"CONFLICT");
});

test("Date and equivalent string timestamps have one canonical revision",()=>{
  const asString=load();
  asString.state.reviews[0].updated_at="2026-10-11 12:34:56";
  const stringDetail=detail(asString,"REV-P").data;
  const asDate=load();
  asDate.state.reviews[0].updated_at=new Date("2026-10-11T05:34:56.000Z");
  const dateDetail=detail(asDate,"REV-P").data;
  assert.equal(dateDetail.updated_at,stringDetail.updated_at);
  assert.equal(dateDetail.revision,stringDetail.revision);
});

test("verified entity uncertainty audit warning and cache freshness remain distinct",()=>{
  for(const option of ["failWrite","corruptWrite","flushFail"]){const env=load({role:"editor",[option]:true});const rev=detail(env,"REV-A").data.revision;const result=call(env,"hideReview_",{review_id:"REV-A",expected_revision:rev});assert.equal(result.error.code,"OUTCOME_UNKNOWN",option);assert.equal(result.error.retryable,false);assert.equal(env.state.bumps,1,option+" invalidates before the attempted public change");}
  const audit=load({role:"editor",auditFail:true});let rev=detail(audit,"REV-A").data.revision;let result=call(audit,"hideReview_",{review_id:"REV-A",expected_revision:rev});assert.equal(result.ok,true);assert.equal(result.data.audit_status,"unconfirmed");
  const cache=load({role:"editor"});rev=detail(cache,"REV-A").data.revision;call(cache,"replyReview_",{review_id:"REV-A",expected_revision:rev,admin_reply:"fresh"});assert.equal(cache.state.bumps,1);rev=detail(cache,"REV-P").data.revision;call(cache,"replyReview_",{review_id:"REV-P",expected_revision:rev,admin_reply:"not public yet"});assert.equal(cache.state.bumps,1);rev=detail(cache,"REV-P").data.revision;call(cache,"approveReview_",{review_id:"REV-P",expected_revision:rev});assert.equal(cache.state.bumps,2);
  const cacheFailure=load({role:"editor",cacheFail:true});rev=detail(cacheFailure,"REV-A").data.revision;assert.equal(call(cacheFailure,"hideReview_",{review_id:"REV-A",expected_revision:rev}).error.code,"SERVER_ERROR");assert.equal(cacheFailure.state.writes,0);
});

// F-23: Sheets drops the apostrophe that the public submit adds, so a stored review reads back as bare "=…".
// Every admin rewrite must re-escape it, never turn it into a live formula, and still verify and keep revisions stable.
test("F-23 admin rewrites never turn stored formula-like review text into a live formula", () => {
  const injected = () => [{ review_id:"REV-X", place_id:"P-1", reviewer_name:"=HYPERLINK(\"https://example.com\")", is_anonymous:false, rating:4, comment:"=IMPORTXML(\"https://example.com\",\"//a\")", admin_reply:"", status:"pending", created_at:"2026-10-01 10:00:00", updated_at:"2026-10-01 10:00:00", approved_at:"", approved_by:"" }];
  const actions = [
    ["deleteReview_", "super_admin", {}, "deleted"],
    ["approveReview_", "reviewer", {}, "approved"],
    ["hideReview_", "reviewer", {}, "hidden"],
    ["replyReview_", "editor", { admin_reply:"=thanks" }, "pending"]
  ];
  for (const [action, role, extra, status] of actions) {
    const env = load({ role, sheetsSemantics:true, reviews:injected() });
    const before = detail(env, "REV-X").data;
    const result = call(env, action, { review_id:"REV-X", expected_revision:before.revision, ...extra });
    assert.equal(result.ok, true, `${action}: ${JSON.stringify(result.error)}`);
    assert.equal(env.state.formulas || 0, 0, `${action} created a live formula`);
    const stored = env.state.reviews[0];
    assert.equal(stored.reviewer_name, "=HYPERLINK(\"https://example.com\")", `${action} changed reviewer_name`);
    assert.equal(stored.comment, "=IMPORTXML(\"https://example.com\",\"//a\")", `${action} changed comment`);
    assert.equal(stored.status, status);
    assert.equal(result.data.audit_status, "recorded");
    const after = detail(env, "REV-X").data;
    assert.equal(result.data.revision, after.revision, `${action}: returned revision must match the next read`);
    assert.equal(after.comment, "=IMPORTXML(\"https://example.com\",\"//a\")");
    if (action === "replyReview_") { assert.equal(stored.admin_reply, "=thanks"); assert.equal(after.admin_reply, "=thanks"); }
  }
});

test("F-23 a rewrite that really produced a formula result is reported as OUTCOME_UNKNOWN", () => {
  // Simulate a sheet that ignores the apostrophe marker: the verify must fail closed, not report success.
  const env = load({ role:"super_admin", reviews:[{ review_id:"REV-X", place_id:"P-1", reviewer_name:"Bob", is_anonymous:false, rating:4, comment:"=1+1", admin_reply:"", status:"pending", created_at:"2026-10-01 10:00:00", updated_at:"2026-10-01 10:00:00", approved_at:"", approved_by:"" }] });
  const rev = detail(env, "REV-X").data.revision;
  const original = env.context.SheetService_replaceObjectAtRow_;
  env.context.SheetService_replaceObjectAtRow_ = (name, row, record) => { original(name, row, record); env.state.reviews[row - 2].comment = 2; };
  const result = call(env, "deleteReview_", { review_id:"REV-X", expected_revision:rev });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "OUTCOME_UNKNOWN");
});

if(process.exitCode)process.exit(process.exitCode);
process.stdout.write("Admin Review service verification passed.\n");
