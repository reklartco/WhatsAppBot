/**
 * Coupon Service — WooCommerce kupon oluşturma ve yönetimi
 */

const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const logger = require('../utils/logger');

let WooCommerce;

function getWooCommerceClient() {
  if (!WooCommerce) {
    WooCommerce = new WooCommerceRestApi({
      url: process.env.WC_URL,
      consumerKey: process.env.WC_CONSUMER_KEY,
      consumerSecret: process.env.WC_CONSUMER_SECRET,
      version: 'wc/v3'
    });
  }
  return WooCommerce;
}

/**
 * Benzersiz kupon kodu üret
 * @param {string} prefix - Kupon ön eki (örn: 'SEPET', 'TEKRAR', 'VIP')
 * @returns {string} Benzersiz kupon kodu (örn: 'SEPET-A7X3')
 */
function generateUniqueCode(prefix = 'KUPON') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // I, O, 0, 1 hariç (karışıklık önleme)
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${suffix}`;
}

/**
 * WooCommerce'te kupon oluştur
 * @param {Object} options
 * @param {number} options.amount - İndirim miktarı (TL veya %)
 * @param {string} options.type - 'fixed_cart' (sabit TL) veya 'percent' (yüzde)
 * @param {number} options.minSpend - Minimum sepet tutarı (0 = limit yok)
 * @param {number} options.expiryDays - Geçerlilik süresi (gün)
 * @param {string} options.email - Kupon sahibi email (opsiyonel, kısıtlama için)
 * @param {string} options.prefix - Kupon kodu ön eki
 * @returns {Object} { code, id, amount, type, expiryDate }
 */
async function createCoupon({ amount, type = 'fixed_cart', minSpend = 0, expiryDays = 30, email = null, prefix = 'KUPON' }) {
  const wc = getWooCommerceClient();
  const code = generateUniqueCode(prefix);

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  const dateExpires = expiryDate.toISOString().slice(0, 10); // YYYY-MM-DD format

  const couponData = {
    code: code,
    discount_type: type,
    amount: amount.toString(),
    individual_use: true, // Diğer kuponlarla birleştirilemez
    usage_limit: 1, // Tek kullanımlık
    usage_limit_per_user: 1,
    date_expires: dateExpires,
    minimum_amount: minSpend > 0 ? minSpend.toString() : '',
    description: `WhatsApp bot tarafından oluşturuldu — ${new Date().toLocaleDateString('tr-TR')}`
  };

  // Email kısıtlaması (opsiyonel)
  if (email) {
    couponData.email_restrictions = [email];
  }

  try {
    const response = await wc.post('coupons', couponData);
    const coupon = response.data;

    logger.info(`[COUPON] Kupon oluşturuldu: ${code} — ${amount}${type === 'percent' ? '%' : '₺'} — Son: ${dateExpires}`);

    return {
      id: coupon.id,
      code: coupon.code,
      amount: amount,
      type: type,
      expiryDate: dateExpires
    };
  } catch (error) {
    logger.error(`[COUPON] Kupon oluşturma hatası:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Kupon bilgisini sorgula
 * @param {string} code - Kupon kodu
 * @returns {Object|null}
 */
async function getCoupon(code) {
  const wc = getWooCommerceClient();
  try {
    const response = await wc.get('coupons', { code: code });
    if (response.data && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch (error) {
    logger.error(`[COUPON] Kupon sorgulama hatası (${code}):`, error.message);
    return null;
  }
}

/**
 * Kuponu sil
 * @param {number} couponId - WC kupon ID
 */
async function deleteCoupon(couponId) {
  const wc = getWooCommerceClient();
  try {
    await wc.delete(`coupons/${couponId}`, { force: true });
    logger.info(`[COUPON] Kupon silindi: #${couponId}`);
  } catch (error) {
    logger.error(`[COUPON] Kupon silme hatası (#${couponId}):`, error.message);
  }
}

module.exports = {
  createCoupon,
  getCoupon,
  deleteCoupon,
  generateUniqueCode
};
