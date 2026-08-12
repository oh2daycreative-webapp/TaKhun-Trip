"use strict";
(function createAdminPlaceMap(global) {
  const DEFAULT_CENTER = Object.freeze([8.9, 98.8]);
  const DEFAULT_ZOOM = 10;
  const INSTANCE_KEY = "__takhunAdminPlaceMap";
  const DECIMAL_COORDINATE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const INVALID_COORDINATES = "Enter a complete valid latitude and longitude.";

  function manualCoordinate(value, minimum, maximum) {
    const text = String(value == null ? "" : value).trim();
    if (!text || !DECIMAL_COORDINATE.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
  }
  function manualCoordinatePair(latitude, longitude) {
    const lat = manualCoordinate(latitude, -90, 90);
    const lng = manualCoordinate(longitude, -180, 180);
    return lat === null || lng === null ? null : { latitude:lat, longitude:lng };
  }
  function mapCoordinatePair(latitude, longitude) {
    if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude };
  }
  function canonical(value) { return Number(value).toFixed(6); }
  function mapsUrl(pair) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pair.latitude},${pair.longitude}`)}`; }

  function init({ mapElement, latitudeInput, longitudeInput, statusElement, openLink }) {
    if (mapElement && mapElement[INSTANCE_KEY]) return mapElement[INSTANCE_KEY];
    let map = null, marker = null, lastMarkerPoint = null, destroyed = false;
    function value() { return manualCoordinatePair(latitudeInput.value, longitudeInput.value); }
    function setStatus(text) { if (statusElement) statusElement.textContent = text; }
    function setManualValidity(pair) {
      const hasText = String(latitudeInput.value).trim() || String(longitudeInput.value).trim();
      const message = !pair && hasText ? INVALID_COORDINATES : "";
      latitudeInput.setCustomValidity(message);
      longitudeInput.setCustomValidity(message);
      return message;
    }
    function updateOpenLink(pair) {
      if (!openLink) return;
      openLink.hidden = !pair;
      openLink.href = pair ? mapsUrl(pair) : "";
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
    }
    function restoreMarkerPosition(draggedMarker) {
      if (draggedMarker && lastMarkerPoint) draggedMarker.setLatLng(lastMarkerPoint.slice());
    }
    function updateMarker(pair, pan) {
      if (!map || !pair) return;
      const point = [pair.latitude, pair.longitude];
      if (!marker) {
        marker = global.L.marker(point, { draggable:true }).addTo(map);
        marker.on("dragend", () => {
          const draggedMarker = marker;
          if (!draggedMarker || destroyed) return;
          const latlng = draggedMarker.getLatLng();
          if (!applyMapCoordinates(latlng.lat, latlng.lng)) restoreMarkerPosition(draggedMarker);
        });
      } else marker.setLatLng(point);
      lastMarkerPoint = point.slice();
      if (pan) map.panTo(point);
    }
    function syncManual() {
      const pair = value();
      const validationMessage = setManualValidity(pair);
      updateOpenLink(pair);
      if (pair) {
        updateMarker(pair, true);
        setStatus("");
      } else if (validationMessage) setStatus(validationMessage);
      else setStatus("");
      return pair;
    }
    function applyMapCoordinates(latitude, longitude) {
      const pair = mapCoordinatePair(latitude, longitude);
      if (!pair || destroyed) return false;
      latitudeInput.value = canonical(pair.latitude);
      longitudeInput.value = canonical(pair.longitude);
      setManualValidity(pair);
      updateMarker(pair, true);
      updateOpenLink(pair);
      setStatus("");
      return true;
    }

    if (latitudeInput) latitudeInput.addEventListener("input", syncManual);
    if (longitudeInput) longitudeInput.addEventListener("input", syncManual);
    const initial = syncManual();
    if (global.L && typeof global.L.map === "function") {
      map = global.L.map(mapElement).setView(initial ? [initial.latitude, initial.longitude] : DEFAULT_CENTER, DEFAULT_ZOOM);
      global.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution:"&copy; OpenStreetMap contributors", maxZoom:19 }).addTo(map);
      map.on("click", (event) => applyMapCoordinates(event && event.latlng && event.latlng.lat, event && event.latlng && event.latlng.lng));
      if (initial) updateMarker(initial, false);
    } else setStatus("Interactive map is unavailable; enter coordinates manually.");

    const component = Object.freeze({
      getValue:value,
      setValue(latitude, longitude) {
        latitudeInput.value = latitude == null ? "" : String(latitude);
        longitudeInput.value = longitude == null ? "" : String(longitude);
        syncManual();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (marker && marker.remove) marker.remove();
        if (map && map.remove) map.remove();
        marker = null;
        lastMarkerPoint = null;
        map = null;
        if (mapElement && mapElement[INSTANCE_KEY] === component) delete mapElement[INSTANCE_KEY];
      }
    });
    if (mapElement) mapElement[INSTANCE_KEY] = component;
    return component;
  }

  global.TakhunAdminPlaceMap = Object.freeze({ init });
})(window);
