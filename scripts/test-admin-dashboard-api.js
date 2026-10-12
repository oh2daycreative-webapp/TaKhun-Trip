"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../public/admin/js/admin-api.js"),"utf8");
const TOKEN="-".padEnd(43,"A"),ENDPOINT="https://api.example/exec";
const summary={total_places:3,total_routes:4,total_products:5,total_events:6,pending_reviews:7,total_gallery:8,warnings:[{domain:"reviews",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:2}]};
function response(data){return{ok:true,status:200,text:async()=>JSON.stringify({ok:true,data,message:"success"})};}
function load(responder,options={}){const calls=[],timers=[];const context={window:{APP_CONFIG:{API_URL:ENDPOINT},fetch:async(url,request)=>{calls.push({url,request});return responder(JSON.parse(request.body));},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},AbortController:options.noAbort?undefined:class{constructor(){this.signal={};}abort(){this.signal.aborted=true;}}},URL,JSON,Object,Array,String,Number,Boolean,Date,Math,RegExp,Set,Map,Error,TypeError,Promise};context.window.window=context.window;vm.createContext(context);vm.runInContext(source,context);return{api:context.window.TakhunAdminApi,calls,timers};}
async function rejectsCode(fn,code){try{await fn();assert.fail(`expected ${code}`);}catch(error){assert.equal(error&&error.code,code);}}
const tests=[];function test(name,fn){tests.push([name,fn]);}

test("exports getDashboard and sends one exact body-only POST",async()=>{const h=load(()=>response(summary));assert.equal(typeof h.api.getDashboard,"function");const result=await h.api.getDashboard(TOKEN);assert.deepEqual(JSON.parse(JSON.stringify(result)),summary);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,ENDPOINT);assert.equal(h.calls[0].request.method,"POST");assert.deepEqual(JSON.parse(h.calls[0].request.body),{action:"adminGetDashboard",token:TOKEN});assert.equal(new URL(h.calls[0].url).search,"");});

test("strictly rejects malformed counts and warning projections",async()=>{const malformed=[
  {...summary,total_places:-1},{...summary,total_routes:1.5},{...summary,total_products:Number.MAX_SAFE_INTEGER+1},{...summary,total_events:"6"},{...summary,pending_reviews:null},{...summary,total_gallery:Infinity},
  {...summary,secret:true},{...summary,warnings:undefined},{...summary,warnings:[{domain:"unknown",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1}]},
  {...summary,warnings:[{domain:"reviews",code:"OTHER",skipped_count:1}]},{...summary,warnings:[{domain:"reviews",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:0}]},
  {...summary,warnings:[{domain:"reviews",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1,raw:"secret"}]},
  {...summary,warnings:[{domain:"reviews",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1},{domain:"reviews",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:2}]},
  {...summary,warnings:[{domain:"gallery",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1},{domain:"places",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1}]}
];for(const value of malformed){const h=load(()=>response(value));await rejectsCode(()=>h.api.getDashboard(TOKEN),"MALFORMED_RESPONSE");assert.equal(h.calls.length,1);}});

test("accepts exact zero summary and canonical ordered warning domains",async()=>{const value={total_places:0,total_routes:0,total_products:0,total_events:0,pending_reviews:0,total_gallery:0,warnings:["places","routes","products","events","reviews","gallery"].map(domain=>({domain,code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1}))};const h=load(()=>response(value));assert.deepEqual(JSON.parse(JSON.stringify(await h.api.getDashboard(TOKEN))),value);});

test("rejects a Dashboard success envelope whose message is not the exact contract literal",async()=>{for(const message of ["ok","Success","success ",""]){const h=load(()=>({ok:true,status:200,text:async()=>JSON.stringify({ok:true,data:summary,message})}));await rejectsCode(()=>h.api.getDashboard(TOKEN),"MALFORMED_RESPONSE");assert.equal(h.calls.length,1);}});

test("backend network HTTP and malformed outcomes are safe and never retried",async()=>{for(const responder of [()=>{throw new TypeError("TOKEN secret");},()=>({ok:false,status:503,text:async()=>"secret"}),()=>({ok:true,status:200,text:async()=>"not json"}),()=>({ok:true,status:200,text:async()=>JSON.stringify({ok:false,error:{code:"UNAUTHORIZED",message:"safe"}})})]){const h=load(responder);await assert.rejects(h.api.getDashboard(TOKEN),error=>["NETWORK_ERROR","HTTP_ERROR","MALFORMED_RESPONSE","UNAUTHORIZED"].includes(error.code));assert.equal(h.calls.length,1);}});

test("invalid token fails before fetch",async()=>{const h=load(()=>{throw Error("fetch must not run")});await rejectsCode(()=>h.api.getDashboard("bad"),"VALIDATION_ERROR");assert.equal(h.calls.length,0);});

(async()=>{for(const [name,fn] of tests){try{await fn();process.stdout.write(`PASS ${name}\n`);}catch(error){process.stderr.write(`FAIL ${name}\n${error.stack}\n`);process.exitCode=1;}}if(process.exitCode)process.exit(process.exitCode);process.stdout.write("Admin Dashboard API verification passed.\n");})();
