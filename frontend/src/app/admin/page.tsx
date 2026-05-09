'use client';
import { useState, useEffect, useRef } from 'react';
import { adminApi, authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface LogEntry { type: string; message: string; timestamp?: string; stats?: any; }

export default function AdminDashboard() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [streamLogs, setStreamLogs] = useState<LogEntry[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Change password state
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ─── Auth gate ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('fashion_token');
    const user  = localStorage.getItem('fashion_user');
    if (!token || !user) { router.replace('/login'); return; }
    try {
      const u = JSON.parse(user);
      if (u.role !== 'admin') { router.replace('/'); return; }
      setAuthed(true);
    } catch {
      router.replace('/login');
    } finally {
      setChecking(false);
    }
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, logsRes, statusRes] = await Promise.all([
        adminApi.stats(),
        adminApi.scraperLogs(10),
        adminApi.scraperStatus(),
      ]);
      setStats(statsRes.data);
      setLogs(logsRes.data.logs ?? []);
      setStatus(statusRes.data);
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        localStorage.removeItem('fashion_token');
        localStorage.removeItem('fashion_user');
        router.replace('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    fetchData();
    esRef.current = adminApi.scraperStream(
      (data) => {
        setSseConnected(true);
        if (data.type !== 'connected') {
          setStreamLogs((prev) => [{ ...data, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 60));
        }
        if (data.type === 'completed' || data.type === 'error') fetchData();
      },
      () => setSseConnected(false)
    );
    return () => { esRef.current?.close(); };
  }, [authed]);

  useEffect(() => { logsEndRef.current?.scrollIntoView(); }, [streamLogs]);

  const handleTriggerScrape = async () => {
    if (triggering || status?.isRunning) return;
    setTriggering(true);
    setStreamLogs([]);
    try {
      await adminApi.triggerScrape();
      setStatus((s: any) => ({ ...s, isRunning: true }));
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to start scraper.';
      setStreamLogs([{ type: 'error', message: msg, timestamp: new Date().toLocaleTimeString() }]);
    } finally {
      setTriggering(false);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      return setPwMsg({ type: 'error', text: 'All fields are required.' });
    }
    if (pwForm.next !== pwForm.confirm) {
      return setPwMsg({ type: 'error', text: 'New passwords do not match.' });
    }
    if (pwForm.next.length < 6) {
      return setPwMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
    }
    setPwLoading(true);
    try {
      await authApi.changePassword(pwForm.current, pwForm.next);
      setPwMsg({ type: 'success', text: 'Password changed successfully! Please log in again.' });
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => {
        localStorage.removeItem('fashion_token');
        localStorage.removeItem('fashion_user');
        router.replace('/login');
      }, 2000);
    } catch (err: any) {
      setPwMsg({ type: 'error', text: err?.response?.data?.error || 'Failed to change password.' });
    } finally {
      setPwLoading(false);
    }
  };

  const logColor = (type: string) => {
    if (type === 'completed') return 'var(--success)';
    if (type === 'error') return 'var(--error)';
    if (type === 'started') return 'var(--accent)';
    return 'var(--text-secondary)';
  };

  if (checking || !authed) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><div className="spinner" style={{ width: 50, height: 50 }} /></div>;
  }

  if (loading) {
    return <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><div className="spinner" style={{ width: 50, height: 50 }} /></div>;
  }

  return (
    <main className="page">
      {/* Change Password Modal */}
      {showPwModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 440, padding: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', margin: 0 }}>🔐 Change Password</h2>
              <button onClick={() => { setShowPwModal(false); setPwMsg(null); setPwForm({ current: '', next: '', confirm: '' }); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { label: 'Current Password', key: 'current' },
                { label: 'New Password', key: 'next' },
                { label: 'Confirm New Password', key: 'confirm' },
              ].map(f => (
                <div key={f.key} className="form-group">
                  <label className="form-label">{f.label}</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    value={(pwForm as any)[f.key]}
                    onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleChangePassword(); }}
                  />
                </div>
              ))}
              {pwMsg && (
                <p style={{ fontSize: '0.85rem', color: pwMsg.type === 'success' ? 'var(--success)' : 'var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', background: pwMsg.type === 'success' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${pwMsg.type === 'success' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
                  {pwMsg.text}
                </p>
              )}
              <button className="btn btn-primary" onClick={handleChangePassword} disabled={pwLoading}>
                {pwLoading ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</> : '✓ Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container" style={{ padding: '4rem clamp(1rem,4vw,3rem)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="section-label">✦ Control Center</span>
            <h1 className="title" style={{ marginTop: '0.75rem' }}>Admin Dashboard</h1>
            <p className="subtitle" style={{ marginTop: '0.4rem', fontSize: '0.9rem' }}>
              {sseConnected
                ? <span className="live-badge">Live stream connected</span>
                : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>● Connecting to stream…</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPwModal(true)}>🔐 Change Password</button>
            <button
              id="trigger-scrape-btn"
              className="btn btn-primary btn-lg"
              onClick={handleTriggerScrape}
              disabled={triggering || status?.isRunning}
              style={{ animation: status?.isRunning ? 'pulse-glow 1.5s ease-in-out infinite' : 'none' }}
            >
              {status?.isRunning
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />Scraping…</>
                : triggering ? 'Starting…' : '▶ Trigger Scrape'}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '1.75rem', marginBottom: '4rem' }}>
          {[
            { label: 'Total Products', value: stats?.total ?? 0, color: 'var(--accent)', sub: `Clothing: ${stats?.byCategory?.clothing ?? 0} · Shoes: ${stats?.byCategory?.shoes ?? 0}` },
            { label: 'Active Brands', value: stats?.byBrand?.length ?? 0, color: 'var(--accent-gold)', sub: stats?.byBrand?.[0] ? `Top: ${stats.byBrand[0]._id} (${stats.byBrand[0].count})` : 'No brands yet' },
            { label: 'New This Week', value: `+${stats?.recentWeek ?? 0}`, color: 'var(--accent-teal)', sub: 'Newly scraped products' },
            { label: 'Avg Price', value: stats?.priceRange?.avg ? `PKR ${Math.round(stats.priceRange.avg).toLocaleString()}` : '—', color: 'var(--accent-rose)', sub: `Range: ${stats?.priceRange?.min ?? 0}–${stats?.priceRange?.max ?? 0}` },
          ].map((card) => (
            <div key={card.label} className="glass-card" style={{ padding: '2rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>{card.label}</p>
              <p style={{ fontSize: '2.6rem', fontFamily: 'var(--font-display)', color: card.color, lineHeight: 1 }}>{card.value}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Live Stream + History */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2.5rem', alignItems: 'start' }}>
          {/* Scraper History Table */}
          <div>
            <h2 className="title" style={{ fontSize: '1.6rem', marginBottom: '1.5rem' }}>Scraper History</h2>
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {logs.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p>No scraper runs yet. Trigger one above.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: 'rgba(255,255,255,0.03)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    <tr>
                      <th style={{ padding: '1rem 1.5rem' }}>Run Date</th>
                      <th style={{ padding: '1rem 1.5rem' }}>Status</th>
                      <th style={{ padding: '1rem 1.5rem' }}>Results</th>
                      <th style={{ padding: '1rem 1.5rem' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log._id} style={{ borderTop: '1px solid var(--border)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.88rem' }}>
                          {new Date(log.startedAt).toLocaleString()}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{log.runId?.slice(0, 8)}…</div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span className="tag" style={{ background: log.status === 'completed' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', color: log.status === 'completed' ? 'var(--success)' : 'var(--error)', borderColor: log.status === 'completed' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)' }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem' }}>
                          <div style={{ color: 'var(--success)' }}>+{log.stats?.totalInserted ?? 0} ins</div>
                          <div style={{ color: 'var(--accent)' }}>~{log.stats?.totalUpdated ?? 0} upd</div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {log.durationMs ? `${(log.durationMs / 60000).toFixed(1)}m` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Brand Health + SSE log */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2 className="title" style={{ fontSize: '1.6rem', marginBottom: '1.5rem' }}>Brand Health</h2>
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                {stats?.byBrand?.length > 0 ? stats.byBrand.map((b: any) => (
                  <div key={b._id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{b._id}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{b.count} products</span>
                    </div>
                    <div className="score-bar">
                      <div className="score-bar__fill" style={{ width: `${(b.count / (stats.total || 1)) * 100}%` }} />
                    </div>
                  </div>
                )) : <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No products in database yet.</p>}
              </div>
            </div>

            {/* Live SSE stream log */}
            <div>
              <h2 className="title" style={{ fontSize: '1.6rem', marginBottom: '1.5rem' }}>
                Live Stream
                {status?.isRunning && <span className="live-badge" style={{ marginLeft: '0.75rem', fontSize: '0.65rem' }}>Running</span>}
              </h2>
              <div className="glass-card" style={{ maxHeight: 280, overflowY: 'auto', padding: 0 }}>
                {streamLogs.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {sseConnected ? 'Waiting for scraper events…' : 'Connecting to event stream…'}
                  </div>
                ) : streamLogs.map((entry, i) => (
                  <div key={i} className="log-entry" style={{ color: logColor(entry.type) }}>
                    <span style={{ opacity: 0.5, marginRight: '0.5rem' }}>{entry.timestamp}</span>
                    [{entry.type?.toUpperCase()}] {entry.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
