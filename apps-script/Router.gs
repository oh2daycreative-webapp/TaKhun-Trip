function routeRequest_(method, event) {
  var parameters = event && event.parameter ? event.parameter : {};
  var action = parameters.action ? String(parameters.action).trim() : "";

  try {
    if (method === "GET") {
      switch (action) {
        case "getSettings":
          return createJsonResponse_(getSettings_(parameters));
        case "getHomeData":
          return createJsonResponse_(getHomeData_(parameters));
        case "getCategories":
          return createJsonResponse_(getCategories_(parameters));
        case "getPlaces":
          return createJsonResponse_(getPlaces_(parameters));
        case "getPlaceDetail":
          return createJsonResponse_(getPlaceDetail_(parameters));
        case "getMapPlaces":
          return createJsonResponse_(getMapPlaces_(parameters));
        case "getRoutes":
          return createJsonResponse_(getRoutes_(parameters));
        case "getRouteDetail":
          return createJsonResponse_(getRouteDetail_(parameters));
        case "getTripTemplates":
          return createJsonResponse_(getTripTemplates_(parameters));
        case "getProducts":
          return createJsonResponse_(getProducts_(parameters));
        case "getProductDetail":
          return createJsonResponse_(getProductDetail_(parameters));
        case "getEvents":
          return createJsonResponse_(getEvents_(parameters));
        case "getEventDetail":
          return createJsonResponse_(getEventDetail_(parameters));
        case "getGallery":
          return createJsonResponse_(getGallery_(parameters));
        case "getReviews":
          return createJsonResponse_(getReviews_(parameters));
        case "searchAll":
          return createJsonResponse_(searchAll_(parameters));
      }
    }

    if (method === "POST" && (!action || action === "submitReview")) {
      if (!event || !event.postData || typeof event.postData.contents !== "string" || !event.postData.contents.trim()) {
        return createJsonResponse_({ ok: false, error: { code: "VALIDATION_ERROR", message: "ข้อมูลคำขอไม่ถูกต้อง" } });
      }
      var body;
      try {
        body = JSON.parse(event.postData.contents);
      } catch (_jsonError) {
        return createJsonResponse_({ ok: false, error: { code: "VALIDATION_ERROR", message: "ข้อมูลคำขอไม่ถูกต้อง" } });
      }
      action = body && body.action ? String(body.action).trim() : "";
      if (action === "submitReview") return createJsonResponse_(submitReview_(body.payload));
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
