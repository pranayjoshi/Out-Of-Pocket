import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowUpRight, Check, ChevronRight, ImagePlus, Leaf, LoaderCircle, Megaphone, Pause, Pencil, Play, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { AD_PLACEMENTS, BANNER_WIDTH, BANNER_HEIGHT, cropRect, dateToday, isAdVisible, validateAd } from './lib/ads.mjs';
import { sampleAds } from './lib/sampleAds.mjs';
import './ads.css';

export type Ad = {
  id: string; campus: string; title: string; description: string; sponsor: string;
  image: string; prompt: string; url: string; cta: string; kind: string;
  status: 'draft' | 'live' | 'paused'; placements: string[]; start: string; end: string; sample?: boolean;
};
const storageKey = 'relay-promotions-v1';
const campusName = (campus: string) => campus === 'Alabama' ? 'University of Alabama' : 'Auburn University';
const blankAd = (campus: string): Ad => ({
  id: crypto.randomUUID(), campus, title: '', description: '', sponsor: campusName(campus),
  image: '', prompt: '', url: '', cta: 'Learn more', kind: 'Campus event', status: 'draft',
  placements: [...AD_PLACEMENTS], start: '', end: '',
});

export function useAds() {
  const [ads, setAds] = useState<Ad[]>(() => {
    try { const stored = JSON.parse(localStorage.getItem(storageKey) || 'null'); return Array.isArray(stored) ? stored : sampleAds; }
    catch { return sampleAds; }
  });
  const revision = useRef(0);
  const [syncError, setSyncError] = useState('');
  useEffect(() => {
    let active = true;
    let firstRefresh = true;
    async function refresh() {
      try {
        const response = await fetch('/api/ads/campaigns');
        if (!response.ok) throw new Error();
        let result = await response.json();
        if (firstRefresh && result.revision === 0) {
          firstRefresh = false;
          const legacy = ads.filter(ad => !ad.sample && !result.ads.some((item: Ad) => item.id === ad.id));
          if (legacy.length) {
            const migration = await fetch('/api/ads/campaigns', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ads: [...result.ads, ...legacy], revision: 0 }) });
            if (!migration.ok) throw new Error();
            result = await migration.json();
          }
        }
        firstRefresh = false;
        if (!Array.isArray(result.ads) || !Number.isInteger(result.revision)) throw new Error();
        if (!active) return;
        if (result.revision < revision.current) return;
        revision.current = result.revision;
        setAds(result.ads);
        try { localStorage.setItem(storageKey, JSON.stringify(result.ads)); } catch { /* The server is authoritative. */ }
        setSyncError('');
      } catch { if (active) setSyncError('Campaign service unavailable. Showing cached or sample promotions; publishing needs the local server.'); }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  async function commit(next: Ad[]) {
    try {
      const response = await fetch('/api/ads/campaigns', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ads: next, revision: revision.current }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save promotions.');
      revision.current = result.revision;
      setAds(result.ads);
      try { localStorage.setItem(storageKey, JSON.stringify(result.ads)); } catch { /* Saved on the server. */ }
      setSyncError('');
      return true;
    } catch (error) { setSyncError(error instanceof Error ? error.message : 'Could not save promotions.'); return false; }
  }
  return { ads, commit, syncError };
}

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}
async function renderBanner(src: string, zoom = 1, x = 50, y = 50) {
  const image = await loadImage(src);
  const crop = cropRect(image.naturalWidth, image.naturalHeight, zoom, x, y);
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare this image.');
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function CropDialog({ src, onClose, onApply }: { src: string; onClose: () => void; onApply: (image: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = 'hidden';
    let active = true;
    loadImage(src).then(image => { if (active) setSource(image); }).catch(() => { if (active) setError('This picture could not be opened. Try a JPG, PNG or WebP.'); });
    return () => { active = false; document.body.style.overflow = overflow; previous?.focus(); };
  }, [src]);
  useEffect(() => {
    if (!source || !canvas.current) return;
    const crop = cropRect(source.naturalWidth, source.naturalHeight, zoom, x, y);
    const context = canvas.current.getContext('2d');
    if (!context) { setError('Your browser could not prepare this picture.'); return; }
    context.clearRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    setReady(true);
  }, [source, zoom, x, y]);
  async function apply() {
    setApplying(true);
    try { onApply(await renderBanner(src, zoom, x, y)); } catch { setError('Could not crop this picture. Please try another image.'); }
    finally { setApplying(false); }
  }
  return <dialog ref={dialog} className="ad-crop-dialog" aria-labelledby="crop-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="ad-crop-heading"><div><span className="eyebrow">MAKE IT FIT</span><h2 id="crop-title">A little room to adjust.</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cancel crop"><X size={20} /></button></div>
    <p>Choose the part students will see. We’ll take care of the size.</p>
    <div className="ad-crop-stage"><canvas ref={canvas} width={BANNER_WIDTH} height={BANNER_HEIGHT} aria-label="Banner crop preview" /></div>
    <div className="ad-crop-controls">
      <label>Zoom <input aria-label="Crop zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <label>Horizontal position <input type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))} /></label>
      <label>Vertical position <input type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))} /></label>
    </div>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-crop-footer"><span>1,200 × 400 px · 3:1</span><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={!ready || applying} onClick={apply}><Check size={16} /> Use this crop</button></div>
  </dialog>;
}

export function AdBanner({ ad, preview = false, onDismiss }: { ad: Ad; preview?: boolean; onDismiss?: () => void }) {
  const content = <>
    <div className="ad-banner-art">{ad.image ? <img src={ad.image} alt="" /> : <div className="ad-placeholder-art"><span /><span /><span /><Leaf size={66} strokeWidth={1} /></div>}</div>
    <div className="ad-banner-copy"><span className="ad-sponsor-label">SPONSORED · {ad.sponsor || 'Your university'}</span><h3>{ad.title || 'Something good is happening.'}</h3>{ad.description && <p>{ad.description}</p>}<span className="ad-banner-cta">{ad.cta || 'Learn more'} <ArrowUpRight size={15} /></span></div>
  </>;
  return <aside className={`ad-banner ${preview ? 'is-preview' : ''}`} aria-label={preview ? 'Promotion preview' : `Sponsored by ${ad.sponsor}`}>
    {preview ? <div className="ad-banner-link">{content}</div> : <a className="ad-banner-link" href={ad.url} target="_blank" rel="noopener noreferrer">{content}</a>}
    {onDismiss && <button className="ad-dismiss" onClick={onDismiss} aria-label="Dismiss promotion"><X size={15} /></button>}
  </aside>;
}

export function AdPlacement({ ads, campus, placement }: { ads: Ad[]; campus: string; placement: string }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [, refreshDate] = useState(0);
  useEffect(() => { const timer = setInterval(() => refreshDate(value => value + 1), 60000); return () => clearInterval(timer); }, []);
  const ad = [...ads].sort((a, b) => Number(Boolean(a.sample)) - Number(Boolean(b.sample))).find(ad => isAdVisible(ad, campus, placement) && !dismissed.includes(ad.id));
  if (!ad) return null;
  return <AdBanner ad={ad} onDismiss={() => setDismissed(previous => [...previous, ad.id])} />;
}

export default function AdsPortal({ campus, ads, commit, onPreview }: { campus: string; ads: Ad[]; commit: (ads: Ad[]) => Promise<boolean>; onPreview: (placement: string) => void }) {
  const [tab, setTab] = useState<'create' | 'manage'>('create');
  const [draft, setDraft] = useState<Ad>(() => blankAd(campus));
  const [method, setMethod] = useState<'generate' | 'upload'>('generate');
  const [cropSource, setCropSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewMode, setPreviewMode] = useState('desktop');
  const [deleteId, setDeleteId] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const campusAds = ads.filter(ad => ad.campus === campus);
  useEffect(() => {
    setDraft(blankAd(campus)); setError(''); setNotice(''); setCropSource(''); setBusy(false); setDeleteId('');
    controller.current?.abort();
    return () => controller.current?.abort();
  }, [campus]);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/ads/status', { signal: abort.signal }).then(r => r.json()).then(data => setAvailability(Boolean(data.available))).catch(() => { if (!abort.signal.aborted) setAvailability(false); });
    return () => abort.abort();
  }, []);
  function update<K extends keyof Ad>(key: K, value: Ad[K]) { setDraft(previous => ({ ...previous, [key]: value })); setNotice(''); setError(''); }
  async function generate() {
    if (draft.prompt.trim().length < 10) { setError('Tell us a little more: use at least 10 characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch('/api/ads/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: draft.prompt }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not generate a banner. Please try again.');
      const banner = await renderBanner(result.image);
      if (abort.signal.aborted) return;
      setDraft(previous => ({ ...previous, image: banner, title: previous.title || previous.prompt.split(/[\n.!?]/)[0].slice(0, 80) }));
      setNotice('Banner ready. Add your link and you’re ready to publish.');
    } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : 'Could not generate this banner.'); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG or WebP picture.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Choose a picture smaller than 10 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setCropSource(String(reader.result));
    reader.onerror = () => setError('This picture could not be read. Please try again.');
    reader.readAsDataURL(file);
  }
  async function save(status: Ad['status']) {
    const candidate = { ...draft, sample: false, title: draft.title.trim(), sponsor: draft.sponsor.trim(), url: draft.url.trim(), status };
    const problem = validateAd(candidate, status === 'live');
    if (problem) { setError(problem); return; }
    setSaving(true);
    const saved = await commit([...ads.filter(ad => ad.id !== candidate.id), candidate]);
    setSaving(false);
    if (!saved) { setError('Could not save this promotion to the campaign service. Check the service message and try again.'); return; }
    setDraft(candidate); setError(''); setNotice(status === 'live' ? 'Promotion published. It will appear in the app when it refreshes.' : 'Draft saved. Come back whenever you’re ready.');
  }
  async function toggle(ad: Ad) {
    const status = ad.status === 'live' ? 'paused' : 'live';
    const problem = validateAd(ad, status === 'live');
    if (problem) { setError(problem); return; }
    if (!await commit(ads.map(item => item.id === ad.id ? { ...item, status } : item))) setError('Could not update this promotion. Please try again.');
    else { setError(''); setNotice(status === 'live' ? 'Promotion resumed in the app.' : 'Promotion paused. It is no longer shown to students.'); }
  }
  function newDraft() { setDraft(blankAd(campus)); setTab('create'); setError(''); setNotice(''); setDeleteId(''); }
  return <div className="ads-portal">
    <div className="ad-breadcrumb"><span>University workspace</span><ChevronRight size={13} /><span>Campus promotions</span><span className="ad-preview-badge">LOCAL WORKSPACE</span></div>
    <div className="ad-page-heading"><div><div className="eyebrow"><Megaphone size={14} /> A LITTLE MORE CAMPUS</div><h1>Good things deserve<br className="ad-heading-break" /> to be seen<span>.</span></h1><p>Bring your events, research and campus opportunities to the right people.</p></div><div className="ad-university-mark"><span>{campus === 'Alabama' ? 'A' : 'AU'}</span><div><strong>{campusName(campus)}</strong><small>Campus partner workspace</small></div></div></div>
    <div className="ad-purpose-note"><Leaf size={19} /><p><strong>Free for students. Supported by campus.</strong> Thoughtful promotions keep Relay free, with no marketplace commissions.</p></div>
    <div className="ad-workspace-tabs" role="tablist" aria-label="Promotions workspace"><button id="ad-create-tab" role="tab" aria-selected={tab === 'create'} aria-controls="ad-create-panel" onClick={() => { setTab('create'); setError(''); setNotice(''); }}><Plus size={16} /> Create a promotion</button><button id="ad-manage-tab" role="tab" aria-selected={tab === 'manage'} aria-controls="ad-manage-panel" onClick={() => { setTab('manage'); setError(''); setNotice(''); }}>Your promotions <span>{campusAds.length}</span></button></div>
    {error && <div role="alert" className="ad-error">{error}</div>}
    {notice && <div role="status" className="ad-notice"><Check size={17} />{notice}</div>}
    {tab === 'create' ? <div className="ad-editor-layout" role="tabpanel" id="ad-create-panel" aria-labelledby="ad-create-tab">
      <form className="ad-editor" onSubmit={(e: FormEvent) => { e.preventDefault(); save('live'); }}>
        <section className="ad-editor-section ad-banner-section">
          <div className="ad-method-tabs"><button type="button" aria-pressed={method === 'generate'} onClick={() => setMethod('generate')}><Sparkles size={16} /> Generate with a prompt</button><button type="button" aria-pressed={method === 'upload'} onClick={() => setMethod('upload')}><Upload size={16} /> Upload a picture</button></div>
          {method === 'generate' ? <div className="ad-prompt-area"><label htmlFor="ad-prompt">What would you like to share?</label><textarea id="ad-prompt" maxLength={3000} rows={4} value={draft.prompt} disabled={busy} onChange={e => update('prompt', e.target.value)} placeholder="A cozy evening at the campus film festival. Outdoor cinema, blankets on the quad, warm autumn colors. October 24, free entry." /><div className="ad-prompt-examples"><span>Try an idea</span>{['A fall festival on the quad', 'Help shape the next research breakthrough'].map(prompt => <button type="button" disabled={busy} key={prompt} onClick={() => update('prompt', prompt)}>{prompt}<ArrowUpRight size={11} /></button>)}</div>
            <button type="button" className="button primary ad-generate-button" disabled={busy || draft.prompt.trim().length < 10} onClick={generate}>{busy ? <LoaderCircle className="ad-spinner" size={17} /> : <Sparkles size={17} />}{busy ? 'Creating your banner…' : draft.image ? 'Generate a new banner' : 'Generate banner'}<span>3:1</span></button>
            <p className="ad-field-hint" role="status">{busy ? 'Good artwork takes a moment. You can keep editing the details below.' : availability === false ? 'Connect your OpenRouter key to generate, or upload a picture.' : 'Made to fit automatically. Your headline stays crisp and readable.'}</p>
          </div> : <div className="ad-upload-area"><button type="button" className="ad-upload-target" disabled={busy} onClick={() => fileInput.current?.click()}><span><ImagePlus size={26} strokeWidth={1.4} /></span><strong>Give your picture a place on campus.</strong><p>Choose a picture, then crop it to fit.</p><small>JPG, PNG or WebP · up to 10 MB</small><span className="button">Choose picture <Upload size={15} /></span></button></div>}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
          {draft.image && <div className="ad-image-ready"><Check size={15} /> Banner ready · 1,200 × 400 px<button type="button" disabled={busy} onClick={() => setCropSource(draft.image)}>Adjust crop</button></div>}
        </section>
        <section className="ad-essential-fields">
          <div className="ad-field-grid">
            <label className="ad-full-field">Headline<input maxLength={80} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="What’s happening on campus?" /></label>
            <label className="ad-full-field">Link<input type="url" value={draft.url} onChange={e => update('url', e.target.value)} placeholder="https://your-university.edu/event" /></label>
          </div>
        </section>
        <details className="ad-more-options" key={draft.id}>
          <summary>More options <ChevronRight size={15} /></summary>
          <div className="ad-optional-fields">
            <div className="ad-field-grid">
              <label className="ad-full-field">Description <span>optional</span><input maxLength={160} value={draft.description} onChange={e => update('description', e.target.value)} placeholder="October 24 · The Quad · Free entry" /></label>
              <label className="ad-full-field">University or department<input maxLength={100} value={draft.sponsor} onChange={e => update('sponsor', e.target.value)} /></label>
              <label>Start date<input type="date" value={draft.start} onChange={e => update('start', e.target.value)} /><small>Blank means start when published.</small></label>
              <label>End date<input type="date" min={draft.start || dateToday()} value={draft.end} onChange={e => update('end', e.target.value)} /><small>Blank means run until paused.</small></label>
            </div>
            <fieldset className="ad-placements"><legend>Show on</legend>{AD_PLACEMENTS.map(placement => <label key={placement}><input type="checkbox" checked={draft.placements.includes(placement)} onChange={() => update('placements', draft.placements.includes(placement) ? draft.placements.filter(item => item !== placement) : [...draft.placements, placement])} />{placement}</label>)}</fieldset>
          </div>
        </details>
        <p className="ad-default-summary">{draft.placements.join(' & ') || 'No placements selected'} · {draft.start ? `Starts ${draft.start}` : 'Starts when published'}{draft.end ? ` · Ends ${draft.end}` : ''}</p>
        <div className="ad-publish-row"><button type="button" className="button ad-save-button" disabled={busy || saving} onClick={() => save('draft')}>Save draft</button><button type="submit" className="button primary" disabled={busy || saving}>{saving ? 'Saving…' : 'Publish to app'} <ArrowUpRight size={16} /></button></div>
        <p className="ad-local-note">Saved on your local campus server. Shared with the app.</p>
      </form>
      <aside className="ad-preview-column"><div className="ad-preview-sticky"><div className="ad-preview-header"><span className="eyebrow">THE STUDENT VIEW</span><div role="group" aria-label="Preview size"><button aria-pressed={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>Desktop</button><button aria-pressed={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>Mobile</button></div></div><div className={`ad-context-preview ${previewMode}`}><div className="ad-context-top"><span className="ad-mini-brand">relay<span>.</span></span><span>{campus === 'Alabama' ? 'Alabama' : 'Auburn'} <ChevronRight size={11} /></span></div><div className="ad-context-heading">Your campus, in circulation.</div><div className="ad-context-skeleton"><span /><span /><span /></div><AdBanner ad={draft} preview /><div className="ad-context-products">{['chair', 'lamp', 'books'].map(image => <div key={image}><img src={`/images/${image}.jpg`} alt="" /><span /><span /></div>)}</div></div><div className="ad-preview-caption"><span /><p>A natural part of their campus.<br /><strong>Always labeled. Never in the way.</strong></p></div><div className="ad-design-note"><Leaf size={19} /><div><strong>A good neighbor to good finds.</strong><p>One promotion per page, gentle colors, and room for the things students came for.</p></div></div>{draft.status === 'live' && <button className="button ad-view-in-app" onClick={() => onPreview(draft.placements[0] || 'Discover')}>See it in the app <ArrowUpRight size={16} /></button>}</div></aside>
    </div> : <section role="tabpanel" id="ad-manage-panel" aria-labelledby="ad-manage-tab" className="ad-manage"><div className="ad-manage-heading"><div><h2>Your corner of campus.</h2><p>{campusAds.filter(ad => ad.status === 'live').length} published · {campusAds.filter(ad => ad.status === 'draft').length} drafts · {campusAds.filter(ad => ad.status === 'paused').length} paused</p></div><button className="button primary" onClick={newDraft}><Plus size={16} />New promotion</button></div>{campusAds.length ? <div className="ad-campaign-list">{campusAds.map(ad => <article key={ad.id} className="ad-campaign"><div className="ad-campaign-image">{ad.image ? <img src={ad.image} alt="" /> : <ImagePlus size={25} />}</div><div className="ad-campaign-info"><span className={`ad-status ${ad.status}`}>{ad.status === 'live' ? ad.start && ad.start > dateToday() ? 'Scheduled' : ad.end && ad.end < dateToday() ? 'Ended' : 'Published' : ad.status}</span><h3>{ad.title}</h3><p>{ad.kind} · {ad.placements.join(', ') || 'No placements chosen'}</p></div><div className="ad-campaign-actions"><button aria-label={`Edit ${ad.title}`} title="Edit promotion" onClick={() => { controller.current?.abort(); setBusy(false); setDraft({ ...ad }); setTab('create'); setError(''); setNotice(''); }}><Pencil size={17} /></button>{ad.status !== 'draft' && <button aria-label={`${ad.status === 'live' ? 'Pause' : 'Resume'} ${ad.title}`} title={ad.status === 'live' ? 'Pause' : 'Resume'} onClick={() => toggle(ad)}>{ad.status === 'live' ? <Pause size={17} /> : <Play size={17} />}</button>}<button aria-label={`Delete ${ad.title}`} title="Delete promotion" onClick={() => setDeleteId(ad.id)}><Trash2 size={17} /></button></div>{deleteId === ad.id && <div className="ad-delete-confirm"><span>Delete this promotion? This cannot be undone.</span><button className="button" onClick={() => setDeleteId('')}>Keep it</button><button className="button" onClick={async () => { if (await commit(ads.filter(item => item.id !== ad.id))) { setDeleteId(''); if (draft.id === ad.id) setDraft(blankAd(campus)); } else setError('Could not remove this promotion from the campaign service.'); }}>Delete</button></div>}</article>)}</div> : <div className="ad-empty"><span><Megaphone size={30} strokeWidth={1.3} /></span><h3>Your next good thing starts here.</h3><p>Create your first promotion for an event, a study, or an opportunity worth sharing.</p><button className="button" onClick={newDraft}>Create a promotion <ArrowUpRight size={16} /></button></div>}</section>}
    {cropSource && <CropDialog src={cropSource} onClose={() => setCropSource('')} onApply={image => { update('image', image); setCropSource(''); setNotice('Picture cropped and ready.'); }} />}
  </div>;
}
