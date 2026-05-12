'use client';
import Link from 'next/link';

const CATEGORIES = [
  { 
    id: 'clothing', 
    name: 'Luxury Clothing', 
    desc: 'Lawn, Chiffon, Unstitched, and Ready-to-Wear from top designers.',
    icon: '👗',
    image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?q=80&w=800&auto=format&fit=crop'
  },
  { 
    id: 'shoes', 
    name: 'Designer Shoes', 
    desc: 'Heels, Flats, Khussa and Sandals for every occasion.',
    icon: '👠',
    image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800&auto=format&fit=crop'
  },
  { 
    id: 'accessories', 
    name: 'Elite Accessories', 
    desc: 'Jewelry, Bags, and Scarves to complete your look.',
    icon: '✨',
    image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=800&auto=format&fit=crop'
  }
];

const SUBCATS = [
  { name: '2-Piece', parent: 'clothing' },
  { name: '3-Piece', parent: 'clothing' },
  { name: 'Pret', parent: 'clothing' },
  { name: 'Unstitched', parent: 'clothing' },
  { name: 'Western', parent: 'clothing' },
  { name: 'Heels', parent: 'shoes' },
  { name: 'Khussa', parent: 'shoes' },
  { name: 'Sandals', parent: 'shoes' }
];

export default function CategoriesPage() {
  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="section-header">
          <span className="section-label">✦ Browse</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>Collections by Category</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem', marginBottom: '6rem' }}>
          {CATEGORIES.map((cat) => (
            <Link key={cat.id} href={`/discover?category=${cat.id}`} style={{ textDecoration: 'none' }}>
              <div className="product-card" style={{ height: '400px' }}>
                <div className="product-card__image" style={{ height: '100%' }}>
                  <img src={cat.image} alt={cat.name} />
                  <div className="product-card__overlay" style={{ opacity: 1, background: 'linear-gradient(to top, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.2) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start', padding: 'clamp(1.25rem,4vw,2.5rem)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{cat.icon}</div>
                    <h2 className="title" style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>{cat.name}</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '300px' }}>{cat.desc}</p>
                    <span className="btn btn-primary btn-sm" style={{ marginTop: '1.5rem' }}>Explore Category →</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
          <h2 className="title" style={{ marginBottom: '2.5rem' }}>Shop by Style</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {SUBCATS.map((sub) => (
              <Link 
                key={sub.name} 
                href={`/discover?category=${sub.parent}&subCategory=${sub.name.toLowerCase()}`}
                className="btn btn-ghost btn-lg"
                style={{ fontSize: '1.1rem', padding: '1rem 2rem' }}
              >
                {sub.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
