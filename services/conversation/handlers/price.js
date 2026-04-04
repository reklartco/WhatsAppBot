const { sendTextMessage } = require('../../whatsappService');
const { calculatePrice } = require('../../priceCalculator');
const { STATES } = require('../states');
const { formatNumber, formatTRPrice, pushCurrentItemToCart, clearProductData } = require('../helpers');
const { normalizeTurkish } = require('../../../utils/validator');
const { handleStateError, onSuccessfulTransition } = require('../errorRecovery');
const { tryNLtoCart } = require('../parseOrder');
const logger = require('../../../utils/logger');

async function calculateAndShowPrice(from, conv) {
  await sendTextMessage(from, 'Fiyat hesaplanıyor...');

  try {
    const varietyCount = conv.data.varietyCount || 1;
    const perDesignQty = conv.data.quantity;
    const totalQuantity = varietyCount > 1 ? perDesignQty * varietyCount : perDesignQty;

    const priceResult = await calculatePrice({
      material: conv.data.material.code,
      width: conv.data.width,
      height: conv.data.height,
      quantity: totalQuantity
    });

    conv.data.price = priceResult;

    let priceText = `*${conv.data.material.name}*\n`;
    priceText += `📐 ${conv.data.width}x${conv.data.height} mm\n`;

    if (varietyCount > 1) {
      priceText += `🎨 ${varietyCount} çeşit × ${formatNumber(perDesignQty)} adet = *${formatNumber(totalQuantity)} adet*\n`;
      const perDesignTotal = (priceResult.totalRaw / varietyCount);
      const perDesignGrand = perDesignTotal * 1.20 + (priceResult.freeShipping ? 0 : priceResult.kargoFee / varietyCount);
      priceText += `📋 1 çeşit ücreti: ${formatTRPrice(perDesignGrand)} TL\n`;
    } else {
      priceText += `📦 ${formatNumber(totalQuantity)} adet\n`;
    }

    priceText += `\n*TOPLAM: ${priceResult.grandTotal} TL* (KDV dahil)`;
    if (priceResult.freeShipping) {
      priceText += `\n🚚 Kargo fiyata dahildir.`;
    }

    if (conv.data.isDefaultMaterial) {
      priceText += `\n\nℹ️ _Kuşe etiket olarak hesaplanmıştır. Farklı malzeme için malzeme adını belirtiniz._`;
    }

    await sendTextMessage(from, priceText);

    // Sepet özeti göster
    if (conv.data.cart && conv.data.cart.length > 0) {
      let cartText = `📦 *Sepet (${conv.data.cart.length} ürün):*\n`;
      conv.data.cart.forEach((item, i) => {
        const vc = item.varietyCount || 1;
        const qtyLabel = vc > 1 ? `${vc}×${formatNumber(item.perDesignQty || item.quantity / vc)}=${formatNumber(item.quantity)}` : formatNumber(item.quantity);
        cartText += `${i + 1}. ${item.material.name} ${item.width}x${item.height}mm ${qtyLabel} ad. — ${item.price.grandTotal} TL\n`;
      });
      const curQtyLabel = varietyCount > 1 ? `${varietyCount}×${formatNumber(perDesignQty)}=${formatNumber(totalQuantity)}` : formatNumber(totalQuantity);
      cartText += `+ ${conv.data.material.name} ${conv.data.width}x${conv.data.height}mm ${curQtyLabel} ad. — ${priceResult.grandTotal} TL`;
      await sendTextMessage(from, cartText);
    }

    await sendTextMessage(from,
      `1. Sipariş Oluştur\n` +
      `2. Ekleme Yap\n` +
      `3. Değiştir\n` +
      `4. İptal Et\n` +
      `5. Müşteri Hizmetleri`
    );

    conv.state = STATES.SHOW_PRICE;

    // Abandoned cart hatırlatma planla
    try {
      const schedulerService = require('../../schedulerService');
      schedulerService.scheduleAbandonedCart(from, {
        materialName: conv.data.material.name,
        size: `${conv.data.width}x${conv.data.height}mm`,
        quantity: totalQuantity,
        price: priceResult.grandTotal
      });
    } catch (e) { /* scheduler yoksa sorun değil */ }

  } catch (error) {
    logger.error('Fiyat hesaplama hatası:', error);
    await sendTextMessage(from, 'Fiyat hesaplanamadı. Lütfen tekrar deneyin veya "iptal" yazarak yeniden başlayın.\n\nMüşteri temsilcimize bağlanmak için *0* yazın.');
  }
}

async function handlePriceResponse(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();
  const text = msgContent.text?.trim() || '';
  const norm = normalizeTurkish(selection || '');

  // Uzun mesajlarda yeni fiyat sorusu olabilir
  if (!msgContent.buttonId && text.length >= 8) {
    const nlResult = await tryNLtoCart(from, conv, text);
    if (nlResult) return;
  }

  // 1 — Sipariş Oluştur
  if (selection === 'create_order' || text === '1' || norm.includes('siparis olustur') || norm.includes('onayla') || norm.includes('evet')) {
    onSuccessfulTransition(conv, STATES.SHOW_PRICE);
    pushCurrentItemToCart(conv);
    clearProductData(conv);

    try {
      const schedulerService = require('../../schedulerService');
      schedulerService.cancelAbandonedCart(from);
    } catch (e) {}

    await sendTextMessage(from, 'Lütfen e-posta adresinizi yazınız:');
    conv.state = STATES.ASK_EMAIL;

  // 2 — Ekleme Yap
  } else if (selection === 'add_to_cart' || text === '2' || selection?.includes('ekleme') || selection?.includes('ekle')) {
    onSuccessfulTransition(conv, STATES.SHOW_PRICE);
    pushCurrentItemToCart(conv);
    clearProductData(conv);
    await sendTextMessage(from, `Ürün sepetinize eklendi! ✅ (Sepet: ${conv.data.cart.length} ürün)\n\nYeni ürün için malzeme seçin:`);
    const { showMaterialList } = require('./mainMenu');
    await showMaterialList(from);
    conv.state = STATES.SELECT_MATERIAL;

  // 3 — Değiştir
  } else if (selection === 'change_options' || text === '3' || norm.includes('degistir') || norm.includes('degis')) {
    clearProductData(conv);
    await sendTextMessage(from, 'Ürünü yeniden seçin:');
    const { showMaterialList } = require('./mainMenu');
    await showMaterialList(from);
    conv.state = STATES.SELECT_MATERIAL;

  // 4 — İptal Et
  } else if (selection === 'cancel_order' || text === '4' || selection === 'cancel' || selection?.includes('iptal')) {
    // deleteConvState is called by orchestrator
    conv._deleted = true;
    await sendTextMessage(from, 'Sipariş iptal edildi. Tekrar görüşmek üzere!');

  // 5 — Müşteri Hizmetleri
  } else if (selection === 'customer_service' || text === '5' || norm.includes('musteri') || norm.includes('hizmet') || norm.includes('destek')) {
    const { triggerHumanHandoff } = require('./humanHandoff');
    await triggerHumanHandoff(from, conv.name, conv);

  } else {
    // Adet girişi: farklı adet yazarsa yeniden hesapla
    const normalizedQty = text.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
    const qParts = normalizedQty.split(/\s*(?:ve|ile|[-,\/])\s*|\s+/).filter(Boolean);
    const qNums = qParts.map(p => parseInt(p)).filter(q => !isNaN(q) && q >= 50 && q <= 1000000);
    const qUnique = [...new Set(qNums)];

    if (qUnique.length >= 2 && qNums.length === qParts.length && conv.data.material && conv.data.width) {
      const { showMultiQuantityPrices } = require('./quantity');
      await showMultiQuantityPrices(from, conv, qUnique);
      return;
    }

    const singleQty = parseInt(text.replace(/\./g, '').replace(/,/g, ''));
    if (singleQty && singleQty >= 50 && singleQty <= 1000000 && conv.data.material && conv.data.width) {
      conv.data.quantity = singleQty;
      conv.data.varietyCount = conv.data.varietyCount || 1;
      await calculateAndShowPrice(from, conv);
      return;
    }

    if (text.length >= 5) {
      const nlResult = await tryNLtoCart(from, conv, text);
      if (nlResult) return;
    }

    await handleStateError(from, conv,
      'Lütfen seçim yapın:\n\n1. Sipariş Oluştur\n2. Ekleme Yap\n3. Değiştir\n4. İptal Et\n5. Müşteri Hizmetleri\n\nVeya farklı adet yazarak fiyat öğrenebilirsiniz.'
    );
  }
}

module.exports = { calculateAndShowPrice, handlePriceResponse };
