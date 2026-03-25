'use client';
import { useState, useRef, useEffect } from 'react';

export default function ChatBox({ onSend, isLoading }: { onSend: (msg: string) => void, isLoading: boolean }) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSend(message);
      setMessage('');
    }
  };

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  return (
    <form onSubmit={handleSubmit} className="glass-panel" style={{ display: 'flex', gap: '8px', padding: '12px' }}>
      <input
        ref={inputRef}
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g., I need a blue formal dress for a wedding under 20k..."
        style={{
          flex: 1,
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          background: 'rgba(0,0,0,0.3)',
          color: 'var(--text-primary)',
          fontSize: '1rem',
          outline: 'none',
          fontFamily: 'var(--font-main)'
        }}
        disabled={isLoading}
      />
      <button 
        type="submit"
        disabled={isLoading || !message.trim()}
        style={{
          padding: '12px 24px',
          borderRadius: '8px',
          border: 'none',
          background: isLoading ? 'var(--bg-secondary)' : 'var(--accent)',
          color: '#fff',
          fontWeight: 600,
          opacity: isLoading || !message.trim() ? 0.7 : 1,
          transition: 'all 0.2s ease',
          cursor: isLoading || !message.trim() ? 'not-allowed' : 'pointer'
        }}
      >
        {isLoading ? 'Styling...' : 'Send'}
      </button>
    </form>
  );
}
