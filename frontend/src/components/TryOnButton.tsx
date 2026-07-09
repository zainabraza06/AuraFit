'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { tryonApi, authApi } from '@/lib/api';

type Step = 'idle' | 'processing' | 'done' | 'error' | 'no-auth' | 'no-pic' | 'bad-photo';

/** Builds a clean garment description from a product's real fields (color, dress style,
 * pieces, print) instead of the raw scraped title — better text-conditioning for the AI.
 * IMPORTANT: dressStyle (e.g. 'kameez', 'shalwar-kameez', 'maxi', 'lehenga') is always
 * included because the backend uses it to set is_checked_crop correctly — long eastern
 * garments need crop=false so the kameez covers the full body, not just the shirt region. */
export function buildGarmentDescription(p: any): string {
  if (!p) return '';
  const parts = [
    p.primaryExactColor || p.primaryColor,
    p.print,
    p.pieces ? `${p.pieces}-piece` : null,
    p.dressStyle,          // e.g. 'kameez', 'shalwar-kameez', 'maxi', 'lehenga' — drives crop-mode
    p.subCategory,         // e.g. 'mens-shalwar-kameez', '2-piece' — backup keyword
    p.fabric
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : p.name;
}

interface Props {
  productImage?: string;
  /** Additional product images — used for 2-piece outfits: [0] = top/kameez, [1] = trouser/shalwar */
  productImages?: string[];
  productName?: string;
  /** Richer garment description (color/style/pieces) — improves AI fit quality over the raw product title. Falls back to productName. */
  productDescription?: string;
  /** Number of pieces in the outfit (2 = shirt+trouser, 3 = shirt+trouser+dupatta) */
  pieces?: number;
  /** compact = small pill for card overlays; full = normal button */
  variant?: 'compact' | 'full';
}

/**
 * "Try On Yourself" — runs Virtual Try-On using the logged-in user's saved profile
 * picture as the person image and the given product image as the garment.
 * Prompts to log in / set a profile picture when those are missing.
 */
export default function TryOnButton({ productImage, productImages, productName, productDescription, pieces, variant = 'compact' }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [resultUrl, setResultUrl] = useState('');
  const [personUrl, setPersonUrl] = useState('');
  const [err, setErr] = useState('');
  const [mounted, setMounted] = useState(false);
  const [passLabel, setPassLabel] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const resolveProfilePic = async (): Promise<string> => {
    let pic = '';
    try {
      const raw = localStorage.getItem('user');
      if (raw) pic = JSON.parse(raw).profilePicture || '';
    } catch { /* ignore */ }
    if (pic) return pic;
    // Fall back to a fresh /me lookup (localStorage may predate the avatar feature).
    try {
      const res = await authApi.me();
      pic = res.data?.user?.profilePicture || '';
      if (pic) {
        const raw = localStorage.getItem('user');
        const u = raw ? JSON.parse(raw) : {};
        localStorage.setItem('user', JSON.stringify({ ...u, profilePicture: pic }));
      }
    } catch { /* ignore */ }
    return pic;
  };

  const start = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!productImage && !productImages?.length) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('fashion_token') : null;
    if (!token) { setOpen(true); setStep('no-auth'); return; }

    const pic = await resolveProfilePic();
    if (!pic) { setOpen(true); setStep('no-pic'); return; }

    setPersonUrl(pic);
    setOpen(true);
    setStep('processing');
    setErr('');
    setResultUrl('');

    // Resolve the top and optional bottom garment URLs
    // productImages[0] = top (shirt/kameez), productImages[1] = bottom (trouser/shalwar)
    const allImages = productImages?.length ? productImages : (productImage ? [productImage] : []);
    const topImageUrl    = allImages[0] || productImage || '';
    const bottomImageUrl = (pieces && pieces >= 2 && allImages[1]) ? allImages[1] : null;

    try {
      if (bottomImageUrl) {
        // 2-pass try-on for multi-piece outfits
        setPassLabel('Step 1/2 — Fitting top garment…');
        const descTop = productDescription ? `${productDescription} top/kameez` : productName || '';
        const descBot = productDescription ? `${productDescription} trouser/shalwar` : productName || '';
        const res = await tryonApi.generateMultiFromUrls(pic, topImageUrl, bottomImageUrl, descTop, descBot);
        setPassLabel(res.data.passes === 2 ? 'Both pieces fitted!' : 'Top piece fitted');
        setResultUrl(res.data.resultUrl);
        setStep('done');
      } else {
        // Single-pass try-on
        const res = await tryonApi.generateFromUrls(pic, topImageUrl, productDescription || productName);
        setResultUrl(res.data.resultUrl);
        setStep('done');
      }
    } catch (e: any) {
      if (e?.response?.data?.reason === 'bad_person_photo') {
        setErr(e.response.data.error);
        setStep('bad-photo');
        return;
      }
      const msg = e?.response?.data?.error || 'Try-on failed. Please try again.';
      const hint = e?.response?.data?.hint || '';
      setErr(hint ? `${msg} ${hint}` : msg);
      setStep('error');
    }
  };

  const close = (e?: React.MouseEvent) => { e?.stopPropagation(); setOpen(false); setStep('idle'); setPassLabel(''); };

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={variant === 'full' ? 'btn btn-secondary btn-sm' : ''}
        style={variant === 'compact' ? {
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.32rem 0.7rem', borderRadius: '100px', cursor: 'pointer',
          fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap',
          background: 'rgba(8,8,16,0.82)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-accent)', color: 'var(--accent)',
        } : { whiteSpace: 'nowrap' }}
        aria-label="Try this on yourself with AI"
        title="Try this on yourself with AI"
      >
        ✦ Try On
      </button>

      {open && mounted && createPortal(
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,4,10,0.72)',
            backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '1.25rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card"
            style={{ maxWidth: 760, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '1.75rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                Virtual <span className="gradient-text">Try-On</span>
              </h3>
              <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {step === 'no-auth' && (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔐</div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Please log in to try items on yourself.</p>
                <button className="btn btn-primary" onClick={() => router.push('/login')}>Log In</button>
              </div>
            )}

            {step === 'no-pic' && (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📷</div>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Set a profile picture first</h4>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem', maxWidth: 380, margin: '0 auto 0.75rem' }}>
                  We use your profile photo as the model for AI try-on. Add one to your account, then come back.
                </p>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.78rem', maxWidth: 380, margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                  Tip: a well-lit, front-facing, full-length photo gives the best fit — the AI can only place the outfit on the part of you that's actually in frame.
                </p>
                <button className="btn btn-primary" onClick={() => router.push('/account')}>Set Profile Picture →</button>
              </div>
            )}

            {step === 'bad-photo' && (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🙈</div>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>We need a clearer photo</h4>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', maxWidth: 380, margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                  {err}
                </p>
                <button className="btn btn-primary" onClick={() => router.push('/account')}>Update Profile Picture →</button>
              </div>
            )}

            {step === 'processing' && (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 1.5rem' }}>
                  <div className="spinner" style={{ width: 72, height: 72, borderWidth: 4 }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>👗</div>
                </div>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '0.5rem' }}>Generating your look…</h4>
                <p style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>
                  {passLabel || 'IDM-VTON is fitting the garment to your photo'}
                </p>
                {pieces && pieces >= 2 && (
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                    Full outfit = 2 AI passes — shirt first, then trouser
                  </p>
                )}
                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>Typically {pieces && pieces >= 2 ? '2–4' : '1–2'} minutes</p>
              </div>
            )}

            {step === 'error' && (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
                <p style={{ color: 'var(--error)', marginBottom: '1.5rem', fontSize: '0.88rem', maxWidth: 460, margin: '0 auto 1.5rem' }}>{err}</p>
                <button className="btn btn-ghost" onClick={close}>Close</button>
              </div>
            )}

            {step === 'done' && resultUrl && (
              <div>
                <div className="resp-grid-2" style={{ marginBottom: '1.5rem' }}>
                  <div>
                    <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>You</p>
                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                      <img src={personUrl} alt="You" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover' }} />
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: '0.5rem' }}>✦ Wearing {productName ? `“${productName.slice(0, 28)}”` : 'this'}</p>
                    <div className="glass-card" style={{ overflow: 'hidden', border: '1px solid var(--border-accent)' }}>
                      <img src={resultUrl} alt="Try-on result" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover' }} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href={resultUrl} download="aurafit-tryon.jpg" className="btn btn-primary">⬇ Download</a>
                  <button className="btn btn-ghost" onClick={close}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
