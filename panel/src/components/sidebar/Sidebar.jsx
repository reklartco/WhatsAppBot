import TabBar from './TabBar';
import ConversationList from './ConversationList';
import { useApp } from '../../contexts/AppContext';

export default function Sidebar() {
  const { state, setSearch } = useApp();

  return (
    <div className="sidebar">
      <TabBar />
      <div className="search-box">
        <input
          type="text"
          placeholder="Ara..."
          value={state.searchQuery}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ConversationList />
    </div>
  );
}
