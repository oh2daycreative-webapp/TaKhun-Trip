"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/favorites.js"), "utf8");

function loadFavorites() {
  const context = {
    URL, URLSearchParams, console, setTimeout, clearTimeout,
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    location: { href: "https://example.test/favorites.html", pathname: "/favorites.html", search: "" },
    window: null
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "favorites.js" });
  return context.TakhunFavorites;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const api = loadFavorites();

for (const name of [
  "validatePlaceId", "sanitizeFavorites", "parseFavoritesStorage", "serializeFavorites",
  "removeFavorite", "detailUrl", "mapUrl", "tripPlannerUrl", "loadPlaceDetailsLimited",
  "mergeLoadedPlaces", "classifyLoadResults", "createGenerationGate", "parseStorageEvent",
  "resolveState", "setPageState"
]) assert.equal(typeof api[name], "function", `missing helper ${name}`);

for (const id of ["BTK-001", "place_2", "A1"]) assert.equal(api.validatePlaceId(id), true);
for (const id of ["", "bad id", "../bad", "A/B", "<script>", "A".repeat(65)]) assert.equal(api.validatePlaceId(id), false);

{
  const sourceIds = [" BTK-001 ", "BTK-002", "BTK-001", 42, null, "bad id", "place_3"];
  const snapshot = JSON.stringify(sourceIds);
  assert.deepEqual(plain(api.sanitizeFavorites(sourceIds)), ["BTK-001", "BTK-002", "place_3"]);
  assert.equal(JSON.stringify(sourceIds), snapshot);
  assert.deepEqual(plain(api.sanitizeFavorites(null)), []);
}

assert.deepEqual(plain(api.parseFavoritesStorage('["BTK-001","BTK-001"," BTK-002 "]').ids), ["BTK-001", "BTK-002"]);
assert.equal(api.parseFavoritesStorage('["BTK-001"]').recovered, false);
assert.deepEqual(plain(api.parseFavoritesStorage("not json")), { ids: [], recovered: true });
assert.deepEqual(plain(api.parseFavoritesStorage('{"ids":[]}')), { ids: [], recovered: true });
assert.deepEqual(plain(api.parseFavoritesStorage("null")), { ids: [], recovered: true });
assert.deepEqual(plain(api.parseFavoritesStorage(null)), { ids: [], recovered: false });
assert.equal(api.serializeFavorites([" BTK-001 ", "BTK-001", "BTK-002"]), '["BTK-001","BTK-002"]');
assert.deepEqual(plain(api.removeFavorite(["BTK-001", "BTK-002"], "BTK-001")), ["BTK-002"]);
assert.deepEqual(plain(api.removeFavorite(["BTK-001"], "BTK-001")), []);

assert.equal(api.detailUrl("BTK A/B"), "place-detail.html?id=BTK%20A%2FB");
assert.equal(api.mapUrl("BTK A/B"), "map.html?focus=BTK%20A%2FB");
assert.equal(api.tripPlannerUrl("BTK A/B"), "trip-planner.html?add=BTK%20A%2FB");

(async () => {
  {
    const ids = ["BTK-1", "BTK-2", "BTK-3", "BTK-4", "BTK-5"];
    let active = 0;
    let maxActive = 0;
    const results = await api.loadPlaceDetailsLimited(ids, async (id) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, id === "BTK-2" ? 4 : 1));
      active -= 1;
      if (id === "BTK-4") throw new Error("failed");
      return { place_id: id };
    }, 3);
    assert.ok(maxActive <= 3, `max concurrency was ${maxActive}`);
    assert.deepEqual(plain(results.map((entry) => entry.placeId)), ids);
    assert.equal(results[3].status, "rejected");
    assert.deepEqual(plain(api.mergeLoadedPlaces(ids, results).map((place) => place.place_id)), ["BTK-1", "BTK-2", "BTK-3", "BTK-5"]);
  }

  {
    const malformed = await api.loadPlaceDetailsLimited(["BTK-1", "BTK-2"], async (id) => id === "BTK-1" ? {} : { place_id: "WRONG-ID" }, 2);
    assert.deepEqual(plain(malformed.map((entry) => entry.status)), ["rejected", "rejected"]);
    assert.equal(api.classifyLoadResults(malformed), "error");
  }

  assert.equal(api.classifyLoadResults([]), "empty");
  assert.equal(api.classifyLoadResults([{ status: "fulfilled" }]), "ready");
  assert.equal(api.classifyLoadResults([{ status: "fulfilled" }, { status: "rejected" }]), "partial-error");
  assert.equal(api.classifyLoadResults([{ status: "rejected" }]), "error");

  {
    const gate = api.createGenerationGate();
    const first = gate.next();
    const second = gate.next();
    assert.equal(gate.isCurrent(first), false);
    assert.equal(gate.isCurrent(second), true);
    gate.invalidate();
    assert.equal(gate.isCurrent(second), false);
  }

  assert.deepEqual(plain(api.parseStorageEvent({ key: "OTHER", newValue: '["BTK-1"]' })), { handled: false, ids: [], recovered: false });
  assert.deepEqual(plain(api.parseStorageEvent({ key: "TAKHUN_FAVORITES", newValue: '["BTK-2","BTK-2"]' })), { handled: true, ids: ["BTK-2"], recovered: false });
  assert.deepEqual(plain(api.parseStorageEvent({ key: "TAKHUN_FAVORITES", newValue: "bad" })), { handled: true, ids: [], recovered: true });

  for (const [input, expected] of [
    [{ initial: true }, "initial"], [{ loading: true }, "loading"], [{ ids: [] }, "empty"],
    [{ results: [{ status: "fulfilled" }] }, "ready"],
    [{ results: [{ status: "fulfilled" }, { status: "rejected" }] }, "partial-error"],
    [{ results: [{ status: "rejected" }] }, "error"],
    [{ ids: [], recovered: true }, "malformed-storage-recovered"]
  ]) assert.equal(api.resolveState(input), expected);

  {
    const names = ["initial", "loading", "ready", "empty", "partial-error", "error", "malformed-storage-recovered"];
    const states = Object.fromEntries(names.map((name) => [name, { hidden: false }]));
    for (const active of names) {
      assert.equal(api.setPageState(states, active), true);
      assert.equal(Object.values(states).filter((state) => !state.hidden).length, 1);
    }
  }

  process.stdout.write("Favorites behavior verification passed.\n");
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
