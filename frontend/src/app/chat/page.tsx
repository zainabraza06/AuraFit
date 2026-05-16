'use client';
import { useState, useRef, useEffect } from 'react';
import { recommendationsApi, supportApi } from '@/lib/api';
import RecommendationResult from '@/components/RecommendationResult';

type Msg = { role: 'user' | 'ai'; text?: string; data?: any; noResults?: boolean; isError?: boolean };

const OCCASION_CHIPS = [
  { label: 'Eid', prompt: 'A festive Eid outfit with accessories' },
  { label: 'Wedding', prompt: 'A bridal/guest wedding look' },
  { label: 'Mehndi', prompt: 'A colorful mehndi outfit' },
  { label: 'Party', prompt: 'A stylish party look for evening' },
  { label: 'Office', prompt: 'A smart office formal outfit' },
  { label: 'Casual', prompt: 'An everyday casual look' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([{
    role: 'ai',
    text: "Assalam o Alaikum! I'm your personal AI Stylist, powered by Gemini. Tell me what occasion you're dressing for, your color preference, or budget — and I'll curate a complete look from Pakistan's top brands. ✨"
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text: string) => {
    const q = text.trim(); if (!q || loading) return;
    setInput('');
    const userMsgIdx = messages.length;
    setMessages(p => [...p, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await recommendationsApi.outfit(q);
      if (res.data?.results?.length) {
        setMessages(p => [...p, { role: 'ai', data: res.data }]);
      } else {
        setMessages(p => [...p, {
          role: 'ai',
          text: "I couldn't find a perfect match right now. Try a different occasion or color, or let me connect you with our style expert.",
          noResults: true,
          data: { _userMessage: q }
        }]);
      }
    } catch {
      setMessages(p => [...p, {
        role: 'ai',
        text: "I'm having trouble reaching the styling engine. Please try again in a moment.",
        isError: true,
        data: { _userMessage: q }
      }]);
    } finally { setLoading(false); }
  };

  const handleEscalate = async (msgIdx: number, userMessage: string) => {
    if (escalating || escalated.has(msgIdx)) return;
    setEscalating(true);
    try {
      await supportApi.escalate(userMessage);
      setEscalated(prev => new Set([...prev, msgIdx]));
      setMessages(p => [...p, {
        role: 'ai',
        text: "Your request has been sent to our style expert. We'll get back to you soon with personalized recommendations!"
      }]);
    } catch {
      setMessages(p => [...p, { role: 'ai', text: "Couldn't submit the request. Please try again." }]);
    } finally {
      setEscalating(false);
    }
  };

  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header bar */}
      <div style={{
        position: 'fixed', top: 'var(--nav-h)', left: 0, right: 0, zIndex: 50,
        background: 'rgba(8,8,16,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        padding: '0.85rem clamp(1rem,4vw,3rem)',
        display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent-warm))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>✨</div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-display)' }}>AuraFit AI Stylist</h1>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Powered by Gemini 2.5 Flash · RAG over {'>'}10 Pakistani brands</p>
        </div>
        <div className="live-badge" style={{ marginLeft: 'auto' }}>Online</div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--nav-h) + 80px) clamp(1rem,4vw,3rem) 200px', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.4rem' }}>
            {msg.role === 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent-warm))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✨</div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>AI Stylist</span>
              </div>
            )}
            {msg.text && (
              <div style={{
                maxWidth: '78%',
                padding: '1rem 1.35rem',
                borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '4px 20px 20px 20px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg,var(--accent),var(--accent-warm))'
                  : 'var(--bg-elevated)',
                color: msg.role === 'user' ? '#0a0a12' : 'var(--text-primary)',
                border: msg.role === 'ai' ? '1px solid var(--border)' : 'none',
                lineHeight: 1.65, fontWeight: msg.role === 'user' ? 500 : 400,
              }}>
                {msg.text}
                {/* Escalate button on no-results or error messages */}
                {(msg.noResults || msg.isError) && !escalated.has(i) && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <button
                      onClick={() => handleEscalate(i, msg.data?._userMessage || '')}
                      disabled={escalating}
                      style={{
                        background: 'rgba(201,169,110,0.12)',
                        border: '1px solid rgba(201,169,110,0.35)',
                        color: 'var(--accent)',
                        padding: '0.45rem 1rem',
                        borderRadius: '100px',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {escalating ? 'Sending…' : '👩‍💼 Notify a Style Expert'}
                    </button>
                  </div>
                )}
                {escalated.has(i) && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--success)' }}>
                    ✓ Expert notified
                  </p>
                )}
              </div>
            )}
            {msg.data && !msg.noResults && !msg.isError && (
              <div style={{ width: '100%' }}><RecommendationResult data={msg.data} /></div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent-warm))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>✨</div>
            <div style={{ padding: '0.9rem 1.2rem', borderRadius: '4px 20px 20px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: `pulse-glow 1.2s ${d}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(8,8,16,0.9)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)', padding: '0.85rem clamp(1rem,4vw,3rem) 1.25rem' }}>
        {/* Occasion chips — always visible */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.75rem', maxWidth: 860, margin: '0 auto 0.75rem' }}>
          {OCCASION_CHIPS.map(chip => (
            <button
              key={chip.label}
              className="chip"
              onClick={() => send(chip.prompt)}
              disabled={loading}
              style={{ fontSize: '0.73rem', padding: '0.3rem 0.85rem' }}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.85rem', maxWidth: 860, margin: '0 auto' }}>
          <div className="style-input-wrap" style={{ flex: 1 }}>
            <input
              type="text"
              placeholder="E.g. A maroon wedding outfit under Rs. 12,000…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(input); }}
              style={{ fontSize: '0.92rem' }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            style={{ borderRadius: '100px', padding: '0 1.75rem', flexShrink: 0 }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}
