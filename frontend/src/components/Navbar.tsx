'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isActive = useCallback((href: string) => pathname === href, [pathname]);

  const links = [
    { href: '/',         label: 'Home' },
    { href: '/discover', label: 'Discover' },
    { href: '/search',   label: 'Search' },
    { href: '/favorites',label: 'Favourites' },
    { href: '/wardrobe', label: 'Wardrobe' },
  ];

  return (
    <>
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="navbar__inner">
          {/* Logo */}
          <Link href="/" className="navbar__logo">
            Muse<span>AI</span>
          </Link>

          {/* Desktop links */}
          <ul className="navbar__links">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={isActive(l.href) ? 'active' : ''}>{l.label}</Link>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="navbar__actions">
            <Link href="/search/visual" className="btn btn-ghost btn-sm" style={{ gap: '0.4rem' }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Visual
            </Link>
            <Link href="/admin" className="btn btn-secondary btn-sm">Admin</Link>

            {/* Mobile hamburger */}
            <button
              id="mobile-menu-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{
                display: 'none',
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '0.45rem',
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
              aria-label="Toggle menu"
              className="mobile-hamburger"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {mobileOpen
                  ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                  : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', top: 'var(--nav-h)', left: 0, right: 0, bottom: 0, zIndex: 99,
          background: 'rgba(8,8,16,0.97)',
          backdropFilter: 'blur(24px)',
          display: 'flex', flexDirection: 'column', padding: '2rem',
          animation: 'fadeIn 0.2s ease',
        }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                padding: '1rem 0', borderBottom: '1px solid var(--border)',
                color: isActive(l.href) ? 'var(--accent)' : 'var(--text-primary)',
                textDecoration: 'none', fontSize: '1.2rem', fontFamily: 'var(--font-display)',
              }}
            >
              {l.label}
            </Link>
          ))}
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <Link href="/search/visual" className="btn btn-ghost">Visual Search</Link>
            <Link href="/admin" className="btn btn-secondary">Admin</Link>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .navbar__links { display: none !important; }
          .mobile-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}
