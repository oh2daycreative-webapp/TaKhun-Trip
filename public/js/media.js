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
    loadManifest().then(() => {
      if (mount._takhunMediaGeneration !== generation || !mount.isConnected) return;
      const model = pictureModel(options.mediaId, options.lang);
      if (!model) return;
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

  global.TakhunMedia = Object.freeze({ mediaIdFor, placeholderPath, isLocalGeneratedPath, isLocalPlaceholderPath, normalizeManifest, loadManifest, pictureModel, renderImage });
})(window);
