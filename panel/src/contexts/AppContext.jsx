import { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext(null);

const initialState = {
  conversations: [],
  selectedPhone: null,
  messages: [],
  customerProfile: null,
  stats: null,
  connectionStatus: null,
  currentTab: 'all', // all | handoff | customers
  showProfile: false,
  searchQuery: '',
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.payload };
    case 'SET_SELECTED_PHONE':
      return { ...state, selectedPhone: action.payload, messages: [], customerProfile: null };
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    case 'SET_CUSTOMER_PROFILE':
      return { ...state, customerProfile: action.payload };
    case 'SET_STATS':
      return { ...state, stats: action.payload };
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    case 'SET_TAB':
      return { ...state, currentTab: action.payload };
    case 'TOGGLE_PROFILE':
      return { ...state, showProfile: !state.showProfile };
    case 'SET_SHOW_PROFILE':
      return { ...state, showProfile: action.payload };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload };
    case 'UPDATE_CUSTOMER_BOT':
      if (state.customerProfile) {
        return {
          ...state,
          customerProfile: {
            ...state.customerProfile,
            customer: { ...state.customerProfile.customer, botEnabled: action.payload }
          }
        };
      }
      return state;
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = {
    setConversations: useCallback((data) => dispatch({ type: 'SET_CONVERSATIONS', payload: data }), []),
    selectPhone: useCallback((phone) => dispatch({ type: 'SET_SELECTED_PHONE', payload: phone }), []),
    setMessages: useCallback((data) => dispatch({ type: 'SET_MESSAGES', payload: data }), []),
    setCustomerProfile: useCallback((data) => dispatch({ type: 'SET_CUSTOMER_PROFILE', payload: data }), []),
    setStats: useCallback((data) => dispatch({ type: 'SET_STATS', payload: data }), []),
    setConnectionStatus: useCallback((data) => dispatch({ type: 'SET_CONNECTION_STATUS', payload: data }), []),
    setTab: useCallback((tab) => dispatch({ type: 'SET_TAB', payload: tab }), []),
    toggleProfile: useCallback(() => dispatch({ type: 'TOGGLE_PROFILE' }), []),
    setShowProfile: useCallback((show) => dispatch({ type: 'SET_SHOW_PROFILE', payload: show }), []),
    setSearch: useCallback((q) => dispatch({ type: 'SET_SEARCH', payload: q }), []),
    updateCustomerBot: useCallback((enabled) => dispatch({ type: 'UPDATE_CUSTOMER_BOT', payload: enabled }), []),
  };

  return (
    <AppContext.Provider value={{ state, ...actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
