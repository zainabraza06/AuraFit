'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { searchApi, vectorSearchApi } from '@/lib/api';

const QUICK = ['Lawn suit', 'Black heels', 'Embroidered kurta', 'Pastel dress', 'Casual sneakers', 'Bridal lehenga'];

type Mode = 'keyword' | 'semantic';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('keyword');
  const [inputVal, setInputVal] = useState(searchParams.get('q') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [semanticInfo, setSemanticInfo] = useState<string>('');

  const doSearch = async (q: string, page = 1, searchMode: Mode = mode) => {
    if (!q.trim()) { setResults([]); setPagination(null); setSemanticInfo(''); return; }
    setLoading(true);
    try {
      if (searchMode === 'semantic') {
        const res = await vectorSearchApi.semantic(q, { limit: 24 });
        setResults(res.data.results ?? []);
        setPagination(null); // semantic returns flat list
        setSemanticInfo(res.data.engine ? `Semantic engine: ${res.data.engine}` : '');
        setCurrentPage(1);
      } else {
        const res = await searchApi.search({ q, page, limit: 16 });
        setResults(res.data.products ?? []);
        setPagination(res.data.pagination ?? null);
        setSemanticInfo('');
        setCurrentPage(page);
      }
    } catch (err: any) {
      if (searchMode === 'semantic' && err?.response?.status === 503) {
        setSemanticInfo('⚠ Semantic search not configured — add HUGGINGFACE_API_KEY to .env. Falling back to keyword search.');
        // Fallback to keyword
        try {
          const res = await searchApi.search({ q, page: 1, limit: 16 });
          setResults(res.data.products ?? []);
          setPagination(res.data.pagination ?? null);
        } catch { setResults([]); }
      } else {
        setResults([]);
      }
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

  useEffect(() => { doSearch(query, 1, mode); }, [query, mode]);

  const switchMode = (m: Mode) => { setMode(m); if (query) doSearch(query, 1, m); };

  return (
    <main className="page">
      {/* Header */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '3.5rem 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="section-label">✦ {mode === 'semantic' ? 'Vector Search' : 'Keyword Search'}</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>
            Find Your <em className="gradient-text">Aesthetic</em>
          </h1>

          {/* Mode toggle */}
          <div style={{ display: 'inline-flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '100px', padding: '0.3rem', gap: '0.25rem', margin: '1.5rem auto 0' }}>
            {(['keyword', 'semantic'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  padding: '0.45rem 1.25rem', borderRadius: '100px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: 600,
                  transition: 'all 0.2s ease',
                  background: mode === m ? 'linear-gradient(135deg,var(--accent),var(--accent-warm))' : 'none',
                  color: mode === m ? '#0a0a12' : 'var(--text-secondary)',
                }}
              >
                {m === 'keyword' ? '🔤 Keyword' : '🧠 Semantic AI'}
              </button>
            ))}
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
            {mode === 'semantic' ? 'Uses HuggingFace all-MiniLM-L6-v2 embeddings for true semantic understanding' : 'MongoDB full-text + regex search across all products'}
          </p>

          {/* Search bar */}
          <div style={{ maxWidth: 680, margin: '1.5rem auto 0' }}>
            <div className="search-bar" style={{ padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-xl)', boxShadow: mode === 'semantic' ? '0 0 30px rgba(167,139,250,0.15)' : 'none', borderColor: mode === 'semantic' ? 'var(--border-accent)' : 'var(--border)' }}>
              {mode === 'semantic' ? (
                <span style={{ fontSize: '1.1rem' }}>🧠</span>
              ) : (
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              )}
              <input
                id="search-input"
                type="text"
                placeholder={mode === 'semantic' ? 'Describe what you\'re looking for naturally…' : 'Search by color, occasion, fabric, brand…'}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setQuery(inputVal); doSearch(inputVal); } }}
                style={{ fontSize: '1rem' }}
                autoFocus
              />
              {inputVal && (
                <button onClick={() => { setInputVal(''); setQuery(''); setResults([]); setSemanticInfo(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
              )}
            </div>

            {/* Quick searches */}
            {!query && (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                {QUICK.map(q => (
                  <button key={q} className="chip" onClick={() => { setInputVal(q); setQuery(q); }}>{q}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '3rem clamp(1rem,4vw,3rem)' }}>
        {/* Semantic info banner */}
        {semanticInfo && (
          <div style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', background: semanticInfo.startsWith('⚠') ? 'rgba(251,191,36,0.08)' : 'rgba(167,139,250,0.08)', border: `1px solid ${semanticInfo.startsWith('⚠') ? 'rgba(251,191,36,0.25)' : 'var(--border-accent)'}`, fontSize: '0.82rem', color: semanticInfo.startsWith('⚠') ? 'var(--warning)' : 'var(--accent)' }}>
            {semanticInfo}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '10rem 0', gap: '1rem' }}>
            <div className="spinner" style={{ width: 50, height: 50 }} />
            {mode === 'semantic' && <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Running semantic similarity search…</p>}
          </div>
        ) : results.length > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {pagination
                  ? <>Found <strong style={{ color: 'var(--text-secondary)' }}>{pagination.total?.toLocaleString()}</strong> results for "<em>{query}</em>"</>
                  : <><strong style={{ color: 'var(--text-secondary)' }}>{results.length}</strong> semantic matches for "<em>{query}</em>"</>}
              </p>
              {mode === 'semantic' && results[0]?.relevanceScore && (
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'rgba(167,139,250,0.1)', padding: '0.25rem 0.75rem', borderRadius: '100px', border: '1px solid var(--border-accent)' }}>
                  Top relevance: {(results[0].relevanceScore * 100).toFixed(1)}%
                </span>
              )}
            </div>

            <div className="product-grid">
              {results.map(p => (
                <div key={p._id} style={{ position: 'relative' }}>
                  {mode === 'semantic' && p.relevanceScore && (
                    <div style={{ position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 10, background: 'rgba(8,8,16,0.85)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-accent)', borderRadius: '100px', padding: '0.2rem 0.6rem', fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700 }}>
                      {(p.relevanceScore * 100).toFixed(0)}% match
                    </div>
                  )}
                  <ProductCard product={p} />
                </div>
              ))}
            </div>

            {/* Pagination (keyword mode only) */}
            {pagination && pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '3.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" disabled={currentPage <= 1} onClick={() => doSearch(query, currentPage - 1)}>← Prev</button>
                {Array.from({ length: Math.min(pagination.totalPages, 8) }, (_, i) => i + 1).map(pg => (
                  <button key={pg} className={`btn btn-sm ${currentPage === pg ? 'btn-primary' : 'btn-ghost'}`} onClick={() => doSearch(query, pg)}>{pg}</button>
                ))}
                <button className="btn btn-ghost btn-sm" disabled={currentPage >= pagination.totalPages} onClick={() => doSearch(query, currentPage + 1)}>Next →</button>
              </div>
            )}
          </>
        ) : query ? (
          <div style={{ textAlign: 'center', padding: '8rem 0', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔍</div>
            <h3 className="title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No matches for "{query}"</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {mode === 'semantic' ? 'No products scored above the similarity threshold. Try switching to Keyword search.' : 'Try a different term — color, style, or brand name.'}
            </p>
            {mode === 'semantic' && (
              <button className="btn btn-ghost" onClick={() => switchMode('keyword')}>Switch to Keyword Search</button>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '8rem 0' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{mode === 'semantic' ? '🧠' : '✦'}</div>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              {mode === 'semantic' ? 'Describe any outfit in natural language' : 'Type to search 2,700+ Pakistani fashion products'}
            </p>
            {mode === 'semantic' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                e.g. "elegant embroidered formal wear in warm tones"
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><div className="spinner" style={{ width: 50, height: 50 }} /></div>}>
      <SearchContent />
    </Suspense>
  );
}
