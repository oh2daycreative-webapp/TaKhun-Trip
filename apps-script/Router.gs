function routeRequest_(method, event) {
  var parameters = event && event.parameter ? event.parameter : {};
  var action = parameters.action ? String(parameters.action).trim() : "";

  try {
    if (method === "GET") {
      switch (action) {
        case "getPlaces":
          return createJsonResponse_(getPlaces_(parameters));
        case "getPlaceDetail":
          return createJsonResponse_(getPlaceDetail_(parameters));
        case "getMapPlaces":
          return createJsonResponse_(getMapPlaces_(parameters));
      }
    }

    return createJsonResponse_({
      ok: false,
      error: {
        code: "UNKNOWN_ACTION",
        message: "ไม่พบ action ที่เรียก"
      }
    });
  } catch (_error) {
    return createJsonResponse_({
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: "เกิดข้อผิดพลาดของระบบ"
      }
    });
  }
}
