export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 400;
export const AD_PLACEMENTS = ['Discover', 'Campus board', 'My plans', 'Exchanges'];

export function cropRect(width, height, zoom = 1, x = 50, y = 50) {
  const ratio = BANNER_WIDTH / BANNER_HEIGHT;
  const safeZoom = Math.max(1, Math.min(3, zoom));
  const cropWidth = Math.min(width, height * ratio) / safeZoom;
  const cropHeight = cropWidth / ratio;
  return {
    x: (width - cropWidth) * Math.max(0, Math.min(100, x)) / 100,
    y: (height - cropHeight) * Math.max(0, Math.min(100, y)) / 100,
    width: cropWidth,
    height: cropHeight,
  };
}

export function dateToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isAdVisible(ad, campus, placement, today = dateToday()) {
  return ad.status === 'live' && ad.campus === campus &&
    ad.placements.includes(placement) &&
    (!ad.start || ad.start <= today) && (!ad.end || ad.end >= today);
}

export function validateAd(ad, publish = false) {
  if (!ad.title.trim()) return 'Give your promotion a headline.';
  if (publish && !ad.image) return 'Generate or upload a banner first.';
  if (publish && !ad.sponsor.trim()) return 'Add the university department or sponsor name.';
  if (publish && !ad.placements.length) return 'Choose at least one place to show your promotion.';
  if (ad.end && ad.start && ad.end < ad.start) return 'The end date must come after the start date.';
  if (publish && ad.end && ad.end < dateToday()) return 'Choose an end date that has not passed.';
  if (ad.url) {
    try {
      const parsed = new URL(ad.url);
      if (parsed.protocol !== 'https:') return 'Use a full HTTPS link for your destination.';
      if (parsed.username || parsed.password) return 'Destination links cannot contain credentials.';
    } catch { return 'Use a full HTTPS link for your destination.'; }
  }
  if (publish && !ad.url) return 'Add an HTTPS link for registrations or study details.';
  return '';
}
