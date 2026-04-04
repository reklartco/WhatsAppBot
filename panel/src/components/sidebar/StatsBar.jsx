import { useApp } from '../../contexts/AppContext';

function formatMoney(amount) {
  if (!amount) return '0';
  return Number(amount).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

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
      {stats.sales && (
        <>
          <div className="stat-chip stat-chip-revenue">
            <span className="stat-value">₺{formatMoney(stats.sales.today?.revenue)}</span>
            <span>Bugün</span>
          </div>
          <div className="stat-chip stat-chip-revenue">
            <span className="stat-value">₺{formatMoney(stats.sales.week?.revenue)}</span>
            <span>Hafta</span>
          </div>
          <div className="stat-chip stat-chip-revenue">
            <span className="stat-value">₺{formatMoney(stats.sales.month?.revenue)}</span>
            <span>Ay</span>
          </div>
        </>
      )}
    </div>
  );
}
