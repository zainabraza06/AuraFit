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
    }, 50);
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
      const msg = err?.response?.data?.error || 'Unable to reach the AI stylist. Is the backend running?';
      setChatError(msg);
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
      {/* ── Hero ── */}
      <section style={{ position: 'relative', minHeight: '94vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div className="hero-gradient" />
        {/* Floating orbs */}
        <div className="hero-orb" style={{ top: '12%', right: '8%', width: 420, height: 420, background: 'radial-gradient(circle, rgba(167,139,250,0.14) 0%, transparent 70%)', animationDelay: '0s' }} />
        <div className="hero-orb" style={{ bottom: '8%', left: '3%', width: 320, height: 320, background: 'radial-gradient(circle, rgba(232,121,249,0.09) 0%, transparent 70%)', animationDelay: '3s' }} />
        <div className="hero-orb" style={{ top: '55%', right: '20%', width: 200, height: 200, background: 'radial-gradient(circle, rgba(251,191,36,0.07) 0%, transparent 70%)', animationDelay: '5s' }} />

        <div className="container" style={{ padding: '7rem clamp(1rem,4vw,3rem)', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 800 }}>
            <div className="fade-up">
              <span className="section-label">✦ AI Fashion Stylist for Pakistan</span>
            </div>

            <h1 className="display fade-up-d1" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
              Discover Your<br />
              <em className="gradient-text">Perfect Style</em>
            </h1>

            <p className="subtitle fade-up-d2" style={{ maxWidth: 540, marginBottom: '2.5rem' }}>
              AI-curated outfits from Pakistan's finest brands — Khaadi, Beechtree, Limelight, Alkaram and more.
            </p>

            {/* Style Me Input */}
            <div className="fade-up-d3" style={{ maxWidth: 660 }}>
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
                  style={{ flexShrink: 0, minWidth: 120 }}
                  onClick={() => handleChat(chatMessage)}
                  disabled={chatLoading || !chatMessage.trim()}
                >
                  {chatLoading
                    ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />Styling…</>
                    : '✦ Style Me'}
                </button>
              </div>

              {/* Error */}
              {chatError && (
                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius)', color: 'var(--error)', fontSize: '0.88rem' }}>
                  ⚠ {chatError}
                </div>
              )}

              {/* Quick prompts */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    className="chip"
                    onClick={() => { setChatMessage(p); handleChat(p); }}
                    disabled={chatLoading}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI Result ── */}
      {chatResult && (
        <section id="ai-result" className="fade-in" style={{ padding: '5rem 0', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div className="container">
            <div className="section-header">
              <span className="section-label">✦ AI Recommendation</span>
              <h2 className="title" style={{ marginTop: '0.75rem' }}>Your Curated Outfit</h2>
              {chatResult.intent?.intentSummary && (
                <p className="subtitle" style={{ marginTop: '0.5rem', maxWidth: 600, margin: '0.5rem auto 0' }}>
                  {chatResult.intent.intentSummary}
                </p>
              )}
              {chatResult.outfit?.reasoning && (
                <p style={{ marginTop: '0.75rem', color: 'var(--accent)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                  "{chatResult.outfit.reasoning}"
                </p>
              )}
            </div>

            {chatResult.outfit?.heroDress ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
                <ProductCard product={chatResult.outfit.heroDress} showBadge="Hero Look" />
                {chatResult.outfit.otherDresses?.slice(0, 3).map((p: any) => (
                  <ProductCard key={p._id} product={p} />
                ))}
                {chatResult.outfit.shoes?.slice(0, 4).map((p: any) => (
                  <ProductCard key={p._id || p.name} product={p} showBadge="Matching Shoe" />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <p style={{ marginBottom: '1rem' }}>No products found yet — run the scraper to populate the database.</p>
                <Link href="/admin" className="btn btn-primary">Go to Admin →</Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Featured Products ── */}
      <section style={{ padding: '6rem 0' }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">✦ Curated For You</span>
            <h2 className="title" style={{ marginTop: '0.75rem' }}>Featured Collections</h2>
          </div>

          {/* Occasion Filter */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {OCCASIONS.map((occ) => (
              <button
                key={occ}
                className={`chip ${activeOccasion === occ ? 'active' : ''}`}
                onClick={() => setActiveOccasion(occ)}
              >
                {occ}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
              <div className="spinner" style={{ width: 50, height: 50 }} />
            </div>
          ) : filteredFeatured.length > 0 ? (
            <div className="product-grid">
              {filteredFeatured.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👗</div>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No products yet</p>
              <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>Run the scraper to populate fashion products.</p>
              <Link href="/admin" className="btn btn-primary">Run Scraper →</Link>
            </div>
          )}

          {filteredFeatured.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link href="/discover" className="btn btn-secondary btn-lg">Browse All Collections →</Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Brand Strip ── */}
      <section style={{ padding: '3.5rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="container">
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '1.75rem' }}>
            Powered by real products from
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(1.5rem,4vw,3.5rem)', flexWrap: 'wrap', alignItems: 'center' }}>
            {['Khaadi', 'Beechtree', 'Limelight', 'Alkaram', 'Gul Ahmed', 'Stylo', 'Borjan', 'ECS'].map((brand) => (
              <Link
                key={brand}
                href={`/discover?brand=${brand}`}
                style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontFamily: 'var(--font-display)', fontSize: '1.15rem', transition: 'color 0.2s', fontWeight: 400 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {brand}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{ padding: '7rem 0' }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">✦ How It Works</span>
            <h2 className="title" style={{ marginTop: '0.75rem' }}>Intelligence Meets Fashion</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '2rem', marginTop: '3rem' }}>
            {[
              { icon: '🔍', title: 'Real Product Scraping', desc: 'Automated daily scraping from Beechtree, Khaadi, Limelight, Alkaram, Gul Ahmed, Stylo and more.' },
              { icon: '🤖', title: 'Gemini AI Styling', desc: 'Gemini parses your intent, color theory scores compatibility, and embeddings match styles semantically.' },
              { icon: '👗', title: 'Complete Outfits', desc: 'Get clothing + matching shoes + accessories — all sourced from real Pakistani brands.' },
              { icon: '♡', title: 'Save Favourites', desc: 'Bookmark looks you love and revisit your curated collection anytime.' },
            ].map((item, i) => (
              <div key={i} className="glass-card" style={{ padding: '2.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.75rem', marginBottom: '1.25rem' }}>{item.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', marginBottom: '0.75rem' }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.65 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '6rem 0', textAlign: 'center', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
        <div className="container">
          <h2 className="title" style={{ marginBottom: '1rem' }}>Ready to discover your <em className="gradient-text">style?</em></h2>
          <p className="subtitle" style={{ marginBottom: '2.5rem' }}>Browse thousands of real products from Pakistan's top fashion brands.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/discover" className="btn btn-primary btn-lg">Explore Collections</Link>
            <Link href="/search" className="btn btn-ghost btn-lg">Search Products</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
