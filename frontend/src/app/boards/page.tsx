'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { outfitsApi } from '@/lib/api';

export default function BoardsPage() {
  const [boards, setBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('fashion_token');
    if (!token) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    fetchBoards();
  }, []);

  const fetchBoards = async () => {
    try {
      const res = await outfitsApi.list();
      setBoards(res.data);
    } catch (err) {
      console.error('Failed to fetch boards', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      await outfitsApi.remove(id);
      setBoards(boards.filter(b => b._id !== id));
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  if (loading) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><div className="spinner" /></div>;
  }

  if (!authorized) {
    return (
      <div className="page auth-bg">
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
          <h2 className="title" style={{ marginBottom: '1.5rem' }}>Login Required</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Please log in to view your saved outfit boards.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link href="/login" className="btn btn-primary">Login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="section-header" style={{ textAlign: 'left' }}>
          <span className="section-label">✦ Lookbooks</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>Outfit Boards</h1>
          <p className="subtitle" style={{ marginTop: '0.5rem' }}>Your AI-curated looks and saved combinations.</p>
        </div>

        {boards.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2rem' }}>
            {boards.map((board) => (
              <div key={board._id} className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>{board.name}</h3>
                    <button onClick={() => deleteBoard(board._id)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', opacity: 0.7 }}>✕</button>
                  </div>
                  {board.occasion?.map((o: string) => <span key={o} className="tag" style={{ marginRight: '0.5rem' }}>#{o}</span>)}
                </div>
                
                <div className="resp-grid-2" style={{ padding: '1.5rem', gap: '1rem', background: 'var(--bg-secondary)', flex: 1 }}>
                  {board.heroProduct && (
                    <div style={{ aspectRatio: '3/4', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                      <img src={board.heroProduct.imageUrl || board.heroProduct.images?.[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  {board.accessories?.[0] && (
                    <div style={{ aspectRatio: '3/4', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                      <img src={board.accessories[0].imageUrl || board.accessories[0].images?.[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                </div>

                {board.stylistReasoning && (
                  <div style={{ padding: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', borderTop: '1px solid var(--border)' }}>
                    "{board.stylistReasoning}"
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '6rem 2rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎨</div>
            <h3 className="title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No boards yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Use the AI Stylist on the home page or product pages to generate and save outfit boards.</p>
            <Link href="/" className="btn btn-primary">Try AI Stylist</Link>
          </div>
        )}
      </div>
    </main>
  );
}
