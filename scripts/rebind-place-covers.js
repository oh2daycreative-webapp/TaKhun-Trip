"use strict";
// One-off (2026-10-19 release): rebind the approved place covers from the retired static ids (BTK-002 …) to the
// re-entered live place ids (PLC-…). Image bytes are unchanged: files are renamed (git mv by the caller), the
// manifest keeps width/height/bytes/sha256, and the public renderer finds them via place-<lowercase id>-cover.
// Usage: node scripts/rebind-place-covers.js            (dry run: prints the plan)
//        node scripts/rebind-place-covers.js --apply    (rewrites media-spec.json + manifest, prints git mv commands)
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const MAP = {
  "BTK-002": "PLC-4e11d45a-c022-4919-873c-5823aeb03bf7",
  "BTK-003": "PLC-7cde51bf-ba6e-4d2c-88d2-a65ec6c413cd",
  "BTK-004": "PLC-434d36e8-dd78-4e33-aa5f-a6d9ce43e933",
  "BTK-005": "PLC-e40bad37-fdbb-4615-a622-3f789adae731",
  "KRN-002": "PLC-7f088e4c-4f9b-4e11-a8cf-46faa839bb47",
  "PNM-001": "PLC-b8dc6205-69c8-4a6e-b485-fd87850a13f0"
};
const apply = process.argv.includes("--apply");
const specPath = path.join(root, "media/media-spec.json");
const manifestPath = path.join(root, "public/assets/media/manifest/media-manifest.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const moves = [];
const byId = (items) => items.sort((a, b) => a.media_id.localeCompare(b.media_id));

for (const [legacy, live] of Object.entries(MAP)) {
  const oldId = `place-${legacy.toLowerCase()}-cover`;
  const newId = `place-${live.toLowerCase()}-cover`;
  const specItem = spec.items.find((item) => item.media_id === oldId);
  const manifestItem = manifest.items.find((item) => item.media_id === oldId);
  if (!specItem || !manifestItem) throw new Error(`missing ${oldId}`);
  specItem.media_id = newId; specItem.entity_id = live; specItem.source_file = `places/${newId}.jpg`;
  manifestItem.media_id = newId; manifestItem.entity_id = live;
  for (const output of manifestItem.outputs) {
    const next = output.path.replace(`/${oldId}-`, `/${newId}-`);
    if (next === output.path) throw new Error(`unexpected path ${output.path}`);
    moves.push([output.path, next]);
    output.path = next;
  }
  console.log(`${legacy} -> ${live}: ${oldId} -> ${newId} (${manifestItem.outputs.length} files)`);
}
if (apply) {
  fs.writeFileSync(specPath, JSON.stringify({ ...spec, items: byId(spec.items) }, null, 2) + "\n");
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, items: byId(manifest.items) }, null, 2) + "\n");
}
for (const [from, to] of moves) console.log(`git mv public/${from} public/${to}`);
