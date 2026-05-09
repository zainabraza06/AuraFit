'use client';
import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchData = async () => {
    try {
      const [statsRes, logsRes, statusRes] = await Promise.all([
        adminApi.stats(),
        adminApi.scraperLogs(10),
        adminApi.scraperStatus()
      ]);
      setStats(statsRes.data);
      setLogs(logsRes.data.logs);
      setStatus(statusRes.data);
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll for status every 10 seconds if a scrape is running
    const interval = setInterval(() => {
      if (status?.isRunning) adminApi.scraperStatus().then(res => setStatus(res.data));
    }, 10000);
    return () => clearInterval(interval);
  }, [status?.isRunning]);

  const handleTriggerScrape = async () => {
    if (triggering || status?.isRunning) return;
    setTriggering(true);
    try {
      await adminApi.triggerScrape();
      await adminApi.scraperStatus().then(res => setStatus(res.data));
      alert('Scraper started in the background.');
    } catch (err) {
      alert('Failed to start scraper.');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <main className="page">
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="section-header" style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <span className="section-label">✦ Control Center</span>
            <h1 className="title" style={{ marginTop: '0.75rem' }}>Admin Dashboard</h1>
          </div>
          <button 
            className={`btn btn-primary btn-lg ${status?.isRunning ? 'disabled' : ''}`}
            onClick={handleTriggerScrape}
            disabled={triggering || status?.isRunning}
          >
            {status?.isRunning ? 'Scraping in Progress...' : 'Trigger Manual Scrape ✦'}
          </button>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '4rem' }}>
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '1rem' }}>Total Products</h3>
            <p style={{ fontSize: '3rem', fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>{stats?.total || 0}</p>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <span className="tag">Clothing: {stats?.byCategory?.clothing || 0}</span>
              <span className="tag">Shoes: {stats?.byCategory?.shoes || 0}</span>
            </div>
          </div>
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '1rem' }}>Active Brands</h3>
            <p style={{ fontSize: '3rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>{stats?.byBrand?.length || 0}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Top: {stats?.byBrand?.[0]?._id} ({stats?.byBrand?.[0]?.count})</p>
          </div>
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '1rem' }}>Last 7 Days</h3>
            <p style={{ fontSize: '3rem', fontFamily: 'var(--font-display)', color: 'var(--accent-teal)' }}>+{stats?.recentWeek || 0}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Newly updated products</p>
          </div>
        </div>

        {/* Scraper Status & Logs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '3rem' }}>
          <div>
            <h2 className="title" style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>Scraper History</h2>
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'rgba(255,255,255,0.03)', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  <tr>
                    <th style={{ padding: '1rem 1.5rem' }}>Run Date</th>
                    <th style={{ padding: '1rem 1.5rem' }}>Status</th>
                    <th style={{ padding: '1rem 1.5rem' }}>Stats</th>
                    <th style={{ padding: '1rem 1.5rem' }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.9rem' }}>
                        {new Date(log.startedAt).toLocaleString()}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {log.runId.slice(0, 8)}...</div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span className="tag" style={{ 
                          background: log.status === 'completed' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                          color: log.status === 'completed' ? 'var(--success)' : 'var(--error)',
                          borderColor: log.status === 'completed' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)'
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem' }}>
                        <div style={{ color: 'var(--success)' }}>+{log.stats?.totalInserted || 0} Ins</div>
                        <div style={{ color: 'var(--accent)' }}>~{log.stats?.totalUpdated || 0} Upd</div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {log.durationMs ? `${(log.durationMs / 1000 / 60).toFixed(1)}m` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside>
            <h2 className="title" style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>Brand Health</h2>
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              {stats?.byBrand?.map((b: any) => (
                <div key={b._id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{b._id}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{b.count} products</span>
                  </div>
                  <div className="score-bar">
                    <div className="score-bar__fill" style={{ width: `${(b.count / stats.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
