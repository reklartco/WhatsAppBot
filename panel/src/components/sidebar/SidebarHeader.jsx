import { useAuth } from '../../contexts/AuthContext';
import ConnectionIndicator from '../common/ConnectionIndicator';

export default function SidebarHeader() {
  const { logout } = useAuth();

  return (
    <div className="sidebar-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2>1Etiket</h2>
        <ConnectionIndicator />
      </div>
      <button className="logout-btn" onClick={logout}>Çıkış</button>
    </div>
  );
}
