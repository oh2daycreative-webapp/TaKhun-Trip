var ApprovedMediaService_MEDIA_ID_PATTERN_ = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function ApprovedMediaService_read_() {
  var properties = PropertiesService.getScriptProperties();
  var manifestUrl = properties && properties.getProperty("ADMIN_PLACE_MEDIA_MANIFEST_URL");
  var allowedOrigin = properties && properties.getProperty("ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN");
  if (typeof manifestUrl !== "string" || typeof allowedOrigin !== "string" ||
      !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(allowedOrigin) ||
      manifestUrl.indexOf(allowedOrigin + "/") !== 0 || /[\\<>"'\u0000-\u0020\u007F]/.test(manifestUrl) ||
      manifestUrl.indexOf("@", 8) !== -1) {
    throw new Error("ADMIN_PLACE_MEDIA_CONFIG");
  }
  var response = UrlFetchApp.fetch(manifestUrl, {
    method: "get",
    followRedirects: false,
    muteHttpExceptions: true
  });
  if (!response || typeof response.getResponseCode !== "function" || response.getResponseCode() !== 200 ||
      typeof response.getContentText !== "function") {
    throw new Error("ADMIN_PLACE_MEDIA_FETCH");
  }
  var parsed;
  try {
    parsed = JSON.parse(response.getContentText());
  } catch (_parseError) {
    throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== 1 ||
      !Array.isArray(parsed.items) || parsed.items.length > 10000) {
    throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
  }
  var seen = Object.create(null);
  var items = parsed.items.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.media_id !== "string" || !ApprovedMediaService_MEDIA_ID_PATTERN_.test(item.media_id) ||
        Object.prototype.hasOwnProperty.call(seen, item.media_id) ||
        typeof item.entity_type !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(item.entity_type) ||
        typeof item.entity_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(item.entity_id) ||
        typeof item.role !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(item.role) ||
        typeof item.alt_th !== "string" || item.alt_th.length > 500 ||
        typeof item.alt_en !== "string" || item.alt_en.length > 500 ||
        !/^assets\/media\/placeholders\/(?:hero|cover|product|gallery)\.svg$/.test(item.fallback) ||
        !Array.isArray(item.outputs) || !item.outputs.length || item.outputs.length > 20) {
      throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
    }
    seen[item.media_id] = true;
    var outputs = item.outputs.map(function (output) {
      if (!output || typeof output !== "object" || Array.isArray(output) ||
          !Number.isSafeInteger(output.width) || output.width < 1 ||
          !Number.isSafeInteger(output.height) || output.height < 1 ||
          typeof output.path !== "string" || !/^assets\/media\/generated\/[a-z0-9\/_-]+\.webp$/.test(output.path)) {
        throw new Error("ADMIN_PLACE_MEDIA_MANIFEST");
      }
      return { width: output.width, height: output.height, path: output.path };
    }).sort(function (left, right) { return left.width - right.width; });
    return {
      media_id: item.media_id,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      role: item.role,
      alt_th: item.alt_th,
      alt_en: item.alt_en,
      fallback: item.fallback,
      outputs: outputs
    };
  });
  return { version: 1, items: items };
}

function ApprovedMediaService_projection_(item) {
  return {
    media_id: item.media_id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    role: item.role,
    alt_th: item.alt_th,
    alt_en: item.alt_en,
    fallback: item.fallback,
    outputs: item.outputs.map(function (output) {
      return { width: output.width, height: output.height, path: output.path };
    })
  };
}
