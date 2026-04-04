const BASE_URL = '';

let adminSecret = '';

export function setAdminSecret(secret) {
  adminSecret = secret;
}

export function getAdminSecret() {
  return adminSecret;
}

async function apiCall(path, options = {}) {
  const { method = 'GET', body } = options;
  const headers = {
    'x-admin-secret': adminSecret,
    'Content-Type': 'application/json'
  };

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, config);

  if (res.status === 401) {
    throw new Error('Yetkisiz erişim');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API hatası');
  }

  return res.json();
}

// Auth check
export async function checkAuth() {
  return apiCall('/admin/stats');
}

// Conversations
export async function getConversations() {
  return apiCall('/admin/conversations');
}

export async function getHandoffConversations() {
  return apiCall('/admin/conversations/handoff');
}

export async function getMessages(phone, limit = 50, before = null) {
  let url = `/admin/conversations/${phone}/messages?limit=${limit}`;
  if (before) url += `&before=${before}`;
  return apiCall(url);
}

export async function sendMessage(phone, text, agent = 'admin') {
  return apiCall(`/admin/conversations/${phone}/send`, {
    method: 'POST',
    body: { text, agent }
  });
}

export async function toggleHandoff(phone, agent = 'admin') {
  return apiCall(`/admin/conversations/${phone}/handoff`, {
    method: 'POST',
    body: { agent }
  });
}

export async function releaseHandoff(phone) {
  return apiCall(`/admin/conversations/${phone}/release`, { method: 'POST' });
}

export async function markRead(phone) {
  return apiCall(`/admin/conversations/${phone}/mark-read`, { method: 'POST' });
}

export async function markAllRead() {
  return apiCall('/admin/conversations/mark-all-read', { method: 'POST' });
}

// Customers (CRM)
export async function getCustomers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.segment) params.set('segment', filters.segment);
  if (filters.limit) params.set('limit', filters.limit);
  if (filters.offset) params.set('offset', filters.offset);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return apiCall(`/admin/customers${qs ? '?' + qs : ''}`);
}

export async function getCustomerProfile(phone) {
  return apiCall(`/admin/customers/${phone}`);
}

export async function toggleBot(phone, enabled) {
  return apiCall(`/admin/customers/${phone}/bot-toggle`, {
    method: 'POST',
    body: { enabled }
  });
}

export async function syncCustomer(phone) {
  return apiCall(`/admin/customers/${phone}/sync`, { method: 'POST' });
}

export async function updateSegment(phone, segment) {
  return apiCall(`/admin/customers/${phone}/segment`, {
    method: 'POST',
    body: { segment }
  });
}

// AI Observations
export async function getAiObservations(phone, limit = 20) {
  const params = new URLSearchParams();
  if (phone) params.set('phone', phone);
  if (limit) params.set('limit', limit);
  const qs = params.toString();
  return apiCall(`/admin/ai/observations${qs ? '?' + qs : ''}`);
}

export async function approveObservation(id) {
  return apiCall(`/admin/ai/observations/${id}/approve`, { method: 'POST' });
}

export async function rejectObservation(id) {
  return apiCall(`/admin/ai/observations/${id}/reject`, { method: 'POST' });
}

// Stats & Connection
export async function getDashboardStats() {
  return apiCall('/admin/stats/dashboard');
}

export async function getConnectionStatus() {
  return apiCall('/admin/connection/status');
}

export async function getInstanceStatus() {
  return apiCall('/admin/instance/status');
}

// Bot'u başlat (karşılama mesajını gönder)
export async function startBot(phone) {
  return apiCall(`/admin/conversations/${phone}/start-bot`, { method: 'POST' });
}
