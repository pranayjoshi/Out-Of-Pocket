import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, MessageCircle, Send } from 'lucide-react';
import type { Product } from './data';
import { agreedProduct, conversationTitle, formatOffer, parseOffer, pendingOffer, unreadCount, updateConversation } from './lib/messages.mjs';
import type { Conversation, Party } from './lib/messages.mjs';
import './messages.css';

type Props = {
  threads: Conversation[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (thread: Conversation) => void;
  locked: (id: string) => boolean;
  onReserve: (product: Product) => void;
  onExplore: () => void;
};
export default function Messages({ threads, activeId, onSelect, onUpdate, locked, onReserve, onExplore }: Props) {
  const thread = threads.find(t => t.id === activeId);
  return <section className={`inbox ${thread ? 'thread-open' : ''}`}>
    <div className="inbox-list">
      <div className="eyebrow">A GOOD FIND STARTS WITH HELLO</div>
      <h1>Messages</h1>
      <p>Ask a question. Agree on a price. Plan a pickup.</p>
      <div className="form-note">Local demo · messages stay in this browser. No one else receives them.</div>
      {threads.length === 0 ? <div className="inbox-empty"><MessageCircle size={32}/><h2>Your next connection starts here.</h2><p>Open a listing and message the seller.</p><button className="button primary" onClick={onExplore}>Explore listings <ArrowRight size={16}/></button></div> :
        [...threads].sort((a, b) => (b.messages.at(-1)?.createdAt ?? b.createdAt).localeCompare(a.messages.at(-1)?.createdAt ?? a.createdAt)).map(t => <button key={t.id} className={`conversation-row ${activeId === t.id ? 'active' : ''}`} onClick={() => onSelect(t.id)}>
          {t.product ? <img src={t.product.image} alt=""/> : <span className="conversation-mark" aria-hidden="true">{t.subject?.kind === 'ticket_order' ? 'T' : 'R'}</span>}
          <span><strong>{t.own ? 'Sample buyer' : t.product?.seller || 'Demo participant'}</strong><small>{conversationTitle(t)}</small><small>{t.messages.at(-1)?.text ?? 'Start the conversation'}</small></span>
          {unreadCount(t) > 0 && <span className="unread-count" aria-label={`${unreadCount(t)} unread messages`}>{unreadCount(t)}</span>}
        </button>)}
    </div>
    {thread ? <Thread key={thread.id} thread={thread} onBack={() => onSelect(null)} onUpdate={onUpdate} locked={thread.product ? locked(thread.product.id) : false} onReserve={onReserve}/> :
      threads.length > 0 && <div className="inbox-placeholder"><MessageCircle size={38}/><h2>A little connection.</h2><p>Choose a conversation to keep things moving.</p></div>}
  </section>;
}
function Thread({ thread, onBack, onUpdate, locked, onReserve }: { thread: Conversation; onBack: () => void; onUpdate: Props['onUpdate']; locked: boolean; onReserve: Props['onReserve'] }) {
  const [draft, setDraft] = useState('');
  const [amount, setAmount] = useState('');
  const [showOffer, setShowOffer] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const local: Party = thread.own ? 'seller' : 'buyer';
  const party: Party = demo ? local === 'buyer' ? 'seller' : 'buyer' : local;
  const pending = pendingOffer(thread);
  const accepted = thread.offers.find(o => o.status === 'accepted');
  useEffect(() => {
    if (unreadCount(thread)) onUpdate(updateConversation(thread, { type: 'read', party: local }));
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [thread.id, thread.messages.length]);
  const act = (action: Parameters<typeof updateConversation>[1]) => {
    try { onUpdate(updateConversation(thread, action, locked)); setError(''); return true; }
    catch (e) { setError((e as Error).message); return false; }
  };
  return <div className="message-thread">
    <header className="thread-header">
      <button className="icon-button" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={18}/></button>
      {thread.product ? <img src={thread.product.image} alt=""/> : <span className="conversation-mark" aria-hidden="true">{thread.subject?.kind === 'ticket_order' ? 'T' : 'R'}</span>}
      <div><strong>{conversationTitle(thread)}</strong><small>{thread.product ? `${thread.own ? 'Sample buyer' : thread.product.seller} · Asking ${formatOffer(Math.round(thread.product.price * 100))}` : thread.detail || 'Ride or ticket conversation'}</small></div>
    </header>
    <div className="thread-history" role="log" aria-label="Conversation history" aria-live="polite">
      <label className="demo-party"><input type="checkbox" checked={demo} onChange={e => { setDemo(e.target.checked); setDraft(''); setError(''); setShowOffer(false); }}/><span>Demo: act as {local === 'buyer' ? 'seller' : 'buyer'}<small>Try the other side. No messages are delivered.</small></span></label>
      {thread.messages.length === 0 && <p className="conversation-hint">Ask about condition, availability, or a public pickup spot.</p>}
      {thread.messages.map(m => <article className={`message-bubble ${m.author === local ? 'outgoing' : 'incoming'}`} key={m.id}>
        <small>{m.author === local ? 'You' : 'Demo participant'} · {m.author}</small><p>{m.text}</p>
        <small>{new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{m.offerId && ` · ${thread.offers.find(o => o.id === m.offerId)?.status}`}</small>
      </article>)}
      <div className="negotiation-panel">
        {!thread.product && <p>This conversation follows a ride or ticket. Confirm the seat or transfer on its activity page. An offer here would not change that price.</p>}
        {thread.product && accepted ? <><h3><Check size={18}/> Agreed on {formatOffer(accepted.amountCents)}</h3><p>Agreeing on a price does not reserve the item or charge a payment.</p></> : thread.product && pending ? <>
          <h3>{pending.author === 'buyer' ? 'Buyer' : 'Seller'}’s offer · {formatOffer(pending.amountCents)}</h3><p>Awaiting {pending.author === 'buyer' ? 'seller' : 'buyer'} response.</p>
          {!locked && (pending.author === party ? <button className="button secondary" onClick={() => act({ type: 'withdrawn', party, offerId: pending.id })}>Withdraw offer</button> : <div className="offer-actions"><button className="button primary" onClick={() => { act({ type: 'accepted', party, offerId: pending.id }); setShowOffer(false); }}>Accept {formatOffer(pending.amountCents)}</button><button className="button secondary" onClick={() => setShowOffer(true)}>Counteroffer</button><button className="button secondary" onClick={() => act({ type: 'declined', party, offerId: pending.id })}>Decline</button></div>)}
        </> : null}
        {thread.product && !locked && !accepted && thread.product.price > 0 && <>
          {!showOffer && !pending && <button className="button secondary" onClick={() => setShowOffer(true)}>Make an offer</button>}
          {showOffer && <form onSubmit={e => { e.preventDefault(); try { const cents = parseOffer(amount); if (act({ type: 'offer', party, amountCents: cents })) { setAmount(''); setShowOffer(false); } } catch (e) { setError((e as Error).message); } }}>
            <label className="field-label" htmlFor="offer-amount">Your offer ($)</label><input id="offer-amount" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" required/>
            <div className="offer-actions"><button className="button primary" type="submit">Send offer <ArrowRight size={16}/></button><button className="button secondary" type="button" onClick={() => { setShowOffer(false); setError(''); }}>Cancel</button></div>
          </form>}
        </>}
        {locked && <p>A handoff has started. Its price is fixed; you can keep messaging.</p>}
        {thread.product && party === 'buyer' && (!pending || locked) && <button className="button primary" onClick={() => { if (thread.product) onReserve(agreedProduct(thread)); }}>{locked ? 'View handoff' : `Plan handoff · ${formatOffer(Math.round((thread.product?.price ?? 0) * 100))}`} <ArrowRight size={16}/></button>}
      </div>
      <div ref={bottom}/>
    </div>
    {error && <p className="field-error message-error" role="alert">{error}</p>}
    <form className="message-composer" onSubmit={e => { e.preventDefault(); if (act({ type: 'message', party, text: draft })) setDraft(''); }}>
      <label htmlFor="message-draft">{demo ? 'Writing as demo' : 'Message as'} {party}</label>
      <div><textarea id="message-draft" rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a message…" maxLength={2000}/><button className="button primary" disabled={!draft.trim()} aria-label="Send message"><Send size={18}/></button></div>
      {draft.length > 1800 && <small>{draft.length}/2,000 characters</small>}
    </form>
  </div>;
}
