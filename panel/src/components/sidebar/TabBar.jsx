import { useApp } from '../../contexts/AppContext';

export default function TabBar() {
  const { state, setTab } = useApp();

  return (
    <div className="tab-bar">
      <button
        className={state.currentTab === 'all' ? 'active' : ''}
        onClick={() => setTab('all')}
      >
        Tümü
      </button>
      <button
        className={state.currentTab === 'handoff' ? 'active' : ''}
        onClick={() => setTab('handoff')}
      >
        Bekleyen
      </button>
      <button
        className={state.currentTab === 'customers' ? 'active' : ''}
        onClick={() => setTab('customers')}
      >
        Müşteriler
      </button>
    </div>
  );
}
