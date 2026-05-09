'use client';
import Link from 'next/link';
import { useState } from 'react';
import { favoritesApi } from '@/lib/api';

interface Product {
  _id: string;
  name: string;
  brand: string;
  price: number;
  primaryColor?: string;
  colors?: string[];
  category: string;
  subCategory?: string;
  occasion?: string[];
  images?: string[];
  imageUrl?: string;
  compareAtPrice?: number;
}

interface ProductCardProps {
  product: Product;
  showBadge?: string;
  width?: number;
}

export default function ProductCard({ product, showBadge, width }: ProductCardProps) {
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  const imageUrl = product.imageUrl || product.images?.[0] || '/placeholder.jpg';
  const isOnSale = product.compareAtPrice && product.compareAtPrice > product.price;

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (favLoading) return;
    const token = localStorage.getItem('fashion_token');
    if (!token) { alert('Please login to save favorites'); return; }
    setFavLoading(true);
    try {
      const res = await favoritesApi.toggle(product._id);
      setIsFav(res.data.favorited);
    } catch { /* silent */ }
    finally { setFavLoading(false); }
  };

  return (
    <div className="product-card" style={width ? { width } : {}}>
      <Link href={`/product/${product._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        {/* Image */}
        <div className="product-card__image">
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
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
            {product.primaryColor && (
              <span className="tag">{product.primaryColor}</span>
            )}
            {product.subCategory && (
              <span className="tag">{product.subCategory}</span>
            )}
          </div>
        </div>
      </Link>

      {/* Favorite button (outside link to prevent navigation) */}
      <button
        className={`product-card__fav ${isFav ? 'active' : ''}`}
        onClick={toggleFavorite}
        disabled={favLoading}
        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFav ? '♥' : '♡'}
      </button>
    </div>
  );
}
