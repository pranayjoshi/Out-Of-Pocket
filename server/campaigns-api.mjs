import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sampleAds } from '../src/lib/sampleAds.mjs';
import { AD_PLACEMENTS, dateToday, validateAd } from '../src/lib/ads.mjs';

// Local development only: bind Vite to loopback. Shared deployments require
// university authentication, role checks, and a transactional campaign database.
export function createCampaignHandler({ directory = join(process.cwd(), '.relay-data') } = {}) {
  const file = join(directory, 'campaigns.json');
  let queue = Promise.resolve();
  async function readCampaigns() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { ads: structuredClone(sampleAds), revision: 0 }; throw error; }
  }
  return async function campaignsHandler(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/ads/campaigns') return next();
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return send(403, { error: 'Same-origin requests only.' });
    try {
      if (req.method === 'GET') {
        await queue;
        const { ads, revision } = await readCampaigns();
        let records = ads;
        if (url.searchParams.get('published') === '1') records = records.filter(ad => ad.status === 'live');
        return send(200, { ads: records, revision: revision ?? 0 });
      }
      if (req.method !== 'PUT') return send(405, { error: 'Use GET or PUT.' });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 12 * 1024 * 1024) return send(413, { error: 'Campaign storage limit reached. Remove old campaigns or use smaller pictures.' });
      }
      let body;
      try { body = JSON.parse(raw); } catch { return send(400, { error: 'Invalid JSON.' }); }
      if (!Array.isArray(body.ads) || body.ads.length > 60 || !Number.isInteger(body.revision)) return send(400, { error: 'Invalid campaign collection.' });
      const ids = new Set();
      for (const ad of body.ads) {
        if (!ad || typeof ad.id !== 'string' || ids.has(ad.id) || !['Alabama', 'Auburn'].includes(ad.campus) || !['draft', 'live', 'paused'].includes(ad.status) || !Array.isArray(ad.placements) || ad.placements.some(p => !AD_PLACEMENTS.includes(p))) return send(400, { error: 'Invalid campaign record.' });
        ids.add(ad.id);
        if (['title', 'sponsor', 'image', 'url', 'description', 'cta', 'kind', 'start', 'end', 'prompt'].some(key => typeof ad[key] !== 'string')) return send(400, { error: 'Campaign fields must be text.' });
        if (ad.title.length > 80 || ad.description.length > 160 || ad.sponsor.length > 100 || ad.prompt.length > 3000 || ad.cta.length > 40 || ad.url.length > 2048) return send(400, { error: 'A campaign field is too long.' });
        if (ad.image && !/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(ad.image) && !/^\/images\/[a-zA-Z0-9-]+\.jpg$/.test(ad.image)) return send(400, { error: 'Use an uploaded or generated banner.' });
        for (const key of ['start', 'end']) if (ad[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(ad[key]) || !Number.isFinite(Date.parse(ad[key])))) return send(400, { error: 'Invalid campaign date.' });
        // Previously published campaigns can remain stored after their end date.
        const problem = validateAd(ad, ad.status === 'live' && !(ad.end && ad.end < dateToday()));
        if (problem) return send(400, { error: problem });
      }
      const operation = queue.then(async () => {
        const previous = await readCampaigns();
        const revision = previous.revision ?? 0;
        if (body.revision !== revision) return { status: 409, body: { error: 'Another editor changed these promotions. Reload before saving.' } };
        const saved = { ads: body.ads, revision: revision + 1 };
        await mkdir(directory, { recursive: true });
        const temporary = join(directory, `campaigns-${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(saved));
        await rename(temporary, file);
        return { status: 200, body: saved };
      });
      queue = operation.then(() => {}, () => {});
      const result = await operation;
      return send(result.status, result.body);
    } catch { return send(500, { error: 'Could not access campaign storage. Please try again.' }); }
  };
}
