import { useEffect, useRef, useState } from 'react';
import { coursesFor } from './lib/courses.mjs';
import './schedule.css';
export type CourseProfile = { campus: string; codes: string[] };
export default function Schedule({ campus, codes, onSave }: { campus: string; codes: string[]; onSave: (codes: string[]) => void }) {
  const [draft, setDraft] = useState(codes);
  const [image, setImage] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function readSchedule() {
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(''); setUnmatched([]);
    try {
      const response = await fetch('/api/schedule/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ campus, image, consent }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not import schedule.');
      setDraft(result.courses); setUnmatched(result.unmatched); setImage(''); setConsent(false);
      setMessage(result.courses.length ? 'Review the detected classes below. Save when they look right.' : 'No supported classes found. Choose from the starter list below.');
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not read screenshot.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="schedule-panel" aria-label="Your classes">
    <span className="eyebrow">YOUR SEMESTER, SORTED</span>
    <h3>Find things for your classes.</h3>
    <p>Add your {campus === 'Alabama' ? 'University of Alabama' : 'Auburn University'} classes to personalize finds. Import a schedule screenshot or choose classes below.</p>
    <label className="field-label" htmlFor="schedule-image">Schedule screenshot</label>
    <input id="schedule-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; setImage(''); setConsent(false); setMessage('');
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage('Choose a PNG, JPEG or WebP screenshot smaller than 5 MB.'); return; }
      try { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); setImage(data); }
      catch { setMessage('Could not open that image. Try another.'); }
    }} />
    {image && <img className="schedule-preview" src={image} alt="Selected schedule screenshot" />}
    <label className="schedule-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /> Send this screenshot to OpenRouter and its model provider to read course codes. Crop out personal details first.</label>
    <p className="schedule-note">Out of Pocket does not save the screenshot. Only the classes you confirm stay in this browser. Provider data policies apply to the uploaded image.</p>
    <button type="button" className="button secondary" disabled={!image || !consent || busy} onClick={readSchedule}>{busy ? 'Reading your schedule…' : 'Read screenshot'}</button>
    {message && <p role="status">{message}</p>}
    {unmatched.length > 0 && <p role="status">Outside this starter catalog: {unmatched.join(', ')}. These classes have not been added.</p>}
    <fieldset disabled={busy} className="course-options"><legend>Review your classes · starter catalog</legend>
      {coursesFor(campus).map(course => <label key={course.code}><input type="checkbox" checked={draft.includes(course.code)} onChange={e => setDraft(previous => e.target.checked ? [...previous, course.code] : previous.filter(c => c !== course.code))} /><span><strong>{course.code}</strong> {course.title}</span></label>)}
    </fieldset>
    <div className="schedule-actions"><button className="button primary" disabled={busy} onClick={() => { onSave(draft); setMessage('Classes saved. Your For you finds now use these classes.'); }}>Save classes</button><button className="button secondary" disabled={busy} onClick={() => { setDraft([]); onSave([]); setImage(''); setConsent(false); setMessage('Saved classes removed.'); }}>Clear classes</button></div>
    <p className="schedule-note">Suggestions are based on class tags and listing keywords. Check your syllabus for required books, editions and supplies.</p>
  </section>;
}
