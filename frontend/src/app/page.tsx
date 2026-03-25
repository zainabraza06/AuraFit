'use client';
import { useState } from 'react';
import ChatBox from '@/components/ChatBox';
import RecommendationResult from '@/components/RecommendationResult';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (message: string) => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        throw new Error('Failed to get recommendation');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: '900px', margin: '4rem auto', padding: '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(217, 70, 239, 0.1)', border: '1px solid var(--accent)', borderRadius: '20px', color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>
          AI Fashion Stylist
        </div>
        <h1 className="title-gradient" style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>
          Your Personal Pakistani<br />Fashion Curator
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          Tell me what you're looking for, and I'll scour top brands like Khaadi, Sana Safinaz, and Stylo to build your perfect outfit.
        </p>
      </div>
      
      {/* Input Area */}
      <div style={{ marginBottom: '3rem', position: 'sticky', top: '2rem', zIndex: 10 }}>
        <ChatBox onSend={handleSend} isLoading={loading} />
        {error && <p style={{ color: 'var(--error)', marginTop: '0.5rem', textAlign: 'center', fontSize: '0.9rem' }}>{error}</p>}
      </div>

      {/* Results Area */}
      <div style={{ flex: 1 }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid rgba(217,70,239,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p>Analyzing style intent & matching products...</p>
            </div>
          </div>
        )}
        
        {!loading && data && (
          <RecommendationResult data={data} />
        )}

        {!loading && !data && !error && (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>
            <h3 style={{ marginBottom: '1rem' }}>Waiting for your input</h3>
            <p>Try saying something like "I need a beautiful red dress for my sister's wedding under 25k"</p>
          </div>
        )}
      </div>

    </main>
  );
}
