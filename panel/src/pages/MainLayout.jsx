import Sidebar from '../components/sidebar/Sidebar';
import ChatArea from '../components/chat/ChatArea';
import CustomerProfilePanel from '../components/customer/CustomerProfilePanel';
import { useApp } from '../contexts/AppContext';
import {
  useConversationPolling,
  useMessagePolling,
  useStatsPolling,
  useConnectionPolling,
  useCustomerProfile
} from '../hooks/usePolling';

export default function MainLayout() {
  const { state } = useApp();

  // Polling hooks
  useConversationPolling(5000);
  useMessagePolling(state.selectedPhone, 3000);
  useStatsPolling(10000);
  useConnectionPolling(15000);
  useCustomerProfile(state.selectedPhone);

  return (
    <div className="app-layout">
      <Sidebar />
      <ChatArea />
      <CustomerProfilePanel />
    </div>
  );
}
