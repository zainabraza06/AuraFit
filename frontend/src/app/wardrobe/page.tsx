'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { wardrobeApi } from '@/lib/api';

const CATEGORIES = ['All', 'clothing', 'shoes', 'accessories'];

export default function WardrobePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [authorized, setAuthorized] = useState(true);
  const [filter, setFilter] = useState('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localStorage.getItem('fashion_token')) { setAuthorized(false); setLoading(false); return; }
    wardrobeApi.list().then(r => setItems(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append('image', file);
    try { const r = await wardrobeApi.add(fd); setItems(prev => [r.data, ...prev]); }
    catch { alert('Upload failed. Please try again.'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const filtered = filter === 'All' ? items : items.filter(i => i.category === filter);

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><div className="spinner" style={{ width: 48, height: 48 }} /></div>;

  if (!authorized) return (
    <div className="page auth-bg">
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>👗</div>
        <h2 className="title" style={{ marginBottom: '1rem' }}>Your Digital Wardrobe</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: 360, margin: '0 auto 2rem' }}>Log in to upload your clothes and let AI organize your closet automatically.</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link href="/login" className="btn btn-primary btn-lg">Login</Link>
          <Link href="/register" className="btn btn-ghost btn-lg">Register</Link>
        </div>
      </div>
    </div>
  );

  return (
    <main className="page">
      <div className="hero-gradient" />
      <div className="container" style={{ padding: '4.5rem 0', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2.5rem' }} className="fade-up">
          <div>
            <span className="section-label">✦ My Closet</span>
            <h1 className="title" style={{ marginTop: '0.75rem', fontSize: 'clamp(1.8rem,4vw,3rem)' }}>Digital Wardrobe</h1>
            <p className="subtitle" style={{ marginTop: '0.4rem' }}>Upload your clothes — Gemini auto-tags category, color & style.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleUpload} />
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ gap: '0.5rem' }}>
              {uploading
                ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analyzing…</>
                : <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> Add Item</>}
            </button>
          </div>
        </div>

        {/* Category tabs */}
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => (
              <button key={c} className={`chip ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)} style={{ textTransform: 'capitalize' }}>
                {c}
              </button>
            ))}
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="product-grid fade-up">
            {filtered.map((item) => (
              <div key={item._id} className="glass-card" style={{ overflow: 'hidden', cursor: 'default' }}>
                <div style={{ aspectRatio: '3/4', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')} />
                </div>
                <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
                  <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: '0.3rem', fontWeight: 700 }}>{item.subCategory || item.category}</p>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '0.6rem', lineHeight: 1.3 }}>{item.name || 'Wardrobe Item'}</h3>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {item.primaryColor && <span className="tag" style={{ borderColor: 'rgba(167,139,250,0.2)', color: 'var(--accent)' }}>{item.primaryColor}</span>}
                    {item.tags?.slice(0, 3).map((t: string) => <span key={t} className="tag">{t}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel fade-up" style={{ textAlign: 'center', padding: '7rem 2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1.25rem' }}>👕</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', marginBottom: '0.75rem' }}>
              {filter !== 'All' ? `No ${filter} items yet` : 'Your wardrobe is empty'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: 420, margin: '0 auto 2rem' }}>
              Upload a photo of any clothing item and Gemini will automatically categorize, color-detect, and tag it.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => fileInputRef.current?.click()}>
              Upload First Item
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
