'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { productsApi, recommendationsApi } from '@/lib/api';

export default function ProductDetailsPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState('');

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [prodRes, recRes] = await Promise.all([
          productsApi.getById(id as string),
          recommendationsApi.forProduct(id as string)
        ]);
        setProduct(prodRes.data.product);
        setRecommendations(recRes.data);
        setActiveImage(prodRes.data.product.imageUrl || prodRes.data.product.images?.[0] || '');
      } catch (err) {
        console.error('Failed to fetch product details', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page" style={{ textAlign: 'center', padding: '10rem 0' }}>
        <h2 className="title">Product not found</h2>
      </div>
    );
  }

  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        {/* Product Info Section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '4rem', marginBottom: '6rem' }}>
          {/* Gallery */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            {/* Thumbnails */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '80px' }}>
              {(product.images || []).slice(0, 5).map((img: string, idx: number) => (
                <div 
                  key={idx} 
                  className={`glass-card ${activeImage === img ? 'active' : ''}`}
                  style={{ 
                    aspectRatio: '1', 
                    overflow: 'hidden', 
                    cursor: 'pointer',
                    borderColor: activeImage === img ? 'var(--accent)' : 'var(--border)'
                  }}
                  onClick={() => setActiveImage(img)}
                >
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
            {/* Main Image */}
            <div className="glass-card" style={{ flex: 1, aspectRatio: '3/4', overflow: 'hidden' }}>
              <img src={activeImage} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          {/* Details */}
          <div>
            <span className="section-label">{product.brand}</span>
            <h1 className="title" style={{ fontSize: '3rem', marginTop: '1rem', marginBottom: '1rem' }}>{product.name}</h1>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-gold)' }}>PKR {product.price.toLocaleString()}</span>
              {product.compareAtPrice && (
                <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>PKR {product.compareAtPrice.toLocaleString()}</span>
              )}
            </div>

            <div className="glass-card" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.8' }}>
                {product.description || 'No description available for this premium piece.'}
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Category</h4>
                  <p>{product.category} {product.subCategory && `— ${product.subCategory}`}</p>
                </div>
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Fabric</h4>
                  <p>{product.fabric || 'Standard'}</p>
                </div>
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Color</h4>
                  <p>{product.primaryColor}</p>
                </div>
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Source</h4>
                  <p>{product.source || product.brand}</p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg" style={{ flex: 1, justifyContent: 'center' }}>
                Buy on {product.brand} →
              </a>
              <button className="btn btn-ghost btn-lg">♥ Save</button>
            </div>
          </div>
        </div>

        {/* AI Recommendations Section */}
        {recommendations && (
          <section style={{ marginTop: '8rem' }}>
            <div className="section-header" style={{ textAlign: 'left' }}>
              <span className="section-label">✦ AI Styling</span>
              <h2 className="title" style={{ marginTop: '0.75rem' }}>Complete the Look</h2>
              <p className="subtitle" style={{ marginTop: '0.5rem' }}>Our AI analyzed {product.name} to find these perfect matches based on color theory and style compatibility.</p>
            </div>

            {/* Matching Shoes */}
            <div style={{ marginBottom: '5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                Matching Shoes 
                <span className="tag" style={{ background: 'rgba(45, 212, 191, 0.1)', color: 'var(--accent-teal)', borderColor: 'rgba(45, 212, 191, 0.2)' }}>High Compatibility</span>
              </h3>
              <div className="carousel">
                {recommendations.shoes?.map((rec: any) => (
                  <div key={rec.product._id} style={{ width: '280px' }}>
                    <ProductCard product={rec.product} />
                    <div style={{ marginTop: '1rem', padding: '0 0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                        <span>Match Score</span>
                        <span>{Math.round(rec.scores.total * 100)}%</span>
                      </div>
                      <div className="score-bar">
                        <div className="score-bar__fill" style={{ width: `${rec.scores.total * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                {(!recommendations.shoes || recommendations.shoes.length === 0) && (
                  <p style={{ color: 'var(--text-muted)' }}>No matching shoes found in the current collection.</p>
                )}
              </div>
            </div>

            {/* Complementary Products */}
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', marginBottom: '2rem' }}>Complementary Styles</h3>
              <div className="carousel">
                {recommendations.complementaryClothing?.map((rec: any) => (
                  <div key={rec.product._id} style={{ width: '280px' }}>
                    <ProductCard product={rec.product} />
                    <div style={{ marginTop: '1rem', padding: '0 0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                        <span>Style Synergy</span>
                        <span>{Math.round(rec.scores.total * 100)}%</span>
                      </div>
                      <div className="score-bar">
                        <div className="score-bar__fill" style={{ width: `${rec.scores.total * 100}%`, background: 'linear-gradient(90deg, var(--accent-teal), var(--accent-warm))' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
