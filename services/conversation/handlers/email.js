const { sendTextMessage } = require('../../whatsappService');
const { getCustomerByEmail } = require('../../woocommerceService');
const { validateEmail } = require('../../../utils/validator');
const { normalizeTurkish } = require('../../../utils/validator');
const { STATES } = require('../states');
const { handleStateError, onSuccessfulTransition } = require('../errorRecovery');
const logger = require('../../../utils/logger');

async function handleAskEmail(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  if (!text) {
    await sendTextMessage(from, 'Lütfen e-posta adresinizi girin:\nÖrnek: info@firma.com');
    return;
  }

  const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  const match = text.match(emailRegex);
  const email = match ? match[0] : text;

  if (!validateEmail(email)) {
    const recovered = await handleStateError(from, conv,
      'Geçersiz e-posta adresi. Lütfen doğru formatta girin:\nÖrnek: info@firma.com'
    );
    if (recovered) return;
    return;
  }

  onSuccessfulTransition(conv, STATES.ASK_EMAIL);
  conv.data.email = email;

  try {
    const existingCustomer = await getCustomerByEmail(email);
    if (existingCustomer) {
      conv.data.existingWcCustomerId = existingCustomer.id;
      conv.data.existingCustomerData = {
        first_name: existingCustomer.first_name,
        last_name: existingCustomer.last_name,
        phone: existingCustomer.billing?.phone || '',
        billingAddress: existingCustomer.billing?.address_1 || '',
        company: existingCustomer.billing?.company || '',
      };
      logger.info(`Mevcut WC müşteri bulundu: ${email} (ID: ${existingCustomer.id})`);
      await sendTextMessage(from, `✅ Mevcut hesabınız bulundu: ${email}`);
    }
  } catch (e) {
    logger.warn('WC email lookup failed:', e.message);
  }

  await sendTextMessage(from,
    `Fatura türünüzü seçin:\n\n` +
    `1. Bireysel\n` +
    `2. Kurumsal`
  );
  conv.state = STATES.SELECT_CUSTOMER_TYPE;
}

async function handleEmail(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  if (!text) {
    await sendTextMessage(from, 'Lütfen e-posta adresinizi girin:\nÖrnek: info@firma.com');
    return;
  }

  const norm = normalizeTurkish(text);
  if (['yok', 'mail yok', 'email yok', 'e-posta yok', 'eposta yok', 'mailyok'].includes(norm.replace(/\s+/g, ' ').trim())) {
    onSuccessfulTransition(conv, STATES.ENTER_EMAIL);
    conv.data.email = null;
    const { showOrderSummary } = require('./orderSummary');
    await showOrderSummary(from, conv);
    return;
  }

  const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  const match = text.match(emailRegex);
  const email = match ? match[0] : text;

  if (!validateEmail(email)) {
    const recovered = await handleStateError(from, conv,
      'Geçersiz e-posta adresi. Lütfen doğru formatta girin:\nÖrnek: info@firma.com\n\nE-posta yoksa "yok" yazabilirsiniz.'
    );
    if (recovered) return;
    return;
  }
  onSuccessfulTransition(conv, STATES.ENTER_EMAIL);
  conv.data.email = email;
  const { showOrderSummary } = require('./orderSummary');
  await showOrderSummary(from, conv);
}

module.exports = { handleAskEmail, handleEmail };
