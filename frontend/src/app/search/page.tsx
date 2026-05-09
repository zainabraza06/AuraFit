'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { searchApi } from '@/lib/api';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [inputVal, setInputVal] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const doSearch = async (q: string, page = 1) => {
    if (!q.trim()) { setResults([]); setPagination(null); return; }
    setLoading(true);
    try {
      const res = await searchApi.search({ q, page, limit: 16 });
      setResults(res.data.products ?? []);
      setPagination(res.data.pagination ?? null);
      setCurrentPage(page);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounce input → query
  useEffect(() => {
    const t = setTimeout(() => {
      if (inputVal !== query) {
        setQuery(inputVal);
        if (inputVal) router.replace(`/search?q=${encodeURIComponent(inputVal)}`, { scroll: false });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [inputVal]);

  useEffect(() => { doSearch(query, 1); }, [query]);

  const QUICK = ['Lawn suit', 'Black heels', 'Embroidered kurta', 'Pastel dress', 'Casual sneakers', 'Bridal lehenga'];

  return (
    <main className="page">
      {/* Header */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '3.5rem 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="section-label">✦ Semantic Search</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>
            Find Your <em className="gradient-text">Aesthetic</em>
          </h1>

          {/* Search bar */}
          <div style={{ maxWidth: 640, margin: '2rem auto 0' }}>
            <div className="search-bar" style={{ padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-xl)' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                id="search-input"
                type="text"
                placeholder="Search by color, occasion, fabric, brand…"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setQuery(inputVal); doSearch(inputVal); } }}
                style={{ fontSize: '1rem' }}
                autoFocus
              />
              {inputVal && (
                <button
                  onClick={() => { setInputVal(''); setQuery(''); setResults([]); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                >×</button>
              )}
            </div>

            {/* Quick searches */}
            {!query && (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                {QUICK.map((q) => (
                  <button key={q} className="chip" onClick={() => { setInputVal(q); setQuery(q); }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '3rem clamp(1rem,4vw,3rem)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10rem 0' }}>
            <div className="spinner" style={{ width: 50, height: 50 }} />
          </div>
        ) : results.length > 0 ? (
          <>
            {pagination && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Found <strong style={{ color: 'var(--text-secondary)' }}>{pagination.total?.toLocaleString()}</strong> results for "<em>{query}</em>"
              </p>
            )}

            <div className="product-grid">
              {results.map((p) => <ProductCard key={p._id} product={p} />)}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '3.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" disabled={currentPage <= 1} onClick={() => doSearch(query, currentPage - 1)}>← Prev</button>
                {Array.from({ length: Math.min(pagination.totalPages, 8) }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    className={`btn btn-sm ${currentPage === pg ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => doSearch(query, pg)}
                  >{pg}</button>
                ))}
                <button className="btn btn-ghost btn-sm" disabled={currentPage >= pagination.totalPages} onClick={() => doSearch(query, currentPage + 1)}>Next →</button>
              </div>
            )}
          </>
        ) : query ? (
          <div style={{ textAlign: 'center', padding: '8rem 0', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔍</div>
            <h3 className="title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No matches for "{query}"</h3>
            <p style={{ color: 'var(--text-muted)' }}>Try a different term — color, style, or brand name.</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '8rem 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✦</div>
            <p style={{ fontSize: '1.1rem' }}>Type above to search 2,700+ Pakistani fashion products</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" style={{ width: 50, height: 50 }} />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
