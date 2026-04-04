import { useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import * as api from '../api/client';

export function useConversationPolling(interval = 5000) {
  const { setConversations } = useApp();

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await api.getConversations();
        if (active) setConversations(data.conversations || []);
      } catch (e) { /* silent */ }
    }
    poll();
    const id = setInterval(poll, interval);
    return () => { active = false; clearInterval(id); };
  }, [interval, setConversations]);
}

export function useMessagePolling(phone, interval = 3000) {
  const { setMessages } = useApp();
  const markedRef = useRef(null);

  useEffect(() => {
    if (!phone) return;
    let active = true;

    // Konuşma açıldığında okundu olarak işaretle
    if (markedRef.current !== phone) {
      markedRef.current = phone;
      api.markRead(phone).catch(() => {});
    }

    async function poll() {
      try {
        const data = await api.getMessages(phone, 100);
        if (active) setMessages(data.messages || []);
      } catch (e) { /* silent */ }
    }
    poll();
    const id = setInterval(poll, interval);
    return () => { active = false; clearInterval(id); };
  }, [phone, interval, setMessages]);
}

export function useStatsPolling(interval = 10000) {
  const { setStats } = useApp();

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await api.getDashboardStats();
        if (active) setStats(data);
      } catch (e) { /* silent */ }
    }
    poll();
    const id = setInterval(poll, interval);
    return () => { active = false; clearInterval(id); };
  }, [interval, setStats]);
}

export function useConnectionPolling(interval = 15000) {
  const { setConnectionStatus } = useApp();

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await api.getConnectionStatus();
        if (active) setConnectionStatus(data);
      } catch (e) {
        if (active) setConnectionStatus({ isConnected: false, state: 'error' });
      }
    }
    poll();
    const id = setInterval(poll, interval);
    return () => { active = false; clearInterval(id); };
  }, [interval, setConnectionStatus]);
}

export function useCustomerProfile(phone) {
  const { setCustomerProfile } = useApp();
  const lastPhoneRef = useRef(null);

  useEffect(() => {
    if (!phone) {
      setCustomerProfile(null);
      return;
    }
    if (phone === lastPhoneRef.current) return;
    lastPhoneRef.current = phone;

    let active = true;
    async function load() {
      try {
        const data = await api.getCustomerProfile(phone);
        if (active) setCustomerProfile(data);
      } catch (e) {
        if (active) setCustomerProfile(null);
      }
    }
    load();
    return () => { active = false; };
  }, [phone, setCustomerProfile]);
}
