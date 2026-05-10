'use client';
import { useState, useRef } from 'react';
import ProductCard from '@/components/ProductCard';
import { visualSearchApi } from '@/lib/api';

export default function VisualSearchPage() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setLoading(true);
    setResults([]);
    setAnalysis(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await visualSearchApi.searchByImage(formData);
      setAnalysis(res.data.analysis);
      setResults(res.data.matches || []);
    } catch (err) {
      console.error('Visual search failed', err);
      alert('Failed to analyze the image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="section-header" style={{ textAlign: 'center' }}>
          <span className="section-label">✦ Lens</span>
          <h1 className="title" style={{ marginTop: '0.75rem' }}>Visual Search</h1>
          <p className="subtitle" style={{ marginTop: '0.5rem', maxWidth: '600px', margin: '0.5rem auto 0' }}>
            Upload a photo of an outfit you love, and our AI will find similar products from top Pakistani brands.
          </p>
        </div>

        <div style={{ maxWidth: '800px', margin: '0 auto 4rem', textAlign: 'center' }}>
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleImageUpload} 
          />
          
          {!imagePreview ? (
            <div 
              className="glass-card" 
              style={{ padding: '4rem 2rem', borderStyle: 'dashed', borderColor: 'var(--border-accent)', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📸</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Tap to upload an image</h3>
              <p style={{ color: 'var(--text-muted)' }}>Supports JPG, PNG up to 5MB</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
              <div className="glass-card" style={{ padding: '1rem' }}>
                <img src={imagePreview} alt="Preview" style={{ width: '100%', borderRadius: 'var(--radius-sm)', maxHeight: '400px', objectFit: 'contain' }} />
                <button className="btn btn-ghost" style={{ width: '100%', marginTop: '1rem' }} onClick={() => fileInputRef.current?.click()}>
                  Upload Different Image
                </button>
              </div>
              
              <div style={{ textAlign: 'left' }}>
                {loading ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                    <p className="gradient-text">Gemini is analyzing your image...</p>
                  </div>
                ) : analysis ? (
                  <div className="glass-panel" style={{ padding: '2rem' }}>
                    <h3 style={{ color: 'var(--accent)', marginBottom: '1rem' }}>AI Analysis</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <li><strong style={{ color: 'var(--text-secondary)' }}>Category:</strong> {analysis.category}</li>
                      <li><strong style={{ color: 'var(--text-secondary)' }}>Color:</strong> {analysis.color}</li>
                      <li><strong style={{ color: 'var(--text-secondary)' }}>Style:</strong> {analysis.style}</li>
                      <li>
                        <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Keywords:</strong>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {analysis.keywords?.map((k: string) => <span key={k} className="tag">{k}</span>)}
                        </div>
                      </li>
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div>
            <h2 className="title" style={{ fontSize: '2rem', marginBottom: '2rem', textAlign: 'center' }}>We Found These Matches</h2>
            <div className="product-grid">
              {results.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
