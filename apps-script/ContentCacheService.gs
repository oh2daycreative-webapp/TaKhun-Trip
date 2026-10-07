// Shared only by Product/Event list/detail, Home and Search. No Script Properties.
var ContentCacheService_GENERATION_KEY_ = "content-public-generation-v1";

function ContentCacheService_key_() {
  var cache = CacheService.getScriptCache();
  var generation = cache.get(ContentCacheService_GENERATION_KEY_);
  if (typeof generation === "string" && /^[a-f0-9-]{36}$/.test(generation)) return "content-epoch:" + generation;
  // Never reuse a default namespace after eviction. A concurrent writer owns this
  // same lock; throwing here makes the public cache wrappers read uncached data.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) throw new Error("CONTENT_CACHE_BUSY");
  try {
    generation = cache.get(ContentCacheService_GENERATION_KEY_);
    if (typeof generation !== "string" || !/^[a-f0-9-]{36}$/.test(generation)) {
      generation = Utilities.getUuid();
      cache.put(ContentCacheService_GENERATION_KEY_, generation, 21600);
      if (cache.get(ContentCacheService_GENERATION_KEY_) !== generation) throw new Error("CONTENT_CACHE_UNAVAILABLE");
    }
    return "content-epoch:" + generation;
  } finally {
    try { lock.releaseLock(); } catch (_releaseError) { /* Cache namespace already established. */ }
  }
}

// Caller MUST own the script lock. Removal is verified before touching content.
// Leave it absent: the first public read after lock release creates a new UUID.
function ContentCacheService_invalidateUnderLock_() {
  var cache = CacheService.getScriptCache();
  cache.remove(ContentCacheService_GENERATION_KEY_);
  if (cache.get(ContentCacheService_GENERATION_KEY_) !== null) throw new Error("CONTENT_CACHE_INVALIDATION");
}
