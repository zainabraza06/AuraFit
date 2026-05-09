'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { productsApi } from '@/lib/api';

const CATEGORIES = ['clothing', 'shoes'];
const BRANDS = ['Beechtree', 'Limelight', 'Khaadi', 'Alkaram Studio', 'Gul Ahmed', 'Stylo', 'ECS', 'Borjan', 'Hush Puppies', 'Ndure', 'Zellbury'];
const COLORS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Orange', 'Gold', 'Grey', 'Brown', 'Teal', 'Multicolor'];
const OCCASIONS = ['casual', 'wedding', 'office', 'party', 'eid', 'formal', 'mehndi'];

function DiscoverContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<any>(null);
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    brand:    searchParams.get('brand')    || '',
    color:    searchParams.get('color')    || '',
    occasion: searchParams.get('occasion') || '',
    page:     searchParams.get('page')     || '1',
    limit:    '16',
  });

  const fetchProducts = async (f: typeof filters) => {
    setLoading(true);
    try {
      const res = await productsApi.list(f);
      setProducts(res.data.products ?? []);
      setPagination(res.data.pagination ?? null);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(filters); }, [filters]);

  const updateFilter = (key: string, value: string) => {
    const next = { ...filters, [key]: value, page: '1' };
    setFilters(next);
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => { if (v && v !== '1' && k !== 'limit') params.set(k, v); });
    router.push(`/discover?${params.toString()}`);
  };

  const clearAll = () => {
    setFilters({ category: '', brand: '', color: '', occasion: '', page: '1', limit: '16' });
    router.push('/discover');
  };

  const activeFilterCount = [filters.category, filters.brand, filters.color, filters.occasion].filter(Boolean).length;

  return (
    <main className="page">
      {/* Page header */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '3rem 0' }}>
        <div className="container">
          <span className="section-label">✦ Discover</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>
            Explore <em className="gradient-text">Collections</em>
          </h1>
          <p className="subtitle" style={{ marginTop: '0.5rem' }}>
            {pagination?.total != null
              ? `${pagination.total.toLocaleString()} products from Pakistan's top brands`
              : 'Browsing all collections'}
          </p>
        </div>
      </div>

      <div className="container" style={{ padding: '3rem clamp(1rem,4vw,3rem)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2.5rem', alignItems: 'start' }}>

          {/* ── Sidebar ── */}
          <aside>
            <div className="glass-card" style={{ padding: '1.5rem', position: 'sticky', top: 'calc(var(--nav-h) + 1.5rem)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
                  Filters {activeFilterCount > 0 && <span style={{ color: 'var(--accent)', marginLeft: '0.4rem' }}>({activeFilterCount})</span>}
                </h3>
                {activeFilterCount > 0 && (
                  <button onClick={clearAll} style={{ fontSize: '0.75rem', color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Clear all
                  </button>
                )}
              </div>

              {[
                { label: 'Category', key: 'category', options: CATEGORIES },
                { label: 'Brand',    key: 'brand',    options: BRANDS },
                { label: 'Color',    key: 'color',    options: COLORS },
                { label: 'Occasion', key: 'occasion', options: OCCASIONS },
              ].map(({ label, key, options }) => (
                <div key={key} className="form-group">
                  <label className="form-label">{label}</label>
                  <select
                    className="input"
                    value={(filters as any)[key]}
                    onChange={(e) => updateFilter(key, e.target.value)}
                    style={{ appearance: 'none', cursor: 'pointer' }}
                  >
                    <option value="">All {label}s</option>
                    {options.map((o) => (
                      <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Product Grid ── */}
          <div>
            {/* Sort / result count bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              {pagination && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Showing <strong style={{ color: 'var(--text-secondary)' }}>{products.length}</strong> of {pagination.total?.toLocaleString() ?? '…'} results
                </p>
              )}
              {/* Active filter chips */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { key: 'category', val: filters.category },
                  { key: 'brand',    val: filters.brand },
                  { key: 'color',    val: filters.color },
                  { key: 'occasion', val: filters.occasion },
                ].filter(f => f.val).map(f => (
                  <button
                    key={f.key}
                    className="chip active"
                    onClick={() => updateFilter(f.key, '')}
                    style={{ fontSize: '0.72rem' }}
                  >
                    {f.val} ×
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10rem 0' }}>
                <div className="spinner" style={{ width: 50, height: 50 }} />
              </div>
            ) : products.length > 0 ? (
              <>
                <div className="product-grid">
                  {products.map((p) => <ProductCard key={p._id} product={p} />)}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '3.5rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pagination.page <= 1}
                      onClick={() => setFilters(f => ({ ...f, page: String(f.page - 1) }))}
                    >← Prev</button>
                    {Array.from({ length: Math.min(pagination.totalPages, 10) }, (_, i) => i + 1).map((pg) => (
                      <button
                        key={pg}
                        className={`btn btn-sm ${Number(filters.page) === pg ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => { setFilters(f => ({ ...f, page: String(pg) })); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      >
                        {pg}
                      </button>
                    ))}
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setFilters(f => ({ ...f, page: String(Number(f.page) + 1) }))}
                    >Next →</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '8rem 0', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔍</div>
                <h3 className="title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No products found</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Try adjusting your filters.</p>
                <button className="btn btn-secondary" onClick={clearAll}>Clear Filters</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// useSearchParams needs Suspense boundary in Next.js 13+
export default function DiscoverPage() {
  return (
    <Suspense fallback={
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" style={{ width: 50, height: 50 }} />
      </div>
    }>
      <DiscoverContent />
    </Suspense>
  );
}
