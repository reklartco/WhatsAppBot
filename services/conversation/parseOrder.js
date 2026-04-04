const { normalizeTurkish } = require('../../utils/validator');
const { MATERIALS } = require('./states');
const { parseSize } = require('./parseSize');
const { formatNumber } = require('./helpers');
const logger = require('../../utils/logger');

// ===== REGEX TABANLI HIZLI PARSER (AI'sız fallback) =====
function parseOrderRegex(text) {
  if (!text || text.length < 5) return null;
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // Boyut çıkar
  const sizeMatch = t.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(?:mm|cm|santim)?/);
  if (!sizeMatch) return null;

  let w = parseFloat(sizeMatch[1].replace(',', '.'));
  let h = parseFloat(sizeMatch[2].replace(',', '.'));

  const hasCmUnit = /\d\s*(cm|santim)/.test(t);
  const hasExplicitMm = /\d\s*mm/.test(t);
  const hasDecimal = /\d[.,]\d/.test(sizeMatch[1]) || /\d[.,]\d/.test(sizeMatch[2]);
  const bothSmall = w < 10 && h < 10;

  if (!hasExplicitMm && (hasCmUnit || bothSmall || hasDecimal)) {
    w = Math.round(w * 10);
    h = Math.round(h * 10);
  }

  w = Math.round(w);
  h = Math.round(h);
  if (w < 10 || w > 460 || h < 10 || h > 460) return null;

  // Adet çıkar
  let quantity = null;
  const qtyMatch = t.match(/(\d[\d.]*)\s*(?:adet|ad\b|tane)/);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1].replace(/\./g, ''));
  } else {
    const allNums = t.replace(sizeMatch[0], '').match(/\b(\d[\d.]*)\b/g);
    if (allNums) {
      for (const n of allNums) {
        const val = parseInt(n.replace(/\./g, ''));
        if (val >= 50 && val <= 1000000) { quantity = val; break; }
      }
    }
  }

  // Malzeme çıkar
  const norm = normalizeTurkish(t);
  const matKeywords = {
    'seffaf': 'seffaf', 'transparan': 'seffaf', 'saydam': 'seffaf',
    'opak': 'opak', 'plastik etiket': 'opak',
    'kraft': 'kraft', 'kahverengi': 'kraft',
    'karton': 'karton', 'mat kuse': 'karton', '350gr mat': 'karton', 'askili': 'karton',
    'metalize': 'metalize', 'metalik': 'metalize', 'altin etiket': 'metalize', 'gumus etiket': 'metalize',
    'yaldiz': 'hologram', 'yaldizli': 'hologram', 'varak': 'hologram',
    'parlak kuse': 'parlak', 'glossy': 'parlak',
    'selefonlu': '350grmatselefonlu', 'laminasyonlu': '350grmatselefonlu',
    'amerikan': '300gramerikan', 'bristol': '300gramerikan',
    'sarap kagidi': 'sarap', 'sarap etiketi': 'sarap',
    'kirilgan': 'kirilgan-etiket', 'fragile': 'kirilgan-etiket',
    'yumurta kabugu': 'yumurta-kabugu-sticker', 'dokulu': 'yumurta-kabugu-sticker',
    'fantezi': 'fantezi-kagidi', 'dekoratif': 'fantezi-kagidi',
    '170gr': '170grkuse',
    'hologram metalize': 'hologram-metalize',
    'kuse': 'kuse', 'kagit etiket': 'kuse',
  };
  let matCode = null;
  let isDefault = true;
  const sortedKeywords = Object.entries(matKeywords).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, code] of sortedKeywords) {
    if (norm.includes(keyword)) {
      matCode = code;
      isDefault = false;
      break;
    }
  }

  return {
    material: matCode || 'kuse',
    isDefaultMaterial: isDefault,
    width: w,
    height: h,
    quantity: (quantity && quantity >= 50) ? quantity : null,
    varietyCount: 1,
  };
}

// ===== ORTAK NL-TO-CART HELPER =====
async function tryNLtoCart(from, conv, text) {
  if (!text || text.length < 8) return false;

  try {
    const regexParsed = parseOrderRegex(text);
    logger.info(`[NL-CART] ${from}: Regex sonucu: ${regexParsed ? `${regexParsed.width}x${regexParsed.height}mm qty=${regexParsed.quantity} mat=${regexParsed.material}` : 'null'} — "${text.substring(0, 50)}"`);

    const parsed = regexParsed;
    if (!parsed) {
      logger.info(`[NL-CART] ${from}: Parse sonucu null — atlanıyor`);
      return false;
    }

    if (!parsed.width || !parsed.height) {
      logger.info(`[NL-CART] ${from}: Boyut eksik (w=${parsed.width}, h=${parsed.height}) — atlanıyor`);
      return false;
    }

    const matCode = parsed.material || 'kuse';
    const material = MATERIALS[matCode] || MATERIALS['kuse'];

    conv.data.material = material;
    conv.data.width = parsed.width;
    conv.data.height = parsed.height;
    conv.data.varietyCount = parsed.varietyCount || 1;
    conv.data.isDefaultMaterial = parsed.isDefaultMaterial || false;
    conv.data.isQuoteOnly = true;

    // Adet var → direkt fiyat hesapla
    if (parsed.quantity && parsed.quantity >= 50) {
      conv.data.quantity = parsed.quantity;
      logger.info(`[NL-CART] ${from}: Direkt fiyat hesaplama → ${material.name} ${parsed.width}x${parsed.height}mm ${parsed.quantity} adet`);
      // Lazy require to avoid circular dependency
      const { calculateAndShowPrice } = require('./handlers/price');
      await calculateAndShowPrice(from, conv);
      return true;
    }

    // Adet yok → malzeme+boyut kaydet, adet sor
    logger.info(`[NL-CART] ${from}: Adet eksik, sorulacak → ${material.name} ${parsed.width}x${parsed.height}mm`);
    const { sendTextMessage } = require('../whatsappService');
    await sendTextMessage(from,
      `*${material.name}* — ${parsed.width}x${parsed.height} mm\n\n` +
      `Kaç adet sipariş vermek istersiniz?\n\n` +
      `1. 100 Adet\n2. 250 Adet\n3. 1.000 Adet\n\nVeya direkt adet yazınız.`
    );
    const { STATES } = require('./states');
    conv.state = STATES.SELECT_QUANTITY;
    return true;
  } catch (error) {
    logger.error(`[NL-CART] ${from}: BEKLENMEYEN HATA — ${error.message}`, error.stack);
    return false;
  }
}

// Manuel fiyat isteği parse (regex tabanlı)
function parseManualPriceRequest(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  const qtyMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:adet|tane|ad\b)/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1].replace('.', '')) : null;

  const sizeResult = parseSize(lower);
  if (!sizeResult || sizeResult.error) return null;

  let foundMaterial = null;
  for (const [key, mat] of Object.entries(MATERIALS)) {
    if (lower.includes(key) || lower.includes(mat.name.toLowerCase())) {
      foundMaterial = mat;
      break;
    }
  }

  if (!quantity || !foundMaterial) return null;
  if (quantity < 50) return null;

  return {
    material: foundMaterial,
    width: sizeResult.width,
    height: sizeResult.height,
    quantity
  };
}

module.exports = {
  parseOrderRegex,
  tryNLtoCart,
  parseManualPriceRequest,
};
