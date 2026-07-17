"use strict";

(function createPlaceRepositoryAdapter(global) {
  function repository() {
    const source = global.TakhunContentData;
    if (!source?.listPlaces || !source?.getPlaceById || !source?.getNearbyPlaces) {
      throw new Error("Canonical place content is unavailable.");
    }
    return source;
  }

  function listPlaces() { return repository().listPlaces(); }
  function getPlaceById(id) { return repository().getPlaceById(id); }
  function getNearbyPlaces(ids, currentId = "") { return repository().getNearbyPlaces(ids, currentId); }

  global.TakhunPlaceData = Object.freeze({ listPlaces, getPlaceById, getNearbyPlaces });
})(window);
