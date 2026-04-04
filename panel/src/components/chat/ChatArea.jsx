import { useApp } from '../../contexts/AppContext';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AiObservations from './AiObservations';

export default function ChatArea() {
  const { state } = useApp();

  if (!state.selectedPhone) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          Bir konuşma seçin veya Müşteriler sekmesinden müşteri profillerini görüntüleyin
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <ChatHeader />
      <AiObservations />
      <MessageList />
      <MessageInput />
    </div>
  );
}
