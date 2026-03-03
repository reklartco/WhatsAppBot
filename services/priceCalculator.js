const axios = require('axios');
const logger = require('../utils/logger');

/**
 * WordPress'teki fiyat hesaplama API'sini çağır
 * Bu endpoint mevcut WooCommerce fiyat mantığını kullanır
 */
async function calculatePrice({ material, width, height, quantity, lamination }) {
  try {
    const response = await axios.post(process.env.PRICE_API_URL, {
      material,
      width,    // mm cinsinden
      height,   // mm cinsinden
      quantity,
      lamination
    }, {
      headers: {
        'X-API-Key': process.env.PRICE_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      unitPrice: response.data.unit_price,
      totalPrice: response.data.total_price,
      deliveryDays: response.data.delivery_days || '3-5',
      discount: response.data.discount || 0
    };
  } catch (error) {
    logger.error('Fiyat API hatası:', error.response?.data || error.message);

    // Fallback: yerel hesaplama (API çalışmazsa)
    return calculatePriceLocal({ material, width, height, quantity, lamination });
  }
}

/**
 * Yerel fallback fiyat hesaplama
 * API çalışmazsa bu fonksiyon devreye girer
 */
function calculatePriceLocal({ material, width, height, quantity, lamination }) {
  // Temel birim fiyatlar (₺/cm²)
  const basePrices = {
    'kuse': 0.005,
    'kraft': 0.006,
    'seffaf_pp': 0.008,
    'beyaz_pp': 0.007,
    'vellum': 0.006,
    'silver': 0.010,
    'gold': 0.011,
    'hologram': 0.013
  };

  // Alan hesabı (mm → cm)
  const areaCm2 = (width / 10) * (height / 10);

  // Temel birim fiyat
  let unitPrice = areaCm2 * (basePrices[material] || 0.005);

  // Laminasyon çarpanı
  const laminationMultiplier = {
    'none': 1.0,
    'glossy': 1.15,
    'matte': 1.18
  };
  unitPrice *= laminationMultiplier[lamination] || 1.0;

  // Miktar indirimi
  let discount = 0;
  if (quantity >= 5000) discount = 0.30;
  else if (quantity >= 1000) discount = 0.20;
  else if (quantity >= 500) discount = 0.10;
  else if (quantity >= 250) discount = 0.05;

  unitPrice *= (1 - discount);

  // Minimum birim fiyat
  unitPrice = Math.max(unitPrice, 0.02);

  const totalPrice = unitPrice * quantity;

  // Teslimat süresi
  let deliveryDays = '3-5';
  if (quantity > 5000) deliveryDays = '5-7';
  if (quantity > 10000) deliveryDays = '7-10';

  return {
    unitPrice: unitPrice.toFixed(4),
    totalPrice: totalPrice.toFixed(2),
    deliveryDays,
    discount: Math.round(discount * 100)
  };
}

module.exports = { calculatePrice, calculatePriceLocal };
