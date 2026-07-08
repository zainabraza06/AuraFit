'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { recommendationsApi, supportApi } from '@/lib/api';
import RecommendationResult from '@/components/RecommendationResult';

type Msg = {
  id: number;
  role: 'user' | 'ai';
  text?: string;
  data?: any;
  noResults?: boolean;
  isError?: boolean;
  userQuery?: string;
  advice?: { advice: string; searchPrompt: string };
};
type PanelState = 'closed' | 'open' | 'minimized';
type Mode = 'search' | 'stylist';

const OCCASION_CHIPS = [
  { label: 'Eid', prompt: 'A festive Eid outfit with accessories' },
  { label: 'Wedding', prompt: 'A bridal/guest wedding look' },
  { label: 'Mehndi', prompt: 'A colorful mehndi outfit' },
  { label: 'Party', prompt: 'A stylish party look for evening' },
  { label: 'Office', prompt: 'A smart office formal outfit' },
  { label: 'Casual', prompt: 'An everyday casual look' },
];

const STYLIST_WELCOME = "Tell me about yourself — body type, skin tone, height, whatever you'd like to share — and the occasion, and I'll suggest what to wear using global styling principles and Pakistani traditional standards. E.g. \"I'm petite with a wheatish skin tone, going to a friend's mehndi.\"";

let msgId = 0;

export default function ChatWidget() {
  const [panel, setPanel] = useState<PanelState>('closed');
  const [mode, setMode] = useState<Mode>('search');
  const [messages, setMessages] = useState<Msg[]>([{
    id: msgId++,
    role: 'ai',
    text: "Assalam o Alaikum! I'm your AI Stylist. Pick an occasion below or describe what you need — I'll curate a complete look. ✨"
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [escalating, setEscalating] = useState(false);
  const [escalatedIds, setEscalatedIds] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (panel === 'open') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, panel]);

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
      const results = res.data?.results;
      const hasResults = Array.isArray(results) && results.length > 0;

      if (hasResults) {
        const aiMsg: Msg = { id: msgId++, role: 'ai', data: res.data };
        setMessages(p => [...p, aiMsg]);
        if (panel !== 'open') {
          setUnread(u => u + 1);
          const topProduct = results[0]?.product;
          showToast(topProduct ? `Found: ${topProduct.name}` : 'Outfit ready for you!');
        }
      } else {
        const aiMsg: Msg = {
          id: msgId++, role: 'ai',
          text: "I couldn't find a perfect match right now. Try a different style or occasion, or I can connect you with our style expert.",
          noResults: true,
          userQuery: q,
        };
        setMessages(p => [...p, aiMsg]);
        if (panel !== 'open') setUnread(u => u + 1);
      }
    } catch {
      const aiMsg: Msg = {
        id: msgId++, role: 'ai',
        text: "Having trouble connecting to the styling engine. Please try again.",
        isError: true,
        userQuery: text.trim(),
      };
      setMessages(p => [...p, aiMsg]);
    } finally {
      setLoading(false);
    }
  };

  const sendStyleAdvice = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(p => [...p, { id: msgId++, role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await recommendationsApi.styleAdvice(q);
      setMessages(p => [...p, { id: msgId++, role: 'ai', text: res.data.advice, advice: res.data }]);
      if (panel !== 'open') { setUnread(u => u + 1); showToast('Styling advice ready!'); }
    } catch (e: any) {
      setMessages(p => [...p, {
        id: msgId++, role: 'ai',
        text: e?.response?.data?.error || 'Having trouble reaching the stylist right now. Please try again.',
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const searchThisLook = (searchPrompt: string) => {
    setMode('search');
    send(searchPrompt);
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setMessages(p => [...p, {
      id: msgId++, role: 'ai',
      text: m === 'stylist' ? STYLIST_WELCOME : 'Back to direct search — describe what you need and I\'ll curate a look.'
    }]);
  };

  const handleEscalate = async (msgId: number, userQuery: string) => {
    if (escalating || escalatedIds.has(msgId)) return;
    setEscalating(true);
    try {
      await supportApi.escalate(userQuery);
      setEscalatedIds(prev => new Set([...prev, msgId]));
      setMessages(p => [...p, {
        id: (window as any).__chatMsgId = ((window as any).__chatMsgId || 1000) + 1,
        role: 'ai',
        text: "Your request has been sent to our style expert. We'll get back to you soon with personalized recommendations!"
      }]);
    } catch {
      setMessages(p => [...p, {
        id: ((window as any).__chatMsgId || 1000) + 2,
        role: 'ai',
        text: "Couldn't submit the request. Please try again."
      }]);
    } finally {
      setEscalating(false);
    }
  };

  const open = () => { setPanel('open'); setUnread(0); if (toast) setToast(null); };
  const close = () => setPanel('closed');
  const minimize = () => setPanel('minimized');

  return (
    <>
      {/* Toast notification */}
      {toast && panel !== 'open' && (
        <div onClick={open} style={{
          position: 'fixed', bottom: 96, right: 24, zIndex: 1001,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)',
          borderRadius: 'var(--radius)', padding: '0.9rem 1.2rem',
          boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '0.75rem',
          cursor: 'pointer', maxWidth: 280,
          animation: 'slideUpFade 0.3s ease forwards',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0, color: 'var(--bg-primary)' }}>✨</div>
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '0.1rem' }}>AI Stylist</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{toast}</p>
          </div>
          <button onClick={e => { e.stopPropagation(); setToast(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', marginLeft: 'auto', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={panel === 'open' ? minimize : open}
        aria-label="Open AI Stylist Chat"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1002,
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--accent)', boxShadow: 'var(--shadow-gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s var(--ease), box-shadow 0.2s var(--ease)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-lg), var(--shadow-gold)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-gold)'; }}
      >
        {panel === 'open' ? (
          <svg width="20" height="20" fill="none" stroke="var(--bg-primary)" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" fill="none" stroke="var(--bg-primary)" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
        {unread > 0 && panel !== 'open' && (
          <div style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: 'var(--error)', border: '2px solid var(--bg-primary)', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{unread}</div>
        )}
      </button>

      {/* Side panel */}
      <div style={{
        position: 'fixed', right: 0, zIndex: 1000,
        top: panel === 'minimized' ? 'auto' : 0,
        bottom: panel === 'minimized' ? 96 : 0,
        width: panel === 'closed' ? 0 : 400,
        height: panel === 'minimized' ? 'auto' : '100dvh',
        overflow: 'hidden',
        transition: 'width 0.3s var(--ease)',
        pointerEvents: panel === 'closed' ? 'none' : 'all',
      }}>
        <div style={{
          width: 400, height: '100%',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        }}>
          {/* Header */}
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-mid)',
            display: 'flex', alignItems: 'center', gap: '0.85rem',
            background: 'var(--bg-primary)', flexShrink: 0,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0, color: 'var(--bg-primary)' }}>✨</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>AI Stylist</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>Gemini 2.5 Flash · RAG powered</p>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button onClick={minimize} title="Minimize" style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, color 0.15s', fontSize: '0.85rem' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
              >
                <svg width="10" height="2" fill="none" viewBox="0 0 10 2"><rect width="10" height="2" rx="1" fill="currentColor"/></svg>
              </button>
              <button onClick={close} title="Close" style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,114,114,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', padding: '0.6rem 1.25rem 0', gap: '0.4rem', background: 'var(--bg-primary)', flexShrink: 0 }}>
            {(['search', 'stylist'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                disabled={loading}
                style={{
                  flex: 1, padding: '0.4rem 0.5rem', borderRadius: '100px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600,
                  background: mode === m ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: mode === m ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                {m === 'search' ? '🔍 Direct Search' : '👤 Personal Stylist'}
              </button>
            ))}
          </div>

          {/* Occasion chips — direct-search mode only */}
          {mode === 'search' && (
          <div style={{
            padding: '0.65rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            flexShrink: 0,
            display: 'flex', gap: '0.4rem', flexWrap: 'wrap',
          }}>
            {OCCASION_CHIPS.map(chip => (
              <button
                key={chip.label}
                onClick={() => send(chip.prompt)}
                disabled={loading}
                style={{
                  background: 'rgba(201,169,110,0.08)',
                  border: '1px solid rgba(201,169,110,0.25)',
                  color: 'var(--accent)',
                  borderRadius: '100px',
                  padding: '0.25rem 0.7rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'background 0.15s, border-color 0.15s',
                  opacity: loading ? 0.5 : 1,
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,0.18)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,0.08)'; }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.25rem' }}>
                {msg.role === 'ai' && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '0.25rem' }}>AI Stylist</span>
                )}
                {msg.text && (
                  <div style={{
                    maxWidth: '88%',
                    padding: '0.75rem 1rem',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-card)',
                    color: msg.role === 'user' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    border: msg.role === 'ai' ? '1px solid var(--border)' : 'none',
                    fontSize: '0.85rem', lineHeight: 1.6,
                    fontWeight: msg.role === 'user' ? 500 : 400,
                    fontFamily: 'var(--font-body)',
                  }}>
                    {msg.text}
                    {/* Escalate button on no-results / error */}
                    {(msg.noResults || msg.isError) && !escalatedIds.has(msg.id) && (
                      <div style={{ marginTop: '0.65rem' }}>
                        <button
                          onClick={() => handleEscalate(msg.id, msg.userQuery || '')}
                          disabled={escalating}
                          style={{
                            background: 'rgba(201,169,110,0.1)',
                            border: '1px solid rgba(201,169,110,0.3)',
                            color: 'var(--accent)',
                            padding: '0.35rem 0.85rem',
                            borderRadius: '100px',
                            fontSize: '0.73rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontFamily: 'var(--font-body)',
                          }}
                        >
                          {escalating ? 'Sending…' : '👩‍💼 Notify Style Expert'}
                        </button>
                      </div>
                    )}
                    {escalatedIds.has(msg.id) && (
                      <p style={{ marginTop: '0.4rem', fontSize: '0.73rem', color: 'var(--success)' }}>✓ Expert notified</p>
                    )}
                    {msg.advice && (
                      <button
                        onClick={() => searchThisLook(msg.advice!.searchPrompt)}
                        disabled={loading}
                        style={{
                          marginTop: '0.65rem', display: 'block', width: '100%', textAlign: 'left',
                          background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)',
                          color: 'var(--accent)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
                          fontSize: '0.73rem', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600,
                          fontFamily: 'var(--font-body)', lineHeight: 1.4,
                        }}
                      >
                        🔍 Search: "{msg.advice.searchPrompt}"
                      </button>
                    )}
                  </div>
                )}
                {msg.data && !msg.noResults && !msg.isError && (
                  <div style={{ width: '100%', marginTop: '0.25rem' }}>
                    <RecommendationResult data={msg.data} compact />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ padding: '0.75rem 1rem', borderRadius: '2px 12px 12px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 0.2, 0.4].map((d, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: `chatDot 1.2s ${d}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '0.85rem', borderTop: '1px solid var(--border-mid)', background: 'var(--bg-primary)', flexShrink: 0 }}>
            <div
              style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.4rem 0.4rem 1rem', transition: 'border-color 0.2s ease' }}
              onFocusCapture={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
              onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') (mode === 'stylist' ? sendStyleAdvice(input) : send(input)); }}
                placeholder={mode === 'stylist' ? "E.g. I'm tall with a cool undertone, going to a wedding…" : 'E.g. Eid outfit in blush pink…'}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-body)' }}
              />
              <button
                onClick={() => (mode === 'stylist' ? sendStyleAdvice(input) : send(input))}
                disabled={!input.trim() || loading}
                style={{
                  width: 34, height: 34, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                  background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease', flexShrink: 0,
                }}
              >
                <svg width="14" height="14" fill="none" stroke={input.trim() && !loading ? 'var(--bg-primary)' : 'var(--text-muted)'} strokeWidth="2.5" viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p style={{ textAlign: 'center', fontSize: '0.63rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontFamily: 'var(--font-body)' }}>
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
