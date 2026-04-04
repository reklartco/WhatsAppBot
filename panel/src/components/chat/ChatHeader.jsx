import { useState, useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../api/client';

const STATE_LABELS = {
  'IDLE': null,
  'MAIN_MENU': 'Menü',
  'SELECT_MATERIAL': 'Malzeme',
  'SELECT_SIZE': 'Boyut',
  'ENTER_CUSTOM_SIZE': 'Özel Boyut',
  'SELECT_QUANTITY': 'Adet',
  'ENTER_CUSTOM_QTY': 'Özel Adet',
  'ASK_DESIGN_VARIETY': 'Çeşit',
  'SHOW_PRICE': 'Fiyat',
  'SELECT_CUSTOMER_TYPE': 'Müşteri Tipi',
  'ENTER_BIREYSEL_INFO': 'Bireysel Bilgi',
  'ENTER_KURUMSAL_INFO': 'Kurumsal Bilgi',
  'ENTER_ADDRESS': 'Adres',
  'ASK_SHIPPING_SAME': 'Kargo Adresi',
  'ENTER_SHIPPING_ADDRESS': 'Kargo Adresi',
  'ASK_EMAIL': 'E-posta',
  'ENTER_EMAIL': 'E-posta',
  'CONFIRM_ORDER': 'Onay',
  'AWAITING_PAYMENT': 'Ödeme Bekleniyor',
  'AWAITING_FILE': 'Dosya Bekleniyor',
  'AWAITING_APPROVAL': 'Onay Bekleniyor',
  'ORDER_TRACKING': 'Sipariş Takip',
  'HUMAN_HANDOFF': 'Temsilci',
  'LABEL_INFO': 'Etiket Bilgi',
  'LABEL_INFO_DETAIL': 'Etiket Detay',
};

function formatMoney(amount) {
  if (!amount) return '0';
  return Number(amount).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function daysAgo(ts) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Dün';
  return `${days} gün önce`;
}

export default function ChatHeader() {
  const { state, toggleProfile, setConversations, selectPhone } = useApp();
  const [loading, setLoading] = useState(false);

  const conv = useMemo(() => {
    return state.conversations.find(c => c.phone === state.selectedPhone);
  }, [state.conversations, state.selectedPhone]);

  if (!conv) return null;

  const profile = state.customerProfile;
  const customer = profile?.customer;

  const handleHandoff = async () => {
    setLoading(true);
    try {
      if (conv.isHumanHandoff) {
        await api.releaseHandoff(state.selectedPhone);
      } else {
        await api.toggleHandoff(state.selectedPhone);
      }
      const data = await api.getConversations();
      setConversations(data.conversations || []);
    } catch (e) { /* silent */ }
    setLoading(false);
  };

  const handleStartBot = async () => {
    setLoading(true);
    try {
      await api.startBot(state.selectedPhone);
      const data = await api.getConversations();
      setConversations(data.conversations || []);
    } catch (e) { /* silent */ }
    setLoading(false);
  };

  const stateLabel = STATE_LABELS[conv.state] || null;

  return (
    <div className="chat-header">
      <div className="chat-header-info">
        <button className="mobile-back-btn" onClick={() => selectPhone(null)}>←</button>
        <div>
          <div className="chat-name">{conv.name || conv.phone}</div>
          <div className="chat-phone">{state.selectedPhone}</div>
        </div>
      </div>
      <div className="chat-header-actions">
        <button
          className="start-bot-btn"
          onClick={handleStartBot}
          disabled={loading}
        >
          Botu Başlat
        </button>
        <button
          className={conv.isHumanHandoff ? 'active-handoff' : ''}
          onClick={handleHandoff}
          disabled={loading}
        >
          {conv.isHumanHandoff ? 'Bota Bırak' : 'Devral'}
        </button>
        <button className="profile-toggle" onClick={toggleProfile}>
          {state.showProfile ? 'Profili Kapat' : 'Profil'}
        </button>
      </div>

      {/* Bilgi Badgeleri */}
      <div className="chat-badges">
        {customer?.segment && customer.segment !== 'normal' && (
          <span className={`chat-badge badge-${customer.segment}`}>
            {customer.segment === 'vip' ? '⭐ VIP' : customer.segment === 'risk' ? '⚠️ Risk' : '💤 Uyuyan'}
          </span>
        )}
        {stateLabel && (
          <span className="chat-badge badge-state">📋 {stateLabel}</span>
        )}
        {customer?.totalOrders > 0 && (
          <span className="chat-badge badge-orders">🛒 {customer.totalOrders} sipariş</span>
        )}
        {customer?.totalSpending > 0 && (
          <span className="chat-badge badge-spending">💰 {formatMoney(customer.totalSpending)} TL</span>
        )}
        {customer?.channelSource === 'facebook_ad' && (
          <span className="chat-badge badge-facebook">📣 Reklam</span>
        )}
        {conv.lastActivity && (
          <span className="chat-badge badge-time">🕐 {daysAgo(conv.lastActivity)}</span>
        )}
      </div>
    </div>
  );
}
