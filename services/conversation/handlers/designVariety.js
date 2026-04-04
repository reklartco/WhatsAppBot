const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const { formatNumber } = require('../helpers');
const { normalizeTurkish } = require('../../../utils/validator');
const { handleStateError, onSuccessfulTransition } = require('../errorRecovery');

async function askDesignVariety(from, conv) {
  await sendTextMessage(from,
    `Tek bir tasarımdan mı ${formatNumber(conv.data.quantity)} adet olacak, yoksa farklı çeşit görselleriniz var mı?\n\n` +
    `1. Tek tasarım\n` +
    `2. Birden fazla çeşit var`
  );
  conv.state = STATES.ASK_DESIGN_VARIETY;
}

async function handleDesignVariety(from, conv, msgContent) {
  const rawText = msgContent.text?.trim() || '';

  // ===== SAYI BEKLİYORSAK — en önce kontrol et, buttonId dönüşümü yoksay =====
  if (conv.data._awaitingVarietyCount) {
    const rawNorm = normalizeTurkish(rawText);
    const countMatch = rawNorm.match(/(\d+)/);
    if (countMatch) {
      const count = parseInt(countMatch[1]);
      if (count === 1) {
        conv.data.varietyCount = 1;
        delete conv.data._awaitingVarietyCount;
        onSuccessfulTransition(conv, STATES.ASK_DESIGN_VARIETY);
        const { calculateAndShowPrice } = require('./price');
        await calculateAndShowPrice(from, conv);
        return;
      }
      if (count >= 2 && count <= 100) {
        conv.data.varietyCount = count;
        delete conv.data._awaitingVarietyCount;
        onSuccessfulTransition(conv, STATES.ASK_DESIGN_VARIETY);
        const { calculateAndShowPrice } = require('./price');
        await calculateAndShowPrice(from, conv);
        return;
      }
    }
    await sendTextMessage(from, 'Lütfen çeşit sayısını girin (1-100 arası bir sayı).');
    return;
  }

  // ===== İlk seçim aşaması (tek/çoklu) =====
  const selection = msgContent.buttonId || rawText;
  const norm = normalizeTurkish(selection || '');

  // TEK TASARIM ALGILA
  const singleKeywords = ['tek', 'bir tane', 'bir cesit', 'tek cesit', 'tek tasarim', 'hepsi ayni', 'ayni', 'ayni tasarim'];
  const isSingle = selection === 'single_design' || selection === '1' ||
    singleKeywords.some(kw => norm.includes(kw)) ||
    (norm === 'bir') || (norm === 'evet');

  if (isSingle) {
    conv.data.varietyCount = 1;
    onSuccessfulTransition(conv, STATES.ASK_DESIGN_VARIETY);
    const { calculateAndShowPrice } = require('./price');
    await calculateAndShowPrice(from, conv);
    return;
  }

  // ÇOKLU TASARIM — Sayı + keyword (ör: "3 çeşit", "5 farklı tasarım")
  const varietyMatch = norm.match(/(\d+)\s*(?:cesit|cesidi|model|tasarim|farkli|tur|adet cesit|tane)/);
  if (varietyMatch) {
    const count = parseInt(varietyMatch[1]);
    if (count === 1) {
      conv.data.varietyCount = 1;
      onSuccessfulTransition(conv, STATES.ASK_DESIGN_VARIETY);
      const { calculateAndShowPrice } = require('./price');
      await calculateAndShowPrice(from, conv);
      return;
    }
    if (count >= 2 && count <= 100) {
      conv.data.varietyCount = count;
      onSuccessfulTransition(conv, STATES.ASK_DESIGN_VARIETY);
      const { calculateAndShowPrice } = require('./price');
      await calculateAndShowPrice(from, conv);
      return;
    }
  }

  // "birden fazla" veya "2" → sayı sor
  const multiKeywords = ['birden fazla', 'coklu', 'farkli var', 'farkli cesit', 'farkli tasarim', 'farkli model', 'hayir'];
  const isMultiple = selection === 'multiple_design' || selection === '2' ||
    multiKeywords.some(kw => norm.includes(kw));

  if (isMultiple) {
    conv.data._awaitingVarietyCount = true;
    await sendTextMessage(from, 'Kaç farklı çeşit görseliniz var?');
    return;
  }

  // HİÇBİRİ EŞLEŞMEDİ
  const recovered = await handleStateError(from, conv,
    'Lütfen seçim yapın:\n\n1. Tek tasarım\n2. Birden fazla çeşit var\n\nVeya doğrudan çeşit sayısını yazın: _"3 çeşit"_'
  );
  if (recovered) return;
}

module.exports = { askDesignVariety, handleDesignVariety };
