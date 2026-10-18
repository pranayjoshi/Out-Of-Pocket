/**
 * Uber ride-request links follow the documented deep-link guide:
 * https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
 * Coordinates are included only when a place is explicitly reviewed.
 * An opened link is not a booking.
 */

/** @param {{name: string, formattedAddress?: string, reviewStatus?: string, coordinates?: {latitude: number, longitude: number} | null}} place */
function reviewedCoordinates(place) {
  if (place?.reviewStatus !== 'reviewed' || !place.coordinates) return null;
  const { latitude, longitude } = place.coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/**
 * @param {{pickup: {name: string, formattedAddress?: string, reviewStatus?: string, coordinates?: {latitude: number, longitude: number} | null}, dropoff: {name: string, formattedAddress?: string, reviewStatus?: string, coordinates?: {latitude: number, longitude: number} | null}, clientId?: string}} input
 */
export function buildUberHandoff(input) {
  const pickup = input.pickup;
  const dropoff = input.dropoff;
  if (!pickup?.name || !dropoff?.name) throw new Error('Choose a pickup and a destination before opening Uber.');
  const copyText = `${pickup.name}\n${dropoff.name}`;
  const clientId = String(input.clientId || '').trim();
  const pickupCoordinates = reviewedCoordinates(pickup);
  const dropoffCoordinates = reviewedCoordinates(dropoff);
  const base = {
    provider: 'uber',
    coordinatesIncluded: false,
    bookingState: null,
    copyText,
    nativeUrl: null,
  };
  if (!clientId) {
    return {
      ...base,
      mode: 'manual',
      url: 'https://m.uber.com/',
      message: 'Uber opens for you to confirm the pickup and destination. Review your pickup, fare, and booking in Uber. Out of Pocket does not book this ride.',
    };
  }
  if (!pickupCoordinates || !dropoffCoordinates) {
    return {
      ...base,
      mode: 'confirm',
      url: `https://m.uber.com/looking?client_id=${encodeURIComponent(clientId)}`,
      message: 'These locations do not have reviewed coordinates, so Out of Pocket will not send a pin. Confirm the pickup and destination in Uber.',
    };
  }
  const pickupJson = JSON.stringify({
    latitude: pickupCoordinates.latitude,
    longitude: pickupCoordinates.longitude,
    addressLine1: pickup.name,
    addressLine2: pickup.formattedAddress || pickup.name,
  });
  const dropJson = JSON.stringify({
    latitude: dropoffCoordinates.latitude,
    longitude: dropoffCoordinates.longitude,
    addressLine1: dropoff.name,
    addressLine2: dropoff.formattedAddress || dropoff.name,
  });
  const url = `https://m.uber.com/looking?client_id=${encodeURIComponent(clientId)}&pickup=${encodeURIComponent(pickupJson)}&drop[0]=${encodeURIComponent(dropJson)}`;
  const nativeUrl = [
    'uber://riderequest?',
    `pickup[latitude]=${pickupCoordinates.latitude}`,
    `&pickup[longitude]=${pickupCoordinates.longitude}`,
    `&pickup[nickname]=${encodeURIComponent(pickup.name)}`,
    `&pickup[formatted_address]=${encodeURIComponent(pickup.formattedAddress || pickup.name)}`,
    `&dropoff[latitude]=${dropoffCoordinates.latitude}`,
    `&dropoff[longitude]=${dropoffCoordinates.longitude}`,
    `&dropoff[nickname]=${encodeURIComponent(dropoff.name)}`,
    `&dropoff[formatted_address]=${encodeURIComponent(dropoff.formattedAddress || dropoff.name)}`,
  ].join('');
  return {
    ...base,
    mode: 'reviewed',
    coordinatesIncluded: true,
    url,
    nativeUrl,
    message: 'Review your pickup, fare, and booking in Uber. Out of Pocket does not book this ride.',
  };
}
