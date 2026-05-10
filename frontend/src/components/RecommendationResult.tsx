'use client';

// ── Tier config ────────────────────────────────────────────────────────────────
const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  exact:   { label: '100% Match',     color: '#72a884', bg: 'rgba(114,168,132,0.10)', border: 'rgba(114,168,132,0.30)' },
  close:   { label: '90% — Close',    color: '#c9a96e', bg: 'rgba(201,169,110,0.10)', border: 'rgba(201,169,110,0.35)' },
  similar: { label: '80% — Similar',  color: '#e0a060', bg: 'rgba(224,160,96,0.10)',  border: 'rgba(224,160,96,0.35)'  },
  loose:   { label: '50% — Partial',  color: '#d07070', bg: 'rgba(208,112,112,0.10)', border: 'rgba(208,112,112,0.35)' },
  none:    { label: 'No match',        color: '#888',    bg: 'rgba(136,136,136,0.08)', border: 'rgba(136,136,136,0.25)' },
};

function MatchBadge({ matchQuality }: { matchQuality: any }) {
  if (!matchQuality) return null;
  const cfg = TIER_CONFIG[matchQuality.tier] || TIER_CONFIG.none;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.72rem',
        fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`
      }}>
        <span style={{ fontSize: '0.65rem' }}>★</span> {cfg.label}
      </span>
      {matchQuality.message && (
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          {matchQuality.message}
        </span>
      )}
    </div>
  );
}

// General result-context banner — always shown for any non-exact result.
// Tier drives the main message; specific fallbacks (color/occasion/piece) appear
// as supplementary detail only when present.
const TIER_CONTEXT: Record<string, string> = {
  close:   'Showing the closest available results to your search.',
  similar: 'No exact match found — showing the most similar products we have.',
  loose:   'No close match available — showing loosely related products you might like.',
  none:    "This combination isn't in our catalog yet — here are a few products you might like.",
};

function ResultContextBanner({
  matchQuality, colorMessage, occasionFallbackMessage, pieceFallbackMessage
}: {
  matchQuality: any;
  colorMessage?: string | null;
  occasionFallbackMessage?: string | null;
  pieceFallbackMessage?: string | null;
}) {
  if (!matchQuality || matchQuality.tier === 'exact') return null;

  const baseText = TIER_CONTEXT[matchQuality.tier] || matchQuality.message || '';
  const details  = [colorMessage, occasionFallbackMessage, pieceFallbackMessage].filter(Boolean) as string[];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
      padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
      background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.20)',
      fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6
    }}>
      <span style={{ flexShrink: 0, marginTop: '0.05rem', opacity: 0.7 }}>ℹ</span>
      <span>
        {baseText}
        {details.length > 0 && (
          <span style={{ opacity: 0.8 }}>{' '}{details.join(' ')}</span>
        )}
      </span>
    </div>
  );
}

export default function RecommendationResult({ data, compact = false }: { data: any; compact?: boolean }) {
  if (!data || !data.intent) return null;

  const { intent, outfit, matchQuality, colorMessage, occasionFallbackMessage, pieceFallbackMessage } = data;
  const heroDress    = outfit?.heroDress;
  const shoes        = outfit?.shoes        || [];
  const otherDresses = outfit?.otherDresses || [];

  // ── Compact mode: slim card for chat widget ──────────────────────────────────
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
        {/* Match quality in compact */}
        {matchQuality && matchQuality.tier !== 'exact' && (
          <MatchBadge matchQuality={matchQuality} />
        )}

        <ResultContextBanner matchQuality={matchQuality} colorMessage={colorMessage} occasionFallbackMessage={occasionFallbackMessage} pieceFallbackMessage={pieceFallbackMessage} />

        {heroDress && (
          <a href={heroDress.productUrl || '#'} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'flex', gap: '0.7rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', transition: 'border-color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <img src={heroDress.imageUrl || heroDress.images?.[0] || '/placeholder.jpg'} alt={heroDress.name}
              style={{ width: 70, height: 90, objectFit: 'cover', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }} />
            <div style={{ padding: '0.65rem 0.65rem 0.65rem 0', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
              <p style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{heroDress.brand}</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3, marginBottom: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroDress.name}</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--accent-light)', fontWeight: 600 }}>PKR {heroDress.price?.toLocaleString()}</p>
              {heroDress.primaryColor && <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{heroDress.primaryColor}</p>}
            </div>
          </a>
        )}

        {shoes.length > 0 && (
          <div>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Matched Shoes</p>
            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem', scrollbarWidth: 'none' }}>
              {shoes.slice(0, 3).map((s: any, i: number) => (
                <a key={i} href={s.productUrl || '#'} target="_blank" rel="noopener noreferrer"
                  title={s.matchReason || s.name}
                  style={{ textDecoration: 'none', flexShrink: 0, width: 68 }}
                >
                  <img src={s.imageUrl || s.images?.[0] || '/placeholder.jpg'} alt={s.name}
                    style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                    onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }} />
                  <p style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {(otherDresses.length > 0 || shoes.length > 0) && (
          <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'center' }}>Click any item to shop ↗</p>
        )}
      </div>
    );
  }

  // ── Full page mode ────────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ── Stylist's Vision banner ── */}
      <div className="glass-panel" style={{ padding: '1.5rem 2rem', borderLeft: '3px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <h3 style={{ color: 'var(--accent)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
            Stylist's Vision
          </h3>
          {matchQuality && <MatchBadge matchQuality={matchQuality} />}
        </div>

        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.05rem', fontFamily: 'var(--font-display)', lineHeight: 1.5 }}>
          "{outfit?.reasoning || intent.intentSummary}"
        </p>

        {/* AI analysis */}
        {intent.aiAnalysis && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {intent.aiAnalysis}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {intent.color && intent.color !== 'Any' && (
            <span className="tag" style={{ color: 'var(--text-primary)' }}>🎨 {intent.shade ? `${intent.shade} (${intent.color})` : intent.color}</span>
          )}
          {intent.fabric && <span className="tag" style={{ color: 'var(--text-secondary)' }}>🧵 {intent.fabric}</span>}
          {intent.piece  && <span className="tag" style={{ color: 'var(--text-secondary)' }}>👗 {intent.piece}</span>}
          {intent.occasion?.map((o: string) => (
            <span key={o} className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--border-accent)', background: 'rgba(201,169,110,0.06)' }}>
              #{o}
            </span>
          ))}
          {intent.maxBudget > 0 && (
            <span className="tag" style={{ color: 'var(--success)', borderColor: 'rgba(114,168,132,0.2)', background: 'rgba(114,168,132,0.08)' }}>
              Under PKR {intent.maxBudget.toLocaleString()}
            </span>
          )}
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <ResultContextBanner matchQuality={matchQuality} colorMessage={colorMessage} occasionFallbackMessage={occasionFallbackMessage} pieceFallbackMessage={pieceFallbackMessage} />
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
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s var(--ease)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                />
              </div>
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <p className="product-card__brand" style={{ fontSize: '0.72rem', marginBottom: '0.5rem' }}>{heroDress.brand}</p>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', lineHeight: 1.25, marginBottom: '0.75rem' }}>{heroDress.name}</h3>
                  <p style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--accent-light)', marginBottom: '1rem' }}>
                    PKR {heroDress.price?.toLocaleString()}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {heroDress.primaryColor && <span className="tag">🎨 {heroDress.primaryColor}</span>}
                    {heroDress.subCategory  && <span className="tag">{heroDress.subCategory}</span>}
                    {heroDress.fabric       && <span className="tag">🧵 {heroDress.fabric}</span>}
                    {heroDress.occasion?.slice(0, 2).map((o: string) => <span key={o} className="tag">#{o}</span>)}
                  </div>
                  {heroDress.description && (
                    <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {heroDress.description}
                    </p>
                  )}
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

          {/* ── Matching Shoes ── */}
          {shoes.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                Matching <em className="gradient-text">Shoes</em>
                <span className="tag" style={{ fontSize: '0.65rem', color: 'var(--accent-teal)', borderColor: 'rgba(106,173,160,0.25)', background: 'rgba(106,173,160,0.08)' }}>
                  AI Matched
                </span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem' }}>
                {shoes.slice(0, 4).map((shoe: any, i: number) => (
                  <a key={shoe._id || i} href={shoe.productUrl || '#'} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="glass-card" style={{ overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s, transform 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.transform = ''; }}
                    >
                      <div style={{ aspectRatio: '1/1', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                        <img
                          src={shoe.imageUrl || shoe.images?.[0] || '/placeholder.jpg'}
                          alt={shoe.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s var(--ease)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                        />
                      </div>
                      <div style={{ padding: '0.9rem 1rem' }}>
                        <p className="product-card__brand">{shoe.brand}</p>
                        <p className="product-card__name" style={{ fontSize: '0.88rem' }}>{shoe.name}</p>
                        <p className="product-card__price" style={{ fontSize: '0.88rem' }}>PKR {shoe.price?.toLocaleString()}</p>
                        {shoe.matchReason && (
                          <p style={{ fontSize: '0.72rem', color: 'var(--accent-teal)', marginTop: '0.45rem', fontStyle: 'italic', lineHeight: 1.4, opacity: 0.85 }}>
                            {shoe.matchReason}
                          </p>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── Similar Styles ── */}
          {otherDresses.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '1.25rem' }}>
                Similar <em className="gradient-text">Styles</em>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.25rem' }}>
                {otherDresses.slice(0, 4).map((p: any, i: number) => (
                  <a key={p._id || i} href={p.productUrl || '#'} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="glass-card" style={{ overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s, transform 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.transform = ''; }}
                    >
                      <div style={{ aspectRatio: '3/4', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                        <img
                          src={p.imageUrl || p.images?.[0] || '/placeholder.jpg'}
                          alt={p.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s var(--ease)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                        />
                      </div>
                      <div style={{ padding: '0.9rem 1rem' }}>
                        <p className="product-card__brand">{p.brand}</p>
                        <p className="product-card__name" style={{ fontSize: '0.95rem' }}>{p.name}</p>
                        <p className="product-card__price" style={{ fontSize: '0.9rem' }}>PKR {p.price?.toLocaleString()}</p>
                        {p.primaryColor && <span className="tag" style={{ marginTop: '0.4rem', fontSize: '0.7rem' }}>{p.primaryColor}</span>}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '0.75rem' }}>No match found</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            {matchQuality?.message || 'Try a different style prompt or run the scraper to populate the database.'}
          </p>
        </div>
      )}
    </div>
  );
}
