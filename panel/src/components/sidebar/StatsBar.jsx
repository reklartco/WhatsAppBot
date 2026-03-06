import { useApp } from '../../contexts/AppContext';

export default function StatsBar() {
  const { state } = useApp();
  const stats = state.stats;

  if (!stats) return null;

  return (
    <div className="stats-bar">
      <div className="stat-chip">
        <span className="stat-value">{stats.realtime?.totalConversations || 0}</span>
        <span>Konuşma</span>
      </div>
      <div className="stat-chip">
        <span className="stat-value">{stats.realtime?.activeHandoffs || 0}</span>
        <span>Bekleyen</span>
      </div>
      <div className="stat-chip">
        <span className="stat-value">{stats.today?.ordersCreated || 0}</span>
        <span>Sipariş</span>
      </div>
      <div className="stat-chip">
        <span className="stat-value">{stats.realtime?.todayMessages || 0}</span>
        <span>Mesaj</span>
      </div>
    </div>
  );
}
