// Local prototype endpoint. Add authenticated university roles and per-tenant
// quotas before exposing this service beyond loopback.
export function createAdsHandler({ apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_IMAGE_MODEL || 'black-forest-labs/flux.2-klein-4b', fetchImpl = fetch } = {}) {
  let generating = false;
  return async function adsHandler(req, res, next) {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/ads/')) return next();
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
      return send(403, { error: 'This endpoint accepts same-origin requests only.' });
    }
    if (path === '/api/ads/status' && req.method === 'GET') return send(200, { available: Boolean(apiKey) });
    if (path !== '/api/ads/generate' || req.method !== 'POST') return send(404, { error: 'Not found.' });
    if (!apiKey) return send(503, { error: 'Image generation is not connected yet. Set OPENROUTER_API_KEY on the server, or upload a banner instead.' });
    if (generating) return send(429, { error: 'A banner is already being generated. Please try again shortly.' });
    let raw = '';
    let acquired = false;
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 12000) return send(413, { error: 'This prompt is too long.' });
      }
      let body;
      try { body = JSON.parse(raw); } catch { return send(400, { error: 'Send a valid JSON prompt.' }); }
      if (typeof body.prompt !== 'string' || body.prompt.trim().length < 10 || body.prompt.length > 3000) {
        return send(400, { error: 'Describe your banner in 10–3,000 characters.' });
      }
      if (generating) return send(429, { error: 'A banner is already being generated. Please try again shortly.' });
      generating = true;
      acquired = true;
      const response = await fetchImpl('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          model, n: 1, aspect_ratio: '21:9', output_format: 'jpeg',
          prompt: `Create a tasteful editorial illustration for a university campus promotion in Relay, a free student marketplace. Wide banner artwork that will be center-cropped to 3:1. Keep the subject within the middle horizontal third with generous space above and below. Warm off-white, forest green, sage and muted peach palette; a calm, welcoming campus feel. Use the whole canvas with a clear focal point. No text, lettering, logos, QR codes or watermarks; headline and accessible call-to-action are rendered separately by the app. The promotional brief is: ${body.prompt.trim()}`,
        }),
      });
      if (!response.ok) {
        return send(response.status === 429 ? 429 : 502, { error: response.status === 429
          ? 'The image service is busy or its quota has been reached. Try again later or upload a picture.'
          : 'The image service could not create this banner. Try a different prompt or upload a picture.' });
      }
      const result = await response.json();
      if (!result.data?.[0]?.b64_json) return send(502, { error: 'The image service returned no banner. Please try again.' });
      const mediaType = result.data[0].media_type || 'image/jpeg';
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) return send(502, { error: 'The image service returned an unsupported picture format.' });
      return send(200, { image: `data:${mediaType};base64,${result.data[0].b64_json}` });
    } catch (error) {
      return send(502, { error: error?.name === 'TimeoutError' ? 'Generation took too long. Please try again.' : 'The image service is unavailable. Please try again or upload a picture.' });
    } finally { if (acquired) generating = false; }
  };
}
