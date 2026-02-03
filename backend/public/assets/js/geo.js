async function getGeoLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Geolocation not supported");
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

window.getGeoLocation = getGeoLocation;
