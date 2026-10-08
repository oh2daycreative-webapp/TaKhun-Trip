"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));

const routeFields = [
  "name_th",
  "name_en",
  "slug",
  "short_description_th",
  "short_description_en",
  "description_th",
  "description_en",
  "duration",
  "travel_style",
  "cover_image_url",
  "map_focus_lat",
  "map_focus_lng",
  "is_featured",
  "sort_order"
];

const routeHeaders = [
  "route_id",
  ...routeFields,
  "status",
  "created_at",
  "updated_at"
];

const stopHeaders = [
  "route_place_id",
  "route_id",
  "place_id",
  "day_number",
  "stop_order",
  "start_time",
  "end_time",
  "note_th",
  "note_en",
  "status"
];

const auditHeaders = [
  "log_id",
  "admin_id",
  "action",
  "entity_type",
  "entity_id",
  "description",
  "created_at",
  "audit_id",
  "actor_admin_id",
  "occurred_at"
];

function routeContent(overrides = {}) {
  return {
    name_th: "เส้นทางทดสอบ",
    name_en: "Test Route",
    slug: "test-route",
    short_description_th: "เส้นทางสำหรับทดสอบ",
    short_description_en: "Route for testing",
    description_th: "รายละเอียดเส้นทางสำหรับการทดสอบระบบ",
    description_en: "Route description for system testing",
    duration: "1 วัน",
    travel_style: "nature|community",
    cover_image_url: "",
    map_focus_lat: 8.9,
    map_focus_lng: 98.9,
    is_featured: false,
    sort_order: 1,
    ...overrides
  };
}

function stop(placeId, overrides = {}) {
  return {
    place_id: placeId,
    ...overrides
  };
}

function harness(options = {}) {
  let held = false;
  let uuid = 0;

  const effects = [];
  const cacheValues = new Map();

  const tables = {
    routes: [routeHeaders.slice()],
    route_places: [stopHeaders.slice()],
    places: [
      ["place_id", "status"],
      ["PLC-1", "published"],
      ["PLC-2", "published"],
      ["PLC-3", "draft"],
      ["PLC-ARCHIVED", "archived"],
      ["PLC-DELETED", "deleted"]
    ],
    activity_logs: [auditHeaders.slice()]
  };

  const sheet = name => ({
    getName: () => name,

    getLastRow: () => tables[name].length,

    getLastColumn: () => tables[name][0].length,

    getMaxRows: () => 1000,

    getDataRange: () => ({
      getValues: () => {
        if (options.failRead === name) {
          throw Error("PRIVATE SHEET DETAILS");
        }

        return tables[name].map(row => row.slice());
      }
    }),

    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () =>
        Array.from(
          { length: nr },
          (_, ri) =>
            Array.from(
              { length: nc },
              (_, ci) =>
                tables[name][r - 1 + ri]?.[c - 1 + ci] ?? ""
            )
        ),

      getNumberFormats: () => [
        Array.from(
          { length: nc },
          (_, ci) => {
            const field = tables[name][0][c - 1 + ci];

            if (options.badFormat) {
              return "General";
            }

            if (field === "is_featured") {
              return options.booleanFormat || "0";
            }

            return "@";
          }
        )
      ],

      getFormulas: () => [
        Array(nc).fill(options.formula ? "=1+1" : "")
      ],

      setValues: rows => {
        assert.equal(
          held,
          true,
          "all writes must hold the script lock"
        );

        effects.push({
          name,
          r,
          rows: plain(rows)
        });

        if (options.failWrite === name) {
          throw Error("PRIVATE WRITE DETAILS");
        }

        rows.forEach((row, ri) => {
          const targetRow = r - 1 + ri;

          tables[name][targetRow] ||= Array(
            tables[name][0].length
          ).fill("");

          row.forEach((value, ci) => {
            tables[name][targetRow][c - 1 + ci] = value;
          });
        });

        if (options.throwAfterWrite === name) {
          throw Error("LOST WRITE RESPONSE");
        }

        if (options.readFailureAfterWrite === name) {
          options.failRead = name;
        }
      }
    })
  });

  const cache = {
    get: key => cacheValues.get(key) ?? null,

    put: (key, value) => {
      cacheValues.set(key, value);
    },

    remove: key => {
      if (options.cacheRemoveFail) {
        throw Error("cache unavailable");
      }

      cacheValues.delete(key);
    }
  };

  const context = {
    console,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Math,
    RegExp,
    isFinite,
    encodeURIComponent,

    Utilities: {
      getUuid: () =>
        `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`
    },

    CacheService: {
      getScriptCache: () => cache
    },

    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (held || options.lockFail) {
            return false;
          }

          held = true;

          if (options.onLock) {
            options.onLock();
          }

          return true;
        },

        releaseLock: () => {
          held = false;

          if (options.releaseFail) {
            throw Error("release failed");
          }
        }
      })
    },

    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null
      })
    },

    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: name =>
          tables[name] ? sheet(name) : null
      }),

      flush: () => {}
    },

    getAppConfig_: () => ({
      spreadsheetId: "local-test-only"
    }),

    AuthService_requireAdmin_: token => {
      if (
        !["viewer", "reviewer", "editor", "super_admin"].includes(token) ||
        options.revoked
      ) {
        throw Error("UNAUTHORIZED");
      }

      return {
        admin_id: "ADM-1",
        role: options.role || token
      };
    },

    createJsonResponse_: value => value,

    PLACE_PUBLIC_CACHE_EPOCH_PROPERTY_: "PLACE_PUBLIC_CACHE_EPOCH"
  };

  vm.createContext(context);

  for (const name of [
    "CryptoService",
    "SheetService",
    "ContentCacheService",
    "PlaceService",
    "RouteService",
    "AdminRouteService",
    "Router"
  ]) {
    const file = path.join(
      root,
      "apps-script",
      name + ".gs"
    );

    if (fs.existsSync(file)) {
      vm.runInContext(
        fs.readFileSync(file, "utf8"),
        context,
        { filename: file }
      );
    }
  }

  function call(action, token, payload) {
    assert.equal(
      typeof context[action + "_"],
      "function",
      action + "_ must exist"
    );

    return plain(
      context[action + "_"](token, payload)
    );
  }

  return {
    context,
    options,
    effects,
    tables,
    cacheValues,
    call
  };
}

let checks = 0;

function test(name, run) {
  run();
  checks++;
  console.log("PASS " + name);
}

function error(result, code) {
  assert.equal(
    result.ok,
    false,
    JSON.stringify(result)
  );

  assert.equal(result.error.code, code);

  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE|stack|local-test-only/
  );
}

test(
  "Route create detail list update reorder and stale revision",
  () => {
    const h = harness();

    const created = h.call(
      "createRoute",
      "editor",
      {
        content: routeContent(),
        stops: [
          stop("PLC-1", {
            day_number: 1,
            stop_order: 1,
            start_time: "09:00",
            end_time: "10:00",
            note_th: "จุดแรก"
          }),
          stop("PLC-2", {
            day_number: 1,
            stop_order: 2,
            start_time: "10:30",
            end_time: "11:30",
            note_th: "จุดที่สอง"
          })
        ]
      }
    );

    assert.equal(
      created.ok,
      true,
      JSON.stringify(created)
    );

    assert.match(
      created.data.route_id,
      /^ROUTE-[A-Za-z0-9_-]+$/
    );

    assert.equal(created.data.status, "draft");

    assert.match(
      created.data.revision,
      /^r1-[a-f0-9]{64}$/
    );

    assert.equal(
      created.data.audit_status,
      "recorded"
    );

    const routeId = created.data.route_id;

    const detail = h.call(
      "adminGetRouteDetail",
      "viewer",
      { route_id: routeId }
    );

    assert.equal(
      detail.ok,
      true,
      JSON.stringify(detail)
    );

    assert.equal(
      detail.data.route_id,
      routeId
    );

    assert.equal(
      detail.data.content.name_th,
      "เส้นทางทดสอบ"
    );

    assert.equal(detail.data.stops.length, 2);

    assert.deepEqual(
      detail.data.stops.map(item => item.place_id),
      ["PLC-1", "PLC-2"]
    );

    assert.deepEqual(
      detail.data.stops.map(item => item.stop_order),
      [1, 2]
    );

    for (const item of detail.data.stops) {
      assert.match(
        item.route_place_id,
        /^RP-[A-Za-z0-9_-]+$/
      );
    }

    const list = h.call(
      "adminGetRoutes",
      "reviewer",
      {
        keyword: "เส้นทางทดสอบ",
        status: "draft",
        page: 1,
        page_size: 20
      }
    );

    assert.equal(
      list.ok,
      true,
      JSON.stringify(list)
    );

    assert.equal(list.data.total, 1);
    assert.equal(
      list.data.items[0].route_id,
      routeId
    );

    assert.equal(
      list.data.items[0].revision,
      detail.data.revision
    );

    const oldRevision = detail.data.revision;

    const reorderedStops = [
      {
        ...detail.data.stops[1],
        stop_order: 1
      },
      {
        ...detail.data.stops[0],
        stop_order: 2
      }
    ];

    const updated = h.call(
      "updateRoute",
      "editor",
      {
        route_id: routeId,
        expected_revision: oldRevision,
        stops: reorderedStops
      }
    );

    assert.equal(
      updated.ok,
      true,
      JSON.stringify(updated)
    );

    assert.notEqual(
      updated.data.revision,
      oldRevision
    );

    const after = h.call(
      "adminGetRouteDetail",
      "viewer",
      { route_id: routeId }
    );

    assert.deepEqual(
      after.data.stops.map(item => item.place_id),
      ["PLC-2", "PLC-1"]
    );

    assert.deepEqual(
      after.data.stops.map(item => item.stop_order),
      [1, 2]
    );

    assert.equal(
      after.data.revision,
      updated.data.revision
    );

    const stale = h.call(
      "updateRoute",
      "editor",
      {
        route_id: routeId,
        expected_revision: oldRevision,
        content: routeContent({
          description_th: "ข้อมูลที่ไม่ควรเขียนทับ"
        })
      }
    );

    error(stale, "CONFLICT");

    assert.equal(
      h.tables.routes.length,
      2,
      "one retained route row"
    );

    assert.equal(
      h.tables.route_places.length,
      3,
      "two retained relationship rows"
    );
  }
);
test("Route authentication and role enforcement", () => {
  const h = harness();

  const created = h.call("createRoute", "editor", {
    content: routeContent(),
    stops: [stop("PLC-1", { stop_order: 1 })]
  }).data;

  for (const token of [undefined, "", "invalid"]) {
    error(
      h.call("adminGetRoutes", token, {}),
      "UNAUTHORIZED"
    );
  }

  for (const token of ["viewer", "reviewer"]) {
    assert.equal(
      h.call("adminGetRoutes", token, {}).ok,
      true
    );

    assert.equal(
      h.call("adminGetRouteDetail", token, {
        route_id: created.route_id
      }).ok,
      true
    );

    error(
      h.call("createRoute", token, {
        content: routeContent()
      }),
      "FORBIDDEN"
    );

    error(
      h.call("updateRoute", token, {
        route_id: created.route_id,
        expected_revision: created.revision
      }),
      "FORBIDDEN"
    );

    error(
      h.call("deleteRoute", token, {
        route_id: created.route_id,
        expected_revision: created.revision
      }),
      "FORBIDDEN"
    );
  }
});

test("Route strict envelopes and domain validation reject before writes", () => {
  const invalidCreates = [
    {
      bogus: true,
      content: routeContent()
    },
    {
      route_id: "CLIENT-ID",
      content: routeContent()
    },
    {
      content: routeContent({ bogus: "x" })
    },
    {
      content: routeContent({
        description_th: "=IMPORTXML(\"private\")"
      })
    },
    {
      content: routeContent({
        cover_image_url: "javascript:alert(1)"
      })
    },
    {
      content: routeContent({
        map_focus_lat: 91
      })
    },
    {
      content: routeContent({
        map_focus_lng: -181
      })
    },
    {
      content: routeContent({
        sort_order: -1
      })
    },
    {
      content: routeContent({
        is_featured: "true"
      })
    },
    {
      content: routeContent({
        travel_style: "nature||photo"
      })
    },
    {
      content: routeContent({
        travel_style: "nature|nature"
      })
    },
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 2 })
      ]
    },
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", {
          stop_order: 1,
          start_time: "24:00"
        })
      ]
    },
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", {
          stop_order: 1,
          end_time: "10:00"
        })
      ]
    },
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", {
          stop_order: 1,
          start_time: "11:00",
          end_time: "10:00"
        })
      ]
    },
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 1 }),
        stop("PLC-1", { stop_order: 2 })
      ]
    },
    {
      content: routeContent(),
      stops: [
        stop("MISSING", { stop_order: 1 })
      ]
    },
    {
      content: routeContent(),
      stops: [
        stop("PLC-ARCHIVED", { stop_order: 1 })
      ]
    },
    {
      content: routeContent(),
      stops: [
        stop("PLC-DELETED", { stop_order: 1 })
      ]
    }
  ];

  for (const payload of invalidCreates) {
    const h = harness();

    error(
      h.call("createRoute", "editor", payload),
      "VALIDATION_ERROR"
    );

    assert.equal(
      h.effects.length,
      0,
      JSON.stringify(payload)
    );
  }
});

test("Published Route requires published Places while draft may use draft Place", () => {
  const draftHarness = harness();

  const draft = draftHarness.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: [
        stop("PLC-3", { stop_order: 1 })
      ]
    }
  );

  assert.equal(
    draft.ok,
    true,
    JSON.stringify(draft)
  );

  const publishHarness = harness();

  error(
    publishHarness.call(
      "createRoute",
      "editor",
      {
        status: "published",
        content: routeContent(),
        stops: [
          stop("PLC-3", { stop_order: 1 })
        ]
      }
    ),
    "VALIDATION_ERROR"
  );

  assert.equal(
    publishHarness.effects.length,
    0
  );

  const validPublished = publishHarness.call(
    "createRoute",
    "editor",
    {
      status: "published",
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 1 })
      ]
    }
  );

  assert.equal(
    validPublished.ok,
    true,
    JSON.stringify(validPublished)
  );

  assert.equal(
    validPublished.data.status,
    "published"
  );
});

test("Route lifecycle follows the retained content transition matrix", () => {
  const transitions = {
    draft: ["published", "archived", "deleted"],
    published: ["hidden", "archived", "deleted"],
    hidden: ["draft", "published", "archived", "deleted"],
    archived: ["draft", "deleted"],
    deleted: ["draft"]
  };

  const statuses = [
    "draft",
    "published",
    "hidden",
    "archived",
    "deleted"
  ];

  for (const from of statuses) {
    for (const to of statuses) {
      if (from === to) {
        continue;
      }

      const h = harness();

      const created = h.call(
        "createRoute",
        "editor",
        {
          content: routeContent(),
          stops: []
        }
      ).data;

      const routeHeadersLocal = h.tables.routes[0];
      const statusIndex =
        routeHeadersLocal.indexOf("status");

      h.tables.routes[1][statusIndex] = from;

      const current = h.call(
        "adminGetRouteDetail",
        "editor",
        { route_id: created.route_id }
      ).data;

      const result = h.call(
        "updateRoute",
        "editor",
        {
          route_id: created.route_id,
          expected_revision: current.revision,
          status: to
        }
      );

      if (transitions[from].includes(to)) {
        assert.equal(
          result.ok,
          true,
          `${from} -> ${to}: ${JSON.stringify(result)}`
        );

        assert.equal(result.data.status, to);
      } else {
        error(result, "INVALID_TRANSITION");
      }

      assert.equal(
        h.tables.routes.length,
        2,
        "lifecycle never physically removes route"
      );
    }
  }
});

test("Route stop reconciliation preserves IDs, reorders, adds and soft-removes", () => {
  const h = harness();

  const created = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 1 }),
        stop("PLC-2", { stop_order: 2 })
      ]
    }
  ).data;

  const before = h.call(
    "adminGetRouteDetail",
    "viewer",
    { route_id: created.route_id }
  ).data;

  const firstId =
    before.stops[0].route_place_id;

  const secondId =
    before.stops[1].route_place_id;

  const updated = h.call(
    "updateRoute",
    "editor",
    {
      route_id: created.route_id,
      expected_revision: before.revision,
      stops: [
        {
          ...before.stops[1],
          stop_order: 1
        },
        stop("PLC-3", {
          stop_order: 2,
          day_number: 2
        })
      ]
    }
  );

  assert.equal(
    updated.ok,
    true,
    JSON.stringify(updated)
  );

  const after = h.call(
    "adminGetRouteDetail",
    "viewer",
    { route_id: created.route_id }
  ).data;

  assert.deepEqual(
    after.stops.map(item => item.place_id),
    ["PLC-2", "PLC-3"]
  );

  assert.equal(
    after.stops[0].route_place_id,
    secondId,
    "retained relationship ID must survive reorder"
  );

  assert.notEqual(
    after.stops[1].route_place_id,
    firstId
  );

  assert.notEqual(
    after.stops[1].route_place_id,
    secondId
  );

  assert.equal(
    h.tables.route_places.length,
    4,
    "two original rows plus one new row"
  );

  const idIndex =
    h.tables.route_places[0].indexOf(
      "route_place_id"
    );

  const statusIndex =
    h.tables.route_places[0].indexOf(
      "status"
    );

  const removedRow =
    h.tables.route_places.find(
      row => row[idIndex] === firstId
    );

  assert.ok(removedRow);

  assert.equal(
    removedRow[statusIndex],
    "deleted",
    "removed membership is retained as soft-deleted"
  );
});

test("Route delete soft-deletes parent and every active relationship", () => {
  const h = harness();

  const created = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 1 }),
        stop("PLC-2", { stop_order: 2 })
      ]
    }
  ).data;

  const beforeRows = h.tables.route_places.length;

  const deleted = h.call(
    "deleteRoute",
    "editor",
    {
      route_id: created.route_id,
      expected_revision: created.revision
    }
  );

  assert.equal(
    deleted.ok,
    true,
    JSON.stringify(deleted)
  );

  assert.equal(
    deleted.data.status,
    "deleted"
  );

  assert.equal(
    h.tables.routes.length,
    2
  );

  assert.equal(
    h.tables.route_places.length,
    beforeRows,
    "delete must not physically remove relationship rows"
  );

  const statusIndex =
    h.tables.route_places[0].indexOf(
      "status"
    );

  for (const row of h.tables.route_places.slice(1)) {
    assert.equal(row[statusIndex], "deleted");
  }

  const detail = h.call(
    "adminGetRouteDetail",
    "viewer",
    { route_id: created.route_id }
  );

  assert.equal(detail.ok, true);

  assert.equal(detail.data.status, "deleted");

  assert.deepEqual(
    detail.data.stops,
    [],
    "deleted relationships are not active memberships"
  );
});

function assertOutcomeUnknown(result, routeId) {
  error(result, "OUTCOME_UNKNOWN");

  assert.equal(
    result.error.retryable,
    false
  );

  assert.equal(
    result.error.route_id,
    routeId
  );
}

test("Route write failure after mutation begins returns OUTCOME_UNKNOWN", () => {
  const h = harness({
    failWrite: "route_places"
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 1 })
      ]
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "OUTCOME_UNKNOWN");
  assert.equal(result.error.retryable, false);

  assert.match(
    result.error.route_id,
    /^ROUTE-[A-Za-z0-9_-]+$/
  );

  assert.equal(
    h.tables.routes.length,
    2,
    "parent may already have been written"
  );
});

test("Route lost response after parent write returns OUTCOME_UNKNOWN", () => {
  const h = harness({
    throwAfterWrite: "routes"
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: []
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "OUTCOME_UNKNOWN");
  assert.equal(result.error.retryable, false);

  assert.match(
    result.error.route_id,
    /^ROUTE-[A-Za-z0-9_-]+$/
  );

  assert.equal(
    h.tables.routes.length,
    2,
    "lost response must model a write that may have succeeded"
  );

  const routeIdIndex =
    h.tables.routes[0].indexOf("route_id");

  assert.equal(
    h.tables.routes[1][routeIdIndex],
    result.error.route_id,
    "uncertain response exposes the ID needed for reconciliation"
  );
});

test("Route readback failure after write returns OUTCOME_UNKNOWN", () => {
  const h = harness({
    readFailureAfterWrite: "routes"
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: []
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "OUTCOME_UNKNOWN");
  assert.equal(result.error.retryable, false);

  assert.match(
    result.error.route_id,
    /^ROUTE-[A-Za-z0-9_-]+$/
  );

  assert.equal(
    h.tables.routes.length,
    2
  );
});

test("Route audit write failure does not turn verified entity into failure", () => {
  const h = harness({
    failWrite: "activity_logs"
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 1 })
      ]
    }
  );

  assert.equal(
    result.ok,
    true,
    JSON.stringify(result)
  );

  assert.equal(
    result.data.audit_status,
    "unconfirmed"
  );

  assert.match(
    result.data.route_id,
    /^ROUTE-[A-Za-z0-9_-]+$/
  );

  assert.equal(h.tables.routes.length, 2);
  assert.equal(h.tables.route_places.length, 2);
});

test("Route preflight format failure mutates nothing", () => {
  const h = harness({
    badFormat: true
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: [
        stop("PLC-1", { stop_order: 1 })
      ]
    }
  );

  assert.equal(result.ok, false);

  assert.notEqual(
    result.error.code,
    "OUTCOME_UNKNOWN",
    "preflight failure occurs before mutation"
  );

  assert.equal(h.tables.routes.length, 1);
  assert.equal(h.tables.route_places.length, 1);
  assert.equal(h.tables.activity_logs.length, 1);

  assert.equal(
    h.effects.length,
    0,
    "preflight failure must not write"
  );
});

test("Route preflight formula failure mutates nothing", () => {
  const h = harness({
    formula: true
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: []
    }
  );

  assert.equal(result.ok, false);

  assert.notEqual(
    result.error.code,
    "OUTCOME_UNKNOWN"
  );

  assert.equal(h.tables.routes.length, 1);
  assert.equal(h.tables.route_places.length, 1);
  assert.equal(h.tables.activity_logs.length, 1);
  assert.equal(h.effects.length, 0);
});

test("Route lock failure mutates nothing", () => {
  const h = harness({
    lockFail: true
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: []
    }
  );

  error(result, "CONTENT_LOCK");

  assert.equal(h.tables.routes.length, 1);
  assert.equal(h.tables.route_places.length, 1);
  assert.equal(h.tables.activity_logs.length, 1);
  assert.equal(h.effects.length, 0);
});

test("Route authorization is rechecked after acquiring write lock", () => {
  const options = {};

  const h = harness(options);

  options.onLock = () => {
    options.revoked = true;
  };

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: []
    }
  );

  error(result, "UNAUTHORIZED");

  assert.equal(h.tables.routes.length, 1);
  assert.equal(h.tables.route_places.length, 1);
  assert.equal(h.tables.activity_logs.length, 1);
  assert.equal(h.effects.length, 0);
});

test("Route lock release failure does not replace a known successful result", () => {
  const h = harness({
    releaseFail: true
  });

  const result = h.call(
    "createRoute",
    "editor",
    {
      content: routeContent(),
      stops: []
    }
  );

  assert.equal(
    result.ok,
    true,
    JSON.stringify(result)
  );

  assert.equal(
    result.data.audit_status,
    "recorded"
  );
});

console.log(
  `Admin Route behavioral verification passed: ${checks} checks.`
);