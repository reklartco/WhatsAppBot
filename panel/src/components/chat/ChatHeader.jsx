import { useState, useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../api/client';

export default function ChatHeader() {
  const { state, toggleProfile, setConversations } = useApp();
  const [loading, setLoading] = useState(false);

  const conv = useMemo(() => {
    return state.conversations.find(c => c.phone === state.selectedPhone);
  }, [state.conversations, state.selectedPhone]);

  if (!conv) return null;

  const handleHandoff = async () => {
    setLoading(true);
    try {
      if (conv.isHumanHandoff) {
        await api.releaseHandoff(state.selectedPhone);
      } else {
        await api.toggleHandoff(state.selectedPhone);
      }
      // Refresh conversations
      const data = await api.getConversations();
      setConversations(data.conversations || []);
    } catch (e) { /* silent */ }
    setLoading(false);
  };

  return (
    <div className="chat-header">
      <div className="chat-header-info">
        <div>
          <div className="chat-name">{conv.name || conv.phone}</div>
          <div className="chat-phone">{state.selectedPhone}</div>
        </div>
      </div>
      <div className="chat-header-actions">
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
    </div>
  );
}
