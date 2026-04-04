const db = require('./database');
const { getQueueStatus } = require('./messageQueue');
const sessionMonitor = require('./sessionMonitor');
const logger = require('../utils/logger');

// ========== İSTATİSTİK SERVİSİ ==========

/**
 * Dashboard için kapsamlı istatistik verisi
 */
function getDashboardStats() {
  const realtime = db.getStats();
  const today = db.getTodayStats();
  const thisWeek = db.getWeeklyStats();
  const segments = db.getSegmentCounts();
  const botCounts = db.getBotEnabledCounts();
  const sales = db.getSalesStats();

  return {
    realtime: {
      totalConversations: realtime.totalConversations,
      activeHandoffs: realtime.activeHandoffs,
      totalMessages: realtime.totalMessages,
      todayMessages: realtime.todayMessages,
      botEnabled: botCounts.enabled,
      botDisabled: botCounts.disabled
    },
    today: {
      newConversations: today.newConversations,
      inboundMessages: today.inboundMessages,
      outboundMessages: today.outboundMessages,
      humanMessages: today.humanMessages,
      handoffCount: today.handoffCount,
      ordersCreated: today.ordersCreated,
      uniqueContacts: today.uniqueContacts
    },
    thisWeek: {
      newConversations: thisWeek.newConversations,
      totalMessages: thisWeek.totalMessages,
      ordersCreated: thisWeek.ordersCreated,
      uniqueContacts: thisWeek.uniqueContacts,
      handoffCount: thisWeek.handoffCount
    },
    sales,
    segments,
    connection: {
      isConnected: sessionMonitor.isConnected,
      uptime: process.uptime(),
      reconnectAttempts: sessionMonitor.reconnectAttempts,
      queuePending: getQueueStatus().pending || 0,
      queueProcessing: getQueueStatus().processing || false
    }
  };
}

/**
 * Mesaj istatistiği kaydet
 */
function recordMessageStat(direction) {
  try {
    db.incrementDailyStat('total_messages');
    if (direction === 'inbound') {
      db.incrementDailyStat('inbound_messages');
    } else if (direction === 'outbound') {
      db.incrementDailyStat('outbound_messages');
    } else if (direction === 'human') {
      db.incrementDailyStat('human_messages');
    }
  } catch (e) {
    logger.error('[STATS] Mesaj stat hatası:', e.message);
  }
}

/**
 * Handoff istatistiği kaydet
 */
function recordHandoffStat() {
  try {
    db.incrementDailyStat('handoff_count');
  } catch (e) {
    logger.error('[STATS] Handoff stat hatası:', e.message);
  }
}

/**
 * Sipariş istatistiği kaydet
 */
function recordOrderStat() {
  try {
    db.incrementDailyStat('orders_created');
  } catch (e) {
    logger.error('[STATS] Sipariş stat hatası:', e.message);
  }
}

/**
 * Yeni konuşma istatistiği kaydet
 */
function recordNewConversation() {
  try {
    db.incrementDailyStat('new_conversations');
    db.incrementDailyStat('total_conversations');
  } catch (e) {
    logger.error('[STATS] Konuşma stat hatası:', e.message);
  }
}

/**
 * Benzersiz kişi istatistiği kaydet
 */
function recordUniqueContact() {
  try {
    db.incrementDailyStat('unique_contacts');
  } catch (e) {
    logger.error('[STATS] Kişi stat hatası:', e.message);
  }
}

/**
 * Bağlantı durumu bilgisi
 */
async function getConnectionStatus() {
  const { getInstanceStatus } = require('./evolutionTransport');

  try {
    const status = await getInstanceStatus();
    const state = status?.instance?.state || status?.state || 'unknown';

    return {
      isConnected: sessionMonitor.isConnected,
      state: state,
      uptime: process.uptime(),
      lastCheck: sessionMonitor.getStatus().lastCheck,
      reconnectAttempts: sessionMonitor.reconnectAttempts,
      qrAvailable: !!sessionMonitor.lastQR,
      queue: getQueueStatus()
    };
  } catch (error) {
    return {
      isConnected: false,
      state: 'error',
      error: error.message,
      uptime: process.uptime(),
      queue: getQueueStatus()
    };
  }
}

/**
 * Sipariş cirosu kaydet
 */
function recordOrderRevenue(amount) {
  try {
    if (amount > 0) {
      db.incrementDailyRevenue(amount);
    }
  } catch (e) {
    logger.error('[STATS] Ciro stat hatası:', e.message);
  }
}

module.exports = {
  getDashboardStats,
  recordMessageStat,
  recordHandoffStat,
  recordOrderStat,
  recordOrderRevenue,
  recordNewConversation,
  recordUniqueContact,
  getConnectionStatus
};
