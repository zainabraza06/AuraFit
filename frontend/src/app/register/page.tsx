'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [picture, setPicture] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    setError('');
    setPicture(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authApi.register(name, email, password, picture);
      localStorage.setItem('fashion_token', res.data.token);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page auth-bg">
      <div className="container" style={{ maxWidth: '480px' }}>
        <div className="glass-card" style={{ padding: '3rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h1 className="title">Join AuraFit</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Start your AI-powered fashion journey</p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Optional profile picture */}
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: 68, height: 68, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                  border: '1px dashed var(--border-accent)', background: preview ? `center/cover no-repeat url(${preview})` : 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.4rem', overflow: 'hidden'
                }}
                aria-label="Upload profile picture"
              >
                {!preview && '📷'}
              </button>
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>Profile picture <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.4 }}>
                  Used later for AI tools like Virtual Try-On. You can add or change it anytime.
                </p>
                {preview && (
                  <button type="button" onClick={() => { setPicture(null); setPreview(''); if (fileRef.current) fileRef.current.value = ''; }}
                    style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.72rem', cursor: 'pointer', padding: 0, marginTop: '0.25rem' }}>
                    Remove
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input 
                type="text" 
                className="input" 
                placeholder="John Doe" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input 
                type="email" 
                className="input" 
                placeholder="name@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input 
                type="password" 
                className="input" 
                placeholder="Min. 6 characters" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginBottom: '1.5rem' }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Already have an account? <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Login</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
