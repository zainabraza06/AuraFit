'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
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
      if (res.data?.outfit) {
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
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.75rem 2rem',
                marginBottom: '2.5rem',
                position: 'relative', overflow: 'hidden'
              }}>
                {/* glow */}
                <div style={{ position: 'absolute', top: -80, right: -80, width: 220, height: 220, background: 'radial-gradient(circle, rgba(201,169,110,0.08), transparent 70%)', pointerEvents: 'none' }} />

                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{
                    width: 42, height: 42, flexShrink: 0,
                    background: 'var(--accent)', borderRadius: '3px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', color: '#0c0b0a', fontWeight: 800
                  }}>✦</div>

                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.55rem' }}>Gemini AI Analysis</p>

                    {/* Summary quote */}
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontStyle: 'italic', color: 'var(--text-primary)', lineHeight: 1.65, marginBottom: chatResult.intent.aiAnalysis ? '0.9rem' : '1rem' }}>
                      "{chatResult.intent.intentSummary}"
                    </p>

                    {/* AI explanation paragraph */}
                    {chatResult.intent.aiAnalysis && (
                      <p style={{ fontSize: '0.85rem', lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
                        {chatResult.intent.aiAnalysis}
                      </p>
                    )}

                    {/* Intent tags */}
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      {chatResult.intent.color && chatResult.intent.color !== 'Any' && (
                        <span style={{ padding: '0.25rem 0.75rem', borderRadius: 2, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(201,169,110,0.12)', border: '1px solid var(--border-accent)', color: 'var(--accent)' }}>
                          ● {chatResult.intent.color}
                        </span>
                      )}
                      {chatResult.intent.occasion?.map((o: string) => (
                        <span key={o} style={{ padding: '0.25rem 0.75rem', borderRadius: 2, fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-secondary)' }}>{o}</span>
                      ))}
                      {chatResult.intent.style?.map((s: string) => (
                        <span key={s} style={{ padding: '0.25rem 0.75rem', borderRadius: 2, fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(212,149,106,0.08)', border: '1px solid rgba(212,149,106,0.25)', color: 'var(--accent-warm)' }}>{s}</span>
                      ))}
                      {chatResult.intent.maxBudget > 0 && (
                        <span style={{ padding: '0.25rem 0.75rem', borderRadius: 2, fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(114,168,132,0.08)', border: '1px solid rgba(114,168,132,0.25)', color: 'var(--success)' }}>
                          Under PKR {chatResult.intent.maxBudget.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {chatResult.outfit?.heroDress ? (
              <>
                {/* ── #1 Hero Best Pick ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <span style={{ background: 'var(--accent)', color: '#0c0b0a', padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✦ #1 Best Match</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 400 }}>AI's Top Pick</h3>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-mid), transparent)' }} />
                </div>

                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-accent)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  display: 'grid',
                  gridTemplateColumns: 'clamp(240px,32%,360px) 1fr',
                  boxShadow: 'var(--shadow-lg), var(--shadow-gold)',
                  marginBottom: '3.5rem'
                }}>
                  {/* Hero image */}
                  <div style={{
                    backgroundImage: `url(${chatResult.outfit.heroDress.imageUrl || chatResult.outfit.heroDress.images?.[0] || '/placeholder.jpg'})`,
                    backgroundSize: 'cover', backgroundPosition: 'top center',
                    minHeight: 420, position: 'relative'
                  }}>
                    <div style={{ position: 'absolute', top: 12, left: 12, background: 'var(--accent)', color: '#0c0b0a', padding: '0.22rem 0.65rem', borderRadius: 2, fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      ✦ AI Pick
                    </div>
                  </div>

                  {/* Hero details */}
                  <div style={{ padding: '2rem 2.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem', justifyContent: 'center' }}>
                    <div>
                      <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.4rem' }}>
                        {chatResult.outfit.heroDress.brand}
                      </p>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.25rem,2.5vw,1.8rem)', lineHeight: 1.22 }}>
                        {chatResult.outfit.heroDress.name}
                      </h3>
                    </div>

                    {/* Metadata tags */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {chatResult.outfit.heroDress.primaryColor && <span className="tag">{chatResult.outfit.heroDress.primaryColor}</span>}
                      {chatResult.outfit.heroDress.subCategory && <span className="tag">{chatResult.outfit.heroDress.subCategory}</span>}
                      {chatResult.outfit.heroDress.occasion?.slice(0, 2).map((o: string) => (
                        <span key={o} className="tag" style={{ textTransform: 'capitalize' }}>{o}</span>
                      ))}
                    </div>

                    {/* Score breakdown */}
                    {chatResult.outfit.scores?.[0] && (
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem' }}>
                        <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.9rem' }}>Match Breakdown</p>
                        {[
                          { label: 'Color Match', val: chatResult.outfit.scores[0].colorMatch },
                          { label: 'Occasion Fit', val: chatResult.outfit.scores[0].occasionMatch },
                          { label: 'Style Alignment', val: chatResult.outfit.scores[0].styleMatch },
                          { label: 'Keyword Relevance', val: chatResult.outfit.scores[0].keywordMatch },
                        ].map(({ label, val }) => {
                          const pct = Math.round((val || 0) * 100);
                          const clr = pct >= 75 ? 'var(--success)' : pct >= 45 ? 'var(--accent)' : 'var(--accent-rose)';
                          return (
                            <div key={label} style={{ marginBottom: '0.65rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: clr }}>{pct}%</span>
                              </div>
                              <div className="score-bar">
                                <div className="score-bar__fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Price + CTA */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.55rem', fontWeight: 700, color: 'var(--accent-light)', letterSpacing: '0.02em' }}>
                        PKR {chatResult.outfit.heroDress.price?.toLocaleString()}
                      </span>
                      <a href={chatResult.outfit.heroDress.productUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                        Shop This Look →
                      </a>
                    </div>
                  </div>
                </div>

                {/* ── Top N More Matches ── */}
                {chatResult.outfit.otherDresses?.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 400, whiteSpace: 'nowrap' }}>
                        Top {chatResult.outfit.otherDresses.length + 1} Results
                      </h3>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-mid), transparent)' }} />
                    </div>
                    <div className="product-grid" style={{ marginBottom: '3.5rem' }}>
                      {chatResult.outfit.otherDresses.map((p: any, i: number) => (
                        <div key={p._id} style={{ position: 'relative' }}>
                          <div style={{
                            position: 'absolute', top: 10, left: 10, zIndex: 10,
                            background: 'rgba(12,11,10,0.88)', border: '1px solid var(--border-mid)',
                            borderRadius: 2, padding: '0.12rem 0.52rem',
                            fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em'
                          }}>#{i + 2}</div>
                          <ProductCard product={p} />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ── Matching Shoes ── */}
                {chatResult.outfit.shoes?.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 400, whiteSpace: 'nowrap' }}>Matching Shoes</h3>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-mid), transparent)' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: '1rem' }}>
                      {chatResult.outfit.shoes.map((s: any) => (
                        <ProductCard key={s._id} product={s} showBadge="Best Pair" />
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
