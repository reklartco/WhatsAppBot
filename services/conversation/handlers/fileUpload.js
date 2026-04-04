const { sendTextMessage, downloadMedia } = require('../../whatsappService');
const { saveFile } = require('../../fileService');
const { STATES } = require('../states');
const logger = require('../../../utils/logger');

async function handleFileUpload(from, conv, message, msgContent) {
  // Canva veya herhangi bir URL linki
  if (msgContent && msgContent.text) {
    const urlMatch = msgContent.text.match(/https?:\/\/\S+/i);
    if (urlMatch) {
      await sendTextMessage(from,
        `Tasarım linkiniz alındı! ✅\n\n` +
        `Link: ${urlMatch[0]}\n` +
        `Sipariş: #${conv.data.orderNumber}\n\n` +
        `Tasarımınız incelendikten sonra baskı onayınız istenecektir.\n` +
        `Onay verdiğinizde siparişiniz baskıya alınacaktır.`
      );
      conv.state = STATES.AWAITING_APPROVAL;
      return;
    }
  }

  // Dosya yükleme
  if (message.type === 'document' || message.type === 'image') {
    const mediaId = message.document?.id || message.image?.id;
    const fileName = message.document?.filename || `baski_${conv.data.orderId}.jpg`;

    try {
      await sendTextMessage(from, 'Dosyanız alınıyor...');

      const media = await downloadMedia(mediaId);
      const savedPath = await saveFile(media.buffer, fileName, conv.data.orderId);

      await sendTextMessage(from,
        `Dosyanız başarıyla alındı! ✅\n\n` +
        `Dosya: ${fileName}\n` +
        `Sipariş: #${conv.data.orderNumber}\n\n` +
        `Tasarımınız incelendikten sonra baskı onayınız istenecektir.\n` +
        `Onay verdiğinizde siparişiniz baskıya alınacaktır.`
      );

      conv.state = STATES.AWAITING_APPROVAL;

    } catch (error) {
      logger.error('Dosya indirme hatası:', error);
      await sendTextMessage(from,
        'Dosya alınamadı. Lütfen tekrar gönderin veya e-posta ile gönderin: info@1etiket.com.tr'
      );
    }
  } else {
    await sendTextMessage(from,
      'Lütfen tasarım dosyanızı gönderin veya Canva linkinizi yapıştırın.\n\n' +
      'Kabul edilen formatlar: Canva Linki, PDF, AI, PNG, JPEG'
    );
  }
}

module.exports = { handleFileUpload };
