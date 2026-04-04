const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = process.env.DB_PATH || './data/conversations.db';

let db;

function getDb() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    -- Konuşma durumları (kalıcı)
    CREATE TABLE IF NOT EXISTS conversations (
      phone TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      state TEXT DEFAULT 'IDLE',
      data TEXT DEFAULT '{}',
      is_human_handoff INTEGER DEFAULT 0,
      human_agent TEXT DEFAULT NULL,
      last_activity INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Mesaj geçmişi
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound', 'human')),
      message_type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    -- Human handoff notları
    CREATE TABLE IF NOT EXISTS handoff_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      agent TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Müşteri profilleri (CRM)
    CREATE TABLE IF NOT EXISTS customers (
      phone TEXT PRIMARY KEY,
      wc_customer_id INTEGER DEFAULT NULL,
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      city TEXT DEFAULT '',
      customer_type TEXT DEFAULT '',
      segment TEXT DEFAULT 'normal',
      channel_source TEXT DEFAULT 'organic',
      total_orders INTEGER DEFAULT 0,
      total_spending REAL DEFAULT 0.0,
      last_order_id INTEGER DEFAULT NULL,
      last_order_number TEXT DEFAULT NULL,
      last_order_date INTEGER DEFAULT NULL,
      last_order_status TEXT DEFAULT NULL,
      last_order_product TEXT DEFAULT NULL,
      last_order_total TEXT DEFAULT NULL,
      bot_enabled INTEGER DEFAULT 1,
      wc_last_sync INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Günlük istatistikler
    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      total_conversations INTEGER DEFAULT 0,
      new_conversations INTEGER DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      inbound_messages INTEGER DEFAULT 0,
      outbound_messages INTEGER DEFAULT 0,
      human_messages INTEGER DEFAULT 0,
      handoff_count INTEGER DEFAULT 0,
      orders_created INTEGER DEFAULT 0,
      unique_contacts INTEGER DEFAULT 0
    );

    -- Index'ler
    CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_activity ON conversations(last_activity);
    CREATE INDEX IF NOT EXISTS idx_conversations_handoff ON conversations(is_human_handoff);
    CREATE INDEX IF NOT EXISTS idx_customers_wc_id ON customers(wc_customer_id);
    CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment);
    CREATE INDEX IF NOT EXISTS idx_customers_bot ON customers(bot_enabled);

    -- AI Gözlem Logları
    CREATE TABLE IF NOT EXISTS ai_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      observation_type TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      data TEXT DEFAULT '{}',
      ai_response TEXT DEFAULT NULL,
      source_messages TEXT DEFAULT '[]',
      reviewed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_observations_phone ON ai_observations(phone);
    CREATE INDEX IF NOT EXISTS idx_ai_observations_type ON ai_observations(observation_type);
    CREATE INDEX IF NOT EXISTS idx_ai_observations_reviewed ON ai_observations(reviewed);
  `);

  // Webhook bildirim deduplication tablosu (kalıcı — container restart'ta bile korunur)
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS sent_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL,
      status TEXT NOT NULL,
      phone TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      UNIQUE(order_number, status)
    );
    CREATE INDEX IF NOT EXISTS idx_sent_notifications_order ON sent_notifications(order_number, status);
  `);

  // Migrations — yeni kolonlar (idempotent)
  try { getDb().exec(`ALTER TABLE customers ADD COLUMN ad_data TEXT DEFAULT NULL`); } catch (e) { /* zaten var */ }
  try { getDb().exec(`ALTER TABLE daily_stats ADD COLUMN revenue REAL DEFAULT 0.0`); } catch (e) { /* zaten var */ }
  try { getDb().exec(`ALTER TABLE conversations ADD COLUMN admin_last_read INTEGER DEFAULT 0`); } catch (e) { /* zaten var */ }
  try { getDb().exec(`ALTER TABLE customers ADD COLUMN reorder_count INTEGER DEFAULT 0`); } catch (e) { /* zaten var */ }
  try { getDb().exec(`ALTER TABLE customers ADD COLUMN last_reorder_reminder INTEGER DEFAULT NULL`); } catch (e) { /* zaten var */ }

  // Zamanlı görevler tablosu
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      task_type TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'cancelled', 'failed')),
      data TEXT DEFAULT '{}',
      result TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status_time ON scheduled_tasks(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_phone_type ON scheduled_tasks(phone, task_type);

    -- Broadcast kampanyalar tablosu
    CREATE TABLE IF NOT EXISTS broadcast_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      segment TEXT DEFAULT NULL,
      template TEXT NOT NULL,
      coupon_config TEXT DEFAULT NULL,
      total_target INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sending', 'completed', 'cancelled')),
      created_at INTEGER NOT NULL
    );
  `);

  logger.info('Veritabanı tabloları hazır');
}

// ========== KONUŞMA İŞLEMLERİ ==========

function getConversation(phone) {
  const row = getDb().prepare('SELECT * FROM conversations WHERE phone = ?').get(phone);
  if (!row) return null;
  return {
    phone: row.phone,
    name: row.name,
    state: row.state,
    data: JSON.parse(row.data || '{}'),
    isHumanHandoff: !!row.is_human_handoff,
    humanAgent: row.human_agent,
    lastActivity: row.last_activity,
    createdAt: row.created_at
  };
}

function saveConversation(phone, conv) {
  const stmt = getDb().prepare(`
    INSERT INTO conversations (phone, name, state, data, is_human_handoff, human_agent, last_activity, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      name = excluded.name,
      state = excluded.state,
      data = excluded.data,
      is_human_handoff = excluded.is_human_handoff,
      human_agent = excluded.human_agent,
      last_activity = excluded.last_activity
  `);
  stmt.run(
    phone,
    conv.name || '',
    conv.state || 'IDLE',
    JSON.stringify(conv.data || {}),
    conv.isHumanHandoff ? 1 : 0,
    conv.humanAgent || null,
    conv.lastActivity || Date.now(),
    conv.createdAt || Date.now()
  );
}

function deleteConversation(phone) {
  getDb().prepare('DELETE FROM conversations WHERE phone = ?').run(phone);
}

function getActiveConversations() {
  return getDb().prepare('SELECT * FROM conversations ORDER BY last_activity DESC').all()
    .map(row => ({
      phone: row.phone,
      name: row.name,
      state: row.state,
      data: JSON.parse(row.data || '{}'),
      isHumanHandoff: !!row.is_human_handoff,
      humanAgent: row.human_agent,
      lastActivity: row.last_activity
    }));
}

function getHumanHandoffConversations() {
  return getDb().prepare('SELECT * FROM conversations WHERE is_human_handoff = 1 ORDER BY last_activity DESC').all()
    .map(row => ({
      phone: row.phone,
      name: row.name,
      state: row.state,
      isHumanHandoff: true,
      humanAgent: row.human_agent,
      lastActivity: row.last_activity
    }));
}

function cleanupStaleConversations(timeoutMs) {
  const cutoff = Date.now() - timeoutMs;
  const result = getDb().prepare('DELETE FROM conversations WHERE last_activity < ? AND is_human_handoff = 0').run(cutoff);
  if (result.changes > 0) {
    logger.info(`${result.changes} eski konuşma temizlendi`);
  }
  return result.changes;
}

// ========== MESAJ GEÇMİŞİ ==========

function saveMessage(phone, direction, content, messageType = 'text', metadata = {}) {
  getDb().prepare(`
    INSERT INTO messages (phone, direction, message_type, content, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(phone, direction, messageType, content, JSON.stringify(metadata), Date.now());
}

function getMessageHistory(phone, limit = 50, before = null) {
  if (before) {
    return getDb().prepare(`
      SELECT * FROM messages WHERE phone = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?
    `).all(phone, before, limit).reverse();
  }
  return getDb().prepare(`
    SELECT * FROM messages WHERE phone = ? ORDER BY created_at DESC LIMIT ?
  `).all(phone, limit).reverse();
}

function updateLastMessageMeta(phone, extraMeta) {
  const last = getDb().prepare(
    'SELECT id, metadata FROM messages WHERE phone = ? AND direction = ? ORDER BY created_at DESC LIMIT 1'
  ).get(phone, 'inbound');
  if (!last) return;
  let meta = {};
  try { meta = JSON.parse(last.metadata || '{}'); } catch (e) {}
  Object.assign(meta, extraMeta);
  getDb().prepare('UPDATE messages SET metadata = ? WHERE id = ?').run(JSON.stringify(meta), last.id);
}

function getRecentMessages(limit = 100) {
  return getDb().prepare(`
    SELECT m.*, c.name FROM messages m
    LEFT JOIN conversations c ON m.phone = c.phone
    ORDER BY m.created_at DESC LIMIT ?
  `).all(limit).reverse();
}

// ========== HANDOFF NOTLARI ==========

function addHandoffNote(phone, agent, note) {
  getDb().prepare(`
    INSERT INTO handoff_notes (phone, agent, note, created_at)
    VALUES (?, ?, ?, ?)
  `).run(phone, agent, note, Date.now());
}

function getHandoffNotes(phone) {
  return getDb().prepare('SELECT * FROM handoff_notes WHERE phone = ? ORDER BY created_at DESC').all(phone);
}

// ========== MÜŞTERİ İŞLEMLERİ (CRM) ==========

function getCustomer(phone) {
  const row = getDb().prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (!row) return null;
  return {
    phone: row.phone,
    wcCustomerId: row.wc_customer_id,
    name: row.name,
    email: row.email,
    city: row.city,
    customerType: row.customer_type,
    segment: row.segment,
    channelSource: row.channel_source,
    totalOrders: row.total_orders,
    totalSpending: row.total_spending,
    lastOrderId: row.last_order_id,
    lastOrderNumber: row.last_order_number,
    lastOrderDate: row.last_order_date,
    lastOrderStatus: row.last_order_status,
    lastOrderProduct: row.last_order_product,
    lastOrderTotal: row.last_order_total,
    botEnabled: !!row.bot_enabled,
    wcLastSync: row.wc_last_sync,
    adData: row.ad_data ? JSON.parse(row.ad_data) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function saveCustomer(phone, data) {
  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO customers (phone, wc_customer_id, name, email, city, customer_type, segment, channel_source,
      total_orders, total_spending, last_order_id, last_order_number, last_order_date, last_order_status,
      last_order_product, last_order_total, bot_enabled, wc_last_sync, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      wc_customer_id = COALESCE(excluded.wc_customer_id, customers.wc_customer_id),
      name = CASE WHEN excluded.name != '' THEN excluded.name ELSE customers.name END,
      email = CASE WHEN excluded.email != '' THEN excluded.email ELSE customers.email END,
      city = CASE WHEN excluded.city != '' THEN excluded.city ELSE customers.city END,
      customer_type = CASE WHEN excluded.customer_type != '' THEN excluded.customer_type ELSE customers.customer_type END,
      segment = excluded.segment,
      channel_source = CASE WHEN excluded.channel_source != 'organic' THEN excluded.channel_source ELSE customers.channel_source END,
      total_orders = excluded.total_orders,
      total_spending = excluded.total_spending,
      last_order_id = COALESCE(excluded.last_order_id, customers.last_order_id),
      last_order_number = COALESCE(excluded.last_order_number, customers.last_order_number),
      last_order_date = COALESCE(excluded.last_order_date, customers.last_order_date),
      last_order_status = COALESCE(excluded.last_order_status, customers.last_order_status),
      last_order_product = COALESCE(excluded.last_order_product, customers.last_order_product),
      last_order_total = COALESCE(excluded.last_order_total, customers.last_order_total),
      bot_enabled = excluded.bot_enabled,
      wc_last_sync = COALESCE(excluded.wc_last_sync, customers.wc_last_sync),
      updated_at = excluded.updated_at
  `);
  stmt.run(
    phone,
    data.wcCustomerId || null,
    data.name || '',
    data.email || '',
    data.city || '',
    data.customerType || '',
    data.segment || 'normal',
    data.channelSource || 'organic',
    data.totalOrders || 0,
    data.totalSpending || 0,
    data.lastOrderId || null,
    data.lastOrderNumber || null,
    data.lastOrderDate || null,
    data.lastOrderStatus || null,
    data.lastOrderProduct || null,
    data.lastOrderTotal || null,
    data.botEnabled !== undefined ? (data.botEnabled ? 1 : 0) : 1,
    data.wcLastSync || null,
    now,
    now
  );
}

function getAllCustomers(filters = {}) {
  const { segment, limit = 100, offset = 0, search } = filters;
  let sql = 'SELECT * FROM customers';
  const params = [];
  const conditions = [];

  if (segment) {
    conditions.push('segment = ?');
    params.push(segment);
  }
  if (search) {
    conditions.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = getDb().prepare(sql).all(...params);
  const countSql = conditions.length > 0
    ? `SELECT COUNT(*) as count FROM customers WHERE ${conditions.join(' AND ')}`
    : 'SELECT COUNT(*) as count FROM customers';
  const countParams = params.slice(0, params.length - 2);
  const count = getDb().prepare(countSql).get(...countParams).count;

  return {
    count,
    customers: rows.map(row => ({
      phone: row.phone,
      name: row.name,
      segment: row.segment,
      totalOrders: row.total_orders,
      totalSpending: row.total_spending,
      botEnabled: !!row.bot_enabled,
      lastActivity: row.updated_at,
      channelSource: row.channel_source
    }))
  };
}

function updateBotEnabled(phone, enabled) {
  const result = getDb().prepare(
    'UPDATE customers SET bot_enabled = ?, updated_at = ? WHERE phone = ?'
  ).run(enabled ? 1 : 0, Date.now(), phone);
  return result.changes > 0;
}

function updateCustomerSegment(phone, segment) {
  const result = getDb().prepare(
    'UPDATE customers SET segment = ?, updated_at = ? WHERE phone = ?'
  ).run(segment, Date.now(), phone);
  return result.changes > 0;
}

function updateCustomerFromWC(phone, wcData) {
  const now = Date.now();
  const stmt = getDb().prepare(`
    UPDATE customers SET
      wc_customer_id = COALESCE(?, wc_customer_id),
      email = CASE WHEN ? != '' THEN ? ELSE email END,
      city = CASE WHEN ? != '' THEN ? ELSE city END,
      total_orders = ?,
      total_spending = ?,
      last_order_id = COALESCE(?, last_order_id),
      last_order_number = COALESCE(?, last_order_number),
      last_order_date = COALESCE(?, last_order_date),
      last_order_status = COALESCE(?, last_order_status),
      last_order_product = COALESCE(?, last_order_product),
      last_order_total = COALESCE(?, last_order_total),
      wc_last_sync = ?,
      updated_at = ?
    WHERE phone = ?
  `);
  stmt.run(
    wcData.wcCustomerId || null,
    wcData.email || '', wcData.email || '',
    wcData.city || '', wcData.city || '',
    wcData.totalOrders || 0,
    wcData.totalSpending || 0,
    wcData.lastOrderId || null,
    wcData.lastOrderNumber || null,
    wcData.lastOrderDate || null,
    wcData.lastOrderStatus || null,
    wcData.lastOrderProduct || null,
    wcData.lastOrderTotal || null,
    now,
    now,
    phone
  );
}

function getSegmentCounts() {
  return getDb().prepare(`
    SELECT segment, COUNT(*) as count FROM customers GROUP BY segment
  `).all().reduce((acc, row) => {
    acc[row.segment] = row.count;
    return acc;
  }, { vip: 0, normal: 0, risk: 0, sleeping: 0 });
}

function getBotEnabledCounts() {
  const d = getDb();
  const enabled = d.prepare('SELECT COUNT(*) as count FROM customers WHERE bot_enabled = 1').get().count;
  const disabled = d.prepare('SELECT COUNT(*) as count FROM customers WHERE bot_enabled = 0').get().count;
  return { enabled, disabled };
}

// ========== GÜNLÜK İSTATİSTİKLER ==========

function getTodayDateStr() {
  return new Date().toISOString().split('T')[0];
}

function incrementDailyStat(field) {
  const dateStr = getTodayDateStr();
  const d = getDb();
  d.prepare('INSERT OR IGNORE INTO daily_stats (date) VALUES (?)').run(dateStr);
  d.prepare(`UPDATE daily_stats SET ${field} = ${field} + 1 WHERE date = ?`).run(dateStr);
}

function getDailyStats(dateFrom, dateTo) {
  return getDb().prepare(
    'SELECT * FROM daily_stats WHERE date >= ? AND date <= ? ORDER BY date DESC'
  ).all(dateFrom, dateTo);
}

function getWeeklyStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateFrom = weekAgo.toISOString().split('T')[0];
  const dateTo = now.toISOString().split('T')[0];

  const row = getDb().prepare(`
    SELECT
      COALESCE(SUM(new_conversations), 0) as newConversations,
      COALESCE(SUM(total_messages), 0) as totalMessages,
      COALESCE(SUM(orders_created), 0) as ordersCreated,
      COALESCE(SUM(unique_contacts), 0) as uniqueContacts,
      COALESCE(SUM(handoff_count), 0) as handoffCount
    FROM daily_stats WHERE date >= ? AND date <= ?
  `).get(dateFrom, dateTo);

  return row || { newConversations: 0, totalMessages: 0, ordersCreated: 0, uniqueContacts: 0, handoffCount: 0 };
}

function getTodayStats() {
  const dateStr = getTodayDateStr();
  const row = getDb().prepare('SELECT * FROM daily_stats WHERE date = ?').get(dateStr);
  if (!row) {
    return {
      newConversations: 0, totalMessages: 0, inboundMessages: 0,
      outboundMessages: 0, humanMessages: 0, handoffCount: 0,
      ordersCreated: 0, uniqueContacts: 0
    };
  }
  return {
    newConversations: row.new_conversations,
    totalMessages: row.total_messages,
    inboundMessages: row.inbound_messages,
    outboundMessages: row.outbound_messages,
    humanMessages: row.human_messages,
    handoffCount: row.handoff_count,
    ordersCreated: row.orders_created,
    uniqueContacts: row.unique_contacts
  };
}

// ========== CTWA (Facebook Reklam) VERİSİ ==========

function updateCustomerAdData(phone, adData) {
  const result = getDb().prepare(
    'UPDATE customers SET ad_data = ?, channel_source = ?, updated_at = ? WHERE phone = ?'
  ).run(JSON.stringify(adData), 'facebook_ad', Date.now(), phone);
  return result.changes > 0;
}

// ========== OKUNMAMIŞ MESAJ SAYISI ==========

function getUnreadCount(phone) {
  // admin_last_read: admin panelde konuşmayı en son ne zaman açtı
  const conv = getDb().prepare('SELECT admin_last_read FROM conversations WHERE phone = ?').get(phone);
  const lastRead = conv?.admin_last_read || 0;

  const row = getDb().prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE phone = ? AND direction = 'inbound'
    AND created_at > ?
  `).get(phone, lastRead);
  return row?.count || 0;
}

function markConversationRead(phone) {
  getDb().prepare(
    'UPDATE conversations SET admin_last_read = ? WHERE phone = ?'
  ).run(Date.now(), phone);
}

function markAllConversationsRead() {
  getDb().prepare(
    'UPDATE conversations SET admin_last_read = ?'
  ).run(Date.now());
}

// ========== AI GÖZLEM İŞLEMLERİ ==========

function saveAiObservation(phone, type, confidence, data, aiResponse, sourceMessages) {
  const stmt = getDb().prepare(`
    INSERT INTO ai_observations (phone, observation_type, confidence, data, ai_response, source_messages, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    phone, type, confidence,
    JSON.stringify(data || {}),
    aiResponse || null,
    JSON.stringify(sourceMessages || []),
    Date.now()
  );
}

function getAiObservations(phone, limit = 20) {
  return getDb().prepare(`
    SELECT * FROM ai_observations WHERE phone = ? ORDER BY created_at DESC LIMIT ?
  `).all(phone, limit).map(row => ({
    id: row.id,
    phone: row.phone,
    type: row.observation_type,
    confidence: row.confidence,
    data: JSON.parse(row.data || '{}'),
    aiResponse: row.ai_response,
    sourceMessages: JSON.parse(row.source_messages || '[]'),
    reviewed: row.reviewed,
    createdAt: row.created_at
  }));
}

function getUnreviewedObservations(limit = 50) {
  return getDb().prepare(`
    SELECT * FROM ai_observations WHERE reviewed = 0 ORDER BY created_at DESC LIMIT ?
  `).all(limit).map(row => ({
    id: row.id,
    phone: row.phone,
    type: row.observation_type,
    confidence: row.confidence,
    data: JSON.parse(row.data || '{}'),
    aiResponse: row.ai_response,
    sourceMessages: JSON.parse(row.source_messages || '[]'),
    reviewed: row.reviewed,
    createdAt: row.created_at
  }));
}

function reviewObservation(id, approved) {
  // reviewed: 1 = approved, -1 = rejected
  const result = getDb().prepare(
    'UPDATE ai_observations SET reviewed = ? WHERE id = ?'
  ).run(approved ? 1 : -1, id);
  return result.changes > 0;
}

// ========== İSTATİSTİKLER ==========

function getStats() {
  const d = getDb();
  const totalConversations = d.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
  const activeHandoffs = d.prepare('SELECT COUNT(*) as count FROM conversations WHERE is_human_handoff = 1').get().count;
  const totalMessages = d.prepare('SELECT COUNT(*) as count FROM messages').get().count;
  const todayMessages = d.prepare('SELECT COUNT(*) as count FROM messages WHERE created_at > ?').get(Date.now() - 86400000).count;

  return { totalConversations, activeHandoffs, totalMessages, todayMessages };
}

// ========== SATIŞ İSTATİSTİKLERİ ==========

function incrementDailyRevenue(amount) {
  const dateStr = getTodayDateStr();
  const d = getDb();
  d.prepare(`
    INSERT INTO daily_stats (date, revenue) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET revenue = revenue + ?
  `).run(dateStr, amount, amount);
}

function getSalesStats() {
  const d = getDb();
  const today = getTodayDateStr();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const todayRev = d.prepare('SELECT COALESCE(SUM(revenue), 0) as total FROM daily_stats WHERE date = ?').get(today);
  const weekRev = d.prepare('SELECT COALESCE(SUM(revenue), 0) as total FROM daily_stats WHERE date >= ?').get(weekAgo);
  const monthRev = d.prepare('SELECT COALESCE(SUM(revenue), 0) as total FROM daily_stats WHERE date >= ?').get(monthAgo);

  const todayOrders = d.prepare('SELECT COALESCE(SUM(orders_created), 0) as total FROM daily_stats WHERE date = ?').get(today);
  const weekOrders = d.prepare('SELECT COALESCE(SUM(orders_created), 0) as total FROM daily_stats WHERE date >= ?').get(weekAgo);
  const monthOrders = d.prepare('SELECT COALESCE(SUM(orders_created), 0) as total FROM daily_stats WHERE date >= ?').get(monthAgo);

  return {
    today: { revenue: todayRev.total, orders: todayOrders.total },
    week: { revenue: weekRev.total, orders: weekOrders.total },
    month: { revenue: monthRev.total, orders: monthOrders.total }
  };
}

// ========== ZAMANLI GÖREVLER ==========

function scheduleTask(phone, taskType, scheduledAt, data = {}) {
  const stmt = getDb().prepare(`
    INSERT INTO scheduled_tasks (phone, task_type, scheduled_at, data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(phone, taskType, scheduledAt, JSON.stringify(data), Date.now());
}

function cancelTask(phone, taskType) {
  const stmt = getDb().prepare(`
    UPDATE scheduled_tasks SET status = 'cancelled'
    WHERE phone = ? AND task_type = ? AND status = 'pending'
  `);
  return stmt.run(phone, taskType);
}

function cancelTaskById(taskId) {
  const stmt = getDb().prepare(`UPDATE scheduled_tasks SET status = 'cancelled' WHERE id = ? AND status = 'pending'`);
  return stmt.run(taskId);
}

function getPendingTasks(now) {
  return getDb().prepare(`
    SELECT * FROM scheduled_tasks
    WHERE status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC
    LIMIT 50
  `).all(now);
}

function markTaskSent(taskId, result = null) {
  const stmt = getDb().prepare(`UPDATE scheduled_tasks SET status = 'sent', result = ? WHERE id = ?`);
  stmt.run(result, taskId);
}

function markTaskFailed(taskId, error) {
  const stmt = getDb().prepare(`UPDATE scheduled_tasks SET status = 'failed', result = ? WHERE id = ?`);
  stmt.run(error, taskId);
}

function getScheduledTasksByPhone(phone, limit = 20) {
  return getDb().prepare(`
    SELECT * FROM scheduled_tasks WHERE phone = ? ORDER BY created_at DESC LIMIT ?
  `).all(phone, limit);
}

function hasPendingTask(phone, taskType) {
  const row = getDb().prepare(`
    SELECT COUNT(*) as count FROM scheduled_tasks
    WHERE phone = ? AND task_type = ? AND status = 'pending'
  `).get(phone, taskType);
  return row.count > 0;
}

// ========== BROADCAST KAMPANYALAR ==========

function createBroadcastCampaign(name, segment, template, couponConfig, totalTarget) {
  const stmt = getDb().prepare(`
    INSERT INTO broadcast_campaigns (name, segment, template, coupon_config, total_target, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(name, segment, template, couponConfig ? JSON.stringify(couponConfig) : null, totalTarget, Date.now());
}

function updateBroadcastCampaign(id, updates) {
  if (updates.sentCount !== undefined) {
    getDb().prepare('UPDATE broadcast_campaigns SET sent_count = ? WHERE id = ?').run(updates.sentCount, id);
  }
  if (updates.status) {
    getDb().prepare('UPDATE broadcast_campaigns SET status = ? WHERE id = ?').run(updates.status, id);
  }
}

function getBroadcastCampaigns(limit = 20) {
  return getDb().prepare('SELECT * FROM broadcast_campaigns ORDER BY created_at DESC LIMIT ?').all(limit);
}

// ========== WEBHOOK NOTIFICATION DEDUP (DB-backed) ==========

/**
 * Bu sipariş+status bildirimi daha önce gönderildi mi?
 * true → daha önce gönderilmiş, tekrar gönderme
 */
function isNotificationSent(orderNumber, status) {
  const row = getDb().prepare(
    'SELECT id FROM sent_notifications WHERE order_number = ? AND status = ?'
  ).get(String(orderNumber), status);
  return !!row;
}

/**
 * Bildirimi gönderildi olarak işaretle
 */
function markNotificationSent(orderNumber, status, phone) {
  try {
    getDb().prepare(
      'INSERT OR IGNORE INTO sent_notifications (order_number, status, phone, sent_at) VALUES (?, ?, ?, ?)'
    ).run(String(orderNumber), status, phone, Date.now());
  } catch (e) {
    // UNIQUE constraint — zaten kayıtlı, sorun yok
  }
}

/**
 * Eski bildirim kayıtlarını temizle (7 günden eski)
 */
function cleanupOldNotifications() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  getDb().prepare('DELETE FROM sent_notifications WHERE sent_at < ?').run(sevenDaysAgo);
}

// ========== CLEANUP ==========

function closeDb() {
  if (db) {
    db.close();
    db = null;
    logger.info('Veritabanı kapatıldı');
  }
}

module.exports = {
  getDb,
  getConversation,
  saveConversation,
  deleteConversation,
  getActiveConversations,
  getHumanHandoffConversations,
  cleanupStaleConversations,
  saveMessage,
  getMessageHistory,
  getRecentMessages,
  addHandoffNote,
  getHandoffNotes,
  getStats,
  closeDb,
  // CRM - Müşteri
  getCustomer,
  saveCustomer,
  getAllCustomers,
  updateBotEnabled,
  updateCustomerSegment,
  updateCustomerFromWC,
  getSegmentCounts,
  getBotEnabledCounts,
  // Günlük İstatistikler
  incrementDailyStat,
  getDailyStats,
  getWeeklyStats,
  getTodayStats,
  getTodayDateStr,
  // CTWA / Reklam
  updateCustomerAdData,
  // Okunmamış Mesaj
  getUnreadCount,
  markConversationRead,
  markAllConversationsRead,
  // AI Gözlemler
  saveAiObservation,
  getAiObservations,
  getUnreviewedObservations,
  reviewObservation,
  // Mesaj Meta Güncelle
  updateLastMessageMeta,
  // Satış İstatistikleri
  incrementDailyRevenue,
  getSalesStats,
  // Zamanlı Görevler
  scheduleTask,
  cancelTask,
  cancelTaskById,
  getPendingTasks,
  markTaskSent,
  markTaskFailed,
  getScheduledTasksByPhone,
  hasPendingTask,
  // Broadcast Kampanyalar
  createBroadcastCampaign,
  updateBroadcastCampaign,
  getBroadcastCampaigns,
  // Webhook Bildirim Dedup
  isNotificationSent,
  markNotificationSent,
  cleanupOldNotifications
};
