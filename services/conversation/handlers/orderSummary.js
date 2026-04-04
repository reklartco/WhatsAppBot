const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const { formatNumber, formatTRPrice } = require('../helpers');

async function showOrderSummary(from, conv) {
  const cart = conv.data.cart || [];
  let summaryText = `*SİPARİŞ ÖZETİ*\n\n`;

  let combinedTotalRaw = 0;
  cart.forEach((item, i) => {
    summaryText += `*Ürün ${i + 1}:* ${item.material.name}\n`;
    summaryText += `Boyut: ${item.width}x${item.height} mm\n`;
    summaryText += `Adet: ${formatNumber(item.quantity)}\n`;
    summaryText += `Fiyat: ${item.price.totalPrice} TL +KDV\n\n`;
    combinedTotalRaw += item.price.totalRaw;
  });

  const KDV_RATE = 0.20;
  const KARGO_THRESHOLD = 2000;
  const KARGO_FEE_AMOUNT = 130;
  const combinedKdv = combinedTotalRaw * KDV_RATE;
  const combinedWithKdv = combinedTotalRaw + combinedKdv;
  const freeShipping = combinedTotalRaw >= KARGO_THRESHOLD;
  const kargoFee = freeShipping ? 0 : KARGO_FEE_AMOUNT;
  const grandTotal = combinedWithKdv + kargoFee;

  conv.data.combinedTotals = {
    totalRaw: combinedTotalRaw,
    kdvAmount: combinedKdv,
    totalWithKdv: combinedWithKdv,
    freeShipping,
    kargoFee,
    grandTotal
  };

  summaryText += `Ara Toplam: ${formatTRPrice(combinedTotalRaw)} TL +KDV\n`;
  summaryText += `KDV (%20): ${formatTRPrice(combinedKdv)} TL\n`;
  summaryText += freeShipping ? `Kargo: *Ücretsiz* 🚚\n` : `Kargo: ${KARGO_FEE_AMOUNT} TL\n`;
  summaryText += `\n*ÖDENECEK TOPLAM: ${formatTRPrice(grandTotal)} TL*\n\n`;

  if (conv.data.customerType === 'bireysel') {
    summaryText += `Ad Soyad: ${conv.data.firstName} ${conv.data.lastName}\n`;
    summaryText += `Telefon: ${conv.data.phone}\n`;
    if (conv.data.tcNo && conv.data.tcNo !== '11111111111') {
      summaryText += `TC: ${conv.data.tcNo}\n`;
    }
  } else {
    summaryText += `Şirket: ${conv.data.companyTitle}\n`;
    summaryText += `Vergi Dairesi: ${conv.data.taxOffice}\n`;
    summaryText += `Vergi No: ${conv.data.taxNo}\n`;
    summaryText += `Telefon: ${conv.data.phone}\n`;
  }

  summaryText += `E-posta: ${conv.data.email}\n`;
  summaryText += `Fatura Adresi: ${conv.data.billingAddress}\n`;
  if (conv.data.shippingAddress !== conv.data.billingAddress) {
    summaryText += `Kargo Adresi: ${conv.data.shippingAddress}\n`;
  }

  await sendTextMessage(from, summaryText);

  await sendTextMessage(from,
    `Her şey doğru mu? Siparişinizi oluşturayım mı?\n\n` +
    `1. Oluştur\n` +
    `2. Düzenle\n` +
    `3. İptal Et`
  );

  conv.state = STATES.CONFIRM_ORDER;
}

module.exports = { showOrderSummary };
