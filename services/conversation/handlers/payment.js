const { sendTextMessage, sendCTAButton } = require('../../whatsappService');

async function handleAwaitingPayment(from, conv, msgContent, { triggerHumanHandoff }) {
  const text = (msgContent.text || '').toLowerCase().trim();

  if (text.includes('ödedim') || text.includes('ödeme yaptım') || text.includes('havale') || text.includes('transfer') || text.includes('yaptım')) {
    await sendTextMessage(from,
      `Teşekkürler! Ödemeniz kontrol edilecektir.\n\n` +
      `Ödemeniz onaylandığında tasarım dosyanız istenecektir.\n` +
      `Lütfen bekleyin, en kısa sürede bilgilendirme yapılacaktır.`
    );
    return;
  }

  if (text.includes('destek') || text.includes('temsilci') || text.includes('insan') || text === '0') {
    await triggerHumanHandoff(from, conv.name, conv);
    return;
  }

  if (conv.data.paymentUrl) {
    await sendCTAButton(from,
      `Siparişiniz #${conv.data.orderNumber} ödeme bekliyor.\n\nÖdemenizi aşağıdaki linkten yapabilirsiniz:`,
      'Ödeme Yap',
      conv.data.paymentUrl
    );
  } else {
    await sendTextMessage(from,
      `Siparişiniz #${conv.data.orderNumber} oluşturuldu ve ödeme bekleniyor.\n\nÖdeme yapıldıktan sonra tasarım dosyanız istenecektir.`
    );
  }
}

module.exports = { handleAwaitingPayment };
