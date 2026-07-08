'use client';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { favoritesApi } from '@/lib/api';
import TryOnButton, { buildGarmentDescription } from './TryOnButton';

interface Product {
  _id?: string;
  id?: string;
  name: string;
  brand: string;
  price: number;
  primaryColor?: string;
  colors?: string[];
  category?: string;
  subCategory?: string;
  occasion?: string[];
  images?: string[];
  imageUrl?: string;
  compareAtPrice?: number;
}

function normalizeProductId(product: Product): string | null {
  const raw = product._id ?? product.id;
  if (raw == null) return null;
  const s =
    typeof raw === 'object' && raw !== null && '$oid' in (raw as Record<string, unknown>)
      ? String((raw as { $oid: string }).$oid)
      : String(raw);
  return /^[a-f0-9]{24}$/i.test(s) ? s : null;
}

interface ProductCardProps {
  product: Product;
  showBadge?: string;
  width?: number;
  /** When true, heart starts filled (e.g. on /favorites). Skips initial network check. */
  favoritedOverride?: boolean;
}

export default function ProductCard({ product, showBadge, width, favoritedOverride }: ProductCardProps) {
  const [isFav, setIsFav] = useState(!!favoritedOverride);
  const [favLoading, setFavLoading] = useState(false);

  const productId = normalizeProductId(product);

  useEffect(() => {
    setIsFav(!!favoritedOverride);
  }, [favoritedOverride, productId]);

  useEffect(() => {
    if (favoritedOverride || !productId) return;
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('fashion_token');
    if (!token) return;

    let cancelled = false;
    favoritesApi
      .check(productId)
      .then((res) => {
        if (!cancelled) setIsFav(!!res.data?.favorited);
      })
      .catch(() => {
        /* 401 / network — leave default */
      });
    return () => {
      cancelled = true;
    };
  }, [productId, favoritedOverride]);

  const imageUrl = product.imageUrl || product.images?.[0] || '/placeholder.jpg';
  const isOnSale = product.compareAtPrice && product.compareAtPrice > product.price;

  const toggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (favLoading) return;
      const token = localStorage.getItem('fashion_token');
      if (!token) {
        alert('Please login to save favorites');
        return;
      }
      if (!productId) {
        alert('This item cannot be saved (missing product id).');
        return;
      }
      setFavLoading(true);
      try {
        const res = await favoritesApi.toggle(productId);
        setIsFav(!!res.data?.favorited);
      } catch (err: unknown) {
        const ax = err as { response?: { status?: number; data?: { error?: string } } };
        const status = ax.response?.status;
        const msg = ax.response?.data?.error;
        if (status === 401) alert('Session expired — please log in again.');
        else if (status === 404) alert(msg || 'Product not found in catalog.');
        else alert(msg || 'Could not update favorites. Please try again.');
      } finally {
        setFavLoading(false);
      }
    },
    [favLoading, productId]
  );

  if (!productId) {
    return (
      <div className="product-card" style={width ? { width } : {}}>
        <div className="product-card__image">
          <img src={imageUrl} alt={product.name} loading="lazy" />
        </div>
        <div className="product-card__body">
          <p className="product-card__brand">{product.brand}</p>
          <h3 className="product-card__name">{product.name}</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="product-card" style={width ? { width } : {}}>
      <Link href={`/product/${productId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        {/* Image */}
        <div className="product-card__image">
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder.jpg';
            }}
          />
          {/* Overlay with quick-view */}
          <div className="product-card__overlay">
            <span className="btn btn-primary btn-sm">View Outfit</span>
          </div>
          {/* Sale badge */}
          {isOnSale && <span className="product-card__badge">Sale</span>}
          {showBadge && !isOnSale && <span className="product-card__badge">{showBadge}</span>}
        </div>

        {/* Body */}
        <div className="product-card__body">
          <p className="product-card__brand">{product.brand}</p>
          <h3 className="product-card__name">{product.name}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span className="product-card__price">PKR {product.price.toLocaleString()}</span>
            {isOnSale && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                PKR {product.compareAtPrice!.toLocaleString()}
              </span>
            )}
          </div>
          {/* Color + Category tags */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            {product.primaryColor && <span className="tag">{product.primaryColor}</span>}
            {product.subCategory && <span className="tag">{product.subCategory}</span>}
          </div>
        </div>
      </Link>

      {/* Favorite button (outside link to prevent navigation) */}
      <button
        type="button"
        className={`product-card__fav ${isFav ? 'active' : ''}`}
        onClick={toggleFavorite}
        disabled={favLoading}
        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFav ? '♥' : '♡'}
      </button>

      {/* Try-On button (outside link to prevent navigation) — top-left over the image */}
      <div style={{ position: 'absolute', left: '0.6rem', top: '0.6rem', zIndex: 5 }}>
        <TryOnButton productImage={imageUrl} productName={product.name} productDescription={buildGarmentDescription(product)} />
      </div>
    </div>
  );
}
