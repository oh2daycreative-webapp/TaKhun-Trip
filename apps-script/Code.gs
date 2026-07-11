function doGet(e) {
  return routeRequest_("GET", e || {});
}

function doPost(e) {
  return routeRequest_("POST", e || {});
}
