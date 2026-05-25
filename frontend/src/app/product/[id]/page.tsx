'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { productsApi, recommendationsApi, favoritesApi } from '@/lib/api';

function normalizeProductId(product: any): string | null {
  if (!product) return null;
  const raw = product._id ?? product.id;
  if (raw == null) return null;
  const s =
    typeof raw === 'object' && raw !== null && '$oid' in raw
      ? String(raw.$oid)
      : String(raw);
  return /^[a-f0-9]{24}$/i.test(s) ? s : null;
}

export default function ProductDetailsPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState('');
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

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

  useEffect(() => {
    if (!product || typeof window === 'undefined') return;
    const productId = normalizeProductId(product);
    if (!productId) return;
    const token = localStorage.getItem('fashion_token');
    if (!token) return;

    favoritesApi
      .check(productId)
      .then((res) => setIsFav(!!res.data?.favorited))
      .catch((err) => console.error('Error checking favorite:', err));
  }, [product]);

  const toggleMainFavorite = useCallback(async () => {
    const productId = normalizeProductId(product);
    if (!productId) {
      console.warn('No valid product ID available');
      return;
    }
    const token = localStorage.getItem('fashion_token');
    if (!token) {
      alert('Please login to save favorites');
      return;
    }
    setFavLoading(true);
    try {
      console.log('Toggling favorite for product:', productId);
      const res = await favoritesApi.toggle(productId);
      console.log('Favorite response:', res.data);
      setIsFav(!!res.data?.favorited);
    } catch (err: unknown) {
      console.error('Error toggling favorite:', err);
      const ax = err as { response?: { status?: number; data?: { error?: string } } };
      const status = ax.response?.status;
      const msg = ax.response?.data?.error;
      if (status === 401) alert('Session expired — please log in again.');
      else if (status === 404) alert(msg || 'Product not found in catalog.');
      else alert(msg || 'Could not update favorites. Please try again.');
    } finally {
      setFavLoading(false);
    }
  }, [product]);

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
        <div className="product-info-grid" style={{ marginBottom: '6rem' }}>
          {/* Gallery */}
          <div className="product-gallery">
            {/* Thumbnails */}
            <div className="product-thumbs">
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
            <h1 className="title" style={{ fontSize: 'clamp(2rem,6vw,3rem)', marginTop: '1rem', marginBottom: '1rem' }}>{product.name}</h1>
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

              <div className="resp-grid-2" style={{ gap: '1.5rem' }}>
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

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg" style={{ flex: 1, justifyContent: 'center' }}>
                Buy on {product.brand} →
              </a>
              <button
                type="button"
                className={`btn btn-ghost btn-lg ${isFav ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={toggleMainFavorite}
                disabled={favLoading}
                aria-pressed={isFav}
              >
                {isFav ? '♥ Saved' : '♡ Save'}
              </button>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
                {recommendations.shoes?.map((rec: any) => (
                  <div key={rec.product._id}>
                    <ProductCard product={rec.product} />
                    <div style={{ marginTop: '0.75rem', padding: '0 0.25rem' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
                {recommendations.complementaryClothing?.map((rec: any) => (
                  <div key={rec.product._id}>
                    <ProductCard product={rec.product} />
                    <div style={{ marginTop: '0.75rem', padding: '0 0.25rem' }}>
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
