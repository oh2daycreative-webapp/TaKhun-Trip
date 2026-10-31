"use strict";

(function createMediaRuntime(global) {
  const MANIFEST_PATH = "assets/media/manifest/media-manifest.json";
  const PLACEHOLDERS = Object.freeze({ hero: "hero", cover: "cover", card: "cover", place: "cover", route: "cover", event: "cover", product: "product", gallery: "gallery", shared: "hero" });
  const PLACEHOLDER_PATTERN = /^assets\/media\/placeholders\/(?:hero|cover|product|gallery)\.svg$/;
  let manifest = Object.freeze({ version: 1, items: Object.freeze([]) });
  let loading = null;

  function cleanId(value) { return String(value || "").trim().toLowerCase(); }
  function mediaIdFor(type, id) {
    const value = cleanId(id);
    if (!value) return "";
    if (type === "place") return `place-${value}-cover`;
    if (type === "route") return `route-${value.replace(/^route-/, "")}-cover`;
    if (type === "product") return `product-${value.replace(/^prod-/, "")}-cover`;
    if (type === "event") return `event-${value.replace(/^event-/, "")}-cover`;
    if (type === "gallery") return value;
    if (type === "shared") return value;
    if (type === "home") return value.startsWith("home-") ? value : `home-${value}`;
    return "";
  }

  function placeholderPath(role) { return `assets/media/placeholders/${PLACEHOLDERS[role] || "cover"}.svg`; }
  function isLocalGeneratedPath(value) { return /^assets\/media\/generated\/[a-z0-9/_-]+\.webp$/i.test(String(value || "")); }
  function isLocalPlaceholderPath(value) { return PLACEHOLDER_PATTERN.test(String(value || "")); }
  function validDimension(value) { return Number.isInteger(value) && value > 0; }

  function normalizeManifest(value) {
    const items = Array.isArray(value?.items) ? value.items.filter((item) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item?.media_id || "")).map((item) => ({
      media_id: item.media_id,
      entity_type: String(item.entity_type || ""),
      entity_id: String(item.entity_id || ""),
      role: String(item.role || ""),
      ratio: String(item.ratio || ""),
      required: item.required === true,
      alt_th: String(item.alt_th || ""),
      alt_en: String(item.alt_en || ""),
      fallback: isLocalPlaceholderPath(item.fallback) ? item.fallback : "",
      outputs: (Array.isArray(item.outputs) ? item.outputs : []).filter((output) => isLocalGeneratedPath(output?.path) && validDimension(output.width) && validDimension(output.height)).map((output) => {
        const normalized = { width: output.width, height: output.height, path: output.path };
        if (validDimension(output.bytes)) normalized.bytes = output.bytes;
        if (/^[a-f0-9]{64}$/i.test(String(output.sha256 || ""))) normalized.sha256 = output.sha256;
        return normalized;
      }).sort((a, b) => a.width - b.width)
    })) : [];
    return Object.freeze({ version: 1, items: Object.freeze(items) });
  }

  function loadManifest(fetcher = global.fetch) {
    if (loading) return loading;
    if (typeof fetcher !== "function") return Promise.resolve(manifest);
    loading = Promise.resolve(fetcher(MANIFEST_PATH, { credentials: "same-origin" })).then((response) => {
      if (!response?.ok) throw new Error("MEDIA_MANIFEST_UNAVAILABLE");
      return response.json();
    }).then((value) => { manifest = normalizeManifest(value); return manifest; }).catch(() => manifest);
    return loading;
  }

  function findItem(mediaId) { return manifest.items.find((item) => item.media_id === mediaId) || null; }
  function pictureModel(mediaId, lang = "th") {
    const item = findItem(mediaId);
    if (!item || !item.outputs.length) return null;
    const largest = item.outputs.at(-1);
    return {
      alt: String(lang === "en" ? item.alt_en || item.alt_th : item.alt_th || ""),
      src: largest.path,
      srcset: item.outputs.map((output) => `${output.path} ${output.width}w`).join(", "),
      width: largest.width,
      height: largest.height,
      fallback: item.fallback,
      outputs: item.outputs.map((output) => ({ ...output }))
    };
  }

  function pictureModelForEntityRole(mediaId, entityType, entityId, role, lang = "th") {
    const item = findItem(mediaId);
    if (!item || item.entity_type !== entityType || item.entity_id !== entityId || item.role !== role) return null;
    return pictureModel(mediaId, lang);
  }

  // ---- uploaded place photos (task 13; spec T6, T12, D12, criterion 15) ----
  // Only with an https APP_CONFIG.MEDIA_ORIGIN; one getPlaceUploads call per page (list mode: every cover; detail mode:
  // usePlaceUploads(id) first, then that place's cover and gallery). Any failure, timeout or malformed answer = no
  // uploads, so the page stays exactly as it is without this layer. A cover is swapped in only after it has loaded.
  const UPLOAD_KEY = /^uploads\/places\/([a-z0-9][a-z0-9-]{0,63})\/([a-f0-9]{32})-(800|1600)\.(webp|jpg)$/;
  const PLACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  const PHOTO_KEYS = ["caption_en", "caption_th", "format", "height", "height_small", "key_large", "key_small", "width", "width_small"];
  const NO_UPLOADS = Object.freeze({ covers: new Map(), gallery: new Map() });
  let uploadsScope = "";
  let uploads = null;

  function mediaOrigin() {
    let config = global.APP_CONFIG;
    try { if (typeof APP_CONFIG !== "undefined") config = APP_CONFIG; } catch (_error) { /* window property only */ }
    try {
      const url = new URL(String(config?.MEDIA_ORIGIN || ""));
      return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : "";
    } catch (_error) { return ""; }
  }

  function safePhoto(value, placeId) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== PHOTO_KEYS.join(",")) return null;
    const large = UPLOAD_KEY.exec(String(value.key_large)), small = UPLOAD_KEY.exec(String(value.key_small));
    const extension = value.format === "jpeg" ? "jpg" : value.format === "webp" ? "webp" : "";
    if (!large || !small || large[1] !== cleanId(placeId) || small[1] !== large[1] || small[2] !== large[2] || large[3] !== "1600" || small[3] !== "800" || large[4] !== extension || small[4] !== extension) return null;
    if (![value.width, value.height, value.width_small, value.height_small].every(validDimension)) return null;
    if (typeof value.caption_th !== "string" || typeof value.caption_en !== "string" || value.caption_th.length > 400 || value.caption_en.length > 400) return null;
    return Object.freeze({ ...value });
  }

  function normalizeUploads(data, scope) {
    const covers = new Map(), gallery = new Map();
    if (scope) {
      if (data?.place_id !== scope) return NO_UPLOADS;
      const cover = data.cover === null ? null : safePhoto(data.cover, scope);
      if (cover) covers.set(cleanId(scope), cover);
      const photos = Array.isArray(data.gallery) ? data.gallery.map((photo) => safePhoto(photo, scope)).filter(Boolean) : [];
      gallery.set(cleanId(scope), photos.filter((photo) => !cover || photo.key_large !== cover.key_large));
    } else if (data?.covers && typeof data.covers === "object" && !Array.isArray(data.covers)) {
      for (const [placeId, photo] of Object.entries(data.covers)) {
        const safe = PLACE_ID.test(placeId) ? safePhoto(photo, placeId) : null;
        if (safe) covers.set(cleanId(placeId), safe);
      }
    }
    return Object.freeze({ covers, gallery });
  }

  // Detail pages call this before rendering, so the single call also brings the gallery.
  function usePlaceUploads(placeId) {
    if (!uploads && PLACE_ID.test(String(placeId || ""))) uploadsScope = String(placeId);
  }

  function loadUploads() {
    if (uploads) return uploads;
    const origin = mediaOrigin();
    const scope = uploadsScope;
    if (!origin || typeof global.TakhunApi?.getPlaceUploads !== "function") { uploads = Promise.resolve(NO_UPLOADS); return uploads; }
    uploads = Promise.resolve().then(() => global.TakhunApi.getPlaceUploads(scope)).then((data) => normalizeUploads(data, scope)).catch(() => NO_UPLOADS);
    return uploads;
  }

  function uploadedImage(photo, options, onError) {
    const origin = mediaOrigin();
    const image = global.document.createElement("img");
    image.className = options.className || "";
    image.src = `${origin}/${photo.key_large}`;
    image.srcset = `${origin}/${photo.key_small} ${photo.width_small}w, ${origin}/${photo.key_large} ${photo.width}w`;
    image.sizes = options.sizes || "100vw";
    image.width = photo.width;
    image.height = photo.height;
    const caption = options.lang === "en" ? photo.caption_en || photo.caption_th : photo.caption_th;
    image.alt = options.decorative ? "" : Object.hasOwn(options, "alt") ? String(options.alt || "") : caption || String(options.fallbackAlt || "");
    applyRequestOptions(image, options);
    if (onError) image.addEventListener("error", onError, { once: true });
    return image;
  }

  // The uploaded photos of one place for its gallery, in sort order, without the cover (decision: never repeated).
  function uploadedGallery(placeId) {
    return loadUploads().then((data) => data.gallery.get(cleanId(placeId)) || []);
  }

  // Gallery and lightbox images: on an error the caller's onError runs (the detail page removes the item).
  function renderUploadedImage(mount, photo, options = {}) {
    if (!mount || !global.document || !photo || !mediaOrigin()) return null;
    const image = uploadedImage(photo, options, () => { if (typeof options.onError === "function") options.onError(); });
    image.setAttribute("data-media-runtime", "uploaded");
    mount.replaceChildren(image);
    return image;
  }

  function applyRequestOptions(image, options) {
    if (options.loading === "eager" || options.loading === "lazy") image.loading = options.loading;
    if (["high", "low", "auto"].includes(options.fetchPriority)) {
      image.fetchPriority = options.fetchPriority;
      image.setAttribute("fetchpriority", options.fetchPriority);
    }
  }

  function hideDecorativeFallback(node, decorative) {
    if (!node || !decorative) return node;
    node.setAttribute?.("aria-hidden", "true");
    node.removeAttribute?.("role");
    node.removeAttribute?.("aria-label");
    return node;
  }

  function renderImage(mount, options = {}) {
    if (!mount || !global.document) return null;
    const role = options.role || options.type || "cover";
    const generation = Number(mount._takhunMediaGeneration || 0) + 1;
    mount._takhunMediaGeneration = generation;
    const placeholderAlt = options.decorative ? "" : String(options.fallbackAlt || options.alt || "");
    let current = mount.querySelector?.("[data-media-runtime]") || null;
    const replaceRuntime = (node) => {
      if (current?.parentNode) current.replaceWith(node); else mount.prepend(node);
      current = node;
      return node;
    };
    const fallback = (path) => {
      const image = global.document.createElement("img");
      image.setAttribute("data-media-runtime", "placeholder");
      image.className = options.className || "";
      image.src = isLocalPlaceholderPath(path) ? path : placeholderPath(role);
      image.alt = placeholderAlt;
      applyRequestOptions(image, options);
      image.addEventListener("error", () => {
        if (mount._takhunMediaGeneration !== generation || !mount.isConnected || current !== image) return;
        const node = hideDecorativeFallback(typeof options.fallbackFactory === "function" ? options.fallbackFactory() : null, options.decorative);
        if (node) {
          node.setAttribute?.("data-media-runtime", "fallback");
          replaceRuntime(node);
        } else current?.remove?.();
      }, { once: true });
      return replaceRuntime(image);
    };
    fallback(placeholderPath(role));
    let manifestModel = null;
    const showManifest = () => {
      if (!manifestModel) { fallback(placeholderPath(role)); return; }
      const model = manifestModel;
      const picture = global.document.createElement("picture");
      picture.setAttribute("data-media-runtime", "picture");
      picture.style.display = "contents";
      const image = global.document.createElement("img");
      image.className = options.className || "";
      image.src = model.src;
      image.srcset = model.srcset;
      image.sizes = options.sizes || "100vw";
      image.width = model.width;
      image.height = model.height;
      image.alt = options.decorative ? "" : Object.hasOwn(options, "alt") ? String(options.alt || "") : model.alt || String(options.fallbackAlt || "");
      applyRequestOptions(image, options);
      image.addEventListener("error", () => {
        if (mount._takhunMediaGeneration !== generation || !mount.isConnected || current !== picture) return;
        fallback(model.fallback || placeholderPath(role));
      }, { once: true });
      picture.append(image);
      replaceRuntime(picture);
    };
    // Uploaded cover of a place (cards, hero, map preview): swapped in only once it has loaded; if it fails later,
    // the manifest picture (or the placeholder) comes back, exactly as without uploads.
    const coverMatch = options.type === "place" && ["cover", "hero", "card"].includes(role) ? /^place-(.+)-cover$/.exec(String(options.mediaId || "")) : null;
    if (coverMatch) {
      loadUploads().then((data) => {
        const photo = data.covers.get(coverMatch[1]);
        if (!photo || mount._takhunMediaGeneration !== generation) return;
        const image = uploadedImage(photo, options, null);
        image.setAttribute("data-media-runtime", "uploaded");
        image.addEventListener("load", () => {
          if (mount._takhunMediaGeneration !== generation || !mount.isConnected) return;
          mount._takhunUploadedGeneration = generation;
          replaceRuntime(image);
          image.addEventListener("error", () => {
            if (mount._takhunMediaGeneration !== generation || current !== image) return;
            mount._takhunUploadedGeneration = 0;
            showManifest();
          }, { once: true });
        }, { once: true });
      });
    }
    loadManifest().then(() => {
      if (mount._takhunMediaGeneration !== generation || !mount.isConnected) return;
      const model = options.entityType && options.entityId && options.role
        ? pictureModelForEntityRole(options.mediaId, options.entityType, options.entityId, options.role, options.lang)
        : pictureModel(options.mediaId, options.lang);
      if (!model) return;
      manifestModel = model;
      if (mount._takhunUploadedGeneration === generation) return; // the uploaded cover is already showing
      const picture = global.document.createElement("picture");
      picture.setAttribute("data-media-runtime", "picture");
      picture.style.display = "contents";
      const image = global.document.createElement("img");
      image.className = options.className || "";
      image.src = model.src;
      image.srcset = model.srcset;
      image.sizes = options.sizes || "100vw";
      image.width = model.width;
      image.height = model.height;
      image.alt = options.decorative
        ? ""
        : Object.hasOwn(options, "alt")
          ? String(options.alt || "")
          : model.alt || String(options.fallbackAlt || "");
      applyRequestOptions(image, options);
      image.addEventListener("error", () => {
        if (mount._takhunMediaGeneration !== generation || !mount.isConnected || current !== picture) return;
        fallback(model.fallback || placeholderPath(role));
      }, { once: true });
      picture.append(image);
      if (mount._takhunMediaGeneration !== generation || !mount.isConnected) return;
      if (current?.parentNode) current.replaceWith(picture); else mount.prepend(picture);
      current = picture;
    });
    return current;
  }

  global.TakhunMedia = Object.freeze({ mediaIdFor, placeholderPath, isLocalGeneratedPath, isLocalPlaceholderPath, normalizeManifest, loadManifest, pictureModel, pictureModelForEntityRole, renderImage,
    usePlaceUploads, uploadedGallery, renderUploadedImage });
})(window);
