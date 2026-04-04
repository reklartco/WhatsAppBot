const { sendTextMessage } = require('../../whatsappService');
const { STATES, MATERIALS } = require('../states');
const { parseOrderRegex } = require('../parseOrder');
const { parseSize } = require('../parseSize');
const { validateEmail } = require('../../../utils/validator');
const { getCustomerByEmail, createOrderMultiItem } = require('../../woocommerceService');
const logger = require('../../../utils/logger');
const statsService = require('../../statsService');

function activatePriceBot(phone, agent, { conversations, saveConvState }) {
  const db = require('../../database');
  let conv = conversations.get(phone) || db.getConversation(phone);
  if (!conv) {
    conv = { phone, name: '', state: STATES.IDLE, data: {}, isHumanHandoff: false, humanAgent: null, lastActivity: Date.now(), createdAt: Date.now() };
    conversations.set(phone, conv);
  }
  conv.state = STATES.PARTIAL_BOT_PRICE;
  conv.isHumanHandoff = false;
  conv.humanAgent = agent;
  conv.data._partialBotMode = 'price';
  saveConvState(phone, conv);
  logger.info(`[PARTIAL BOT] ${phone} → Fiyat botu aktif (admin: ${agent})`);
  return true;
}

function activateOrderBot(phone, agent, { conversations, saveConvState }) {
  const db = require('../../database');
  let conv = conversations.get(phone) || db.getConversation(phone);
  if (!conv) return false;
  conv.state = STATES.PARTIAL_BOT_ORDER;
  conv.isHumanHandoff = false;
  conv.humanAgent = agent;
  conv.data._partialBotMode = 'order';
  saveConvState(phone, conv);
  logger.info(`[PARTIAL BOT] ${phone} → Sipariş botu aktif (admin: ${agent})`);
  return true;
}

async function handlePartialBotPrice(from, conv, msgContent) {
  const text = msgContent.text || '';

  const regexParsed = parseOrderRegex(text);
  if (regexParsed && regexParsed.width && regexParsed.height && regexParsed.quantity) {
    const matCode = regexParsed.material || 'kuse';
    const material = MATERIALS[matCode] || MATERIALS['kuse'];

    conv.data.material = material;
    conv.data.width = regexParsed.width;
    conv.data.height = regexParsed.height;
    conv.data.quantity = regexParsed.quantity;
    conv.data.varietyCount = regexParsed.varietyCount || 1;
    conv.data.isDefaultMaterial = regexParsed.isDefaultMaterial || false;

    const { calculateAndShowPrice } = require('./price');
    await calculateAndShowPrice(from, conv);

    conv.state = STATES.HUMAN_HANDOFF;
    conv.isHumanHandoff = true;
    logger.info(`[PARTIAL BOT] ${from} → Fiyat gösterildi (regex), HUMAN_HANDOFF'a geri dönüldü`);
    return;
  }

  const manualParsed = parseManualPriceRequest(text);
  if (manualParsed) {
    conv.data.material = manualParsed.material;
    conv.data.width = manualParsed.width;
    conv.data.height = manualParsed.height;
    conv.data.quantity = manualParsed.quantity;
    conv.data.varietyCount = 1;

    const { calculateAndShowPrice } = require('./price');
    await calculateAndShowPrice(from, conv);

    conv.state = STATES.HUMAN_HANDOFF;
    conv.isHumanHandoff = true;
    return;
  }

  await sendTextMessage(from,
    `Fiyat hesaplayamadım. Lütfen şu formatta bilgi verin:\n\n` +
    `Örnek: "500 adet 5x5 kuşe etiket"\n` +
    `Veya: "1000 tane 10x7 şeffaf etiket"\n\n` +
    `Mevcut malzemeler: ${Object.values(MATERIALS).map(m => m.name).join(', ')}`
  );
}

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

async function handlePartialBotOrder(from, conv, msgContent) {
  const text = (msgContent.text || '').trim();

  if (!conv.data._orderEmail) {
    if (validateEmail(text)) {
      conv.data._orderEmail = text;

      const lastPrice = conv.data.price;
      if (!lastPrice) {
        await sendTextMessage(from, 'Önce fiyat hesaplaması yapılmalı. Admin /fiyat komutunu kullansın.');
        conv.state = STATES.HUMAN_HANDOFF;
        conv.isHumanHandoff = true;
        return;
      }

      try {
        const existingCustomer = await getCustomerByEmail(text);
        const customerId = existingCustomer?.id || null;

        if (!conv.data.cart || conv.data.cart.length === 0) {
          if (conv.data.material && conv.data.width && conv.data.height && conv.data.quantity) {
            conv.data.cart = [{
              material: conv.data.material,
              width: conv.data.width,
              height: conv.data.height,
              quantity: conv.data.quantity,
              varietyCount: conv.data.varietyCount || 1,
              price: conv.data.price
            }];
          }
        }

        if (!conv.data.cart || conv.data.cart.length === 0) {
          await sendTextMessage(from, 'Sipariş bilgileri bulunamadı. Önce /fiyat ile fiyat hesaplanmalı.');
          conv.state = STATES.HUMAN_HANDOFF;
          conv.isHumanHandoff = true;
          return;
        }

        const order = await createOrderMultiItem({
          customerId,
          cart: conv.data.cart,
          combinedTotals: { kargoFee: lastPrice.kargoFee || 0 },
          customerData: {
            email: text,
            phone: from,
            name: conv.name || ''
          }
        });

        await sendTextMessage(from,
          `✅ Siparişiniz oluşturuldu!\n\n` +
          `Sipariş No: #${order.number}\n` +
          `Toplam: ${order.total} TL\n\n` +
          `Ödeme için: https://1etiket.com.tr/siparis-onayla/${order.id}/`
        );

        statsService.recordOrderStat();
        logger.info(`[PARTIAL BOT] Sipariş oluşturuldu: ${from} — #${order.number}`);
      } catch (error) {
        logger.error(`[PARTIAL BOT] Sipariş oluşturma hatası:`, error.message);
        await sendTextMessage(from, 'Sipariş oluşturulurken bir hata oluştu. Lütfen admin ile iletişime geçin.');
      }

      conv.state = STATES.HUMAN_HANDOFF;
      conv.isHumanHandoff = true;
      delete conv.data._orderEmail;
      delete conv.data._partialBotMode;
      return;
    } else {
      await sendTextMessage(from, 'Geçerli bir e-posta adresi giriniz.\nÖrnek: isim@email.com');
      return;
    }
  }
}

module.exports = { handlePartialBotPrice, handlePartialBotOrder, activatePriceBot, activateOrderBot, parseManualPriceRequest };
