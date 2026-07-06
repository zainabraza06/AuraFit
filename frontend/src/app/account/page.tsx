'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';

const QUICK_LINKS = [
  { href: '/favorites',    icon: '❤️', label: 'Favourites',     desc: 'Your saved products' },
  { href: '/wardrobe',     icon: '👕', label: 'My Wardrobe',    desc: 'Your digital closet' },
  { href: '/boards',       icon: '📋', label: 'Outfit Boards',  desc: 'AI-curated looks' },
  { href: '/try-on',       icon: '👗', label: 'Virtual Try-On', desc: 'See clothes on you' },
  { href: '/search/visual',icon: '📸', label: 'Visual Search',  desc: 'Search by photo' },
];

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string; role: string; profilePicture?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) { router.replace('/login'); return; }
    try {
      const u = JSON.parse(raw);
      if (u.role === 'admin') { router.replace('/admin'); return; }
      setUser(u);
    } catch {
      router.replace('/login');
    } finally {
      setChecking(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('fashion_token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setAvatarMsg('Image must be under 5 MB.'); return; }
    setUploading(true);
    setAvatarMsg('');
    try {
      const res = await authApi.updateProfilePicture(f);
      const updated = { ...user, profilePicture: res.data.profilePicture };
      setUser(updated as any);
      localStorage.setItem('user', JSON.stringify(updated));
      setAvatarMsg('Profile picture updated ✓');
    } catch (err: any) {
      setAvatarMsg(err?.response?.data?.error || 'Upload failed — image hosting may not be configured yet.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (checking || !user) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><div className="spinner" style={{ width: 50, height: 50 }} /></div>;
  }

  const initials = user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <main className="page">
      {/* Header */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '3.5rem 0' }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <span className="section-label">✦ My Account</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {/* Avatar (click to upload/change) */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Upload or change profile picture"
                style={{
                  width: 72, height: 72, borderRadius: '50%', cursor: uploading ? 'wait' : 'pointer', padding: 0, overflow: 'hidden',
                  border: '1px solid var(--border-accent)',
                  background: user.profilePicture ? `center/cover no-repeat url(${user.profilePicture})` : 'linear-gradient(135deg, var(--accent), var(--accent-warm))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 700, color: '#0a0a12', fontFamily: 'var(--font-display)',
                }}
              >
                {uploading ? <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} /> : (user.profilePicture ? '' : initials)}
              </button>
              <span style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', pointerEvents: 'none' }}>📷</span>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 className="title" style={{ marginBottom: '0.25rem' }}>{user.name}</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{user.email}</p>
              {avatarMsg && <p style={{ fontSize: '0.75rem', color: avatarMsg.includes('✓') ? 'var(--success)' : 'var(--error)', marginTop: '0.3rem' }}>{avatarMsg}</p>}
            </div>
            <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="container" style={{ maxWidth: 720, padding: '3rem clamp(1rem,4vw,3rem)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>Quick Access</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {QUICK_LINKS.map(l => (
            <Link key={l.href} href={l.href} style={{ textDecoration: 'none' }}>
              <div className="glass-card" style={{ padding: '1.25rem 1.5rem', cursor: 'pointer', transition: 'border-color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{l.icon}</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{l.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
