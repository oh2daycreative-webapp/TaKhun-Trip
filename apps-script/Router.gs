function routeRequest_(method, event) {
  return createJsonResponse_({
    ok: true,
    data: {
      service: "Takhun Trip API",
      method: method
    },
    message: "API skeleton is ready"
  });
}
