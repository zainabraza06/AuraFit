'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { searchApi, vectorSearchApi } from '@/lib/api';

const QUICK = ['Elegant embroidered formal wear', 'Pastel outfit for Eid', 'Black dress for office party', 'Warm-toned bridal look', 'Casual summer lawn', 'Minimal everyday kurti'];

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [inputVal, setInputVal] = useState(searchParams.get('q') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [engineInfo, setEngineInfo] = useState<string>('');
  const [fellBack, setFellBack] = useState(false);

  const doSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); setEngineInfo(''); setFellBack(false); return; }
    setLoading(true);
    setFellBack(false);
    try {
      const res = await vectorSearchApi.semantic(q, { limit: 24 });
      setResults(res.data.results ?? []);
      setEngineInfo(res.data.engine ? `Semantic engine: ${res.data.engine}${res.data.relaxedFloor ? ' · nearest matches' : ''}` : '');
    } catch (err: any) {
      // Semantic not available (503 = no key, 500 = embedding/model error) → silently fall back to keyword
      if (err?.response?.status === 503 || err?.response?.status === 500) {
        try {
          const res = await searchApi.search({ q, page: 1, limit: 24 });
          setResults(res.data.products ?? []);
          setFellBack(true);
          setEngineInfo('Semantic AI is warming up — showing keyword matches meanwhile.');
        } catch { setResults([]); setEngineInfo(''); }
      } else {
        setResults([]);
        setEngineInfo('');
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

  useEffect(() => { doSearch(query); }, [query]);

  return (
    <main className="page">
      {/* Header */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '3.5rem 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="section-label">🧠 Semantic AI Search</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>
            Find Your <em className="gradient-text">Aesthetic</em>
          </h1>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.9rem', maxWidth: 560, margin: '0.9rem auto 0', lineHeight: 1.6 }}>
            Describe an outfit in your own words — our AI reads every product's full description and finds the closest matches
            by meaning, using <strong style={{ color: 'var(--text-secondary)' }}>all-MiniLM-L6-v2</strong> sentence embeddings.
          </p>

          {/* Search bar */}
          <div style={{ maxWidth: 680, margin: '1.75rem auto 0' }}>
            <div className="search-bar" style={{ padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-xl)', boxShadow: '0 0 30px rgba(167,139,250,0.15)', borderColor: 'var(--border-accent)' }}>
              <span style={{ fontSize: '1.1rem' }}>🧠</span>
              <input
                id="search-input"
                type="text"
                placeholder="Describe what you're looking for naturally…"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setQuery(inputVal); doSearch(inputVal); } }}
                style={{ fontSize: '1rem' }}
                autoFocus
              />
              {inputVal && (
                <button onClick={() => { setInputVal(''); setQuery(''); setResults([]); setEngineInfo(''); }}
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
        {/* Engine info banner */}
        {engineInfo && (
          <div style={{ marginBottom: '1.5rem', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-sm)', background: fellBack ? 'rgba(251,191,36,0.08)' : 'rgba(167,139,250,0.08)', border: `1px solid ${fellBack ? 'rgba(251,191,36,0.25)' : 'var(--border-accent)'}`, fontSize: '0.82rem', color: fellBack ? 'var(--warning)' : 'var(--accent)' }}>
            {fellBack ? '⚠ ' : '✦ '}{engineInfo}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '10rem 0', gap: '1rem' }}>
            <div className="spinner" style={{ width: 50, height: 50 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Running semantic similarity search…</p>
          </div>
        ) : results.length > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>{results.length}</strong> {fellBack ? 'keyword' : 'semantic'} matches for "<em>{query}</em>"
              </p>
              {!fellBack && results[0]?.relevanceScore != null && (
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'rgba(167,139,250,0.1)', padding: '0.25rem 0.75rem', borderRadius: '100px', border: '1px solid var(--border-accent)' }}>
                  Top relevance: {(results[0].relevanceScore * 100).toFixed(1)}%
                </span>
              )}
            </div>

            <div className="product-grid">
              {results.map(p => (
                <div key={p._id} style={{ position: 'relative' }}>
                  {!fellBack && p.relevanceScore != null && (
                    <div style={{ position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 10, background: 'rgba(8,8,16,0.85)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-accent)', borderRadius: '100px', padding: '0.2rem 0.6rem', fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700 }}>
                      {(p.relevanceScore * 100).toFixed(0)}% match
                    </div>
                  )}
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          </>
        ) : query ? (
          <div style={{ textAlign: 'center', padding: '8rem 0', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔍</div>
            <h3 className="title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No matches for "{query}"</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Nothing scored close enough in meaning. Try describing the occasion, colour, or fabric differently.
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '8rem 0' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧠</div>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Describe any outfit in natural language
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              e.g. "elegant embroidered formal wear in warm tones"
            </p>
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
