import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../api/client';

const TYPE_LABELS = {
  order_intent: { label: 'Sipariş Niyeti', icon: '🛒', color: '#00a884' },
  price_agreement: { label: 'Fiyat Anlaşması', icon: '💰', color: '#f5a623' },
  payment_confirmed: { label: 'Ödeme Onayı', icon: '✅', color: '#00c49a' },
  complaint: { label: 'Şikayet', icon: '⚠️', color: '#ea4335' },
  upsell_opportunity: { label: 'Upsell Fırsatı', icon: '📈', color: '#1877f2' },
  urgent_request: { label: 'Acil Talep', icon: '🔥', color: '#ff6b35' },
  competitor_mention: { label: 'Rakip Bahsi', icon: '🏷️', color: '#8696a0' },
};

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Şimdi';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}dk önce`;
  if (diff < 86400000) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

export default function AiObservations() {
  const { state } = useApp();
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadObservations = useCallback(async () => {
    if (!state.selectedPhone) return;
    try {
      const data = await api.getAiObservations(state.selectedPhone, 10);
      setObservations(data.observations || []);
    } catch (e) { /* silent */ }
  }, [state.selectedPhone]);

  // İlk yükleme
  useEffect(() => {
    setObservations([]);
    setLoading(true);
    loadObservations().finally(() => setLoading(false));
  }, [state.selectedPhone, loadObservations]);

  // 15 saniye polling
  useEffect(() => {
    if (!state.selectedPhone) return;
    const interval = setInterval(loadObservations, 15000);
    return () => clearInterval(interval);
  }, [state.selectedPhone, loadObservations]);

  const handleApprove = async (id) => {
    try {
      await api.approveObservation(id);
      setObservations(prev => prev.map(o => o.id === id ? { ...o, reviewed: 1 } : o));
    } catch (e) { /* silent */ }
  };

  const handleReject = async (id) => {
    try {
      await api.rejectObservation(id);
      setObservations(prev => prev.map(o => o.id === id ? { ...o, reviewed: -1 } : o));
    } catch (e) { /* silent */ }
  };

  // Sadece review edilmemiş gözlemler göster
  const unreviewedObs = observations.filter(o => o.reviewed === 0);

  if (unreviewedObs.length === 0) return null;

  return (
    <div className="ai-observations">
      {unreviewedObs.map(obs => {
        const typeInfo = TYPE_LABELS[obs.type] || { label: obs.type, icon: '🤖', color: '#8696a0' };
        return (
          <div
            key={obs.id}
            className="ai-obs-card"
            style={{ borderLeftColor: typeInfo.color }}
          >
            <div className="ai-obs-header">
              <span className="ai-obs-type">
                {typeInfo.icon} {typeInfo.label}
              </span>
              <span className="ai-obs-confidence">
                {(obs.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="ai-obs-summary">
              {obs.data?.summary || 'Detay yok'}
            </div>
            <div className="ai-obs-footer">
              <span className="ai-obs-time">{formatTime(obs.createdAt)}</span>
              <div className="ai-obs-actions">
                <button
                  className="ai-obs-approve"
                  onClick={() => handleApprove(obs.id)}
                  title="Onayla"
                >
                  ✓
                </button>
                <button
                  className="ai-obs-reject"
                  onClick={() => handleReject(obs.id)}
                  title="Reddet"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
