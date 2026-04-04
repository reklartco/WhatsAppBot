const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const { normalizeTurkish } = require('../../../utils/validator');
const { handleStateError, onSuccessfulTransition } = require('../errorRecovery');
const { isWaitMessage } = require('../helpers');
const logger = require('../../../utils/logger');

async function handleCustomerType(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();
  const norm = normalizeTurkish(selection || '');

  if (selection === 'bireysel' || norm.includes('bireysel') || norm.includes('sahis') || norm.includes('kisisel')) {
    onSuccessfulTransition(conv, STATES.SELECT_CUSTOMER_TYPE);
    conv.data.customerType = 'bireysel';
    conv.data._collectedName = null;
    conv.data._collectedPhone = null;
    conv.data._collectedTc = null;
    await sendTextMessage(from,
      `Lütfen aşağıdaki bilgileri yazınız:\n\n` +
      `• Ad Soyad\n` +
      `• Telefon\n` +
      `• TC Kimlik No (fatura için gereklidir, vermek istemiyorsanız "geç" yazabilirsiniz)\n\n` +
      `Hepsini tek mesajda veya ayrı ayrı gönderebilirsiniz.`
    );
    conv.state = STATES.ENTER_BIREYSEL_INFO;
  } else if (selection === 'kurumsal' || norm.includes('kurumsal') || norm.includes('sirket') || norm.includes('firma') || norm.includes('tuzel')) {
    onSuccessfulTransition(conv, STATES.SELECT_CUSTOMER_TYPE);
    conv.data.customerType = 'kurumsal';
    conv.data._collectedCompany = null;
    conv.data._collectedTaxOffice = null;
    conv.data._collectedTaxNo = null;
    conv.data._collectedPhone = null;
    await sendTextMessage(from,
      `Lütfen aşağıdaki bilgileri yazınız:\n\n` +
      `• Şirket Ünvanı\n` +
      `• Vergi Dairesi\n` +
      `• Vergi No\n` +
      `• Telefon\n\n` +
      `Hepsini tek mesajda veya ayrı ayrı gönderebilirsiniz.`
    );
    conv.state = STATES.ENTER_KURUMSAL_INFO;
  } else {
    await handleStateError(from, conv,
      'Lütfen fatura türünüzü seçin:\n\n1. Bireysel\n2. Kurumsal'
    );
  }
}

// ===== BİREYSEL — AKILLI PARSE =====

function extractBireyselFields(text) {
  const result = { names: [], phones: [], tcs: [] };

  let processed = text.replace(/\b(0\s?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})\b/g, (m) => m.replace(/[\s\-]/g, ''));
  processed = processed.replace(/(\+?90\s?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/g, (m) => m.replace(/[\s\-\+]/g, ''));

  const lines = processed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const allTokens = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    allTokens.push(...tokens);
  }

  const nameTokens = [];

  for (const token of allTokens) {
    const clean = token.replace(/[\-().]/g, '');
    if (/^\d+$/.test(clean)) {
      if (clean.length === 11 && !clean.startsWith('0')) {
        result.tcs.push(clean);
      } else if (clean.length >= 10 && clean.length <= 12) {
        result.phones.push(clean);
      }
    } else {
      nameTokens.push(token);
    }
  }

  if (nameTokens.length > 0) {
    result.names.push(nameTokens.join(' '));
  }

  return result;
}

function getMissingBireyselFields(conv) {
  const missing = [];
  if (!conv.data._collectedName) missing.push('*Ad Soyad*');
  if (!conv.data._collectedPhone) missing.push('*Telefon*');
  if (!conv.data._collectedTc) missing.push('*TC Kimlik No* (vermek istemiyorsanız "geç" yazın)');
  return missing.join(', ');
}

async function handleBireyselInfo(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  if (!text) {
    const missing = getMissingBireyselFields(conv);
    await sendTextMessage(from, `Lütfen ${missing} yazınız.`);
    return;
  }

  if (isWaitMessage(text)) {
    await sendTextMessage(from, 'Tamam, hazır olduğunuzda bilgilerinizi yazabilirsiniz 😊');
    return;
  }

  // TC red kalıplarını algıla
  if (!conv.data._collectedTc && conv.data._collectedName && conv.data._collectedPhone) {
    const lower = normalizeTurkish(text.toLowerCase());
    const tcRefusalPatterns = [
      'istemiyorum', 'vermek istemiyorum', 'vermiyorum', 'paylasma',
      'hayir', 'gerek yok', 'gerekmiyor', 'lazim degil',
      'hicbiryere', 'hic bir yere', 'yok', 'bos birak',
      'atla', 'gecebilir miyiz', 'gec', 'pas', 'sonra',
      'tc vermek istemiyorum', 'tc istemiyorum', 'kimlik istemiyorum',
      'kimlik vermek istemiyorum', 'tc yok', 'kimlik yok',
      'paylasma istmiyorum', 'paylasmak istemiyorum'
    ];
    const isTcRefusal = tcRefusalPatterns.some(p => lower.includes(p));
    if (isTcRefusal) {
      conv.data._collectedTc = '11111111111';
      logger.info(`[BIREYSEL] ${from}: TC red edildi, otomatik 11111111111 atandı`);
    }
  }

  const extracted = extractBireyselFields(text);

  if (extracted.names.length > 0 && !conv.data._collectedName) {
    const fullName = extracted.names[0];
    const parts = fullName.split(/\s+/).filter(p => p.length > 0);
    if (parts.length >= 2 && fullName.length >= 4) {
      conv.data._collectedName = fullName;
    }
  }
  if (extracted.phones.length > 0 && !conv.data._collectedPhone) {
    const ph = extracted.phones[0];
    if (ph.length >= 10) {
      conv.data._collectedPhone = ph;
    }
  }
  if (extracted.tcs.length > 0 && !conv.data._collectedTc) {
    const tc = extracted.tcs[0];
    if (/^\d{11}$/.test(tc)) {
      conv.data._collectedTc = tc;
    }
  }

  // Hiçbir alan eşleşmediyse
  if (!extracted.names.length && !extracted.phones.length && !extracted.tcs.length && !conv.data._collectedTc) {
    const missing = getMissingBireyselFields(conv);
    await sendTextMessage(from, `Anlayamadık. Lütfen ${missing} yazınız.`);
    return;
  }

  const hasName = !!conv.data._collectedName;
  const hasPhone = !!conv.data._collectedPhone;
  const hasTc = !!conv.data._collectedTc;

  if (hasName && hasPhone && hasTc) {
    const nameParts = conv.data._collectedName.split(/\s+/).filter(p => p.length > 0);
    conv.data.firstName = nameParts[0];
    conv.data.lastName = nameParts.slice(1).join(' ');
    conv.data.phone = conv.data._collectedPhone;
    conv.data.tcNo = conv.data._collectedTc;

    delete conv.data._collectedName;
    delete conv.data._collectedPhone;
    delete conv.data._collectedTc;

    await sendTextMessage(from, 'Adresinizi girin:\n(İl, ilçe, açık adres)');
    conv.state = STATES.ENTER_ADDRESS;
  } else {
    const missing = getMissingBireyselFields(conv);
    const collected = [];
    if (hasName) collected.push(`✅ Ad Soyad: ${conv.data._collectedName}`);
    if (hasPhone) collected.push(`✅ Telefon: ${conv.data._collectedPhone}`);
    if (hasTc) collected.push(`✅ TC: ${conv.data._collectedTc}`);

    await sendTextMessage(from,
      `${collected.join('\n')}\n\nEksik bilgi: ${missing}`
    );
  }
}

// ===== KURUMSAL — AKILLI PARSE =====

function extractKurumsalFields(text) {
  const result = { phones: [], taxNos: [], textParts: [] };

  let processed = text.replace(/\b(0\s?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})\b/g, (m) => m.replace(/[\s\-]/g, ''));
  processed = processed.replace(/(\+?90\s?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/g, (m) => m.replace(/[\s\-\+]/g, ''));

  const lines = processed.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    const clean = line.replace(/[\s\-().]/g, '');
    if (/^\d+$/.test(clean)) {
      if (clean.length >= 10 && clean.length <= 12 && clean.startsWith('0')) {
        result.phones.push(clean);
      } else if (clean.length >= 10 && clean.length <= 11) {
        result.taxNos.push(clean);
      }
    } else {
      const tokens = line.split(/\s+/);
      const lineTextParts = [];
      for (const token of tokens) {
        const t = token.replace(/[\-().]/g, '');
        if (/^\d{10,12}$/.test(t) && t.startsWith('0')) {
          result.phones.push(t);
        } else if (/^\d{10,11}$/.test(t) && !t.startsWith('0')) {
          result.taxNos.push(t);
        } else {
          lineTextParts.push(token);
        }
      }
      const textPart = lineTextParts.join(' ').trim();
      if (textPart.length > 0) {
        result.textParts.push(textPart);
      }
    }
  }

  return result;
}

function classifyKurumsalText(textParts) {
  let company = null;
  let taxOffice = null;

  const taxOfficeKeywords = ['vd', 'v.d', 'v.d.', 'vergi dairesi', 'vergi d.', 'malmüdürlüğü'];
  const companyKeywords = ['ltd', 'a.ş', 'aş', 'ş.t.i', 'sti', 'tic', 'san', 'ltd.', 'şti'];

  for (const part of textParts) {
    const lower = part.toLowerCase();
    if (!taxOffice && taxOfficeKeywords.some(kw => lower.includes(kw))) {
      taxOffice = part;
      continue;
    }
    if (!company && companyKeywords.some(kw => lower.includes(kw))) {
      company = part;
      continue;
    }
  }

  for (const part of textParts) {
    if (part === company || part === taxOffice) continue;
    if (!company) { company = part; continue; }
    if (!taxOffice) { taxOffice = part; continue; }
  }

  return { company, taxOffice };
}

function getMissingKurumsalFields(conv) {
  const missing = [];
  if (!conv.data._collectedCompany) missing.push('*Şirket Ünvanı*');
  if (!conv.data._collectedTaxOffice) missing.push('*Vergi Dairesi*');
  if (!conv.data._collectedTaxNo) missing.push('*Vergi No*');
  if (!conv.data._collectedPhone) missing.push('*Telefon*');
  return missing.join(', ');
}

async function handleKurumsalInfo(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  if (!text) {
    const missing = getMissingKurumsalFields(conv);
    await sendTextMessage(from, `Lütfen ${missing} yazınız.`);
    return;
  }

  if (isWaitMessage(text)) {
    await sendTextMessage(from, 'Tamam, hazır olduğunuzda bilgilerinizi yazabilirsiniz 😊');
    return;
  }

  const extracted = extractKurumsalFields(text);

  if (extracted.phones.length > 0 && !conv.data._collectedPhone) {
    conv.data._collectedPhone = extracted.phones[0];
  }
  if (extracted.taxNos.length > 0 && !conv.data._collectedTaxNo) {
    conv.data._collectedTaxNo = extracted.taxNos[0];
  }
  if (extracted.textParts.length > 0) {
    const classified = classifyKurumsalText(extracted.textParts);
    if (classified.company && !conv.data._collectedCompany) {
      conv.data._collectedCompany = classified.company;
    }
    if (classified.taxOffice && !conv.data._collectedTaxOffice) {
      conv.data._collectedTaxOffice = classified.taxOffice;
    }
  }

  if (!extracted.phones.length && !extracted.taxNos.length && !extracted.textParts.length) {
    const missing = getMissingKurumsalFields(conv);
    await sendTextMessage(from, `Anlayamadık. Lütfen ${missing} yazınız.`);
    return;
  }

  const hasCompany = !!conv.data._collectedCompany;
  const hasTaxOffice = !!conv.data._collectedTaxOffice;
  const hasTaxNo = !!conv.data._collectedTaxNo;
  const hasPhone = !!conv.data._collectedPhone;

  if (hasCompany && hasTaxOffice && hasTaxNo && hasPhone) {
    conv.data.companyTitle = conv.data._collectedCompany;
    conv.data.taxOffice = conv.data._collectedTaxOffice;
    conv.data.taxNo = conv.data._collectedTaxNo;
    conv.data.phone = conv.data._collectedPhone;
    conv.data.firstName = conv.data.companyTitle;
    conv.data.lastName = '';

    delete conv.data._collectedCompany;
    delete conv.data._collectedTaxOffice;
    delete conv.data._collectedTaxNo;
    delete conv.data._collectedPhone;

    await sendTextMessage(from, 'Adresinizi girin:\n(İl, ilçe, açık adres)');
    conv.state = STATES.ENTER_ADDRESS;
  } else {
    const missing = getMissingKurumsalFields(conv);
    const collected = [];
    if (hasCompany) collected.push(`✅ Şirket: ${conv.data._collectedCompany}`);
    if (hasTaxOffice) collected.push(`✅ Vergi Dairesi: ${conv.data._collectedTaxOffice}`);
    if (hasTaxNo) collected.push(`✅ Vergi No: ${conv.data._collectedTaxNo}`);
    if (hasPhone) collected.push(`✅ Telefon: ${conv.data._collectedPhone}`);

    await sendTextMessage(from,
      `${collected.join('\n')}\n\nEksik bilgi: ${missing}`
    );
  }
}

module.exports = { handleCustomerType, handleBireyselInfo, handleKurumsalInfo };
