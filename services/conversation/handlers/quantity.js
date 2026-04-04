const { sendTextMessage } = require('../../whatsappService');
const { calculatePrice } = require('../../priceCalculator');
const { STATES } = require('../states');
const { formatNumber } = require('../helpers');
const { handleStateError, onSuccessfulTransition } = require('../errorRecovery');
const { tryNLtoCart } = require('../parseOrder');
const logger = require('../../../utils/logger');

async function handleQuantitySelect(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;
  const text = (selection || '').trim();

  // Çoklu fiyat sonuçlarından seçim
  if (conv.data._multiPriceResults) {
    const results = conv.data._multiPriceResults;
    const num = parseInt(text);
    if (num >= 1 && num <= results.length) {
      conv.data.quantity = results[num - 1].quantity;
      conv.data.price = results[num - 1].price;
      delete conv.data._multiPriceResults;
      onSuccessfulTransition(conv, STATES.SELECT_QUANTITY);
      const { askDesignVariety } = require('./designVariety');
      await askDesignVariety(from, conv);
      return;
    }
    const cleaned = text.replace(/\./g, '').replace(/,/g, '').trim();
    const customQty = parseInt(cleaned);
    if (customQty && customQty >= 50) {
      conv.data.quantity = customQty;
      delete conv.data._multiPriceResults;
      onSuccessfulTransition(conv, STATES.SELECT_QUANTITY);
      const { askDesignVariety } = require('./designVariety');
      await askDesignVariety(from, conv);
      return;
    }
    await sendTextMessage(from, 'Lütfen listeden bir numara seçin veya farklı bir adet girin (min 50).');
    return;
  }

  // PRESET ÇOKLU SEÇİM: "1 ve 2", "2,3"
  const PRESET_MAP = { '1': 100, '2': 250, '3': 1000 };
  const trimmedText = text.trim();
  const isMultiSelect = /^[123](?:\s*(?:ve|ile|,|\s)\s*[123])+$/.test(trimmedText);

  if (isMultiSelect) {
    const multiChoices = trimmedText.match(/[123]/g);
    const uniqueChoices = [...new Set(multiChoices)];
    const quantities = uniqueChoices.map(n => PRESET_MAP[n]).filter(Boolean);
    if (quantities.length >= 2) {
      onSuccessfulTransition(conv, STATES.SELECT_QUANTITY);
      await showMultiQuantityPrices(from, conv, quantities);
      return;
    }
  }

  // DOĞAL DİL ÇOKLU ADET
  const normalizedQtyText = trimmedText.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
  const qtyParts = normalizedQtyText.split(/\s*(?:ve|ile|[-,\/])\s*|\s+/).filter(Boolean);
  const parsedQtys = qtyParts.map(p => parseInt(p)).filter(q => !isNaN(q) && q >= 50 && q <= 1000000);
  const uniqueQtys = [...new Set(parsedQtys)];

  if (uniqueQtys.length >= 2 && parsedQtys.length === qtyParts.length) {
    onSuccessfulTransition(conv, STATES.SELECT_QUANTITY);
    await showMultiQuantityPrices(from, conv, uniqueQtys);
    return;
  }

  // TEKLİ PRESET SEÇİM
  if (selection === 'qty_100' || text === '1') {
    conv.data.quantity = 100;
  } else if (selection === 'qty_250' || text === '2') {
    conv.data.quantity = 250;
  } else if (selection === 'qty_1000' || text === '3') {
    conv.data.quantity = 1000;
  } else {
    const cleaned = text.replace(/\./g, '').replace(/,/g, '').trim();
    const qty = parseInt(cleaned);
    if (qty && qty >= 50) {
      conv.data.quantity = qty;
    } else {
      if (text.length >= 8) {
        const nlResult = await tryNLtoCart(from, conv, text);
        if (nlResult) return;
      }
      const recovered = await handleStateError(from, conv,
        'Geçersiz adet. Minimum 50 adet sipariş verilir.\n\n' +
        '1. 100 Adet\n2. 250 Adet\n3. 1.000 Adet\n\nVeya direkt adet yazınız.'
      );
      if (recovered) return;
      return;
    }
  }

  onSuccessfulTransition(conv, STATES.SELECT_QUANTITY);
  const { askDesignVariety } = require('./designVariety');
  await askDesignVariety(from, conv);
}

async function showMultiQuantityPrices(from, conv, quantities) {
  await sendTextMessage(from, 'Fiyatlar hesaplanıyor...');

  try {
    const results = [];
    for (const qty of quantities.sort((a, b) => a - b)) {
      const priceResult = await calculatePrice({
        material: conv.data.material.code,
        width: conv.data.width,
        height: conv.data.height,
        quantity: qty
      });
      results.push({ quantity: qty, price: priceResult });
    }

    let msg = `*${conv.data.material.name}* — ${conv.data.width}x${conv.data.height} mm\n\n`;
    results.forEach((r, i) => {
      msg += `${i + 1}. *${formatNumber(r.quantity)} adet* → *${r.price.grandTotal} TL* (KDV dahil)`;
      if (r.price.freeShipping) msg += ` 🚚`;
      msg += `\n`;
    });

    msg += `\nHangi adette sipariş vermek istersiniz? Numara yazın veya farklı bir adet girin.`;

    await sendTextMessage(from, msg);
    conv.data._multiPriceResults = results;
    conv.state = STATES.SELECT_QUANTITY;
  } catch (error) {
    logger.error('Çoklu fiyat hesaplama hatası:', error);
    await sendTextMessage(from, 'Fiyat hesaplanamadı. Lütfen tekrar deneyin.');
  }
}

async function handleCustomQuantity(from, conv, msgContent) {
  const text = (msgContent.text || '').trim();
  const cleaned = text.replace(/\./g, '').replace(/,/g, '').trim();
  const qty = parseInt(cleaned);

  if (!qty || qty < 50) {
    if (text.length >= 8) {
      const nlResult = await tryNLtoCart(from, conv, text);
      if (nlResult) return;
    }
    const recovered = await handleStateError(from, conv,
      'Minimum sipariş adedi 50\'dir. Lütfen geçerli bir adet girin.'
    );
    if (recovered) return;
    return;
  }

  if (qty > 1000000) {
    await sendTextMessage(from, 'Çok yüksek adet. Lütfen 1.000.000 ve altı girin veya bizi arayın.');
    return;
  }

  onSuccessfulTransition(conv, STATES.ENTER_CUSTOM_QTY);
  conv.data.quantity = qty;
  const { askDesignVariety } = require('./designVariety');
  await askDesignVariety(from, conv);
}

module.exports = { handleQuantitySelect, handleCustomQuantity, showMultiQuantityPrices };
