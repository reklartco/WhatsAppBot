import { useApp } from '../../contexts/AppContext';

export default function ConnectionIndicator() {
  const { state } = useApp();
  const conn = state.connectionStatus;

  if (!conn) {
    return (
      <div className="connection-indicator">
        <div className="connection-dot unknown" />
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>...</span>
      </div>
    );
  }

  const isConnected = conn.isConnected;
  const statusClass = isConnected ? 'connected' : 'disconnected';
  const label = isConnected ? 'Bağlı' : (conn.state === 'close' ? 'Kopuk' : 'Bağlantı yok');

  return (
    <div className="connection-indicator">
      <div className={`connection-dot ${statusClass}`} />
      <span style={{ color: isConnected ? 'var(--accent)' : 'var(--danger)', fontSize: 11 }}>
        {label}
      </span>
    </div>
  );
}
