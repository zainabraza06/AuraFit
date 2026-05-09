'use client';
import { useState, useEffect } from 'react';
import ProductCard from '@/components/ProductCard';
import { searchApi } from '@/lib/api';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<any>(null);

  const handleSearch = async (q: string, page = 1) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await searchApi.search({ q, page, limit: 12 });
      setResults(res.data.products);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query) handleSearch(query);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="section-header">
          <span className="section-label">✦ Semantic Search</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>Find Your Aesthetic</h1>
          
          <div style={{ maxWidth: '600px', margin: '2rem auto 0' }}>
            <div className="search-bar" style={{ padding: '0.8rem 1.5rem', borderRadius: 'var(--radius-xl)' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input 
                type="text" 
                placeholder="Search for 'black formal heels' or 'pastel lawn'..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ fontSize: '1rem' }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
              Try searching by color, occasion, fabric, or style.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10rem 0' }}>
            <div className="spinner" />
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="product-grid">
              {results.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
            
            {pagination && pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '4rem' }}>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={`btn btn-sm ${pagination.page === p ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => handleSearch(query, p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : query && (
          <div style={{ textAlign: 'center', padding: '10rem 0', color: 'var(--text-secondary)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '1rem' }}>No matches found</h3>
            <p>Our AI couldn't find products matching "{query}". Try a different term.</p>
          </div>
        )}
      </div>
    </main>
  );
}
