import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { getAdminSecret, getMessages } from '../../api/client';

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

function MediaContent({ msg, onImageClick }) {
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
            onClick={() => onImageClick(mediaUrl)}
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
    const downloadUrl = mediaId ? `/admin/media/${mediaId}?secret=${encodeURIComponent(secret)}` : null;
    return (
      <div className="msg-media">
        <div className="msg-document">
          <span className="msg-doc-icon">📄</span>
          <span className="msg-doc-name">{meta.filename || 'Belge'}</span>
          {downloadUrl && (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="msg-doc-download" title="İndir">⬇</a>
          )}
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

  return null;
}

function Lightbox({ url, onClose }) {
  if (!url) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={handleBackdrop}>
      <button className="lightbox-close" onClick={onClose}>✕</button>
      <img src={url} alt="Fotoğraf" className="lightbox-image" />
      <a href={url} download className="lightbox-download" title="İndir">⬇ İndir</a>
    </div>
  );
}

export default function MessageList() {
  const { state } = useApp();
  const listRef = useRef(null);
  const prevLenRef = useRef(0);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [olderMessages, setOlderMessages] = useState([]);

  // Tüm mesajlar: eski + yeni
  const allMessages = [...olderMessages, ...state.messages];

  // Yeni mesaj gelince aşağı scroll
  useEffect(() => {
    if (state.messages.length > prevLenRef.current && olderMessages.length === 0) {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
    prevLenRef.current = state.messages.length;
  }, [state.messages, olderMessages.length]);

  // Konuşma değişince eski mesajları temizle
  useEffect(() => {
    setOlderMessages([]);
    setHasMore(true);
  }, [state.selectedPhone]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || allMessages.length === 0) return;
    setLoadingOlder(true);

    const scrollEl = listRef.current;
    const prevHeight = scrollEl?.scrollHeight || 0;

    try {
      const firstMsg = allMessages[0];
      const data = await getMessages(state.selectedPhone, 50, firstMsg.created_at);
      const msgs = data.messages || [];

      if (msgs.length === 0) {
        setHasMore(false);
      } else {
        // Mevcut mesajlarla çakışmayanları filtrele
        const existingIds = new Set(allMessages.map(m => m.id));
        const newMsgs = msgs.filter(m => !existingIds.has(m.id));

        if (newMsgs.length === 0) {
          setHasMore(false);
        } else {
          setOlderMessages(prev => [...newMsgs, ...prev]);
          // Scroll pozisyonunu koru
          requestAnimationFrame(() => {
            if (scrollEl) {
              scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight;
            }
          });
        }
      }
    } catch (e) {
      console.error('Eski mesaj yükleme hatası:', e);
    }
    setLoadingOlder(false);
  }, [loadingOlder, hasMore, allMessages, state.selectedPhone]);

  if (allMessages.length === 0) {
    return (
      <div className="message-list" ref={listRef}>
        <div className="empty-state">Henüz mesaj yok</div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {/* Daha eski mesajları yükle */}
      {hasMore && (
        <div className="load-more-container">
          <button className="load-more-btn" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Yükleniyor...' : '↑ Daha eski mesajları yükle'}
          </button>
        </div>
      )}

      {allMessages.map((msg, i) => {
        const meta = msg.metadata || {};
        return (
          <div key={msg.id || `msg-${i}`}>
            {shouldShowDate(allMessages, i) && (
              <div className="date-separator">
                <span>{formatDate(msg.created_at)}</span>
              </div>
            )}
            <div className={`msg-bubble ${msg.direction}`}>
              {msg.message_type !== 'text' ? (
                <>
                  <MediaContent msg={msg} onImageClick={setLightboxUrl} />
                  {!['image', 'document', 'audio', 'location'].includes(msg.message_type) && (
                    <>
                      <span className="msg-type-badge">{msg.message_type}</span>
                      {msg.content}
                    </>
                  )}
                </>
              ) : (
                <>
                  {msg.content}
                  {meta.resolvedLabel && (
                    <span className="msg-resolved">→ {meta.resolvedLabel}</span>
                  )}
                </>
              )}
              <div className="msg-time">{formatMsgTime(msg.created_at)}</div>
            </div>
          </div>
        );
      })}

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
