const { sendTextMessage } = require('../../whatsappService');
const { STATES, MATERIALS, MATERIAL_GROUPS } = require('../states');
const { normalizeTurkish, validateEmail } = require('../../../utils/validator');
const { isWaitMessage } = require('../helpers');

function getEditableFields(conv) {
  const fields = [];
  fields.push({ key: 'product', label: '🏷️ Ürün Bilgileri (malzeme, boyut, adet)' });
  if (conv.data.customerType === 'bireysel') {
    fields.push({ key: 'name', label: '👤 Ad Soyad' });
    fields.push({ key: 'phone', label: '📞 Telefon' });
    fields.push({ key: 'tc', label: '🆔 TC Kimlik No' });
  } else {
    fields.push({ key: 'company', label: '🏢 Şirket Ünvanı' });
    fields.push({ key: 'taxOffice', label: '🏛️ Vergi Dairesi' });
    fields.push({ key: 'taxNo', label: '🔢 Vergi No' });
    fields.push({ key: 'phone', label: '📞 Telefon' });
  }
  fields.push({ key: 'email', label: '📧 E-posta' });
  fields.push({ key: 'billingAddress', label: '📍 Fatura Adresi' });
  if (conv.data.shippingAddress !== conv.data.billingAddress) {
    fields.push({ key: 'shippingAddress', label: '🚚 Kargo Adresi' });
  }
  return fields;
}

async function showEditFieldMenu(from, conv) {
  const fields = getEditableFields(conv);
  conv.data._editableFields = fields;

  let msg = 'Hangi bilgiyi düzenlemek istiyorsunuz?\n\n';
  fields.forEach((f, i) => {
    msg += `${i + 1}. ${f.label}\n`;
  });

  await sendTextMessage(from, msg);
  conv.state = STATES.EDIT_FIELD_SELECT;
}

async function handleEditFieldSelect(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  const fields = conv.data._editableFields || getEditableFields(conv);

  const num = parseInt(text);
  if (num >= 1 && num <= fields.length) {
    const field = fields[num - 1];
    return await startFieldEdit(from, conv, field.key);
  }

  const norm = normalizeTurkish((text || '').toLowerCase());
  for (const field of fields) {
    const fieldNorm = normalizeTurkish(field.label.toLowerCase());
    if (norm.includes(fieldNorm.split(' ').pop())) {
      return await startFieldEdit(from, conv, field.key);
    }
  }

  const keywordMap = {
    'urun': 'product', 'malzeme': 'product', 'boyut': 'product', 'adet': 'product', 'olcu': 'product',
    'ad': 'name', 'soyad': 'name', 'isim': 'name',
    'telefon': 'phone', 'tel': 'phone', 'numara': 'phone',
    'tc': 'tc', 'kimlik': 'tc',
    'sirket': 'company', 'unvan': 'company', 'firma': 'company',
    'vergi dairesi': 'taxOffice', 'daire': 'taxOffice',
    'vergi no': 'taxNo', 'vergi': 'taxNo',
    'email': 'email', 'e-posta': 'email', 'eposta': 'email', 'mail': 'email',
    'fatura adres': 'billingAddress', 'adres': 'billingAddress',
    'kargo': 'shippingAddress', 'teslimat': 'shippingAddress'
  };
  for (const [kw, key] of Object.entries(keywordMap)) {
    if (norm.includes(kw) && fields.some(f => f.key === key)) {
      return await startFieldEdit(from, conv, key);
    }
  }

  let msg = 'Lütfen düzenlemek istediğiniz alanın numarasını yazın:\n\n';
  fields.forEach((f, i) => {
    msg += `${i + 1}. ${f.label}\n`;
  });
  await sendTextMessage(from, msg);
}

async function startFieldEdit(from, conv, fieldKey) {
  conv.data._editingField = fieldKey;
  conv.state = STATES.EDIT_FIELD_INPUT;

  const prompts = {
    'product': 'Ürün bilgilerini değiştirmek için siparişi iptal edip yeniden başlayabilirsiniz.\n\n1. Siparişe devam et\n2. İptal edip yeniden başla',
    'name': `Mevcut: ${conv.data.firstName} ${conv.data.lastName}\n\nYeni ad soyadınızı yazın:`,
    'phone': `Mevcut: ${conv.data.phone}\n\nYeni telefon numaranızı yazın:`,
    'tc': `Mevcut: ${conv.data.tcNo || '-'}\n\nYeni TC Kimlik No yazın (istemiyorsanız "geç" yazın):`,
    'company': `Mevcut: ${conv.data.companyTitle}\n\nYeni şirket ünvanını yazın:`,
    'taxOffice': `Mevcut: ${conv.data.taxOffice}\n\nYeni vergi dairesini yazın:`,
    'taxNo': `Mevcut: ${conv.data.taxNo}\n\nYeni vergi numarasını yazın:`,
    'email': `Mevcut: ${conv.data.email}\n\nYeni e-posta adresini yazın:`,
    'billingAddress': `Mevcut: ${conv.data.billingAddress}\n\nYeni fatura adresini yazın:\n(İl, ilçe, açık adres)`,
    'shippingAddress': `Mevcut: ${conv.data.shippingAddress}\n\nYeni kargo adresini yazın:\n(İl, ilçe, açık adres)`
  };

  await sendTextMessage(from, prompts[fieldKey] || 'Yeni değeri yazın:');
}

async function handleEditFieldInput(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  const field = conv.data._editingField;

  if (!text) {
    await sendTextMessage(from, 'Lütfen yeni değeri yazın veya "vazgeç" yazarak düzenlemeden çıkın.');
    return;
  }

  const norm = normalizeTurkish(text.toLowerCase());

  if (norm === 'vazgec' || norm === 'iptal' || norm === 'geri') {
    delete conv.data._editingField;
    delete conv.data._editableFields;
    const { showOrderSummary } = require('./orderSummary');
    await showOrderSummary(from, conv);
    return;
  }

  if (field === 'product') {
    if (text === '2' || norm.includes('iptal') || norm.includes('yeniden')) {
      delete conv.data._editingField;
      delete conv.data._editableFields;
      conv.data.cart = [];
      conv.state = STATES.SELECT_MATERIAL;
      await sendTextMessage(from,
        `Sipariş sıfırlandı. Yeniden malzeme seçin:\n\n` +
        MATERIAL_GROUPS.map((m, i) => `${i + 1}. ${m.name}`).join('\n')
      );
      return;
    }
    delete conv.data._editingField;
    delete conv.data._editableFields;
    const { showOrderSummary } = require('./orderSummary');
    await showOrderSummary(from, conv);
    return;
  }

  let valid = true;
  switch (field) {
    case 'name': {
      const parts = text.split(/\s+/).filter(p => p.length > 0);
      if (parts.length < 2 || text.length < 4) {
        await sendTextMessage(from, 'Lütfen ad ve soyadınızı birlikte yazın (örn: Ali Yılmaz)');
        return;
      }
      conv.data.firstName = parts[0];
      conv.data.lastName = parts.slice(1).join(' ');
      break;
    }
    case 'phone': {
      const clean = text.replace(/[\s\-\(\)\+]/g, '');
      if (!/^\d{10,12}$/.test(clean)) {
        await sendTextMessage(from, 'Geçersiz telefon numarası. Lütfen doğru formatta girin (örn: 05xx xxx xx xx)');
        return;
      }
      conv.data.phone = clean;
      break;
    }
    case 'tc': {
      const tcRefusalPatterns = [
        'istemiyorum', 'vermek istemiyorum', 'hayir', 'gerek yok',
        'gec', 'atla', 'yok', 'bos'
      ];
      if (tcRefusalPatterns.some(p => norm.includes(p))) {
        conv.data.tcNo = '11111111111';
      } else {
        const clean = text.replace(/\s/g, '');
        if (!/^\d{11}$/.test(clean)) {
          await sendTextMessage(from, 'TC Kimlik No 11 haneli olmalıdır. Tekrar yazın veya "geç" yazın:');
          return;
        }
        conv.data.tcNo = clean;
      }
      break;
    }
    case 'company': {
      if (text.length < 3) {
        await sendTextMessage(from, 'Şirket ünvanı çok kısa. Lütfen tekrar yazın:');
        return;
      }
      conv.data.companyTitle = text;
      break;
    }
    case 'taxOffice': {
      if (text.length < 2) {
        await sendTextMessage(from, 'Vergi dairesi çok kısa. Lütfen tekrar yazın:');
        return;
      }
      conv.data.taxOffice = text;
      break;
    }
    case 'taxNo': {
      const clean = text.replace(/\s/g, '');
      if (!/^\d{10,11}$/.test(clean)) {
        await sendTextMessage(from, 'Vergi numarası 10-11 haneli olmalıdır. Tekrar yazın:');
        return;
      }
      conv.data.taxNo = clean;
      break;
    }
    case 'email': {
      const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
      const match = text.match(emailRegex);
      const email = match ? match[0] : text;
      if (!validateEmail(email)) {
        await sendTextMessage(from, 'Geçersiz e-posta adresi. Lütfen doğru formatta girin (örn: info@firma.com)');
        return;
      }
      conv.data.email = email;
      break;
    }
    case 'billingAddress': {
      if (text.length < 10) {
        await sendTextMessage(from, 'Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin:');
        return;
      }
      if (isWaitMessage(text)) {
        await sendTextMessage(from, 'Tamam, hazır olduğunuzda adresi yazabilirsiniz 😊');
        return;
      }
      conv.data.billingAddress = text;
      if (conv.data.shippingAddress === conv.data.billingAddress || !conv.data.shippingAddress) {
        conv.data.shippingAddress = text;
      }
      break;
    }
    case 'shippingAddress': {
      if (text.length < 10) {
        await sendTextMessage(from, 'Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin:');
        return;
      }
      if (isWaitMessage(text)) {
        await sendTextMessage(from, 'Tamam, hazır olduğunuzda kargo adresini yazabilirsiniz 😊');
        return;
      }
      conv.data.shippingAddress = text;
      break;
    }
    default:
      valid = false;
  }

  if (valid) {
    delete conv.data._editingField;
    delete conv.data._editableFields;
    await sendTextMessage(from, '✅ Bilgi güncellendi!');
    const { showOrderSummary } = require('./orderSummary');
    await showOrderSummary(from, conv);
  }
}

module.exports = { handleEditFieldSelect, handleEditFieldInput, showEditFieldMenu, startFieldEdit, getEditableFields };
