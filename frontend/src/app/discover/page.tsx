'use client';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import { productsApi } from '@/lib/api';

const CATEGORIES = ['clothing', 'shoes', 'accessories'];
const BRANDS = ['Beechtree', 'Limelight', 'Khaadi', 'Alkaram Studio', 'Gul Ahmed', 'Stylo', 'ECS', 'Borjan', 'Hush Puppies', 'Ndure'];
const COLORS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Orange', 'Gold', 'Grey', 'Brown', 'Teal', 'Multicolor'];
const OCCASIONS = ['casual', 'wedding', 'office', 'party', 'eid', 'formal', 'mehndi'];

export default function DiscoverPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<any>(null);
  
  // Filters state
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    brand: searchParams.get('brand') || '',
    color: searchParams.get('color') || '',
    occasion: searchParams.get('occasion') || '',
    page: searchParams.get('page') || '1',
    limit: '12'
  });

  const fetchProducts = async (currentFilters: any) => {
    setLoading(true);
    try {
      const res = await productsApi.list(currentFilters);
      setProducts(res.data.products);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(filters);
  }, [filters]);

  const updateFilter = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value, page: '1' };
    setFilters(newFilters);
    
    // Update URL
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    router.push(`/discover?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage.toString() });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="section-header">
          <span className="section-label">✦ Discover</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>Explore Collections</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '3rem' }}>
          {/* Sidebar Filters */}
          <aside>
            <div className="glass-card" style={{ padding: '1.5rem', position: 'sticky', top: '100px' }}>
              <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Filters</h3>
              
              {/* Category */}
              <div className="form-group">
                <label className="form-label">Category</label>
                <select 
                  className="input" 
                  value={filters.category} 
                  onChange={(e) => updateFilter('category', e.target.value)}
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>

              {/* Brand */}
              <div className="form-group">
                <label className="form-label">Brand</label>
                <select 
                  className="input" 
                  value={filters.brand} 
                  onChange={(e) => updateFilter('brand', e.target.value)}
                >
                  <option value="">All Brands</option>
                  {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Color */}
              <div className="form-group">
                <label className="form-label">Color</label>
                <select 
                  className="input" 
                  value={filters.color} 
                  onChange={(e) => updateFilter('color', e.target.value)}
                >
                  <option value="">All Colors</option>
                  {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Occasion */}
              <div className="form-group">
                <label className="form-label">Occasion</label>
                <select 
                  className="input" 
                  value={filters.occasion} 
                  onChange={(e) => updateFilter('occasion', e.target.value)}
                >
                  <option value="">All Occasions</option>
                  {OCCASIONS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                </select>
              </div>

              <button 
                className="btn btn-ghost btn-sm" 
                style={{ width: '100%', marginTop: '1rem' }}
                onClick={() => {
                  setFilters({ category: '', brand: '', color: '', occasion: '', page: '1', limit: '12' });
                  router.push('/discover');
                }}
              >
                Clear All
              </button>
            </div>
          </aside>

          {/* Product Grid */}
          <div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10rem 0' }}>
                <div className="spinner" />
              </div>
            ) : products.length > 0 ? (
              <>
                <div className="product-grid">
                  {products.map((p) => (
                    <ProductCard key={p._id} product={p} />
                  ))}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '4rem' }}>
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        className={`btn btn-sm ${pagination.page === p ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => handlePageChange(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '10rem 0', color: 'var(--text-secondary)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '1rem' }}>No products found</h3>
                <p>Try adjusting your filters or search for something else.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
