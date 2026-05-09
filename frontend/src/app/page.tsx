'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { productsApi, recommendationsApi } from '@/lib/api';

const OCCASIONS = ['All', 'Casual', 'Wedding', 'Office', 'Eid', 'Party', 'Mehndi', 'Formal'];
const HERO_STYLE_PROMPTS = [
  'I need a pastel outfit for Eid',
  'Black formal dress for office parties',
  'Embroidered festive suit for wedding',
  'Western casual look under 5000'
];

export default function HomePage() {
  const [featured, setFeatured] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResult, setChatResult] = useState<any>(null);
  const [activeOccasion, setActiveOccasion] = useState('All');
  const [typedPrompt, setTypedPrompt] = useState('');
  const [promptIdx, setPromptIdx] = useState(0);

  // Fetch featured products
  useEffect(() => {
    productsApi.featured()
      .then((res) => setFeatured(res.data.featured || []))
      .catch(() => setFeatured([]))
      .finally(() => setLoading(false));
  }, []);

  // Typewriter effect for hero prompts
  useEffect(() => {
    const prompt = HERO_STYLE_PROMPTS[promptIdx];
    let i = 0;
    setTypedPrompt('');
    const interval = setInterval(() => {
      if (i < prompt.length) { setTypedPrompt(prompt.slice(0, i + 1)); i++; }
      else { clearInterval(interval); setTimeout(() => setPromptIdx((p) => (p + 1) % HERO_STYLE_PROMPTS.length), 2500); }
    }, 55);
    return () => clearInterval(interval);
  }, [promptIdx]);

  const handleChat = async (msg: string) => {
    if (!msg.trim()) return;
    setChatLoading(true);
    setChatResult(null);
    try {
      const res = await recommendationsApi.outfit(msg);
      setChatResult(res.data);
    } catch { /* silent */ }
    finally { setChatLoading(false); }
  };

  const filteredFeatured = activeOccasion === 'All'
    ? featured
    : featured.filter((p) => p.occasion?.some((o: string) => o.toLowerCase() === activeOccasion.toLowerCase()));

  return (
    <main className="page">
      {/* ── Hero Section ── */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div className="hero-gradient" />

        {/* Decorative orbs */}
        <div style={{ position: 'absolute', top: '15%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,132,252,0.12) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '5%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,191,36,0.08) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

        <div className="container" style={{ padding: '6rem clamp(1rem, 4vw, 3rem)', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 780 }}>
            {/* Label */}
            <div className="fade-up">
              <span className="section-label">✦ AI Fashion Stylist</span>
            </div>

            {/* Headline */}
            <h1 className="display fade-up-delay-1" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
              Discover Your<br />
              <em className="gradient-text">Perfect Style</em>
            </h1>

            <p className="subtitle fade-up-delay-2" style={{ maxWidth: 560, marginBottom: '2.5rem' }}>
              AI-curated outfits from Pakistan's finest brands — Khaadi, Beechtree, Limelight, Alkaram and more.
            </p>

            {/* Chat Input */}
            <div className="fade-up-delay-3" style={{ maxWidth: 640 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-xl)', padding: '0.75rem 0.75rem 0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: 'var(--shadow-accent)' }}>
                <input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChat(chatMessage)}
                  placeholder={typedPrompt + '|'}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '0.95rem' }}
                />
                <button
                  onClick={() => handleChat(chatMessage)}
                  disabled={chatLoading}
                  className="btn btn-primary"
                  style={{ flexShrink: 0 }}
                >
                  {chatLoading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : '✦ Style Me'}
                </button>
              </div>

              {/* Quick prompts */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                {HERO_STYLE_PROMPTS.map((p) => (
                  <button key={p} className="chip" onClick={() => { setChatMessage(p); handleChat(p); }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Chat Result ── */}
      {chatResult && (
        <section style={{ padding: '4rem 0', background: 'var(--bg-secondary)' }}>
          <div className="container">
            <div className="section-header">
              <span className="section-label">✦ AI Recommendation</span>
              <h2 className="title" style={{ marginTop: '0.75rem' }}>Your Curated Outfit</h2>
              {chatResult.intent?.intentSummary && (
                <p className="subtitle" style={{ marginTop: '0.5rem' }}>{chatResult.intent.intentSummary}</p>
              )}
            </div>

            {chatResult.outfit?.heroDress && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
                <ProductCard product={chatResult.outfit.heroDress} showBadge="Hero Look" />
                {chatResult.outfit.otherDresses?.slice(0, 3).map((p: any) => (
                  <ProductCard key={p._id} product={p} />
                ))}
                {chatResult.outfit.shoes?.slice(0, 4).map((p: any) => (
                  <ProductCard key={p._id} product={p} showBadge="Matching Shoe" />
                ))}
              </div>
            )}

            {!chatResult.outfit?.heroDress && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <p>No products found yet. Run the scraper to populate the database.</p>
                <Link href="/admin" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
                  Go to Admin →
                </Link>
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
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
              <div className="spinner" />
            </div>
          ) : filteredFeatured.length > 0 ? (
            <div className="product-grid">
              {filteredFeatured.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No products yet</p>
              <p style={{ marginBottom: '1.5rem' }}>Run the scraper to populate fashion products from Pakistani brands.</p>
              <Link href="/admin" className="btn btn-primary" style={{ display: 'inline-flex' }}>Run Scraper →</Link>
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
      <section style={{ padding: '4rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="container">
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '2rem' }}>
            Powered by real products from
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(1.5rem, 4vw, 3.5rem)', flexWrap: 'wrap', alignItems: 'center' }}>
            {['Khaadi', 'Beechtree', 'Limelight', 'Alkaram', 'Gul Ahmed', 'Stylo', 'Borjan', 'ECS'].map((brand) => (
              <Link
                key={brand}
                href={`/discover?brand=${brand}`}
                style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontFamily: 'var(--font-display)', fontSize: '1.1rem', transition: 'color 0.2s', fontWeight: 400 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {brand}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding: '7rem 0' }}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">✦ How It Works</span>
            <h2 className="title" style={{ marginTop: '0.75rem' }}>Intelligence Meets Fashion</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2rem', marginTop: '3rem' }}>
            {[
              { icon: '🔍', title: 'Real Product Scraping', desc: 'Weekly automated scraping from Beechtree, Khaadi, Limelight, Alkaram, Gul Ahmed, Stylo and more.' },
              { icon: '🤖', title: 'AI Recommendation', desc: 'Gemini AI parses your intent, color theory scores compatibility, and embeddings match styles semantically.' },
              { icon: '👗', title: 'Complete Outfits', desc: 'Get clothing + matching shoes + complementary accessories — all sourced from real Pakistani brands.' },
              { icon: '♡', title: 'Save Favorites', desc: 'Bookmark looks you love and revisit your curated collection anytime.' }
            ].map((item, i) => (
              <div key={i} className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{item.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', marginBottom: '0.75rem' }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{item.desc}</p>
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
