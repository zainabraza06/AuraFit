'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const AI_LINKS = [
  { href: '/chat',         label: '✨ AI Stylist Chat', desc: 'Get outfit recommendations' },
  { href: '/try-on',       label: '👗 Virtual Try-On',  desc: 'See clothes on you with AI' },
  { href: '/search/visual',label: '📸 Visual Search',   desc: 'Search by photo' },
];

const NAV_LINKS = [
  { href: '/',          label: 'Home' },
  { href: '/discover',  label: 'Discover' },
  { href: '/search',    label: 'Search' },
  { href: '/favorites', label: 'Favourites' },
  { href: '/wardrobe',  label: 'Wardrobe' },
  { href: '/boards',    label: 'Boards' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const s = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', s, { passive: true });
    return () => window.removeEventListener('scroll', s);
  }, []);

  useEffect(() => { setMobileOpen(false); setAiOpen(false); }, [pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setAiOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = useCallback((href: string) => pathname === href, [pathname]);
  const isAiActive = AI_LINKS.some(l => pathname === l.href);

  return (
    <>
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="navbar__inner">
          {/* Logo */}
          <Link href="/" className="navbar__logo">
            Aura<span>Fit</span>
          </Link>

          {/* Desktop links */}
          <ul className="navbar__links" style={{ gap: '1.85rem' }}>
            {NAV_LINKS.map(l => (
              <li key={l.href}>
                <Link href={l.href} className={isActive(l.href) ? 'active' : ''}>{l.label}</Link>
              </li>
            ))}

            {/* AI dropdown */}
            <li style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                onClick={() => setAiOpen(o => !o)}
                style={{
                  background: isAiActive ? 'rgba(167,139,250,0.12)' : 'none',
                  border: isAiActive ? '1px solid var(--border-accent)' : 'none',
                  borderRadius: '100px',
                  padding: isAiActive ? '0.25rem 0.75rem' : 0,
                  color: isAiActive ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  transition: 'all 0.2s ease',
                }}
              >
                AI Tools
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ transform: aiOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {aiOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 12px)', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                  padding: '0.6rem', minWidth: 240, zIndex: 200,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.1)',
                  animation: 'fadeUp 0.15s ease forwards',
                }}>
                  {AI_LINKS.map(l => (
                    <Link key={l.href} href={l.href} style={{ display: 'block', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', textDecoration: 'none', transition: 'background 0.15s ease' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-strong)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: '0.88rem', fontWeight: 500, color: isActive(l.href) ? 'var(--accent)' : 'var(--text-primary)', marginBottom: '0.2rem' }}>{l.label}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{l.desc}</div>
                    </Link>
                  ))}
                </div>
              )}
            </li>
          </ul>

          {/* Actions */}
          <div className="navbar__actions">
            <Link href="/admin" className="btn btn-secondary btn-sm">Admin</Link>
            <button
              onClick={() => setMobileOpen(o => !o)}
              style={{ display: 'none', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.45rem', color: 'var(--text-primary)', cursor: 'pointer' }}
              className="mobile-hamburger"
              aria-label="Toggle menu"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {mobileOpen
                  ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                  : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{ position: 'fixed', top: 'var(--nav-h)', left: 0, right: 0, bottom: 0, zIndex: 99, background: 'rgba(8,8,16,0.97)', backdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', padding: '1.5rem 2rem', overflowY: 'auto', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1.5rem' }}>
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} style={{ padding: '1rem 0', borderBottom: '1px solid var(--border)', color: isActive(l.href) ? 'var(--accent)' : 'var(--text-primary)', textDecoration: 'none', fontSize: '1.15rem', fontFamily: 'var(--font-display)' }}>
                {l.label}
              </Link>
            ))}
          </div>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>AI Tools</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
            {AI_LINKS.map(l => (
              <Link key={l.href} href={l.href} style={{ padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--glass-strong)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                {l.label}
              </Link>
            ))}
          </div>
          <Link href="/admin" className="btn btn-secondary">Admin Dashboard</Link>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .navbar__links { display: none !important; }
          .mobile-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}
