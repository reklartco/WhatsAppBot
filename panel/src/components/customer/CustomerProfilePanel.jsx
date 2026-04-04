import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../api/client';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return Number(amount).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function daysAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Dün';
  return `${days} gün önce`;
}

const segmentLabels = {
  vip: 'VIP',
  normal: 'Normal',
  risk: 'Risk',
  sleeping: 'Uyuyan',
};

const statusLabels = {
  'pending': 'Bekliyor',
  'processing': 'Hazırlanıyor',
  'on-hold': 'Beklemede',
  'completed': 'Tamamlandı',
  'cancelled': 'İptal',
  'refunded': 'İade',
};

export default function CustomerProfilePanel() {
  const { state, updateCustomerBot, setCustomerProfile, setShowProfile } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState(false);

  if (!state.showProfile || !state.selectedPhone) return null;

  const profile = state.customerProfile;
  if (!profile) {
    return (
      <div className="profile-panel">
        <div className="loading-spinner">Yükleniyor...</div>
      </div>
    );
  }

  const customer = profile.customer;
  const conv = profile.conversation;

  const handleBotToggle = async () => {
    setToggling(true);
    try {
      const newValue = !customer.botEnabled;
      await api.toggleBot(state.selectedPhone, newValue);
      updateCustomerBot(newValue);
    } catch (e) { /* silent */ }
    setToggling(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.syncCustomer(state.selectedPhone);
      // Reload profile
      const data = await api.getCustomerProfile(state.selectedPhone);
      setCustomerProfile(data);
    } catch (e) { /* silent */ }
    setSyncing(false);
  };

  const handleSegmentChange = async (segment) => {
    try {
      await api.updateSegment(state.selectedPhone, segment);
      const data = await api.getCustomerProfile(state.selectedPhone);
      setCustomerProfile(data);
    } catch (e) { /* silent */ }
  };

  return (
    <div className="profile-panel">
      {/* Mobile Close Button */}
      <button className="profile-close-btn" onClick={() => setShowProfile(false)}>← Geri</button>
      {/* Profile Card */}
      <div className="profile-card">
        <div className="profile-avatar">{getInitials(customer.name)}</div>
        <div className="profile-name">{customer.name || 'İsimsiz'}</div>
        <div className="profile-phone">{customer.phone}</div>
        <div className="profile-segment">
          <select
            value={customer.segment}
            onChange={(e) => handleSegmentChange(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 10,
              color: `var(--${customer.segment})`,
              textTransform: 'uppercase',
            }}
          >
            <option value="vip">VIP</option>
            <option value="normal">NORMAL</option>
            <option value="risk">RISK</option>
            <option value="sleeping">UYUYAN</option>
          </select>
        </div>
      </div>

      {/* Bot Toggle */}
      <div className="bot-toggle">
        <span className="toggle-label">Sipariş Botu</span>
        <div
          className={`toggle-switch ${customer.botEnabled ? 'on' : ''}`}
          onClick={toggling ? undefined : handleBotToggle}
          style={toggling ? { opacity: 0.5 } : {}}
        >
          <div className="toggle-knob" />
        </div>
      </div>

      {/* Order Summary */}
      <div className="profile-section">
        <h3>Sipariş Bilgileri</h3>
        <div className="profile-info-row">
          <span className="label">Toplam Sipariş</span>
          <span className="value">{customer.totalOrders || 0}</span>
        </div>
        <div className="profile-info-row">
          <span className="label">Toplam Harcama</span>
          <span className="value" style={{ color: 'var(--accent)' }}>
            {formatMoney(customer.totalSpending)} TL
          </span>
        </div>
        {customer.lastOrder && (
          <div className="order-card" style={{ marginTop: 10 }}>
            <div className="order-number">#{customer.lastOrder.number}</div>
            <div className="order-detail">
              {customer.lastOrder.product || 'Etiket Siparişi'}
            </div>
            <div className="order-detail">
              {daysAgo(customer.lastOrder.date)} · {statusLabels[customer.lastOrder.status] || customer.lastOrder.status}
            </div>
            <div className="order-detail" style={{ fontWeight: 600, color: 'var(--text)' }}>
              {customer.lastOrder.total} TL
            </div>
          </div>
        )}
      </div>

      {/* Contact Info */}
      <div className="profile-section">
        <h3>İletişim</h3>
        <div className="profile-info-row">
          <span className="label">E-posta</span>
          <span className="value" style={{ fontSize: 12 }}>{customer.email || '-'}</span>
        </div>
        <div className="profile-info-row">
          <span className="label">Şehir</span>
          <span className="value">{customer.city || '-'}</span>
        </div>
        <div className="profile-info-row">
          <span className="label">Müşteri Tipi</span>
          <span className="value">{customer.customerType === 'kurumsal' ? 'Kurumsal' : customer.customerType === 'bireysel' ? 'Bireysel' : '-'}</span>
        </div>
        <div className="profile-info-row">
          <span className="label">Kanal</span>
          <span className="value">
            {customer.channelSource === 'facebook_ad'
              ? <span className="badge-facebook-ad">Facebook Reklam</span>
              : customer.channelSource === 'organic' ? 'Organik'
              : customer.channelSource || '-'}
          </span>
        </div>
      </div>

      {/* Facebook Ad Data */}
      {customer.adData && (
        <div className="profile-section">
          <h3>Reklam Bilgisi</h3>
          {customer.adData.title && (
            <div className="profile-info-row">
              <span className="label">Reklam Başlığı</span>
              <span className="value" style={{ fontSize: 11 }}>{customer.adData.title}</span>
            </div>
          )}
          {customer.adData.body && (
            <div className="profile-info-row">
              <span className="label">Reklam Metni</span>
              <span className="value" style={{ fontSize: 11 }}>{customer.adData.body}</span>
            </div>
          )}
          {customer.adData.sourceUrl && (
            <div className="profile-info-row">
              <span className="label">Kaynak URL</span>
              <span className="value" style={{ fontSize: 10, wordBreak: 'break-all' }}>
                {customer.adData.sourceUrl}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Conversation State */}
      {conv && (
        <div className="profile-section">
          <h3>Konuşma Durumu</h3>
          <div className="profile-info-row">
            <span className="label">Durum</span>
            <span className="value">{conv.state}</span>
          </div>
          <div className="profile-info-row">
            <span className="label">Handoff</span>
            <span className="value">{conv.isHumanHandoff ? 'Evet' : 'Hayır'}</span>
          </div>
          <div className="profile-info-row">
            <span className="label">Son Aktivite</span>
            <span className="value" style={{ fontSize: 11 }}>{daysAgo(conv.lastActivity)}</span>
          </div>
        </div>
      )}

      {/* WC Sync */}
      <div className="profile-section">
        <h3>WooCommerce</h3>
        <div className="profile-info-row">
          <span className="label">WC ID</span>
          <span className="value">{customer.wcCustomerId || '-'}</span>
        </div>
        <div className="profile-info-row">
          <span className="label">Son Sync</span>
          <span className="value" style={{ fontSize: 11 }}>
            {customer.wcLastSync ? daysAgo(customer.wcLastSync) : 'Yapılmadı'}
          </span>
        </div>
        <button className="sync-btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Senkronize ediliyor...' : 'WooCommerce Senkronize Et'}
        </button>
      </div>

      {/* Handoff Notes */}
      {profile.handoffNotes && profile.handoffNotes.length > 0 && (
        <div className="profile-section">
          <h3>Notlar</h3>
          {profile.handoffNotes.slice(0, 5).map((note, i) => (
            <div key={i} style={{
              padding: '8px 10px',
              background: 'var(--card-bg)',
              borderRadius: 6,
              marginBottom: 6,
              fontSize: 12,
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>
                {note.agent} · {formatDate(note.created_at)}
              </div>
              {note.note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
