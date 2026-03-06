import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { getAdminSecret } from '../../api/client';

function formatMsgTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Bugün';
  if (d.toDateString() === yesterday.toDateString()) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function shouldShowDate(messages, index) {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].created_at);
  const curr = new Date(messages[index].created_at);
  return prev.toDateString() !== curr.toDateString();
}

function MediaContent({ msg }) {
  const [imgError, setImgError] = useState(false);
  const secret = getAdminSecret();
  const meta = msg.metadata || {};
  const mediaId = meta.id;

  if (msg.message_type === 'image') {
    const mediaUrl = mediaId ? `/admin/media/${mediaId}?secret=${encodeURIComponent(secret)}` : null;
    return (
      <div className="msg-media">
        {mediaUrl && !imgError ? (
          <img
            src={mediaUrl}
            alt="Fotoğraf"
            className="msg-image"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="msg-media-placeholder">📷 Fotoğraf</div>
        )}
        {meta.caption && <div className="msg-media-caption">{meta.caption}</div>}
        {!meta.caption && msg.content && msg.content !== '[image]' && (
          <div className="msg-media-caption">{msg.content}</div>
        )}
      </div>
    );
  }

  if (msg.message_type === 'document') {
    return (
      <div className="msg-media">
        <div className="msg-document">
          <span className="msg-doc-icon">📄</span>
          <span className="msg-doc-name">{meta.filename || 'Belge'}</span>
        </div>
        {meta.caption && <div className="msg-media-caption">{meta.caption}</div>}
      </div>
    );
  }

  if (msg.message_type === 'audio') {
    return (
      <div className="msg-media">
        <div className="msg-media-placeholder">🎵 Ses mesajı</div>
      </div>
    );
  }

  if (msg.message_type === 'location') {
    return (
      <div className="msg-media">
        <div className="msg-media-placeholder">📍 Konum</div>
      </div>
    );
  }

  // Diğer tipler (interactive, button, list vb.)
  return null;
}

export default function MessageList() {
  const { state } = useApp();
  const listRef = useRef(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (state.messages.length > prevLenRef.current) {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
    prevLenRef.current = state.messages.length;
  }, [state.messages]);

  if (state.messages.length === 0) {
    return (
      <div className="message-list" ref={listRef}>
        <div className="empty-state">Henüz mesaj yok</div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {state.messages.map((msg, i) => (
        <div key={msg.id || i}>
          {shouldShowDate(state.messages, i) && (
            <div className="date-separator">
              <span>{formatDate(msg.created_at)}</span>
            </div>
          )}
          <div className={`msg-bubble ${msg.direction}`}>
            {msg.message_type !== 'text' ? (
              <>
                <MediaContent msg={msg} />
                {/* Eğer MediaContent null dönerse, text content göster */}
                {!['image', 'document', 'audio', 'location'].includes(msg.message_type) && (
                  <>
                    <span className="msg-type-badge">{msg.message_type}</span>
                    {msg.content}
                  </>
                )}
              </>
            ) : (
              msg.content
            )}
            <div className="msg-time">{formatMsgTime(msg.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
