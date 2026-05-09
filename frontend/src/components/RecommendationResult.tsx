'use client';

export default function RecommendationResult({ data }: { data: any }) {
  if (!data || !data.intent) return null;

  const { intent, outfit } = data;
  const heroDress = outfit?.heroDress;
  const shoes = outfit?.shoes || [];
  const jewelry = outfit?.jewelry || [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Styling Summary Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent)' }}>
        <h3 style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>Stylist's Vision</h3>
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.1rem' }}>
          "{outfit?.reasoning || intent.intentSummary}"
        </p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          {intent.color && intent.color !== 'Any' && (
            <span style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>
              Color: {intent.color}
            </span>
          )}
          {intent.occasion?.map((o: string) => (
            <span key={o} style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(217, 70, 239, 0.15)', borderRadius: '12px', color: 'var(--accent)' }}>
              #{o}
            </span>
          ))}
          {intent.maxBudget > 0 && (
            <span style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: 'var(--success)' }}>
              Under Rs. {intent.maxBudget}
            </span>
          )}
        </div>
      </div>

      {heroDress ? (
        <>
          {/* Hero Outfit */}
          <h2 className="title-gradient">Your Perfect Match</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {/* Main Dress */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <div style={{ height: '400px', backgroundImage: `url(${heroDress.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'top' }} />
              <div style={{ padding: '1.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>{heroDress.brand}</span>
                <h3 style={{ margin: '0.5rem 0', fontSize: '1.5rem' }}>{heroDress.title}</h3>
                <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '1rem' }}>Rs. {heroDress.price.toLocaleString()}</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
                  <a href={heroDress.productUrl} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '10px 20px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', fontWeight: 600 }}>Get This Look</a>
                  <button 
                    onClick={() => alert('Outfit Saved to your Boards!')}
                    className="glass-button" 
                    style={{ padding: '10px 20px', borderRadius: '8px' }}
                  >
                    Save Outfit
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Accessories Grid */}
          {(shoes.length > 0 || jewelry.length > 0) && (
            <>
              <h3 className="title-gradient" style={{ marginTop: '2rem' }}>Complete The Look</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {[...shoes, ...jewelry].map((item: any, idx) => (
                  <div key={item._id || idx} className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ width: '100%', height: '160px', backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '8px', marginBottom: '1rem' }} />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{item.brand} • {item.category}</span>
                    <h4 style={{ margin: '0.25rem 0', fontSize: '0.95rem', flex: 1 }}>{item.title}</h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Rs. {item.price.toLocaleString()}</span>
                      <a href={item.productUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>Shop</a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '1rem' }}>No Perfect Match Found</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Try broadening your search criteria or ensuring you have scraped data in your database.</p>
        </div>
      )}
    </div>
  );
}
