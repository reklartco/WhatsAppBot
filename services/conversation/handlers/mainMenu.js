const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const { normalizeTurkish } = require('../../../utils/validator');
const { handleMainMenuError } = require('../errorRecovery');
const { tryNLtoCart, parseOrderRegex } = require('../parseOrder');
const logger = require('../../../utils/logger');

async function showMaterialList(from) {
  let text = `Etiket türünü seçin:\n\n`;
  text += `1. Kuşe Etiket — En yaygın, uygun fiyatlı\n`;
  text += `2. Opak Etiket — Suya dayanıklı\n`;
  text += `3. Şeffaf Etiket — Şeffaf zemin\n`;
  text += `4. Kraft Etiket — Kraft görünümlü\n`;
  text += `5. Karton Etiket — Dayanıklı karton\n`;
  text += `6. Metalize Etiket — Altın/Gümüş\n`;
  text += `7. Hologram Etiket — Orijinallik\n\n`;
  text += `Lütfen numara ile seçim yapın.`;
  await sendTextMessage(from, text);
}

async function handleMainMenu(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();
  const text = msgContent.text?.trim() || '';
  const norm = normalizeTurkish(selection || '');

  // 1. UZUN METİNLERDE ÖNCE NL-TO-CART DENE
  if (!msgContent.buttonId && text.length >= 8) {
    const nlResult = await tryNLtoCart(from, conv, text);
    if (nlResult) return;
  }

  // 2. BUTON / KISA METİN / KEYWORD MATCHING
  if (selection === 'price_inquiry' ||
      norm.includes('fiyat') || norm.includes('hesapla') || norm.includes('ucret') || norm.includes('kac para')) {
    if (text.length >= 8) {
      const regexFallback = parseOrderRegex(text);
      if (regexFallback && regexFallback.width && regexFallback.height) {
        conv.data._pendingWidth = regexFallback.width;
        conv.data._pendingHeight = regexFallback.height;
        if (regexFallback.quantity && regexFallback.quantity >= 50) {
          conv.data._pendingQuantity = regexFallback.quantity;
        }
        logger.info(`[MAIN-MENU] ${from}: Boyut bilgisi korundu (fallback): ${regexFallback.width}x${regexFallback.height}mm qty=${regexFallback.quantity || 'yok'}`);
      }
    }
    await showMaterialList(from);
    conv.data.isQuoteOnly = true;
    conv.state = STATES.SELECT_MATERIAL;

  } else if (selection === 'new_order' ||
      norm.includes('siparis') || norm.includes('etiket') || norm.includes('almak') || norm.includes('satin')) {
    if (text.length >= 8) {
      const regexFallback = parseOrderRegex(text);
      if (regexFallback && regexFallback.width && regexFallback.height) {
        conv.data._pendingWidth = regexFallback.width;
        conv.data._pendingHeight = regexFallback.height;
        if (regexFallback.quantity && regexFallback.quantity >= 50) {
          conv.data._pendingQuantity = regexFallback.quantity;
        }
        logger.info(`[MAIN-MENU] ${from}: Boyut bilgisi korundu (sipariş fallback): ${regexFallback.width}x${regexFallback.height}mm qty=${regexFallback.quantity || 'yok'}`);
      }
    }
    await showMaterialList(from);
    conv.data.isQuoteOnly = false;
    conv.state = STATES.SELECT_MATERIAL;

  } else if (selection === 'label_info' || norm.includes('bilgi')) {
    const { showLabelInfoMenu } = require('./labelInfo');
    await showLabelInfoMenu(from);
    conv.state = STATES.LABEL_INFO;

  } else if (selection === 'customer_rep' || norm.includes('temsilci') || norm.includes('insan') || norm.includes('operator') || norm.includes('yetkili')) {
    const { triggerHumanHandoff } = require('./humanHandoff');
    await triggerHumanHandoff(from, conv.name, conv);

  } else if (selection === 'track_order' || norm.includes('takip') || norm.includes('kargo') || norm.includes('nerede')) {
    await sendTextMessage(from,
      'Sipariş takibi için sipariş numaranızı girin:\n(Örnek: 12345)'
    );
    conv.state = STATES.ORDER_TRACKING;

  } else {
    await handleMainMenuError(from, conv);
  }
}

module.exports = { handleMainMenu, showMaterialList };
