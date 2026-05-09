'use client';
import { useState, useEffect, useRef } from 'react';
import { adminApi } from '@/lib/api';

interface LogEntry { type: string; message: string; timestamp?: string; stats?: any; }

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [streamLogs, setStreamLogs] = useState<LogEntry[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

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
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Open SSE stream on mount
  useEffect(() => {
    fetchData();

    esRef.current = adminApi.scraperStream(
      (data) => {
        setSseConnected(true);
        if (data.type !== 'connected') {
          setStreamLogs((prev) => [{ ...data, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 60));
        }
        if (data.type === 'completed' || data.type === 'error') {
          fetchData(); // refresh stats after scrape
        }
      },
      () => setSseConnected(false)
    );

    return () => { esRef.current?.close(); };
  }, []);

  // Scroll stream log to top on new entry
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

  const logColor = (type: string) => {
    if (type === 'completed') return 'var(--success)';
    if (type === 'error') return 'var(--error)';
    if (type === 'started') return 'var(--accent)';
    return 'var(--text-secondary)';
  };

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" style={{ width: 50, height: 50 }} />
      </div>
    );
  }

  return (
    <main className="page">
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
          <button
            id="trigger-scrape-btn"
            className="btn btn-primary btn-lg"
            onClick={handleTriggerScrape}
            disabled={triggering || status?.isRunning}
            style={{ animation: status?.isRunning ? 'pulse-glow 1.5s ease-in-out infinite' : 'none' }}
          >
            {status?.isRunning
              ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />Scraping…</>
              : triggering
                ? 'Starting…'
                : '▶ Trigger Scrape'}
          </button>
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
          {/* Left: Scraper History Table */}
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
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {log.runId?.slice(0, 8)}…
                          </div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span className="tag" style={{
                            background: log.status === 'completed' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                            color: log.status === 'completed' ? 'var(--success)' : 'var(--error)',
                            borderColor: log.status === 'completed' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)',
                          }}>
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

          {/* Right: Brand Health + SSE log */}
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
                )) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No products in database yet.</p>
                )}
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
