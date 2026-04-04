const axios = require('axios');
const logger = require('../utils/logger');

const AJAX_URL = 'https://www.1etiket.com.tr/wp-admin/admin-ajax.php';

// Nonce cache (5 dk'da bir yenilenir)
let cachedNonce = null;
let nonceExpiry = 0;

/**
 * WordPress admin-ajax.php üzerinden nonce al
 */
async function getNonce() {
  if (cachedNonce && Date.now() < nonceExpiry) {
    return cachedNonce;
  }

  const response = await axios.post(AJAX_URL,
    'action=etiket_yeni_nonce',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, timeout: 10000 }
  );

  if (response.data?.success && response.data?.nonce) {
    cachedNonce = response.data.nonce;
    nonceExpiry = Date.now() + 4 * 60 * 1000; // 4 dk cache (5 dk'dan önce yenile)
    return cachedNonce;
  }

  throw new Error('Nonce alınamadı');
}

/**
 * 1etiket.com.tr fiyat hesaplama (admin-ajax.php → etiket_hesapla)
 * material: kagit_turu select value (kuşe, opak, şeffaf, metalize vb.)
 */
async function calculatePrice({ material, width, height, quantity }) {
  try {
    const nonce = await getNonce();

    const params = new URLSearchParams();
    params.append('action', 'etiket_hesapla');
    params.append('nonce', nonce);
    params.append('kagit_turu', material);
    params.append('genislik', width.toString());
    params.append('yukseklik', height.toString());
    params.append('toplam_adet', quantity.toString());

    const response = await axios.post(AJAX_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      timeout: 15000
    });

    const data = response.data;

    if (!data.success) {
      // Nonce expired — yenile ve tekrar dene
      if (data.message?.includes('nonce') || data.message?.includes('Güvenlik')) {
        cachedNonce = null;
        nonceExpiry = 0;
        const freshNonce = await getNonce();
        params.set('nonce', freshNonce);

        const retry = await axios.post(AJAX_URL, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          timeout: 15000
        });

        if (!retry.data.success) {
          throw new Error(retry.data.message || 'Fiyat hesaplanamadı');
        }

        return formatPriceResult(retry.data);
      }

      throw new Error(data.message || 'Fiyat hesaplanamadı');
    }

    return formatPriceResult(data);

  } catch (error) {
    logger.error('Fiyat API hatası:', error.message);
    throw error;
  }
}

/**
 * API cevabını standart formata dönüştür
 */
const KDV_RATE = 0.20;
const KARGO_THRESHOLD = 2000; // TL (KDV hariç)
const KARGO_FEE = 130; // TL

function formatPriceResult(data) {
  const totalRaw = Number(data.toplam_fiyat) || 0;
  const unitRaw = Number(data.birim_fiyat) || 0;
  const kdvAmount = totalRaw * KDV_RATE;
  const totalWithKdv = totalRaw + kdvAmount;
  const freeShipping = totalRaw >= KARGO_THRESHOLD;
  const kargoFee = freeShipping ? 0 : KARGO_FEE;
  const grandTotal = totalWithKdv + kargoFee;

  return {
    unitPrice: data.birim_fiyat_formatted || String(unitRaw),
    totalPrice: data.toplam_fiyat_formatted || String(totalRaw),
    totalRaw,
    kdvAmount: formatTRPrice(kdvAmount),
    totalWithKdv: formatTRPrice(totalWithKdv),
    freeShipping,
    kargoFee,
    grandTotal: formatTRPrice(grandTotal),
    deliveryDays: '3-5',
    discount: data.indirim_var ? data.indirim_orani : 0,
    discountAmount: data.indirim_tutari_formatted || '0',
    sheets: data.gerekli_tabaka,
    labelsPerSheet: data.tabaka_etiket,
    layout: data.yerlesim,
    pricePerSheet: data.tabaka_basi_fiyat_formatted
  };
}

function formatTRPrice(num) {
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted},${decPart}`;
}

module.exports = { calculatePrice, formatTRPrice };
