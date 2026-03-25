'use client';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <nav style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
      <Link href="/">
        <span className="title-gradient" style={{ fontSize: '1.5rem', fontWeight: 700 }}>AI Stylist</span>
      </Link>
      
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <Link href="/" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Home</Link>
        {user ? (
          <>
            <span style={{ fontWeight: 500, color: 'var(--accent)' }}>Welcome, {user.name}</span>
            <button 
              onClick={handleLogout}
              style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/login" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Login</Link>
            <Link href="/register" style={{ padding: '8px 16px', background: 'var(--accent)', borderRadius: '6px', color: '#fff', fontWeight: 600 }}>Sign Up</Link>
          </>
        )}
      </div>
    </nav>
  );
}
