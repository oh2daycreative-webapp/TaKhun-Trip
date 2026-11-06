// takhun-media: read-only image server for uploaded place photos in R2 (spec T4, T12, D9, D14).
// GET/HEAD only; the key must be exactly what the backend writes:
//   uploads/places/<lower-case place id>/<first 32 hex of the large file's SHA-256>-(800|1600).(webp|jpg)
// Anything else is 404 and never reaches the bucket. The Worker only reads (get/head): no put, delete or list.
// Keys are content hashes, so a found object never changes: cached for 1 year, immutable. Misses and errors are not
// cached, so a deleted photo is never served from a cached "found".
const KEY_PATTERN = /^uploads\/places\/[a-z0-9][a-z0-9-]{0,63}\/[a-f0-9]{32}-(?:800|1600)\.(webp|jpg)$/;
const CONTENT_TYPES = { webp: "image/webp", jpg: "image/jpeg" };
const FOUND_CACHE = "public, max-age=31536000, immutable";

function plain(status, text) {
  return new Response(text, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") return plain(404, "Not found");
    const url = new URL(request.url);
    if (url.search || request.url.includes("?")) return plain(404, "Not found");
    const key = url.pathname.slice(1);
    const match = KEY_PATTERN.exec(key);
    if (!match) return plain(404, "Not found");

    let object;
    try {
      object = request.method === "HEAD" ? await env.MEDIA_BUCKET.head(key) : await env.MEDIA_BUCKET.get(key);
    } catch (_error) {
      return plain(503, "Temporarily unavailable");
    }
    if (!object) return plain(404, "Not found");

    const headers = new Headers({
      "Content-Type": CONTENT_TYPES[match[1]],
      "Cache-Control": FOUND_CACHE,
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
      "Content-Length": String(object.size)
    });
    if (request.headers.get("If-None-Match") === object.httpEtag) {
      headers.delete("Content-Length");
      return new Response(null, { status: 304, headers });
    }
    return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
  }
};
