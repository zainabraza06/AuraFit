'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { recommendationsApi } from '@/lib/api';
import RecommendationResult from '@/components/RecommendationResult';

type Msg = { role: 'user' | 'ai'; text?: string; data?: any; id: number };
type PanelState = 'closed' | 'open' | 'minimized';

const QUICK_PROMPTS = [
  'Suggest a wedding outfit',
  'Casual Eid look under Rs. 8000',
  'Black formal heels to match',
];

let msgId = 0;

export default function ChatWidget() {
  const [panel, setPanel] = useState<PanelState>('closed');
  const [messages, setMessages] = useState<Msg[]>([{
    id: msgId++,
    role: 'ai',
    text: "Assalam o Alaikum! I'm your AI Stylist. Describe an occasion, color or budget and I'll curate a complete look. ✨"
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (panel === 'open') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, panel]);

  // Focus input when opened
  useEffect(() => {
    if (panel === 'open') {
      setTimeout(() => inputRef.current?.focus(), 150);
      setUnread(0);
    }
  }, [panel]);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput('');

    const userMsg: Msg = { id: msgId++, role: 'user', text: q };
    setMessages(p => [...p, userMsg]);
    setLoading(true);

    try {
      const res = await recommendationsApi.outfit(q);
      const { heroDress, otherDresses } = res.data || {};
      const aiMsg: Msg = { id: msgId++, role: 'ai', ...(heroDress || otherDresses?.length ? { data: res.data } : { text: "I couldn't find a perfect match right now. Try a different style or occasion!" }) };
      setMessages(p => [...p, aiMsg]);

      if (panel !== 'open') {
        setUnread(u => u + 1);
        const preview = heroDress ? `Found: ${heroDress.name}` : "Outfit ready for you!";
        showToast(preview);
      }
    } catch {
      const errMsg: Msg = { id: msgId++, role: 'ai', text: "Having trouble connecting to the styling engine. Please try again." };
      setMessages(p => [...p, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const open = () => { setPanel('open'); setUnread(0); if (toast) setToast(null); };
  const close = () => setPanel('closed');
  const minimize = () => setPanel('minimized');

  return (
    <>
      {/* ── Toast notification ─────────────────────────────────────── */}
      {toast && panel !== 'open' && (
        <div
          onClick={open}
          style={{
            position: 'fixed', bottom: 96, right: 24, zIndex: 1001,
            background: '#1e1e2e', border: '1px solid rgba(167,139,250,0.3)',
            borderRadius: 12, padding: '0.9rem 1.2rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            cursor: 'pointer', maxWidth: 280,
            animation: 'slideUpFade 0.3s ease forwards',
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#e879f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>✨</div>
          <div>
            <p style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 600, marginBottom: '0.1rem' }}>AI Stylist</p>
            <p style={{ fontSize: '0.82rem', color: '#d4d4e8', lineHeight: 1.3 }}>{toast}</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setToast(null); }} style={{ background: 'none', border: 'none', color: '#55557a', cursor: 'pointer', fontSize: '1rem', marginLeft: 'auto', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── Floating trigger button ──────────────────────────────────── */}
      <button
        onClick={panel === 'open' ? minimize : open}
        aria-label="Open AI Stylist Chat"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1002,
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#a78bfa,#e879f9)',
          boxShadow: '0 4px 20px rgba(167,139,250,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(167,139,250,0.6)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(167,139,250,0.45)'; }}
      >
        {panel === 'open' ? (
          <svg width="20" height="20" fill="none" stroke="#0a0a12" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" fill="none" stroke="#0a0a12" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
        {unread > 0 && panel !== 'open' && (
          <div style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#f87171', border: '2px solid #080810', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{unread}</div>
        )}
      </button>

      {/* ── Side panel ──────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', right: 0, zIndex: 1000,
        top: panel === 'minimized' ? 'auto' : 0,
        bottom: panel === 'minimized' ? 96 : 0,
        width: panel === 'closed' ? 0 : 400,
        height: panel === 'minimized' ? 'auto' : '100dvh',
        overflow: 'hidden',
        transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: panel === 'closed' ? 'none' : 'all',
      }}>
        <div style={{
          width: 400, height: '100%',
          display: 'flex', flexDirection: 'column',
          background: '#111118',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        }}>
          {/* Header */}
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: '0.85rem',
            background: '#0d0d14',
            flexShrink: 0,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#e879f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>✨</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f0f0ff', margin: 0, fontFamily: "'Inter', sans-serif" }}>AI Stylist</p>
              <p style={{ fontSize: '0.7rem', color: '#6b6b8a', margin: 0 }}>Gemini 2.5 Flash · RAG powered</p>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {/* Minimize */}
              <button onClick={minimize} title="Minimize" style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', color: '#9090b0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s', fontSize: '0.85rem' }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)')}
              >
                <svg width="10" height="2" fill="none" viewBox="0 0 10 2"><rect width="10" height="2" rx="1" fill="currentColor"/></svg>
              </button>
              {/* Close */}
              <button onClick={close} title="Close" style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', color: '#9090b0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.15)')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)')}
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
            {/* Quick prompts — only on first view */}
            {messages.length <= 1 && (
              <div style={{ marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#55557a', marginBottom: '0.6rem' }}>Quick Start</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => send(p)} style={{ textAlign: 'left', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: '#a78bfa', cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'Inter', sans-serif" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.12)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.06)'; }}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.25rem' }}>
                {msg.role === 'ai' && (
                  <span style={{ fontSize: '0.65rem', color: '#55557a', paddingLeft: '0.25rem' }}>AI Stylist</span>
                )}
                {msg.text && (
                  <div style={{
                    maxWidth: '88%',
                    padding: '0.75rem 1rem',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                    background: msg.role === 'user' ? 'linear-gradient(135deg,#a78bfa,#9168f0)' : '#1c1c28',
                    color: msg.role === 'user' ? '#080810' : '#d4d4e8',
                    border: msg.role === 'ai' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    fontSize: '0.85rem',
                    lineHeight: 1.6,
                    fontWeight: msg.role === 'user' ? 500 : 400,
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    {msg.text}
                  </div>
                )}
                {msg.data && (
                  <div style={{ width: '100%', marginTop: '0.25rem' }}>
                    <RecommendationResult data={msg.data} compact />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ padding: '0.75rem 1rem', borderRadius: '4px 16px 16px 16px', background: '#1c1c28', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 0.2, 0.4].map((d, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', animation: `chatDot 1.2s ${d}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0d0d14', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', background: '#1c1c28', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.5rem 0.5rem 0.5rem 1rem', transition: 'border-color 0.2s ease' }}
              onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(167,139,250,0.35)')}
              onBlurCapture={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send(input); }}
                placeholder="E.g. Eid outfit in blush pink…"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#f0f0ff', fontSize: '0.85rem', fontFamily: "'Inter', sans-serif" }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                style={{
                  width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: input.trim() && !loading ? 'linear-gradient(135deg,#a78bfa,#9168f0)' : 'rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease', flexShrink: 0,
                }}
              >
                <svg width="14" height="14" fill="none" stroke={input.trim() && !loading ? '#080810' : '#55557a'} strokeWidth="2.5" viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p style={{ textAlign: 'center', fontSize: '0.63rem', color: '#3a3a55', marginTop: '0.5rem', fontFamily: "'Inter', sans-serif" }}>
              Powered by Gemini 2.5 Flash
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatDot {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </>
  );
}
