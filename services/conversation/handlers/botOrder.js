const { sendCTAButton } = require('../../whatsappService');
const db = require('../../database');
const logger = require('../../../utils/logger');

function parseBotOrderCommand(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 3) return null;

  let email = null;
  const lineItems = [];
  let grandTotalOverride = null;
  let isKdvDahil = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    if (i === 0 && lineLower.startsWith('/bot')) continue;

    const emailMatch = line.match(/^(\S+@\S+\.\S+)$/);
    if (!email && emailMatch) {
      email = emailMatch[1];
      continue;
    }
    if (!email) {
      const inlineEmail = line.match(/(\S+@\S+\.\S+)/);
      if (inlineEmail && !line.match(/\d+\s*adet/i)) {
        email = inlineEmail[1];
        continue;
      }
    }

    const totalOverrideMatch = lineLower.match(/([\d.]+)\s*(tl|₺)\s*(kdv\s*dah)/i);
    if (totalOverrideMatch) {
      const raw = totalOverrideMatch[1];
      if (raw.includes('.') && !raw.match(/\.\d{1,2}$/)) {
        grandTotalOverride = parseFloat(raw.replace(/\./g, ''));
      } else {
        grandTotalOverride = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
      }
      isKdvDahil = true;
      continue;
    }

    if (lineLower.match(/^toplam\b/) && !lineLower.includes('adet')) {
      continue;
    }

    const qtyMatch = line.match(/([\d.]+)\s*adet/i);
    const sizeMatch = line.match(/(\d+)\s*[xX×]\s*(\d+)\s*(cm|mm)?/i);
    const priceMatch = line.match(/([\d.]+)\s*(TL|₺)/i);

    if (qtyMatch && priceMatch) {
      const qtyStr = qtyMatch[1].replace(/\./g, '');
      const quantity = parseInt(qtyStr, 10);

      const priceStr = priceMatch[1];
      let unitPrice;
      if (priceStr.includes('.') && !priceStr.match(/\.\d{1,2}$/)) {
        unitPrice = parseFloat(priceStr.replace(/\./g, ''));
      } else {
        unitPrice = parseFloat(priceStr.replace(/\./g, '').replace(',', '.'));
      }

      let width = 0, height = 0;
      if (sizeMatch) {
        width = parseInt(sizeMatch[1], 10);
        height = parseInt(sizeMatch[2], 10);
        const unit = (sizeMatch[3] || 'cm').toLowerCase();
        if (unit === 'cm') {
          width *= 10;
          height *= 10;
        }
      }

      let description = line
        .replace(/([\d.]+)\s*(TL|₺).*$/i, '')
        .replace(/([\d.]+)\s*adet/i, '')
        .replace(/(\d+)\s*[xX×]\s*(\d+)\s*(cm|mm)?/i, '')
        .replace(/[+\s]+kdv/i, '')
        .replace(/[-–—]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!description) description = 'Etiket';

      lineItems.push({ description, quantity, width, height, unitPrice });
    }
  }

  if (!email || lineItems.length === 0) return null;

  return { email, lineItems, grandTotalOverride, isKdvDahil };
}

async function handleBotOrderCommand(phone, text, agent) {
  const wcService = require('../../woocommerceService');

  try {
    const parsed = parseBotOrderCommand(text);
    if (!parsed) {
      logger.warn(`[BOT ORDER] ${phone}: Parse başarısız — geçersiz format`);
      db.saveMessage(phone, 'human', '[BOT ORDER HATA] Komut formatı geçersiz. Örnek:\n/bot\nemail@example.com\nÜrün - 1000adet 5x5cm 2500 TL\nToplam 3000 TL kdv dahil', 'text', { agent });
      return;
    }

    logger.info(`[BOT ORDER] ${phone}: Parse OK — email=${parsed.email}, ${parsed.lineItems.length} ürün, override=${parsed.grandTotalOverride}`);

    let customer = await wcService.getCustomerByEmail(parsed.email);
    let customerId;
    if (customer) {
      customerId = customer.id;
      logger.info(`[BOT ORDER] Mevcut müşteri bulundu: ID=${customerId}`);
    } else {
      const cleanPhone = phone.replace('@s.whatsapp.net', '').replace(/\D/g, '');
      const newCustomer = await wcService.createCustomer({
        email: parsed.email,
        phone: cleanPhone,
        first_name: '',
        last_name: ''
      });
      customerId = newCustomer.id;
      logger.info(`[BOT ORDER] Yeni müşteri oluşturuldu: ID=${customerId}`);
    }

    const order = await wcService.createAdminBotOrder({
      customerId,
      email: parsed.email,
      phone: phone.replace('@s.whatsapp.net', ''),
      lineItems: parsed.lineItems,
      grandTotalOverride: parsed.grandTotalOverride,
      isKdvDahil: parsed.isKdvDahil
    });

    const totalFormatted = parseFloat(order.total).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
    const customerMsg = `Siparişiniz oluşturuldu!\n` +
      `Sipariş #${order.number}\n` +
      `Toplam: ${totalFormatted} ₺\n\n` +
      `Aşağıdaki butona tıklayarak ödemenizi tamamlayabilirsiniz.`;

    await sendCTAButton(phone, customerMsg, 'Ödeme Yap', order.payment_url);

    const itemsSummary = parsed.lineItems.map((item, i) =>
      `  ${i + 1}) ${item.description} - ${item.quantity.toLocaleString('tr-TR')} adet${item.width ? ` ${item.width / 10}x${item.height / 10}cm` : ''} → ${item.unitPrice.toLocaleString('tr-TR')} TL`
    ).join('\n');
    const lineItemsTotal = parsed.lineItems.reduce((sum, item) => sum + item.unitPrice, 0);

    let adminLog = `[BOT ORDER] Sipariş #${order.number} oluşturuldu\n` +
      `Email: ${parsed.email}\n` +
      `Ürünler:\n${itemsSummary}\n` +
      `Alt toplam: ${lineItemsTotal.toLocaleString('tr-TR')} TL`;
    if (parsed.grandTotalOverride) {
      adminLog += ` → KDV dahil sabit: ${parsed.grandTotalOverride.toLocaleString('tr-TR')} TL`;
    }
    adminLog += `\nÖdeme linki: ${order.payment_url}`;

    db.saveMessage(phone, 'human', adminLog, 'text', { agent });
    logger.info(`[BOT ORDER] ${phone}: Sipariş #${order.number} başarıyla oluşturuldu — toplam: ${order.total} TL`);

  } catch (error) {
    logger.error(`[BOT ORDER] ${phone}: HATA — ${error.message}`, error.stack);
    db.saveMessage(phone, 'human', `[BOT ORDER HATA] ${error.message}`, 'text', { agent });
  }
}

module.exports = { parseBotOrderCommand, handleBotOrderCommand };
