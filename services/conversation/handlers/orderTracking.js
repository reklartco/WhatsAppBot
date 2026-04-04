const { sendTextMessage } = require('../../whatsappService');
const { getOrderStatus } = require('../../woocommerceService');
const { STATES } = require('../states');

function calculateBusinessDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

async function handleOrderTracking(from, conv, msgContent) {
  const rawText = msgContent.text?.trim() || '';

  let orderNumber = null;

  // #'li format: #12345
  const hashMatch = rawText.match(/#(\d+)/);
  if (hashMatch) {
    orderNumber = hashMatch[1];
  }

  // "no" / "numara" / "numarası" + rakamlar
  if (!orderNumber) {
    const noMatch = rawText.match(/(?:no|numara|numarası|numarasi)[:\s]*(\d+)/i);
    if (noMatch) {
      orderNumber = noMatch[1];
    }
  }

  // Sadece rakamlardan oluşan girdi
  if (!orderNumber) {
    const cleaned = rawText.replace(/\s+/g, '');
    if (/^\d+$/.test(cleaned)) {
      orderNumber = cleaned;
    }
  }

  // Cümle içinde 4-7 haneli rakam grubu
  if (!orderNumber) {
    const numMatch = rawText.match(/\b(\d{4,7})\b/);
    if (numMatch) {
      orderNumber = numMatch[1];
    }
  }

  if (!orderNumber) {
    await sendTextMessage(from, 'Sipariş numaranızı bulamadık. Lütfen sipariş numaranızı girin.\nÖrnek: 12345 veya #12345');
    return;
  }

  try {
    const status = await getOrderStatus(orderNumber);

    const statusText = {
      'pending': 'Ödeme Bekleniyor',
      'processing': 'Hazırlanıyor',
      'baskda': 'Baskıda 🖨️',
      'kargoya-verildi': 'Kargoya Verildi 🚚',
      'on-hold': 'Beklemede',
      'completed': 'Tamamlandı',
      'shipped': 'Kargoya Verildi 🚚',
      'cancelled': 'İptal Edildi',
      'refunded': 'İade Edildi'
    };

    let responseMsg =
      `*Sipariş #${orderNumber}*\n\n` +
      `Durum: ${statusText[status.status] || status.status}\n` +
      `Tarih: ${status.date}\n` +
      `Toplam: ${status.total} TL\n` +
      (status.tracking ? `Kargo Takip: ${status.tracking}\n` : '');

    if (status.status === 'processing' && status.dateRaw) {
      const businessDays = calculateBusinessDays(new Date(status.dateRaw), new Date());
      if (businessDays > 5) {
        responseMsg += `\n⏳ Şu an anormal bir yoğunluk yaşamaktayız, ilginiz için çok teşekkür ederiz.\n` +
          `Siparişiniz en yakın sürede kargoya verilecektir. Tahmini kargoya veriliş süreci bugün veya yarındır.\n` +
          `Anlayışınız için teşekkürler 🙏`;
      } else if (businessDays > 3) {
        responseMsg += `\n📦 Siparişiniz baskı aşamasında. Tahmini kargoya veriliş: ${5 - businessDays} iş günü içinde.`;
      } else {
        responseMsg += `\n📦 Siparişiniz hazırlanıyor. Tahmini teslimat: 3-5 iş günü.`;
      }
    }

    responseMsg += `\nDetay: https://1etiket.com.tr/hesabim/`;

    await sendTextMessage(from, responseMsg);
    conv.state = STATES.IDLE;
  } catch (error) {
    await sendTextMessage(from,
      `Sipariş #${orderNumber} bulunamadı. Lütfen sipariş numaranızı kontrol edin.`
    );
  }
}

module.exports = { handleOrderTracking, calculateBusinessDays };
