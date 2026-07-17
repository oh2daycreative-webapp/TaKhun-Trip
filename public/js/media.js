"use strict";

(function createMediaRuntime(global) {
  const MANIFEST_PATH = "assets/media/manifest/media-manifest.json";
  const PLACEHOLDERS = Object.freeze({ hero: "hero", cover: "cover", card: "cover", place: "cover", route: "cover", event: "cover", product: "product", gallery: "gallery", shared: "hero" });
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

  function normalizeManifest(value) {
    const items = Array.isArray(value?.items) ? value.items.filter((item) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item?.media_id || "")).map((item) => ({ ...item, outputs: (Array.isArray(item.outputs) ? item.outputs : []).filter((output) => isLocalGeneratedPath(output?.path)).sort((a, b) => Number(a.width) - Number(b.width)) })) : [];
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
    return { alt: String(item[lang === "en" ? "alt_en" : "alt_th"] || item.alt_th || ""), src: item.outputs.at(-1).path, srcset: item.outputs.map((output) => `${output.path} ${output.width}w`).join(", "), outputs: item.outputs.slice() };
  }

  function renderImage(mount, options = {}) {
    if (!mount || !global.document) return null;
    const role = options.role || options.type || "cover";
    const generation = Number(mount._takhunMediaGeneration || 0) + 1;
    mount._takhunMediaGeneration = generation;
    let current = mount.querySelector?.("[data-media-runtime]") || null;
    const fallback = () => {
      const image = global.document.createElement("img");
      image.setAttribute("data-media-runtime", "placeholder");
      image.className = options.className || "";
      image.src = placeholderPath(role);
      image.alt = String(options.alt || "");
      if (options.loading) image.loading = options.loading;
      image.addEventListener("error", () => {
        const node = typeof options.fallbackFactory === "function" ? options.fallbackFactory() : null;
        if (node) {
          node.setAttribute?.("data-media-runtime", "fallback");
          if (current?.parentNode) current.replaceWith(node); else mount.prepend(node);
          current = node;
        } else current?.remove?.();
      }, { once: true });
      if (current?.parentNode) current.replaceWith(image); else mount.prepend(image);
      current = image;
      return image;
    };
    fallback();
    loadManifest().then(() => {
      if (mount._takhunMediaGeneration !== generation) return;
      const model = pictureModel(options.mediaId, options.lang);
      if (!model || !mount.isConnected) return;
      const picture = global.document.createElement("picture");
      picture.setAttribute("data-media-runtime", "picture");
      picture.style.display = "contents";
      const image = global.document.createElement("img");
      image.className = options.className || "";
      image.src = model.src;
      image.srcset = model.srcset;
      image.sizes = options.sizes || "100vw";
      image.alt = String(options.alt || model.alt || "");
      if (options.loading) image.loading = options.loading;
      image.addEventListener("error", fallback, { once: true });
      picture.append(image);
      if (current?.parentNode) current.replaceWith(picture); else mount.prepend(picture);
      current = picture;
    });
    return current;
  }

  global.TakhunMedia = Object.freeze({ mediaIdFor, placeholderPath, isLocalGeneratedPath, normalizeManifest, loadManifest, pictureModel, renderImage });
})(window);
