function routeRequest_(method, event) {
  var parameters = event && event.parameter ? event.parameter : {};
  var queryAction = parameters.action ? String(parameters.action).trim() : "";
  var action = method === "GET" ? queryAction : "";

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

    if (method === "POST") {
      var hasPostBody = event && event.postData && typeof event.postData.contents === "string" && event.postData.contents.trim();
      if (!hasPostBody && (!queryAction || queryAction === "submitReview")) {
        return createJsonResponse_({ ok: false, error: { code: "VALIDATION_ERROR", message: "ข้อมูลคำขอไม่ถูกต้อง" } });
      }
      if (hasPostBody) {
        var body;
        try {
          body = JSON.parse(event.postData.contents);
        } catch (_jsonError) {
          return createJsonResponse_({ ok: false, error: { code: "VALIDATION_ERROR", message: "ข้อมูลคำขอไม่ถูกต้อง" } });
        }
        action = body && typeof body === "object" && !Array.isArray(body) && typeof body.action === "string" ? body.action.trim() : "";
        if (action === "submitReview") return createJsonResponse_(submitReview_(body.payload));
        if (action === "adminLogin") return createJsonResponse_(adminLogin_(body.payload));
        if (action === "adminValidateSession") return createJsonResponse_(adminValidateSession_(body.token));
        if (action === "adminLogout") return createJsonResponse_(adminLogout_(body.token));
        if (action === "adminGetPlaces") return createJsonResponse_(adminGetPlaces_(body.token, body.payload));
        if (action === "adminGetPlaceDetail") return createJsonResponse_(adminGetPlaceDetail_(body.token, body.payload));
        if (action === "adminCreatePlace") return createJsonResponse_(adminCreatePlace_(body.token, body.payload));
        if (action === "adminSavePlaceDraft") return createJsonResponse_(adminSavePlaceDraft_(body.token, body.payload));
        if (action === "adminPublishPlace") return createJsonResponse_(adminPublishPlace_(body.token, body.payload));
        if (action === "adminInspectPlaceDependencies") return createJsonResponse_(adminInspectPlaceDependencies_(body.token, body.payload));
        if (action === "adminDiagnosePlaceDependencies") return createJsonResponse_(adminDiagnosePlaceDependencies_(body.token, body.payload));
        if (action === "adminUnpublishPlace") return createJsonResponse_(adminUnpublishPlace_(body.token, body.payload));
        if (action === "adminArchivePlace") return createJsonResponse_(adminArchivePlace_(body.token, body.payload));
        if (action === "adminRestorePlace") return createJsonResponse_(adminRestorePlace_(body.token, body.payload));
        if (action === "adminGetPlaceMediaOptions") return createJsonResponse_(adminGetPlaceMediaOptions_(body.token, body.payload));
        if (action === "adminInspectPlaceCreateDestinations") return createJsonResponse_(adminInspectPlaceCreateDestinations_(body.token, body.payload));
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
