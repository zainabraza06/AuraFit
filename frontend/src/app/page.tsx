'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import TryOnButton from '@/components/TryOnButton';
import { productsApi, recommendationsApi } from '@/lib/api';

const OCCASIONS = ['All', 'Casual', 'Wedding', 'Office', 'Eid', 'Party', 'Mehndi', 'Formal'];
const PROMPTS = [
  'Pastel outfit for Eid celebrations',
  'Black formal dress for office parties',
  'Embroidered festive suit for weddings',
  'Western casual look under PKR 5000',
];
const BRANDS = ['Khaadi', 'Beechtree', 'Limelight', 'Alkaram', 'Gul Ahmed', 'Stylo', 'Borjan', 'ECS'];
const HOW = [
  { num: '01', title: 'Real Product Scraping', desc: 'Daily automated scraping from Beechtree, Khaadi, Limelight, Alkaram, Gul Ahmed and more.' },
  { num: '02', title: 'Gemini AI Styling', desc: 'Gemini parses your intent, color theory scores compatibility, and embeddings match styles semantically.' },
  { num: '03', title: 'Complete Outfits', desc: 'Clothing + matching shoes sourced from real Pakistani brands — curated in seconds.' },
  { num: '04', title: 'Save Favourites', desc: 'Bookmark looks you love and build your personal style archive.' },
];

export default function HomePage() {
  const [featured, setFeatured] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResult, setChatResult] = useState<any>(null);
  const [chatError, setChatError] = useState('');
  const [activeOccasion, setActiveOccasion] = useState('All');
  const [typedPrompt, setTypedPrompt] = useState('');
  const [promptIdx, setPromptIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    productsApi.featured()
      .then((res) => setFeatured(res.data.featured || []))
      .catch(() => setFeatured([]))
      .finally(() => setLoading(false));
  }, []);

  // Typewriter effect
  useEffect(() => {
    const prompt = PROMPTS[promptIdx];
    let i = 0;
    setTypedPrompt('');
    const iv = setInterval(() => {
      if (i < prompt.length) { setTypedPrompt(prompt.slice(0, ++i)); }
      else { clearInterval(iv); setTimeout(() => setPromptIdx((p) => (p + 1) % PROMPTS.length), 2800); }
    }, 48);
    return () => clearInterval(iv);
  }, [promptIdx]);

  const handleChat = async (msg: string) => {
    const text = msg.trim();
    if (!text || chatLoading) return;
    setChatLoading(true);
    setChatResult(null);
    setChatError('');
    try {
      const res = await recommendationsApi.outfit(text);
      if (res.data?.results?.length) {
        setChatResult(res.data);
        setTimeout(() => document.getElementById('ai-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } else {
        setChatError('No matching outfits found. Try a different prompt!');
      }
    } catch (err: any) {
      setChatError(err?.response?.data?.error || 'Unable to reach the AI stylist. Is the backend running?');
    } finally {
      setChatLoading(false);
    }
  };

  const filteredFeatured = (activeOccasion === 'All'
    ? featured
    : featured.filter((p) => p.occasion?.some((o: string) => o.toLowerCase() === activeOccasion.toLowerCase()))
  ).slice(0, 8);

  return (
    <main className="page">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', minHeight: '96vh', display: 'flex', alignItems: 'center', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
        <div className="hero-gradient" />
        {/* Soft ambient orbs */}
        <div className="hero-orb" style={{ top: '10%', right: '6%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(201,169,110,0.09) 0%, transparent 70%)', animationDelay: '0s' }} />
        <div className="hero-orb" style={{ bottom: '5%', left: '2%', width: 340, height: 340, background: 'radial-gradient(circle, rgba(212,149,106,0.06) 0%, transparent 70%)', animationDelay: '3s' }} />

        <div className="container" style={{ padding: '8rem clamp(1rem,4vw,3rem)', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 820 }}>

            <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ height: 1, width: 40, background: 'var(--accent)' }} />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                AI Fashion Stylist for Pakistan
              </span>
            </div>

            <h1 className="display fade-up-d1" style={{ marginBottom: '1.75rem' }}>
              Discover Your<br />
              <em style={{ fontStyle: 'italic', fontWeight: 300, color: 'var(--accent-light)' }}>Perfect Style</em>
            </h1>

            <p className="subtitle fade-up-d2" style={{ maxWidth: 500, marginBottom: '3rem', lineHeight: 1.75 }}>
              AI-curated outfits from Pakistan's finest brands — Khaadi, Beechtree, Limelight, Alkaram and more.
            </p>

            {/* Style Me Input */}
            <div className="fade-up-d3" style={{ maxWidth: 640 }}>
              <div className="style-input-wrap">
                <input
                  ref={inputRef}
                  id="style-me-input"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChat(chatMessage); }}
                  placeholder={typedPrompt ? typedPrompt + '|' : 'Describe your perfect outfit…'}
                  disabled={chatLoading}
                  autoComplete="off"
                />
                <button
                  id="style-me-btn"
                  className="btn btn-primary"
                  style={{ flexShrink: 0 }}
                  onClick={() => handleChat(chatMessage)}
                  disabled={chatLoading || !chatMessage.trim()}
                >
                  {chatLoading
                    ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Styling…</>
                    : 'Style Me'}
                </button>
              </div>

              {chatError && (
                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(196,114,114,0.08)', border: '1px solid rgba(196,114,114,0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--error)', fontSize: '0.83rem' }}>
                  {chatError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                {PROMPTS.map((p) => (
                  <button key={p} className="chip" onClick={() => { setChatMessage(p); handleChat(p); }} disabled={chatLoading}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI Result ────────────────────────────────────────────────────── */}
      {chatResult && (
        <section id="ai-result" className="fade-in" style={{ padding: '5rem 0', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <div className="container">

            {/* Section header */}
            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ height: 1, width: 32, background: 'var(--accent)' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>AI Recommendation</span>
              </div>
              <h2 className="title">Your Curated Outfit</h2>
            </div>

            {/* ── AI Analysis Card ── */}
            {chatResult.intent && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-lg)', padding: '1.75rem 2rem', marginBottom: '2rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -80, right: -80, width: 220, height: 220, background: 'radial-gradient(circle, rgba(201,169,110,0.08), transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: 42, height: 42, flexShrink: 0, background: 'var(--accent)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#0c0b0a', fontWeight: 800 }}>✦</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.55rem' }}>Gemini AI Analysis</p>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontStyle: 'italic', color: 'var(--text-primary)', lineHeight: 1.65, marginBottom: '0.75rem' }}>
                      "{chatResult.intent.intentSummary}"
                    </p>
                    {chatResult.intent.aiAnalysis && (
                      <p style={{ fontSize: '0.85rem', lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: '1rem' }}>{chatResult.intent.aiAnalysis}</p>
                    )}
                    {/* Intent chips */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {chatResult.intent.colorExact && (
                        <span style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 700, background: 'rgba(201,169,110,0.12)', border: '1px solid var(--border-accent)', color: 'var(--accent)', textTransform: 'capitalize' }}>
                          ● {chatResult.intent.colorExact}{chatResult.intent.colorFamily && chatResult.intent.colorFamily !== 'Any' ? ` (${chatResult.intent.colorFamily})` : ''}
                        </span>
                      )}
                      {chatResult.intent.dressStyle && <span style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 500, background: 'rgba(139,106,212,0.09)', border: '1px solid rgba(139,106,212,0.25)', color: '#a07ad4', textTransform: 'capitalize' }}>{chatResult.intent.dressStyle}</span>}
                      {chatResult.intent.print && <span style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 500, background: 'rgba(212,149,106,0.09)', border: '1px solid rgba(212,149,106,0.25)', color: 'var(--accent-warm)', textTransform: 'capitalize' }}>{chatResult.intent.print}</span>}
                      {chatResult.intent.stitching && <span style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 500, background: 'rgba(114,168,132,0.09)', border: '1px solid rgba(114,168,132,0.25)', color: 'var(--success)', textTransform: 'capitalize' }}>{chatResult.intent.stitching}</span>}
                      {chatResult.intent.pieces && <span style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 500, background: 'rgba(106,173,160,0.09)', border: '1px solid rgba(106,173,160,0.25)', color: 'var(--accent-teal)' }}>{chatResult.intent.pieces}-piece</span>}
                      {chatResult.intent.occasion?.map((o: string) => (
                        <span key={o} style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 500, background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{o}</span>
                      ))}
                      {chatResult.intent.fabric && <span style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 500, background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{chatResult.intent.fabric}</span>}
                      {chatResult.intent.maxBudget > 0 && (
                        <span style={{ padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.67rem', fontWeight: 500, background: 'rgba(114,168,132,0.08)', border: '1px solid rgba(114,168,132,0.25)', color: 'var(--success)' }}>
                          Under PKR {chatResult.intent.maxBudget.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}


            {chatResult.results?.length > 0 ? (
              <>
                {/* ── Catalog note (LLM-generated mismatch banner) ── */}
                {chatResult.catalogNote && (
                  <div style={{ display: 'flex', gap: '0.65rem', padding: '0.8rem 1.1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.22)', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '2rem' }}>
                    <span style={{ flexShrink: 0, color: 'var(--accent)', fontWeight: 700, marginTop: '0.05rem' }}>✦</span>
                    <span>{chatResult.catalogNote}</span>
                  </div>
                )}

                {/* ── #1 Hero Best Pick ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <span style={{ background: 'var(--accent)', color: '#0c0b0a', padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✦ #1 Best Match</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400 }}>AI's Top Pick</h3>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-mid), transparent)' }} />
                </div>

                {/* Hero card */}
                <div className="featured-pick" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg), var(--shadow-gold)', marginBottom: '2.5rem' }}>
                  <div className="featured-pick__media" style={{ backgroundImage: `url(${chatResult.results[0].product.imageUrl || chatResult.results[0].product.images?.[0] || '/placeholder.jpg'})`, backgroundSize: 'cover', backgroundPosition: 'top center', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 12, left: 12, background: 'var(--accent)', color: '#0c0b0a', padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase' }}>✦ AI Pick</div>
                  </div>
                  <div className="featured-pick__content">
                    <div>
                      <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.35rem' }}>{chatResult.results[0].product.brand}</p>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.2rem,2.3vw,1.7rem)', lineHeight: 1.22 }}>{chatResult.results[0].product.name}</h3>
                    </div>
                    {/* Product chips */}
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {(chatResult.results[0].product.primaryExactColor || chatResult.results[0].product.primaryColor) && <span className="tag" style={{ textTransform: 'capitalize' }}>● {chatResult.results[0].product.primaryExactColor || chatResult.results[0].product.primaryColor}</span>}
                      {chatResult.results[0].product.dressStyle && <span className="tag" style={{ textTransform: 'capitalize', color: '#a07ad4', borderColor: 'rgba(139,106,212,0.25)', background: 'rgba(139,106,212,0.07)' }}>{chatResult.results[0].product.dressStyle}</span>}
                      {chatResult.results[0].product.print && <span className="tag" style={{ textTransform: 'capitalize', color: 'var(--accent-warm)', borderColor: 'rgba(212,149,106,0.25)', background: 'rgba(212,149,106,0.07)' }}>{chatResult.results[0].product.print}</span>}
                      {chatResult.results[0].product.stitching && <span className="tag" style={{ textTransform: 'capitalize', color: 'var(--success)', borderColor: 'rgba(114,168,132,0.25)', background: 'rgba(114,168,132,0.07)' }}>{chatResult.results[0].product.stitching}</span>}
                      {chatResult.results[0].product.pieces && <span className="tag" style={{ color: 'var(--accent-teal)', borderColor: 'rgba(106,173,160,0.25)', background: 'rgba(106,173,160,0.07)' }}>{chatResult.results[0].product.pieces}-piece</span>}
                      {chatResult.results[0].product.occasion?.slice(0, 2).map((o: string) => <span key={o} className="tag" style={{ textTransform: 'capitalize' }}>{o}</span>)}
                      {chatResult.results[0].product.fabric && <span className="tag" style={{ textTransform: 'capitalize' }}>{chatResult.results[0].product.fabric}</span>}
                    </div>
                    {/* AI match reason */}
                    {chatResult.results[0].matchReason && (
                      <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-sm)' }}>
                        <p style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.4rem' }}>Why AI chose this</p>
                        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic', margin: 0 }}>"{chatResult.results[0].matchReason}"</p>
                        {chatResult.relaxationMessage && (
                          <p style={{ marginTop: '0.55rem', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            ℹ {chatResult.relaxationMessage}
                          </p>
                        )}
                      </div>
                    )}
                    {/* Price + CTA */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-light)' }}>PKR {chatResult.results[0].product.price?.toLocaleString()}</span>
                      <a href={chatResult.results[0].product.productUrl} target="_blank" rel="noreferrer" className="btn btn-primary">Shop This Look →</a>
                      <TryOnButton
                        productImage={chatResult.results[0].product.imageUrl || chatResult.results[0].product.images?.[0]}
                        productName={chatResult.results[0].product.name}
                        variant="full"
                      />
                    </div>
                    {/* Paired shoe */}
                    {chatResult.results[0].shoe && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.65rem' }}>Paired Shoe</p>
                        <a href={chatResult.results[0].shoe.product.productUrl || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                          <img src={chatResult.results[0].shoe.product.imageUrl || chatResult.results[0].shoe.product.images?.[0] || '/placeholder.jpg'} alt={chatResult.results[0].shoe.product.name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-accent)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }} />
                          <div>
                            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{chatResult.results[0].shoe.product.name}</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--accent-light)', marginBottom: '0.2rem' }}>PKR {chatResult.results[0].shoe.product.price?.toLocaleString()}</p>
                            {chatResult.results[0].shoe.reason && <p style={{ fontSize: '0.7rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.4 }}>{chatResult.results[0].shoe.reason}</p>}
                          </div>
                        </a>
                      </div>
                    )}
                    {/* Paired jewellery */}
                    {chatResult.results[0].jewelry?.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.65rem' }}>✦ Jewellery to Pair</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {chatResult.results[0].jewelry.slice(0, 3).map((j: any) => (
                            <a key={j.product._id} href={j.product.productUrl || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                              <img src={j.product.imageUrl || j.product.images?.[0] || '/placeholder.jpg'} alt={j.product.name} style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-accent)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }} />
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{j.product.name}</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--accent-light)', marginBottom: '0.2rem' }}>PKR {j.product.price?.toLocaleString()}</p>
                                {j.reason && <p style={{ fontSize: '0.7rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.4 }}>{j.reason}</p>}
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Results #2–10 ── */}
                {chatResult.results.length > 1 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, whiteSpace: 'nowrap' }}>
                        More Matches ({chatResult.results.length - 1})
                      </h3>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-mid), transparent)' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                      {chatResult.results.slice(1).map((r: any) => (
                        <div key={r.product._id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'border-color 0.2s, transform 0.2s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = ''; }}>
                          {/* Image with rank badge */}
                          <div style={{ position: 'relative', aspectRatio: '3/4', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                            <img src={r.product.imageUrl || r.product.images?.[0] || '/placeholder.jpg'} alt={r.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }} />
                            <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(12,11,10,0.85)', border: '1px solid var(--border-mid)', borderRadius: 2, padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>#{r.rank}</div>
                          </div>
                          {/* Details */}
                          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
                            <div>
                              <p style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', fontWeight: 700 }}>{r.product.brand}</p>
                              <p style={{ fontSize: '0.9rem', fontWeight: 500, lineHeight: 1.3, color: 'var(--text-primary)', marginTop: '0.2rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{r.product.name}</p>
                            </div>
                            {/* Category chips */}
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              {(r.product.primaryExactColor || r.product.primaryColor) && <span style={{ padding: '0.15rem 0.5rem', borderRadius: 2, fontSize: '0.62rem', fontWeight: 600, background: 'rgba(201,169,110,0.09)', border: '1px solid var(--border-accent)', color: 'var(--accent)', textTransform: 'capitalize' }}>● {r.product.primaryExactColor || r.product.primaryColor}</span>}
                              {r.product.dressStyle && <span style={{ padding: '0.15rem 0.5rem', borderRadius: 2, fontSize: '0.62rem', background: 'rgba(139,106,212,0.08)', border: '1px solid rgba(139,106,212,0.2)', color: '#a07ad4', textTransform: 'capitalize' }}>{r.product.dressStyle}</span>}
                              {r.product.print && <span style={{ padding: '0.15rem 0.5rem', borderRadius: 2, fontSize: '0.62rem', background: 'rgba(212,149,106,0.08)', border: '1px solid rgba(212,149,106,0.2)', color: 'var(--accent-warm)', textTransform: 'capitalize' }}>{r.product.print}</span>}
                              {r.product.stitching && <span style={{ padding: '0.15rem 0.5rem', borderRadius: 2, fontSize: '0.62rem', background: 'rgba(114,168,132,0.08)', border: '1px solid rgba(114,168,132,0.2)', color: 'var(--success)', textTransform: 'capitalize' }}>{r.product.stitching}</span>}
                              {r.product.pieces && <span style={{ padding: '0.15rem 0.5rem', borderRadius: 2, fontSize: '0.62rem', background: 'rgba(106,173,160,0.08)', border: '1px solid rgba(106,173,160,0.2)', color: 'var(--accent-teal)' }}>{r.product.pieces}-piece</span>}
                              {r.product.occasion?.slice(0, 1).map((o: string) => <span key={o} style={{ padding: '0.15rem 0.5rem', borderRadius: 2, fontSize: '0.62rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{o}</span>)}
                            </div>
                            {/* Match reason */}
                            {r.matchReason && (
                              <div>
                                <p style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.2rem' }}>Why AI chose this</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{r.matchReason}</p>
                              </div>
                            )}
                            <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-light)' }}>PKR {r.product.price?.toLocaleString()}</p>
                            {/* Paired shoe */}
                            {r.shoe && (
                              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.65rem' }}>
                                <p style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.45rem' }}>Paired Shoe</p>
                                <a href={r.shoe.product.productUrl || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
                                  <img src={r.shoe.product.imageUrl || r.shoe.product.images?.[0] || '/placeholder.jpg'} alt={r.shoe.product.name} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }} />
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: '0.73rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.shoe.product.name}</p>
                                    {r.shoe.reason && <p style={{ fontSize: '0.67rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.shoe.reason}</p>}
                                  </div>
                                </a>
                              </div>
                            )}
                            {/* Paired jewellery */}
                            {r.jewelry?.length > 0 && (
                              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.65rem' }}>
                                <p style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.45rem' }}>✦ Jewellery</p>
                                {r.jewelry.slice(0, 2).map((j: any) => (
                                  <a key={j.product._id} href={j.product.productUrl || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', gap: '0.55rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <img src={j.product.imageUrl || j.product.images?.[0] || '/placeholder.jpg'} alt={j.product.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }} />
                                    <div style={{ minWidth: 0 }}>
                                      <p style={{ fontSize: '0.73rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.product.name}</p>
                                      {j.reason && <p style={{ fontSize: '0.67rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.reason}</p>}
                                    </div>
                                  </a>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 'auto' }}>
                              <a href={r.product.productUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textAlign: 'center', flex: 1 }}>Shop →</a>
                              <TryOnButton productImage={r.product.imageUrl || r.product.images?.[0]} productName={r.product.name} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <p style={{ marginBottom: '1rem' }}>No products found yet — run the scraper to populate the database.</p>
                <Link href="/admin" className="btn btn-primary">Go to Admin →</Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Featured Products ─────────────────────────────────────────────── */}
      <section style={{ padding: '7rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ height: 1, width: 32, background: 'var(--accent)' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>Curated For You</span>
              </div>
              <h2 className="title">Featured Collections</h2>
            </div>
            <Link href="/discover" className="btn btn-ghost btn-sm">Browse All →</Link>
          </div>

          {/* Occasion Filter */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '3rem', flexWrap: 'wrap' }}>
            {OCCASIONS.map((occ) => (
              <button key={occ} className={`chip ${activeOccasion === occ ? 'active' : ''}`} onClick={() => setActiveOccasion(occ)}>{occ}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
              <div className="spinner" style={{ width: 48, height: 48 }} />
            </div>
          ) : filteredFeatured.length > 0 ? (
            <div className="product-grid">
              {filteredFeatured.map((product) => <ProductCard key={product._id} product={product} />)}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '0.5rem' }}>No products yet</p>
              <p style={{ marginBottom: '1.75rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Run the scraper from the Admin Dashboard to populate fashion products.</p>
              <Link href="/admin" className="btn btn-primary">Go to Admin →</Link>
            </div>
          )}

          {filteredFeatured.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: '3.5rem' }}>
              <Link href="/discover" className="btn btn-secondary btn-lg">View All Collections</Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Brand Strip ──────────────────────────────────────────────────── */}
      <section style={{ padding: '4rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="container">
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: '2rem' }}>
            Powered by real products from
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(1.5rem,4vw,3.5rem)', flexWrap: 'wrap', alignItems: 'center' }}>
            {BRANDS.map((brand) => (
              <Link key={brand} href={`/discover?brand=${brand}`}
                style={{ color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-display)', fontSize: '1.1rem', transition: 'color 0.22s', fontWeight: 400, letterSpacing: '0.04em' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                {brand}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section style={{ padding: '8rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ height: 1, width: 32, background: 'var(--accent)' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>How It Works</span>
          </div>
          <h2 className="title" style={{ marginBottom: '4rem', maxWidth: 500 }}>Intelligence Meets Fashion</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '0' }}>
            {HOW.map((item, i) => (
              <div key={i} style={{ padding: '2.5rem 2rem', borderLeft: i === 0 ? '1px solid var(--border)' : 'none', borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', transition: 'background 0.25s ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--border-mid)', fontWeight: 300, lineHeight: 1, marginBottom: '1.5rem' }}>{item.num}</p>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '0.75rem', fontWeight: 500 }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section style={{ padding: '7rem 0', textAlign: 'center', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ height: 1, flex: 1, maxWidth: 60, background: 'var(--border-mid)' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>Begin</span>
            <div style={{ height: 1, flex: 1, maxWidth: 60, background: 'var(--border-mid)' }} />
          </div>
          <h2 className="title" style={{ marginBottom: '1rem' }}>
            Ready to discover your <em style={{ fontStyle: 'italic', color: 'var(--accent-light)', fontWeight: 300 }}>style?</em>
          </h2>
          <p className="subtitle" style={{ marginBottom: '2.75rem', maxWidth: 480, margin: '0.75rem auto 2.75rem' }}>
            Browse thousands of real products from Pakistan's top fashion brands.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/discover" className="btn btn-primary btn-lg">Explore Collections</Link>
            <Link href="/search" className="btn btn-ghost btn-lg">Search Products</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
