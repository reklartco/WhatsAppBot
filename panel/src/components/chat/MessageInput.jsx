import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../api/client';

export default function MessageInput() {
  const { state } = useApp();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || !state.selectedPhone) return;
    setSending(true);
    try {
      await api.sendMessage(state.selectedPhone, text.trim());
      setText('');
    } catch (e) { /* silent */ }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Mesaj yazın... (Enter ile gönderin)"
        rows={1}
        disabled={sending}
      />
      <button onClick={handleSend} disabled={sending || !text.trim()}>
        {sending ? '...' : 'Gönder'}
      </button>
    </div>
  );
}
