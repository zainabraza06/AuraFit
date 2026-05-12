'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { favoritesApi } from '@/lib/api';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('fashion_token');
    if (!token) {
      setLoading(false);
      setAuthorized(false);
      return;
    }
    setAuthorized(true);
    fetchFavorites();
  }, []);

  const fetchFavorites = async () => {
    try {
      const res = await favoritesApi.list();
      setFavorites(res.data.favorites);
    } catch (err) {
      console.error('Failed to fetch favorites', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px' }}>
          <h2 className="title" style={{ marginBottom: '1.5rem' }}>Login Required</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Please log in to your account to view and manage your saved products.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link href="/login" className="btn btn-primary">Login</Link>
            <Link href="/register" className="btn btn-ghost">Register</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="section-header" style={{ textAlign: 'left' }}>
          <span className="section-label">✦ My Collection</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>Your Favorites</h1>
          <p className="subtitle" style={{ marginTop: '0.5rem' }}>You have {favorites.length} products saved in your personal gallery.</p>
        </div>

        {favorites.length > 0 ? (
          <div className="product-grid">
            {favorites.map((p) => (
              <ProductCard key={p._id} product={p} favoritedOverride />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '10rem 0', color: 'var(--text-secondary)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '1rem' }}>Your gallery is empty</h3>
            <p style={{ marginBottom: '2rem' }}>Start exploring Pakistani fashion and save pieces you love.</p>
            <Link href="/discover" className="btn btn-primary">Explore Now →</Link>
          </div>
        )}
      </div>
    </main>
  );
}
