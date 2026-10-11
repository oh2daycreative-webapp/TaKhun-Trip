"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../public/admin/js/admin-api.js"),"utf8");
const TOKEN="-".padEnd(43,"A"),REVISION="r1-"+"a".repeat(64),ENDPOINT="https://api.example/exec";
const record={review_id:"REV-1",place_id:"P-1",reviewer_name:"นักท่องเที่ยว",is_anonymous:true,rating:5,comment:"ดี",admin_reply:"ขอบคุณ",status:"approved",created_at:"2026-10-01 10:00:00",updated_at:"2026-10-02 10:00:00",approved_at:"2026-10-02 10:00:00",approved_by:"ADM-1",revision:REVISION};
function response(data){return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,data,message:"success"})};}
function load(responder){const calls=[];const context={window:{APP_CONFIG:{API_URL:ENDPOINT},fetch:async(url,options)=>{calls.push({url,options});return responder(JSON.parse(options.body));},setTimeout:()=>1,clearTimeout:()=>{},AbortController:class{constructor(){this.signal={};}abort(){}}},URL,JSON,Object,Array,String,Number,Boolean,Date,Math,RegExp,Set,Map,Error,TypeError,Promise};context.window.window=context.window;vm.createContext(context);vm.runInContext(source,context);return{api:context.window.TakhunAdminApi,calls};}
const methods={getReviews:"adminGetReviews",getReviewDetail:"adminGetReviewDetail",approveReview:"approveReview",hideReview:"hideReview",replyReview:"replyReview",clearReviewReply:"clearReviewReply",deleteReview:"deleteReview"};
function payload(method){if(method==="getReviews")return{status:"pending",place_id:"P-1",page:1,page_size:20};if(method==="getReviewDetail")return{review_id:"REV-1"};const result={review_id:"REV-1",expected_revision:REVISION};if(method==="replyReview")result.admin_reply="ขอบคุณ";return result;}
async function rejectsCode(fn,code){try{await fn();assert.fail(`expected ${code}`);}catch(error){assert.equal(error&&error.code,code);}}
function test(name,fn){Promise.resolve().then(fn).then(()=>process.stdout.write(`PASS ${name}\n`),error=>{process.stderr.write(`FAIL ${name}\n${error.stack}\n`);process.exitCode=1;});}

test("exports exact Review facades and sends one body-only POST",async()=>{for(const [method,action] of Object.entries(methods)){const h=load(body=>{const mutation=!method.startsWith("get");const item={...record};if(method==="approveReview")item.status="approved";if(method==="hideReview")item.status="hidden";if(method==="deleteReview")item.status="deleted";if(method==="clearReviewReply")item.admin_reply="";return response(method==="getReviews"?{items:[record],page:1,page_size:20,total:1,total_pages:1,warning:null}:{...item,...(mutation?{audit_status:"recorded"}:{})});});assert.equal(typeof h.api[method],"function",method);await h.api[method](TOKEN,payload(method));assert.equal(h.calls.length,1);const call=h.calls[0],body=JSON.parse(call.options.body);assert.equal(call.url,ENDPOINT);assert.equal(call.options.method,"POST");assert.deepEqual(Object.keys(body),["action","token","payload"]);assert.equal(body.action,action);assert.equal(body.token,TOKEN);assert.deepEqual(body.payload,payload(method));}}
);

test("rejects unknown keys malformed revisions replies and filters before fetch",async()=>{for(const [method,bad] of [["getReviews",{page_size:101}],["getReviewDetail",{review_id:"../bad"}],["approveReview",{review_id:"REV-1",expected_revision:"bad"}],["hideReview",{review_id:"REV-1",expected_revision:REVISION,extra:true}],["replyReview",{review_id:"REV-1",expected_revision:REVISION,admin_reply:"nul\0bad"}],["replyReview",{review_id:"REV-1",expected_revision:REVISION,admin_reply:"'=ambiguous"}],["clearReviewReply",{review_id:"REV-1",expected_revision:REVISION,admin_reply:"x"}]]){const h=load(()=>{throw Error("fetch must not run")});await rejectsCode(()=>h.api[method](TOKEN,bad),"VALIDATION_ERROR");assert.equal(h.calls.length,0);}}
);

test("accepts empty reviewer names and exact safe skipped-row warnings",async()=>{
  const empty={...record,reviewer_name:""};
  const h=load(()=>response({items:[empty],page:1,page_size:20,total:1,total_pages:1,warning:{code:"SKIPPED_INVALID_REVIEWS",skipped_count:3}}));
  const result=await h.api.getReviews(TOKEN,{});
  assert.equal(result.items[0].reviewer_name,"");
  assert.deepEqual(JSON.parse(JSON.stringify(result.warning)),{code:"SKIPPED_INVALID_REVIEWS",skipped_count:3});
  for(const warning of [{code:"OTHER",skipped_count:3},{code:"SKIPPED_INVALID_REVIEWS",skipped_count:0},{code:"SKIPPED_INVALID_REVIEWS",skipped_count:3,secret:true},undefined]){
    const bad=load(()=>response({items:[record],page:1,page_size:20,total:1,total_pages:1,...(warning===undefined?{}:{warning})}));
    await rejectsCode(()=>bad.api.getReviews(TOKEN,{}),"MALFORMED_RESPONSE");
  }
});

test("strictly validates Review responses and preserves OUTCOME_UNKNOWN without retry",async()=>{const malformed=load(()=>response({...record,secret:"leak"}));await assert.rejects(malformed.api.getReviewDetail(TOKEN,{review_id:"REV-1"}),error=>error.code==="MALFORMED_RESPONSE");const uncertain=load(()=>({ok:true,status:200,text:async()=>JSON.stringify({ok:false,error:{code:"OUTCOME_UNKNOWN",message:"safe",retryable:false,review_id:"REV-1"}})}));await assert.rejects(uncertain.api.hideReview(TOKEN,{review_id:"REV-1",expected_revision:REVISION}),error=>error.code==="OUTCOME_UNKNOWN"&&error.retryable===false&&error.review_id==="REV-1");assert.equal(uncertain.calls.length,1);}
);

test("preserves CONTENT_LOCK exactly and never retries the mutation",async()=>{
  const busy=load(()=>({ok:true,status:200,text:async()=>JSON.stringify({ok:false,error:{code:"CONTENT_LOCK",message:"busy"}})}));
  await rejectsCode(()=>busy.api.hideReview(TOKEN,{review_id:"REV-1",expected_revision:REVISION}),"CONTENT_LOCK");
  assert.equal(busy.calls.length,1);
});

process.on("beforeExit",()=>{if(process.exitCode)process.exit(process.exitCode);else process.stdout.write("Admin Reviews API verification passed.\n");});
