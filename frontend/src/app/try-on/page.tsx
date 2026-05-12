'use client';
import { useState } from 'react';
import { tryonApi } from '@/lib/api';

type Step = 'idle' | 'processing' | 'done' | 'error';

export default function VirtualTryOnPage() {
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [clothingPreview, setClothingPreview] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const readFile = (file: File, setPreview: (s: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setPersonFile(f); readFile(f, setPersonPreview);
  };

  const handleClothingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setClothingFile(f); readFile(f, setClothingPreview);
  };

  const handleGenerate = async () => {
    if (!personFile || !clothingFile) return;
    setStep('processing'); setResultUrl(null); setErrorMsg('');
    const fd = new FormData();
    fd.append('person', personFile);
    fd.append('clothing', clothingFile);
    try {
      const res = await tryonApi.generate(fd);
      setResultUrl(res.data.resultUrl);
      setStep('done');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Try-on failed.';
      const hint = err?.response?.data?.hint || '';
      setErrorMsg(hint ? `${msg} ${hint}` : msg);
      setStep('error');
    }
  };

  const reset = () => {
    setPersonFile(null); setPersonPreview(null);
    setClothingFile(null); setClothingPreview(null);
    setStep('idle'); setResultUrl(null); setErrorMsg('');
  };

  return (
    <main className="page">
      <div className="hero-gradient" />
      <div className="hero-orb" style={{ width: 500, height: 500, top: '-10%', right: '-10%', background: 'radial-gradient(circle, rgba(167,139,250,0.12), transparent 70%)' }} />
      <div className="hero-orb" style={{ width: 350, height: 350, bottom: '5%', left: '-8%', background: 'radial-gradient(circle, rgba(232,121,249,0.08), transparent 70%)', animationDelay: '3s' }} />

      <div className="container" style={{ padding: '5rem 0', position: 'relative', zIndex: 1 }}>
        <div className="section-header fade-up">
          <span className="section-label">✦ AI Fitting Room</span>
          <h1 className="display" style={{ fontSize: 'clamp(2.5rem,6vw,5rem)', marginTop: '0.75rem' }}>
            Virtual <span className="gradient-text">Try-On</span>
          </h1>
          <p className="subtitle" style={{ maxWidth: 560, margin: '1rem auto 0' }}>
            Powered by <strong style={{ color: 'var(--accent)' }}>IDM-VTON</strong> on Replicate. Upload your photo + any clothing item to see yourself wearing it instantly.
          </p>
        </div>

        {/* Steps */}
        <div className="fade-up-d1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', margin: '2.5rem 0 3.5rem', flexWrap: 'wrap' }}>
          {[
            { n: '01', label: 'Your Photo', done: !!personPreview },
            { n: '02', label: 'Clothing Item', done: !!clothingPreview },
            { n: '03', label: 'Generate', done: step === 'done' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', borderRadius: '100px', background: s.done ? 'rgba(167,139,250,0.15)' : 'var(--glass-strong)', border: `1px solid ${s.done ? 'var(--border-accent)' : 'var(--border)'}`, transition: 'all 0.3s ease' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: s.done ? 'var(--accent)' : 'var(--text-muted)' }}>{s.done ? '✓' : s.n}</span>
                <span style={{ fontSize: '0.83rem', color: s.done ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{s.label}</span>
              </div>
              {i < 2 && <div style={{ width: 32, height: 1, background: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {/* Upload zone */}
        {step !== 'done' && (
          <div className="fade-up-d2 resp-grid-2" style={{ maxWidth: 820, margin: '0 auto 3rem' }}>
            <label style={{ cursor: 'pointer', display: 'block' }}>
              <input type="file" accept="image/*" onChange={handlePersonChange} style={{ display: 'none' }} />
              <div className="glass-card" style={{ borderStyle: 'dashed', borderColor: personPreview ? 'var(--accent)' : 'var(--border-accent)', overflow: 'hidden', minHeight: 340 }}>
                {personPreview ? (
                  <>
                    <img src={personPreview} alt="Person" style={{ width: '100%', height: 300, objectFit: 'cover' }} />
                    <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>✓ Your Photo</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click to change</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3.5rem 2rem', gap: '1rem', minHeight: 340 }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(167,139,250,0.1)', border: '1px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🧍</div>
                    <div style={{ textAlign: 'center' }}>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.35rem', fontFamily: 'var(--font-display)' }}>Your Photo</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Full body shot works best</p>
                    </div>
                    <div className="btn btn-ghost btn-sm" style={{ pointerEvents: 'none' }}>Browse Files</div>
                  </div>
                )}
              </div>
            </label>

            <label style={{ cursor: 'pointer', display: 'block' }}>
              <input type="file" accept="image/*" onChange={handleClothingChange} style={{ display: 'none' }} />
              <div className="glass-card" style={{ borderStyle: 'dashed', borderColor: clothingPreview ? 'var(--accent)' : 'var(--border-accent)', overflow: 'hidden', minHeight: 340 }}>
                {clothingPreview ? (
                  <>
                    <img src={clothingPreview} alt="Clothing" style={{ width: '100%', height: 300, objectFit: 'cover' }} />
                    <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>✓ Clothing Item</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click to change</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3.5rem 2rem', gap: '1rem', minHeight: 340 }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(167,139,250,0.1)', border: '1px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>👗</div>
                    <div style={{ textAlign: 'center' }}>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.35rem', fontFamily: 'var(--font-display)' }}>Clothing Item</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Product or flat-lay photo</p>
                    </div>
                    <div className="btn btn-ghost btn-sm" style={{ pointerEvents: 'none' }}>Browse Files</div>
                  </div>
                )}
              </div>
            </label>
          </div>
        )}

        {/* CTA */}
        {(step === 'idle' || step === 'error') && (
          <div className="fade-up-d3" style={{ textAlign: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={!personFile || !clothingFile} style={{ minWidth: 260, fontSize: '1rem', padding: '1.1rem 3rem', boxShadow: '0 0 40px rgba(167,139,250,0.3)' }}>
              ✦ Generate Try-On
            </button>
            {step === 'error' && <p style={{ marginTop: '1rem', color: 'var(--error)', fontSize: '0.88rem', maxWidth: 500, margin: '1rem auto 0' }}>{errorMsg}</p>}
            {!personFile || !clothingFile ? <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Upload both images to continue</p> : null}
          </div>
        )}

        {step === 'processing' && (
          <div className="fade-up" style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '3.5rem 2rem' }}>
              <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 2rem' }}>
                <div className="spinner" style={{ width: 80, height: 80, borderWidth: 4 }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem' }}>👗</div>
              </div>
              <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', marginBottom: '0.75rem' }}>Generating your look…</h3>
              <p style={{ color: 'var(--accent)', fontSize: '0.88rem', marginBottom: '2rem' }}>IDM-VTON is warping the clothing to your body…</p>
              <div className="score-bar"><div className="score-bar__fill" style={{ width: '65%' }} /></div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>Typically takes 30–90 seconds</p>
            </div>
          </div>
        )}

        {step === 'done' && resultUrl && (
          <div className="fade-up" style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="title" style={{ textAlign: 'center', marginBottom: '2rem' }}>Your <span className="gradient-text">Result</span></h2>
            <div className="resp-grid-2" style={{ marginBottom: '2rem' }}>
              <div>
                <p style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Before</p>
                <div className="glass-card" style={{ overflow: 'hidden' }}>
                  <img src={personPreview!} alt="Before" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover' }} />
                </div>
              </div>
              <div>
                <p style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: '0.75rem' }}>✦ After Try-On</p>
                <div className="glass-card" style={{ overflow: 'hidden', border: '1px solid var(--border-accent)', boxShadow: 'var(--shadow-accent)' }}>
                  <img src={resultUrl} alt="Result" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href={resultUrl} download="aurafit-tryon.jpg" className="btn btn-primary btn-lg">⬇ Download</a>
              <button onClick={reset} className="btn btn-ghost btn-lg">Try Another Look</button>
            </div>
          </div>
        )}

        {/* Info cards */}
        <div className="resp-grid-3" style={{ maxWidth: 820, margin: '5rem auto 0' }}>
          {[
            { icon: '🤖', title: 'IDM-VTON', desc: 'State-of-the-art open-source virtual try-on model trained on large fashion datasets' },
            { icon: '⚡', title: 'Replicate', desc: 'GPU-accelerated inference — results in ~30-90 seconds with zero infrastructure' },
            { icon: '🔒', title: 'Privacy First', desc: 'Images are processed in memory and never stored on our servers' },
          ].map((c) => (
            <div key={c.title} className="glass-panel" style={{ padding: '1.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{c.icon}</div>
              <h3 style={{ fontSize: '0.95rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>{c.title}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
