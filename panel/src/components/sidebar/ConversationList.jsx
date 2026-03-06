import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../api/client';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Şimdi';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}dk`;
  if (diff < 86400000) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function getStateLabel(state) {
  const labels = {
    'IDLE': '',
    'MAIN_MENU': 'Menü',
    'SELECT_MATERIAL': 'Malzeme',
    'SELECT_SIZE': 'Boyut',
    'SELECT_QUANTITY': 'Adet',
    'SHOW_PRICE': 'Fiyat',
    'SELECT_CUSTOMER_TYPE': 'Müşteri Tipi',
    'ENTER_BIREYSEL_INFO': 'Bilgi',
    'ENTER_KURUMSAL_INFO': 'Bilgi',
    'ENTER_ADDRESS': 'Adres',
    'ENTER_EMAIL': 'E-posta',
    'CONFIRM_ORDER': 'Onay',
    'AWAITING_FILE': 'Dosya',
    'ORDER_TRACKING': 'Takip',
    'HUMAN_HANDOFF': 'Bekleyen',
  };
  return labels[state] || state;
}

export default function ConversationList() {
  const { state, selectPhone, setShowProfile } = useApp();
  const [customers, setCustomers] = useState([]);

  // Load customers for customers tab
  useEffect(() => {
    if (state.currentTab !== 'customers') return;
    let active = true;
    async function load() {
      try {
        const data = await api.getCustomers({ limit: 100, search: state.searchQuery || undefined });
        if (active) setCustomers(data.customers || []);
      } catch (e) { /* silent */ }
    }
    load();
    return () => { active = false; };
  }, [state.currentTab, state.searchQuery]);

  const filteredConversations = useMemo(() => {
    let list = state.conversations || [];

    if (state.currentTab === 'handoff') {
      list = list.filter(c => c.isHumanHandoff);
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }

    return list;
  }, [state.conversations, state.currentTab, state.searchQuery]);

  const handleSelect = (phone) => {
    selectPhone(phone);
    setShowProfile(false);
  };

  // Customers tab
  if (state.currentTab === 'customers') {
    if (customers.length === 0) {
      return <div className="empty-state">Müşteri bulunamadı</div>;
    }
    return (
      <div className="conversation-list">
        {customers.map(c => (
          <div
            key={c.phone}
            className={`conv-item ${state.selectedPhone === c.phone ? 'active' : ''}`}
            onClick={() => handleSelect(c.phone)}
          >
            <div className="conv-avatar">{getInitials(c.name)}</div>
            <div className="conv-info">
              <div className="conv-name">
                {c.name || c.phone}
                {c.segment && c.segment !== 'normal' && (
                  <span className={`badge badge-${c.segment}`} style={{ marginLeft: 6 }}>
                    {c.segment.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="conv-preview">
                {c.totalOrders > 0
                  ? `${c.totalOrders} sipariş · ${c.totalSpending?.toFixed(0) || 0} TL`
                  : c.phone}
              </div>
            </div>
            <div className="conv-meta">
              {!c.botEnabled && <span className="badge badge-bot-off">BOT OFF</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Conversations tab
  if (filteredConversations.length === 0) {
    return <div className="empty-state">
      {state.currentTab === 'handoff' ? 'Bekleyen konuşma yok' : 'Aktif konuşma yok'}
    </div>;
  }

  return (
    <div className="conversation-list">
      {filteredConversations.map(c => (
        <div
          key={c.phone}
          className={`conv-item ${state.selectedPhone === c.phone ? 'active' : ''}`}
          onClick={() => handleSelect(c.phone)}
        >
          <div className="conv-avatar">{getInitials(c.name)}</div>
          <div className="conv-info">
            <div className="conv-name">
              {c.name || c.phone}
              {c.isHumanHandoff && (
                <span className="badge badge-handoff" style={{ marginLeft: 6 }}>BEKLEYEN</span>
              )}
            </div>
            <div className="conv-preview">
              {getStateLabel(c.state) || c.phone}
            </div>
          </div>
          <div className="conv-meta">
            <div className="conv-time">{formatTime(c.lastActivity)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
