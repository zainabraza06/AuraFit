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
    { href: '/search', label: 'Search' },
    { href: '/categories', label: 'Categories' },
    { href: '/favorites', label: 'Favorites' }
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
          <Link href="/search" className="btn btn-ghost btn-sm">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Search
          </Link>
          <Link href="/admin" className="btn btn-secondary btn-sm">Admin</Link>
        </div>
      </div>
    </nav>
  );
}
