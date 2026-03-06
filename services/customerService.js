const db = require('./database');
const logger = require('../utils/logger');

// ========== MÜŞTERİ PROFİLİ SERVİSİ ==========

/**
 * Müşteri getir veya oluştur (konuşma başladığında çağrılır)
 */
function getOrCreateCustomer(phone, name, channelSource) {
  let customer = db.getCustomer(phone);

  if (!customer) {
    db.saveCustomer(phone, {
      name: name || '',
      channelSource: channelSource || 'organic',
      botEnabled: true
    });
    customer = db.getCustomer(phone);
    logger.info(`[CRM] Yeni müşteri oluşturuldu: ${phone} (${name})`);
  } else if (name && name !== 'Müşteri' && customer.name !== name) {
    // İsim güncelle
    db.saveCustomer(phone, { ...customer, name });
  }

  return customer;
}

/**
 * WooCommerce'den müşteri verilerini senkronize et
 */
async function syncCustomerFromWC(phone) {
  const customer = db.getCustomer(phone);
  if (!customer) return null;

  try {
    const { getWooCommerceClient, extractState } = require('./woocommerceService');
    const wc = getWooCommerceClient();

    // 1. WC müşteri bul
    let wcCustomer = null;
    if (customer.wcCustomerId) {
      try {
        const res = await wc.get(`customers/${customer.wcCustomerId}`);
        wcCustomer = res.data;
      } catch (e) {
        logger.warn(`[CRM] WC müşteri ID ${customer.wcCustomerId} bulunamadı: ${e.message}`);
      }
    }

    if (!wcCustomer) {
      // Telefon ile ara
      try {
        const res = await wc.get('customers', { search: phone, per_page: 5 });
        if (res.data?.length > 0) {
          // Telefon numarası eşleşmesi
          wcCustomer = res.data.find(c =>
            c.billing?.phone?.replace(/\D/g, '').includes(phone.slice(-10)) ||
            c.meta_data?.some(m => m.key === 'whatsapp_number' && m.value?.includes(phone.slice(-10)))
          );
          if (!wcCustomer && res.data.length === 1) {
            wcCustomer = res.data[0];
          }
        }
      } catch (e) {
        logger.warn(`[CRM] WC müşteri telefon araması başarısız: ${e.message}`);
      }
    }

    if (!wcCustomer) {
      logger.info(`[CRM] WC'de müşteri bulunamadı: ${phone}`);
      return customer;
    }

    // 2. Siparişleri getir
    let orders = [];
    try {
      const ordersRes = await wc.get('orders', {
        customer: wcCustomer.id,
        per_page: 100,
        orderby: 'date',
        order: 'desc'
      });
      orders = ordersRes.data || [];
    } catch (e) {
      logger.warn(`[CRM] WC siparişleri alınamadı: ${e.message}`);
    }

    // 3. Toplamları hesapla
    const validOrders = orders.filter(o =>
      ['completed', 'processing', 'on-hold', 'pending'].includes(o.status)
    );
    const totalOrders = validOrders.length;
    const totalSpending = validOrders
      .filter(o => ['completed', 'processing'].includes(o.status))
      .reduce((sum, o) => sum + parseFloat(o.total || 0), 0);

    // 4. Son sipariş
    const lastOrder = orders[0] || null;
    const lastOrderProduct = lastOrder?.line_items?.[0]?.name || '';

    // 5. İl bilgisi
    const stateCode = wcCustomer.billing?.state || '';
    const { TR_STATE_NAMES } = require('./woocommerceService');
    const city = TR_STATE_NAMES?.[stateCode] || stateCode;

    // 6. DB güncelle
    db.updateCustomerFromWC(phone, {
      wcCustomerId: wcCustomer.id,
      email: wcCustomer.email || '',
      city: city,
      totalOrders,
      totalSpending: Math.round(totalSpending * 100) / 100,
      lastOrderId: lastOrder?.id || null,
      lastOrderNumber: lastOrder?.number?.toString() || null,
      lastOrderDate: lastOrder ? new Date(lastOrder.date_created).getTime() : null,
      lastOrderStatus: lastOrder?.status || null,
      lastOrderProduct,
      lastOrderTotal: lastOrder?.total || null
    });

    // 7. Segment hesapla
    const updatedCustomer = db.getCustomer(phone);
    const newSegment = calculateSegment(updatedCustomer);
    if (newSegment !== updatedCustomer.segment) {
      db.updateCustomerSegment(phone, newSegment);
    }

    logger.info(`[CRM] WC sync tamamlandı: ${phone} — ${totalOrders} sipariş, ${totalSpending.toFixed(2)} TL`);
    return db.getCustomer(phone);

  } catch (error) {
    logger.error(`[CRM] WC sync hatası (${phone}):`, error.message);
    return customer;
  }
}

/**
 * Segment hesapla
 * VIP: 3+ sipariş VEYA 1000+ TL harcama
 * Sleeping: Sipariş var ama 30+ gün inaktif
 * Normal: Default
 */
function calculateSegment(customer) {
  if (!customer) return 'normal';

  // VIP
  if (customer.totalOrders >= 3 || customer.totalSpending >= 1000) {
    return 'vip';
  }

  // Sleeping: son güncelleme 30+ gün önce VE sipariş geçmişi var
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  if (customer.totalOrders > 0 && customer.updatedAt < thirtyDaysAgo) {
    return 'sleeping';
  }

  return 'normal';
}

/**
 * Bot ON/OFF toggle
 */
function toggleBot(phone, enabled) {
  // Müşteri yoksa oluştur
  let customer = db.getCustomer(phone);
  if (!customer) {
    db.saveCustomer(phone, { name: '', botEnabled: enabled });
    return { success: true, botEnabled: enabled };
  }

  const result = db.updateBotEnabled(phone, enabled);
  logger.info(`[CRM] Bot ${enabled ? 'AÇILDI' : 'KAPATILDI'}: ${phone}`);
  return { success: result, botEnabled: enabled };
}

/**
 * 360 derece müşteri profili
 */
function getCustomerProfile(phone) {
  const customer = db.getCustomer(phone);
  if (!customer) return null;

  const conversation = db.getConversation(phone);
  const handoffNotes = db.getHandoffNotes(phone);

  return {
    customer: {
      phone: customer.phone,
      name: customer.name,
      email: customer.email,
      city: customer.city,
      customerType: customer.customerType,
      segment: customer.segment,
      channelSource: customer.channelSource,
      totalOrders: customer.totalOrders,
      totalSpending: customer.totalSpending,
      lastOrder: customer.lastOrderId ? {
        id: customer.lastOrderId,
        number: customer.lastOrderNumber,
        date: customer.lastOrderDate,
        status: customer.lastOrderStatus,
        product: customer.lastOrderProduct,
        total: customer.lastOrderTotal
      } : null,
      botEnabled: customer.botEnabled,
      wcCustomerId: customer.wcCustomerId,
      wcLastSync: customer.wcLastSync,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    },
    conversation: conversation ? {
      state: conversation.state,
      isHumanHandoff: conversation.isHumanHandoff,
      humanAgent: conversation.humanAgent,
      lastActivity: conversation.lastActivity,
      data: conversation.data
    } : null,
    handoffNotes: handoffNotes || []
  };
}

/**
 * Tüm müşterileri toplu WC sync (background cron)
 */
async function syncAllCustomers() {
  logger.info('[CRM] Toplu WC senkronizasyon başladı...');
  const { customers } = db.getAllCustomers({ limit: 500 });

  let synced = 0;
  let errors = 0;

  for (const c of customers) {
    try {
      const full = db.getCustomer(c.phone);
      if (full && full.wcCustomerId) {
        await syncCustomerFromWC(c.phone);
        synced++;
        // WC rate limit — 200ms bekle
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      errors++;
    }
  }

  logger.info(`[CRM] Toplu sync tamamlandı: ${synced} başarılı, ${errors} hata`);
}

// Background sync — 6 saatte bir
let syncInterval = null;
function startBackgroundSync() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  syncInterval = setInterval(syncAllCustomers, SIX_HOURS);
  syncInterval.unref();
  logger.info('[CRM] Background sync başlatıldı (6 saatte bir)');
}

function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

module.exports = {
  getOrCreateCustomer,
  syncCustomerFromWC,
  calculateSegment,
  toggleBot,
  getCustomerProfile,
  syncAllCustomers,
  startBackgroundSync,
  stopBackgroundSync
};
