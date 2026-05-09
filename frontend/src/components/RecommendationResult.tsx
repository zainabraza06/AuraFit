'use client';

export default function RecommendationResult({ data }: { data: any }) {
  if (!data || !data.intent) return null;

  const { intent, outfit } = data;
  const heroDress = outfit?.heroDress;
  const shoes     = outfit?.shoes     || [];
  const otherDresses = outfit?.otherDresses || [];

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ── Stylist's Vision banner ── */}
      <div className="glass-panel" style={{ padding: '1.5rem 2rem', borderLeft: '3px solid var(--accent)' }}>
        <h3 style={{ color: 'var(--accent)', marginBottom: '0.5rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
          Stylist's Vision
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.05rem', fontFamily: 'var(--font-display)', lineHeight: 1.5 }}>
          "{outfit?.reasoning || intent.intentSummary}"
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {intent.color && intent.color !== 'Any' && (
            <span className="tag" style={{ color: 'var(--text-primary)' }}>🎨 {intent.color}</span>
          )}
          {intent.occasion?.map((o: string) => (
            <span key={o} className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--border-accent)', background: 'rgba(167,139,250,0.08)' }}>
              #{o}
            </span>
          ))}
          {intent.maxBudget > 0 && (
            <span className="tag" style={{ color: 'var(--success)', borderColor: 'rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.08)' }}>
              Under PKR {intent.maxBudget.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {heroDress ? (
        <>
          {/* ── Hero Dress ── */}
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', marginBottom: '1.25rem' }}>
              Your Perfect <em className="gradient-text">Match</em>
            </h2>
            <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden', borderColor: 'var(--border-accent)' }}>
              <div style={{ aspectRatio: '3/4', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                <img
                  src={heroDress.imageUrl || heroDress.images?.[0] || '/placeholder.jpg'}
                  alt={heroDress.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                />
              </div>
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <p className="product-card__brand" style={{ fontSize: '0.72rem', marginBottom: '0.5rem' }}>{heroDress.brand}</p>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', lineHeight: 1.25, marginBottom: '0.75rem' }}>{heroDress.name}</h3>
                  <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '1rem' }}>
                    PKR {heroDress.price?.toLocaleString()}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                    {heroDress.primaryColor && <span className="tag">{heroDress.primaryColor}</span>}
                    {heroDress.subCategory  && <span className="tag">{heroDress.subCategory}</span>}
                    {heroDress.occasion?.slice(0, 2).map((o: string) => <span key={o} className="tag">{o}</span>)}
                  </div>
                </div>
                {heroDress.productUrl && (
                  <a
                    href={heroDress.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Shop on {heroDress.brand} →
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ── Other Dresses ── */}
          {otherDresses.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '1.25rem' }}>
                Similar <em className="gradient-text">Styles</em>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.25rem' }}>
                {otherDresses.slice(0, 4).map((p: any, i: number) => (
                  <div key={p._id || i} className="glass-card" style={{ overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '3/4', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                      <img
                        src={p.imageUrl || p.images?.[0] || '/placeholder.jpg'}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                      />
                    </div>
                    <div style={{ padding: '0.9rem 1rem' }}>
                      <p className="product-card__brand">{p.brand}</p>
                      <p className="product-card__name" style={{ fontSize: '0.95rem' }}>{p.name}</p>
                      <p className="product-card__price" style={{ fontSize: '0.9rem' }}>PKR {p.price?.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Matching Shoes ── */}
          {shoes.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                Matching <em className="gradient-text">Shoes</em>
                <span className="tag" style={{ fontSize: '0.65rem', color: 'var(--accent-teal)', borderColor: 'rgba(45,212,191,0.25)', background: 'rgba(45,212,191,0.08)' }}>
                  AI Matched
                </span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem' }}>
                {shoes.slice(0, 4).map((shoe: any, i: number) => (
                  <div key={shoe._id || i} className="glass-card" style={{ overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '1/1', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                      <img
                        src={shoe.imageUrl || shoe.images?.[0] || '/placeholder.jpg'}
                        alt={shoe.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                      />
                    </div>
                    <div style={{ padding: '0.9rem 1rem' }}>
                      <p className="product-card__brand">{shoe.brand}</p>
                      <p className="product-card__name" style={{ fontSize: '0.88rem' }}>{shoe.name}</p>
                      <p className="product-card__price" style={{ fontSize: '0.88rem' }}>PKR {shoe.price?.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '0.75rem' }}>No match found</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Try a different style prompt or run the scraper to populate the database.</p>
        </div>
      )}
    </div>
  );
}
