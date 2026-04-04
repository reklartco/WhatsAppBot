import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import ConnectionIndicator from '../common/ConnectionIndicator';

function formatMoney(amount) {
  if (!amount) return '0';
  return Number(amount).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

export default function TopHeader() {
  const { state } = useApp();
  const { logout } = useAuth();
  const stats = state.stats;

  return (
    <div className="top-header">
      <div className="top-header-left">
        <h2 className="top-header-title">1Etiket</h2>
        <ConnectionIndicator />
      </div>

      <div className="top-header-stats">
        {stats && (
          <>
            <div className="top-stat">
              <span className="top-stat-value">{stats.realtime?.totalConversations || 0}</span>
              <span className="top-stat-label">Konuşma</span>
            </div>
            <div className="top-stat">
              <span className="top-stat-value top-stat-warning">{stats.realtime?.activeHandoffs || 0}</span>
              <span className="top-stat-label">Bekleyen</span>
            </div>
            <div className="top-stat">
              <span className="top-stat-value">{stats.today?.ordersCreated || 0}</span>
              <span className="top-stat-label">Sipariş</span>
            </div>
            <div className="top-stat">
              <span className="top-stat-value">{stats.realtime?.todayMessages || 0}</span>
              <span className="top-stat-label">Mesaj</span>
            </div>
            <div className="top-stat-divider" />
            {stats.sales && (
              <>
                <div className="top-stat">
                  <span className="top-stat-value top-stat-revenue">{formatMoney(stats.sales.today?.revenue)} TL</span>
                  <span className="top-stat-label">Bugün</span>
                </div>
                <div className="top-stat">
                  <span className="top-stat-value top-stat-revenue">{formatMoney(stats.sales.week?.revenue)} TL</span>
                  <span className="top-stat-label">Hafta</span>
                </div>
                <div className="top-stat">
                  <span className="top-stat-value top-stat-revenue">{formatMoney(stats.sales.month?.revenue)} TL</span>
                  <span className="top-stat-label">Ay</span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="top-header-right">
        <button className="logout-btn" onClick={logout}>Çıkış</button>
      </div>
    </div>
  );
}
