"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const roles = ["super_admin", "editor", "reviewer", "viewer"];
const reviewHeaders = ["review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment", "admin_reply", "status", "created_at", "updated_at", "approved_at", "approved_by"];
const headers = {
  places: ["place_id", "status"],
  routes: ["route_id", "status"],
  products: ["product_id", "status"],
  events: ["event_id", "status"],
  reviews: reviewHeaders,
  gallery: ["media_id", "status"]
};
const copy = value => JSON.parse(JSON.stringify(value));

function validReview(id, status) {
  return { review_id:id, place_id:"P-1", reviewer_name:"Guest", is_anonymous:false, rating:5, comment:"Good", admin_reply:"", status, created_at:"2026-10-01 10:00:00", updated_at:"2026-10-01 10:00:00", approved_at:"", approved_by:"" };
}

function fixture() {
  return {
    places:[{place_id:"P-D",status:"draft"},{place_id:"P-P",status:"published"},{place_id:"P-A",status:"archived"}],
    routes:[{route_id:"R-D",status:"draft"},{route_id:"R-P",status:"published"},{route_id:"R-H",status:"hidden"},{route_id:"R-A",status:"archived"},{route_id:"R-X",status:"deleted"}],
    products:[{product_id:"PR-1",status:"published"},{product_id:"PR-X",status:"deleted"}],
    events:[{event_id:"E-OLD",status:"published"},{event_id:"E-DRAFT",status:"draft"},{event_id:"E-X",status:"deleted"}],
    reviews:[validReview("REV-P","pending"),validReview("REV-A","approved"),validReview("REV-D","deleted")],
    gallery:[{media_id:"gallery-one",status:"published"},{media_id:"video-one",status:"hidden"},{media_id:"gone",status:"deleted"}]
  };
}

function load(options = {}) {
  const state = { tables:copy(options.tables || fixture()), reads:[], authCalls:[], writes:0, cache:0, audits:0, properties:0, locks:0 };
  const context = {
    JSON,Object,Array,String,Number,Boolean,Date,Math,RegExp,Map,Set,isFinite,
    AuthService_requireAdmin_(token) {
      state.authCalls.push(token);
      if (options.unauthorized || token !== "TOKEN") throw Error("UNAUTHORIZED");
      return {admin_id:"ADM-1",role:options.role || "viewer"};
    },
    SheetService_readTable_(name, required) {
      assert.equal(state.authCalls.length, 1, "authentication must precede every read");
      state.reads.push(name);
      if (options.failRead === name) throw Error("sheet failed");
      assert.equal(JSON.stringify(required), JSON.stringify(headers[name]), `${name} count headers`);
      return {headers:[...required],headerMap:Object.fromEntries(required.map((key,index)=>[key,index])),rows:(state.tables[name] || []).map((values,index)=>({sourceRowNumber:index+2,values:{...values}}))};
    },
    SheetService_appendObjectWithRow_(){state.writes++;throw Error("write forbidden");},
    SheetService_replaceObjectAtRow_(){state.writes++;throw Error("write forbidden");},
    SheetService_clearRow_(){state.writes++;throw Error("write forbidden");},
    PlaceService_cacheEpoch_(){state.cache++;throw Error("cache forbidden");},
    PlaceService_bumpCacheEpoch_(){state.cache++;throw Error("cache forbidden");},
    PropertiesService:{getScriptProperties(){state.properties++;throw Error("properties forbidden");}},
    LockService:{getScriptLock(){state.locks++;throw Error("lock forbidden");}},
    SpreadsheetApp:{flush(){state.writes++;throw Error("flush forbidden");}}
  };
  vm.createContext(context);
  for (const name of ["AdminReviewService.gs","AdminDashboardService.gs"]) {
    const file = path.join(root,"apps-script",name);
    vm.runInContext(fs.existsSync(file) ? fs.readFileSync(file,"utf8") : "",context,{filename:`apps-script/${name}`});
  }
  return {context,state};
}

function call(env) {
  assert.equal(typeof env.context.adminGetDashboard_, "function", "adminGetDashboard_ must exist");
  return copy(env.context.adminGetDashboard_("TOKEN"));
}
function test(name, fn) { try { fn(); process.stdout.write(`PASS ${name}\n`); } catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode=1; } }

test("all authenticated Admin roles receive exact fresh lifecycle counts", () => {
  for (const role of roles) {
    const env=load({role}), result=call(env);
    assert.equal(result.ok,true,role);
    assert.deepEqual(result.data,{total_places:3,total_routes:4,total_products:1,total_events:2,pending_reviews:1,total_gallery:2,warnings:[]});
    assert.deepEqual(env.state.reads,["places","routes","products","events","reviews","gallery"]);
    assert.deepEqual(env.state.authCalls,["TOKEN"]);
  }
});

test("duplicates and malformed count fields are skipped deterministically with safe ordered warnings", () => {
  const tables=fixture();
  tables.places.push({place_id:"P-DUP",status:"published"},{place_id:"P-DUP",status:"archived"},{place_id:"",status:"published"},{place_id:"P-BAD",status:"deleted"});
  tables.routes.push({route_id:"R-DUP",status:"deleted"},{route_id:"R-DUP",status:"published"});
  tables.products.push({product_id:"PR-BAD",status:"future"});
  tables.events.push({event_id:"E-DUP",status:"published"},{event_id:"E-DUP",status:"published"});
  tables.gallery.push({media_id:"bad id",status:"published"});
  const result=call(load({tables}));
  assert.deepEqual(result.data,{total_places:3,total_routes:4,total_products:1,total_events:2,pending_reviews:1,total_gallery:2,warnings:[
    {domain:"places",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:4},
    {domain:"routes",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:2},
    {domain:"products",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1},
    {domain:"events",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:2},
    {domain:"gallery",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:1}
  ]});
  assert.equal(JSON.stringify(result).includes("P-DUP"),false);
  assert.equal(JSON.stringify(result).includes("sourceRowNumber"),false);
});

test("pending Reviews count only fully valid unique rows and warn for every skipped row", () => {
  const tables=fixture();
  tables.reviews.push(validReview("REV-DUP","pending"),validReview("REV-DUP","deleted"));
  tables.reviews.push({...validReview("REV-RATING","pending"),rating:0});
  tables.reviews.push({...validReview("REV-STATUS","future")});
  tables.reviews.push({...validReview("REV-NONPENDING","approved"),comment:"bad\0text"});
  const result=call(load({tables}));
  assert.equal(result.data.pending_reviews,1);
  assert.deepEqual(result.data.warnings,[{domain:"reviews",code:"SKIPPED_INVALID_OR_DUPLICATE_ROWS",skipped_count:5}]);
});

test("failed auth reads nothing and a failed table read returns no partial projection", () => {
  const unauthorized=load({unauthorized:true}), denied=call(unauthorized);
  assert.equal(denied.ok,false);assert.equal(denied.error.code,"UNAUTHORIZED");assert.deepEqual(unauthorized.state.reads,[]);
  const failed=load({failRead:"events"}), result=call(failed);
  assert.equal(result.ok,false);assert.equal(result.error.code,"SERVER_ERROR");assert.equal("data" in result,false);
  assert.deepEqual(failed.state.reads,["places","routes","products","events"]);
});

test("Dashboard reads perform no entity cache audit property lock or flush writes", () => {
  const env=load(), result=call(env);assert.equal(result.ok,true);
  assert.deepEqual({writes:env.state.writes,cache:env.state.cache,audits:env.state.audits,properties:env.state.properties,locks:env.state.locks},{writes:0,cache:0,audits:0,properties:0,locks:0});
  const source=fs.readFileSync(path.join(root,"apps-script/AdminDashboardService.gs"),"utf8");
  assert.doesNotMatch(source,/SheetService_(?:append|replace|clear)|SpreadsheetApp|LockService|PropertiesService|cacheEpoch|bumpCache|activity_logs|audit/i);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin Dashboard service verification passed.\n");
