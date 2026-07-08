'use client';
import TryOnButton from './TryOnButton';

// ── Tier config ────────────────────────────────────────────────────────────────
const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  exact:   { label: '100% Match',    color: '#72a884', bg: 'rgba(114,168,132,0.10)', border: 'rgba(114,168,132,0.30)' },
  close:   { label: '90% — Close',   color: '#c9a96e', bg: 'rgba(201,169,110,0.10)', border: 'rgba(201,169,110,0.35)' },
  similar: { label: '80% — Similar', color: '#e0a060', bg: 'rgba(224,160,96,0.10)',  border: 'rgba(224,160,96,0.35)'  },
  loose:   { label: '50% — Partial', color: '#d07070', bg: 'rgba(208,112,112,0.10)', border: 'rgba(208,112,112,0.35)' },
  none:    { label: 'No match',       color: '#888',   bg: 'rgba(136,136,136,0.08)', border: 'rgba(136,136,136,0.25)' },
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

function PairedJewelry({ jewelry, size = 'full' }: { jewelry: any[]; size?: 'full' | 'compact' }) {
  const items = (jewelry || []).filter((j) => j?.product).slice(0, 3);
  if (!items.length) return null;
  const thumb = size === 'compact' ? 40 : 54;
  return (
    <div>
      <p style={{ fontSize: size === 'compact' ? '0.62rem' : '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
        ✦ Jewellery to Pair
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {items.map((j, i) => (
          <a key={j.product._id || i} href={j.product.productUrl || '#'} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'flex', gap: '0.55rem', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0.4rem', transition: 'border-color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <img
              src={j.product.imageUrl || j.product.images?.[0] || '/placeholder.jpg'}
              alt={j.product.name}
              style={{ width: thumb, height: thumb, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.product.name}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--accent-light)', fontWeight: 600 }}>PKR {j.product.price?.toLocaleString()}</p>
              {j.reason && <p style={{ fontSize: '0.62rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.3 }}>{j.reason}</p>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function CategoryChips({ product }: { product: any }) {
  return (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
      {(product.primaryExactColor || product.primaryColor) && (
        <span className="tag" style={{ fontSize: '0.68rem' }}>
          🎨 {product.primaryExactColor || product.primaryColor}
          {product.primaryExactColor && product.primaryColor && product.primaryExactColor !== product.primaryColor
            ? ` (${product.primaryColor})` : ''}
        </span>
      )}
      {product.dressStyle && (
        <span className="tag" style={{ fontSize: '0.68rem', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.07)' }}>
          {product.dressStyle}
        </span>
      )}
      {product.print && (
        <span className="tag" style={{ fontSize: '0.68rem', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.07)' }}>
          {product.print}
        </span>
      )}
      {product.stitching && (
        <span className="tag" style={{ fontSize: '0.68rem', color: 'var(--success)', borderColor: 'rgba(114,168,132,0.25)', background: 'rgba(114,168,132,0.07)' }}>
          {product.stitching}
        </span>
      )}
      {product.pieces && (
        <span className="tag" style={{ fontSize: '0.68rem', color: 'var(--accent-teal)', borderColor: 'rgba(106,173,160,0.25)', background: 'rgba(106,173,160,0.07)' }}>
          {product.pieces}-piece
        </span>
      )}
      {product.occasion?.slice(0, 2).map((o: string) => (
        <span key={o} className="tag" style={{ fontSize: '0.68rem', color: 'var(--accent)', borderColor: 'var(--border-accent)', background: 'rgba(201,169,110,0.06)' }}>
          #{o}
        </span>
      ))}
      {product.fabric && (
        <span className="tag" style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>🧵 {product.fabric}</span>
      )}
    </div>
  );
}

export default function RecommendationResult({ data, compact = false }: { data: any; compact?: boolean }) {
  if (!data || !data.results?.length) return null;

  const { intent, results, matchQuality, relaxationMessage, catalogNote } = data;
  const topResult  = results[0];
  const heroDress  = topResult?.product;
  const heroShoe   = topResult?.shoe;
  const heroJewelry = topResult?.jewelry;
  const restResults = results.slice(1);

  // ── Compact mode: slim card for chat widget ──────────────────────────────────
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
        {matchQuality && matchQuality.tier !== 'exact' && <MatchBadge matchQuality={matchQuality} />}

        {catalogNote && (
          <div style={{ display: 'flex', gap: '0.45rem', padding: '0.5rem 0.7rem', borderRadius: 'var(--radius-sm)', background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.2)', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, color: 'var(--accent)', fontWeight: 700 }}>✦</span>
            <span>{catalogNote}</span>
          </div>
        )}

        {heroDress && (
          <a href={heroDress.productUrl || '#'} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'flex', gap: '0.7rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', transition: 'border-color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <img
              src={heroDress.imageUrl || heroDress.images?.[0] || '/placeholder.jpg'}
              alt={heroDress.name}
              style={{ width: 70, height: 90, objectFit: 'cover', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
            />
            <div style={{ padding: '0.65rem 0.65rem 0.65rem 0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
              <div>
                <p style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{heroDress.brand}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3, marginBottom: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroDress.name}</p>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                  {heroDress.dressStyle && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}>{heroDress.dressStyle}</span>}
                  {heroDress.stitching && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(114,168,132,0.1)', color: 'var(--success)', border: '1px solid rgba(114,168,132,0.2)' }}>{heroDress.stitching}</span>}
                </div>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--accent-light)', fontWeight: 600 }}>PKR {heroDress.price?.toLocaleString()}</p>
            </div>
          </a>
        )}

        {topResult?.matchReason && (
          <div style={{ padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(201,169,110,0.06)', borderLeft: '2px solid var(--accent)' }}>
            <p style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.2rem' }}>Why AI chose this</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4, margin: 0 }}>"{topResult.matchReason}"</p>
          </div>
        )}

        {heroDress && (
          <TryOnButton productImage={heroDress.imageUrl || heroDress.images?.[0]} productName={heroDress.name} variant="full" />
        )}

        {relaxationMessage && (
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.4, padding: '0 0.1rem' }}>
            ℹ {relaxationMessage}
          </p>
        )}

        {heroShoe?.product && (
          <div>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>Paired Shoe</p>
            <a href={heroShoe.product.productUrl || '#'} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'flex', gap: '0.55rem', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0.4rem', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <img
                src={heroShoe.product.imageUrl || heroShoe.product.images?.[0] || '/placeholder.jpg'}
                alt={heroShoe.product.name}
                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
              />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroShoe.product.name}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--accent-light)', fontWeight: 600 }}>PKR {heroShoe.product.price?.toLocaleString()}</p>
                {heroShoe.reason && <p style={{ fontSize: '0.65rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.3, marginTop: '0.1rem' }}>{heroShoe.reason}</p>}
              </div>
            </a>
          </div>
        )}

        {heroJewelry?.length > 0 && <PairedJewelry jewelry={heroJewelry} size="compact" />}

        {results.length > 1 && (
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center' }}>+{results.length - 1} more results on the main page ↗</p>
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
          "{intent?.intentSummary}"
        </p>

        {intent?.aiAnalysis && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {intent.aiAnalysis}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {intent?.colorExact && (
            <span className="tag" style={{ color: 'var(--text-primary)' }}>
              🎨 {intent.colorExact}{intent.colorFamily && intent.colorFamily !== 'Any' && intent.colorFamily !== intent.colorExact ? ` (${intent.colorFamily})` : ''}
            </span>
          )}
          {!intent?.colorExact && intent?.colorFamily && intent?.colorFamily !== 'Any' && (
            <span className="tag" style={{ color: 'var(--text-primary)' }}>🎨 {intent.colorFamily}</span>
          )}
          {intent?.dressStyle && (
            <span className="tag" style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.07)' }}>👗 {intent.dressStyle}</span>
          )}
          {intent?.print && (
            <span className="tag" style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.07)' }}>{intent.print}</span>
          )}
          {intent?.stitching && (
            <span className="tag" style={{ color: 'var(--success)', borderColor: 'rgba(114,168,132,0.25)', background: 'rgba(114,168,132,0.07)' }}>{intent.stitching}</span>
          )}
          {intent?.pieces && (
            <span className="tag" style={{ color: 'var(--accent-teal)', borderColor: 'rgba(106,173,160,0.25)', background: 'rgba(106,173,160,0.07)' }}>{intent.pieces}-piece</span>
          )}
          {intent?.occasion?.map((o: string) => (
            <span key={o} className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--border-accent)', background: 'rgba(201,169,110,0.06)' }}>#{o}</span>
          ))}
          {intent?.fabric && <span className="tag" style={{ color: 'var(--text-secondary)' }}>🧵 {intent.fabric}</span>}
          {intent?.maxBudget > 0 && (
            <span className="tag" style={{ color: 'var(--success)', borderColor: 'rgba(114,168,132,0.2)', background: 'rgba(114,168,132,0.08)' }}>
              Under PKR {intent.maxBudget.toLocaleString()}
            </span>
          )}
        </div>

        {catalogNote && (
          <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.65rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.22)', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <span style={{ flexShrink: 0, color: 'var(--accent)', fontWeight: 700, marginTop: '0.05rem' }}>✦</span>
            <span>{catalogNote}</span>
          </div>
        )}

      </div>

      {heroDress ? (
        <>
          {/* ── Hero Result (#1) ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem' }}>
                Your Best <em className="gradient-text">Match</em>
              </h2>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, background: 'var(--accent)', color: 'var(--bg-primary)' }}>#1</span>
            </div>

            <div className="glass-card media-split" style={{ overflow: 'hidden', borderColor: 'var(--border-accent)' }}>
              <div style={{ aspectRatio: '3/4', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                <img
                  src={heroDress.imageUrl || heroDress.images?.[0] || '/placeholder.jpg'}
                  alt={heroDress.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s var(--ease)' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                />
              </div>
              <div className="media-split__content">
                <div>
                  <p className="product-card__brand" style={{ fontSize: '0.72rem', marginBottom: '0.4rem' }}>{heroDress.brand}</p>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', lineHeight: 1.25, marginBottom: '0.5rem' }}>{heroDress.name}</h3>
                  <p style={{ fontSize: '1.7rem', fontWeight: 600, color: 'var(--accent-light)', marginBottom: '0.75rem' }}>
                    PKR {heroDress.price?.toLocaleString()}
                  </p>
                  <CategoryChips product={heroDress} />
                </div>

                {topResult.matchReason && (
                  <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.18)', borderLeft: '3px solid var(--accent)' }}>
                    <p style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.4rem' }}>Why AI chose this</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
                      "{topResult.matchReason}"
                    </p>
                    {relaxationMessage && (
                      <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        ℹ {relaxationMessage}
                      </p>
                    )}
                  </div>
                )}

                {heroShoe?.product && (
                  <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>Paired Shoe</p>
                    <a href={heroShoe.product.productUrl || '#'} target="_blank" rel="noopener noreferrer"
                      style={{ textDecoration: 'none', display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0.65rem', transition: 'border-color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <img
                        src={heroShoe.product.imageUrl || heroShoe.product.images?.[0] || '/placeholder.jpg'}
                        alt={heroShoe.product.name}
                        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '0.1rem' }}>{heroShoe.product.brand}</p>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3, marginBottom: '0.25rem' }}>{heroShoe.product.name}</p>
                        <p style={{ fontSize: '0.82rem', color: 'var(--accent-light)', fontWeight: 600, marginBottom: '0.25rem' }}>PKR {heroShoe.product.price?.toLocaleString()}</p>
                        {heroShoe.reason && (
                          <p style={{ fontSize: '0.72rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.4 }}>{heroShoe.reason}</p>
                        )}
                      </div>
                    </a>
                  </div>
                )}

                {heroJewelry?.length > 0 && <PairedJewelry jewelry={heroJewelry} />}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto' }}>
                  {heroDress.productUrl && (
                    <a href={heroDress.productUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                      Shop on {heroDress.brand} →
                    </a>
                  )}
                  <TryOnButton productImage={heroDress.imageUrl || heroDress.images?.[0]} productName={heroDress.name} variant="full" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Remaining Results (#2–N) ── */}
          {restResults.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '1.25rem' }}>
                More <em className="gradient-text">Suggestions</em>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem' }}>
                {restResults.map((r: any, i: number) => {
                  const p    = r.product;
                  const shoe = r.shoe;
                  if (!p) return null;
                  return (
                    <div key={p._id || i} className="glass-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'border-color 0.2s, transform 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.transform = ''; }}
                    >
                      {/* Image + rank badge */}
                      <a href={p.productUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', position: 'relative', display: 'block' }}>
                        <div style={{ aspectRatio: '3/4', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                          <img
                            src={p.imageUrl || p.images?.[0] || '/placeholder.jpg'}
                            alt={p.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s var(--ease)' }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                            onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                          />
                        </div>
                        <span style={{ position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-primary)', border: '1px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)' }}>
                          #{r.rank || i + 2}
                        </span>
                      </a>

                      <div style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1 }}>
                        <div>
                          <p className="product-card__brand" style={{ fontSize: '0.65rem' }}>{p.brand}</p>
                          <p className="product-card__name" style={{ fontSize: '0.88rem', lineHeight: 1.3 }}>{p.name}</p>
                          <p className="product-card__price" style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}>PKR {p.price?.toLocaleString()}</p>
                        </div>

                        <CategoryChips product={p} />

                        {r.matchReason && (
                          <div>
                            <p style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.15rem' }}>Why AI chose this</p>
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              "{r.matchReason}"
                            </p>
                          </div>
                        )}

                        {shoe?.product && (
                          <a href={shoe.product.productUrl || '#'} target="_blank" rel="noopener noreferrer"
                            style={{ textDecoration: 'none', display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.45rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', transition: 'border-color 0.2s' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                          >
                            <img
                              src={shoe.product.imageUrl || shoe.product.images?.[0] || '/placeholder.jpg'}
                              alt={shoe.product.name}
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                              onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                            />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ fontSize: '0.68rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shoe.product.name}</p>
                              {shoe.reason && <p style={{ fontSize: '0.62rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.3 }}>{shoe.reason}</p>}
                            </div>
                          </a>
                        )}

                        {r.jewelry?.length > 0 && <PairedJewelry jewelry={r.jewelry} size="compact" />}

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 'auto' }}>
                          {p.productUrl && (
                            <a href={p.productUrl} target="_blank" rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.45rem 0.85rem', textAlign: 'center', textDecoration: 'none', flex: 1 }}
                            >
                              Shop →
                            </a>
                          )}
                          <TryOnButton productImage={p.imageUrl || p.images?.[0]} productName={p.name} />
                        </div>
                      </div>
                    </div>
                  );
                })}
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
