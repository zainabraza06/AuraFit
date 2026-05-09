'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = useCallback((href: string) => pathname === href, [pathname]);

  const links = [
    { href: '/', label: 'Home' },
    { href: '/discover', label: 'Discover' },
    { href: '/favorites', label: 'Favorites' },
    { href: '/wardrobe', label: 'Wardrobe' },
    { href: '/outfits', label: 'Outfit Boards' }
  ];

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="navbar__inner">
        <Link href="/" className="navbar__logo">
          Muse<span>AI</span>
        </Link>

        <ul className="navbar__links">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={isActive(l.href) ? 'active' : ''}>{l.label}</Link>
            </li>
          ))}
        </ul>

        <div className="navbar__actions">
          <Link href="/search/visual" className="btn btn-ghost btn-sm">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
            Visual Search
          </Link>
          <Link href="/admin" className="btn btn-secondary btn-sm">Admin</Link>
        </div>
      </div>
    </nav>
  );
}
