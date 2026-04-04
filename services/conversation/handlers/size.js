const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const { formatNumber } = require('../helpers');
const { parseSize } = require('../parseSize');
const { handleStateError, onSuccessfulTransition } = require('../errorRecovery');
const { tryNLtoCart } = require('../parseOrder');

async function showQuantityOptions(from, conv) {
  await sendTextMessage(from,
    `Boyut: ${conv.data.width}x${conv.data.height} mm\n\n` +
    `Kaç adet sipariş vermek istersiniz?\n` +
    `1. 100 Adet\n` +
    `2. 250 Adet\n` +
    `3. 1.000 Adet\n\n` +
    `Farklı bir adet için direkt adet yazınız.`
  );
  conv.state = STATES.SELECT_QUANTITY;
}

async function handleSizeSelect(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'size_50x50') {
    onSuccessfulTransition(conv, STATES.SELECT_SIZE);
    conv.data.width = 50;
    conv.data.height = 50;
    await showQuantityOptions(from, conv);
  } else if (selection === 'size_100x50') {
    onSuccessfulTransition(conv, STATES.SELECT_SIZE);
    conv.data.width = 100;
    conv.data.height = 50;
    await showQuantityOptions(from, conv);
  } else if (selection === 'size_custom') {
    onSuccessfulTransition(conv, STATES.SELECT_SIZE);
    await sendTextMessage(from,
      'Özel boyutu mm cinsinden girin:\nÖrnek: 75x50 veya 70x70'
    );
    conv.state = STATES.ENTER_CUSTOM_SIZE;
  } else {
    const parsed = parseSize(selection);
    if (parsed && parsed.error) {
      await sendTextMessage(from, parsed.message + '\n\nLütfen tekrar girin.\n📏 Min: 10mm — Maks: 460mm');
      return;
    }
    if (parsed) {
      if (parsed.maybeCm) {
        conv.data._pendingSize = parsed;
        await sendTextMessage(from,
          `Ölçüleri *cm* olarak mı söylediniz?\n\n` +
          `${parsed.width}x${parsed.height} mm olarak algıladım.\n\n` +
          `1. ✅ Evet, ${parsed.width}x${parsed.height} mm doğru\n` +
          `2. ❌ Hayır, farklı bir ölçü gireceğim`
        );
        return;
      }
      if (parsed.convertedFromCm) {
        await sendTextMessage(from, `📏 Ölçünüz ${parsed.width}x${parsed.height} mm olarak alındı.`);
      }
      if (parsed.width < 10 || parsed.width > 460 || parsed.height < 10 || parsed.height > 460) {
        await sendTextMessage(from, 'Boyut *10mm ile 460mm* arasında olmalıdır. Lütfen tekrar girin.\n\n📏 Min: 10mm — Maks: 460mm');
        return;
      }
      onSuccessfulTransition(conv, STATES.SELECT_SIZE);
      conv.data.width = parsed.width;
      conv.data.height = parsed.height;
      await showQuantityOptions(from, conv);
    } else {
      // Bekleyen cm onayı varsa
      if (conv.data._pendingSize) {
        const answer = (selection || '').trim();
        if (answer === '1' || answer.includes('evet') || answer.includes('doğru')) {
          const ps = conv.data._pendingSize;
          delete conv.data._pendingSize;
          if (ps.width < 10 || ps.width > 460 || ps.height < 10 || ps.height > 460) {
            await sendTextMessage(from, 'Boyut *10mm ile 460mm* arasında olmalıdır. Lütfen tekrar girin.');
            return;
          }
          onSuccessfulTransition(conv, STATES.SELECT_SIZE);
          conv.data.width = ps.width;
          conv.data.height = ps.height;
          await showQuantityOptions(from, conv);
        } else {
          delete conv.data._pendingSize;
          await sendTextMessage(from, 'Lütfen ölçünüzü mm cinsinden tekrar girin.\nÖrnek: 75x50\n\n📏 Min: 10mm — Maks: 460mm');
        }
        return;
      }
      if (selection && selection.length >= 8) {
        const nlResult = await tryNLtoCart(from, conv, selection);
        if (nlResult) return;
      }
      const recovered = await handleStateError(from, conv,
        'Geçersiz boyut. Örnek format: 75x50\n\n' +
        '1. 50x50 mm\n2. 100x50 mm\n3. Özel Boyut\n\n📏 Min: 10mm — Maks: 460mm'
      );
      if (recovered) return;
    }
  }
}

async function handleCustomSize(from, conv, msgContent) {
  // Bekleyen cm onayı varsa
  if (conv.data._pendingSize) {
    const answer = (msgContent.text || '').trim().toLowerCase();
    if (answer === '1' || answer.includes('evet') || answer.includes('doğru')) {
      const ps = conv.data._pendingSize;
      delete conv.data._pendingSize;
      if (ps.width < 10 || ps.width > 460 || ps.height < 10 || ps.height > 460) {
        await sendTextMessage(from, 'Boyut *10mm ile 460mm* arasında olmalıdır. Lütfen tekrar girin.');
        return;
      }
      onSuccessfulTransition(conv, STATES.ENTER_CUSTOM_SIZE);
      conv.data.width = ps.width;
      conv.data.height = ps.height;
      await showQuantityOptions(from, conv);
    } else {
      delete conv.data._pendingSize;
      await sendTextMessage(from, 'Lütfen ölçünüzü mm cinsinden tekrar girin.\nÖrnek: 75x50\n\n📏 Min: 10mm — Maks: 460mm');
    }
    return;
  }

  const parsed = parseSize(msgContent.text);

  if (!parsed) {
    const text = (msgContent.text || '').trim();
    if (text.length >= 8) {
      const nlResult = await tryNLtoCart(from, conv, text);
      if (nlResult) return;
    }
    const recovered = await handleStateError(from, conv,
      'Geçersiz format. Lütfen şu formatta girin: GenişlikxYükseklik\nÖrnek: 75x50, 100x70, 30x20\n\n📏 Min: 10mm — Maks: 460mm'
    );
    if (recovered) return;
    return;
  }

  if (parsed.error) {
    await sendTextMessage(from, parsed.message + '\n\nLütfen tekrar girin.\n📏 Min: 10mm — Maks: 460mm');
    return;
  }

  if (parsed.maybeCm) {
    conv.data._pendingSize = parsed;
    await sendTextMessage(from,
      `Ölçüleri *cm* olarak mı söylediniz?\n\n` +
      `${parsed.width}x${parsed.height} mm olarak algıladım.\n\n` +
      `1. ✅ Evet, ${parsed.width}x${parsed.height} mm doğru\n` +
      `2. ❌ Hayır, farklı bir ölçü gireceğim`
    );
    return;
  }

  if (parsed.convertedFromCm) {
    await sendTextMessage(from, `📏 Ölçünüz ${parsed.width}x${parsed.height} mm olarak alındı.`);
  }

  if (parsed.width < 10 || parsed.width > 460 || parsed.height < 10 || parsed.height > 460) {
    await sendTextMessage(from, 'Boyut *10mm ile 460mm* arasında olmalıdır. Lütfen tekrar girin.\n\n📏 Min: 10mm — Maks: 460mm');
    return;
  }

  onSuccessfulTransition(conv, STATES.ENTER_CUSTOM_SIZE);
  conv.data.width = parsed.width;
  conv.data.height = parsed.height;
  await showQuantityOptions(from, conv);
}

module.exports = { handleSizeSelect, handleCustomSize, showQuantityOptions };
