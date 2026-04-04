const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const { isWaitMessage } = require('../helpers');

async function handleAddress(from, conv, msgContent) {
  const address = msgContent.text?.trim();

  if (!address || address.length < 10) {
    await sendTextMessage(from, 'Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin.');
    return;
  }

  if (isWaitMessage(address)) {
    await sendTextMessage(from, 'Tamam, hazır olduğunuzda adresinizi yazabilirsiniz 😊');
    return;
  }

  conv.data.billingAddress = address;

  await sendTextMessage(from,
    `Kargo adresiniz fatura adresiniz ile aynı mı?\n\n` +
    `1. Evet, Aynı\n` +
    `2. Hayır, Farklı`
  );
  conv.state = STATES.ASK_SHIPPING_SAME;
}

async function handleShippingSame(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();
  const { normalizeTurkish } = require('../../../utils/validator');
  const norm = normalizeTurkish(selection || '');

  if (selection === 'shipping_same' || norm.includes('ayni') || norm.includes('evet')) {
    conv.data.shippingAddress = conv.data.billingAddress;
    const { showOrderSummary } = require('./orderSummary');
    await showOrderSummary(from, conv);
  } else if (selection === 'shipping_different' || norm.includes('farkli') || norm.includes('hayir')) {
    await sendTextMessage(from, 'Kargo teslimat adresini girin:\n(İl, ilçe, açık adres)');
    conv.state = STATES.ENTER_SHIPPING_ADDRESS;
  } else {
    await sendTextMessage(from,
      'Kargo adresiniz fatura adresiniz ile aynı mı?\n\n1. Evet, Aynı\n2. Hayır, Farklı'
    );
  }
}

async function handleShippingAddress(from, conv, msgContent) {
  const address = msgContent.text?.trim();
  if (!address || address.length < 10) {
    await sendTextMessage(from, 'Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin.');
    return;
  }

  if (isWaitMessage(address)) {
    await sendTextMessage(from, 'Tamam, hazır olduğunuzda kargo adresinizi yazabilirsiniz 😊');
    return;
  }

  conv.data.shippingAddress = address;
  const { showOrderSummary } = require('./orderSummary');
  await showOrderSummary(from, conv);
}

module.exports = { handleAddress, handleShippingSame, handleShippingAddress };
