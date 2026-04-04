const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const logger = require('../../../utils/logger');

async function handleApproval(from, conv, msgContent) {
  const text = (msgContent.text || '').toLowerCase().trim();

  // Onay kelimeleri
  const approvalWords = ['uygundur', 'onay', 'onaylıyorum', 'onay veriyorum', 'evet', 'tamam', 'ok', 'olur', 'uygun', 'kabul', 'basılabilir', 'basın', 'onayladım'];
  const isApproval = approvalWords.some(w => text.includes(w)) || text === '1';

  if (isApproval) {
    await sendTextMessage(from,
      `Bizleri tercih ettiğiniz için çok teşekkürler! 🙏\n\n` +
      `Siparişleriniz yoğunluğa göre en hızlı şekilde hazırlanıp gönderilecektir.\n\n` +
      `Sipariş durumunuzu takip etmek için "sipariş takip" yazabilirsiniz.\n` +
      `Başka sorularınız olursa *bot* yazmanız yeterlidir. İyi günler! 😊`
    );
    conv.state = STATES.IDLE;
    conv.isHumanHandoff = false;
    conv.humanAgent = null;
    conv.data = { _closedAt: Date.now() };
    logger.info(`[APPROVAL] ${from} → Onay verildi, IDLE'a geçirildi`);
    return;
  }

  // Farewell kelimeleri
  const farewellWords = ['teşekkürler', 'tesekkurler', 'teşekkür ederim', 'sağol', 'sagol',
    'kolay gelsin', 'iyi günler', 'iyi akşamlar', 'görüşürüz', 'çok teşekkürler',
    'tşk', 'tsk', 'eyv', 'saol', 'çok sağolun', 'hayırlı günler'];
  const cleanText = text.replace(/[!.,?;:)(\\-]/g, '').trim();
  const isFarewell = farewellWords.some(f => cleanText === f || cleanText.includes(f));
  if (isFarewell) {
    const firstName = conv.name ? conv.name.split(' ')[0] : '';
    await sendTextMessage(from,
      `Rica ederiz${firstName ? ' ' + firstName : ''}! Bizi tercih ettiğiniz için teşekkürler 🙏\n` +
      `Başka sorularınız olursa *bot* yazmanız yeterlidir. İyi günler! 😊`
    );
    conv.state = STATES.IDLE;
    conv.isHumanHandoff = false;
    conv.humanAgent = null;
    conv.data = { _closedAt: Date.now() };
    logger.info(`[APPROVAL FAREWELL] ${from} → Farewell algılandı, IDLE'a geçirildi`);
    return;
  }

  // Dosya/link gelirse
  if (msgContent.type === 'document' || msgContent.type === 'image') {
    conv.state = STATES.AWAITING_FILE;
    await sendTextMessage(from, 'Yeni dosyanız alınıyor...');
    return;
  }

  // Değişiklik istiyorsa
  const changeWords = ['değişiklik', 'düzeltme', 'revize', 'güncelle', 'tekrar', 'yeniden', 'hayır'];
  const isChange = changeWords.some(w => text.includes(w)) || text === '2';

  if (isChange) {
    await sendTextMessage(from,
      'Lütfen güncel tasarım dosyanızı tekrar gönderin veya Canva linkinizi yapıştırın.\n\n' +
      'Kabul edilen formatlar: Canva Linki, PDF, AI, PNG, JPEG'
    );
    conv.state = STATES.AWAITING_FILE;
    logger.info(`[APPROVAL] ${from} → Değişiklik istendi, AWAITING_FILE'a geçirildi`);
    return;
  }

  // Belirsiz mesaj
  await sendTextMessage(from,
    `Baskı onayı için lütfen aşağıdakilerden birini yazın:\n\n` +
    `*1* — ✅ Uygundur, onay veriyorum\n` +
    `*2* — 🔄 Değişiklik istiyorum\n\n` +
    `Veya doğrudan "uygundur" veya "değişiklik" yazabilirsiniz.`
  );
}

module.exports = { handleApproval };
