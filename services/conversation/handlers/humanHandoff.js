const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const db = require('../../database');
const logger = require('../../../utils/logger');
const statsService = require('../../statsService');

async function triggerHumanHandoff(from, name, conv, { saveConvState }) {
  conv.isHumanHandoff = true;
  conv.state = STATES.HUMAN_HANDOFF;
  saveConvState(from, conv);
  statsService.recordHandoffStat();
  await sendTextMessage(from,
    'Sizi bir yetkilimize yönlendiriyorum. En kısa sürede size dönüş yapılacaktır.\n\n' +
    'Otomatik sisteme geri dönmek için "bot" yazabilirsiniz.'
  );
  logger.warn(`[HUMAN HANDOFF] ${from} (${name}) insan operatöre yönlendirildi`);
}

function enableHumanHandoff(phone, agent, { conversations, saveConvState }) {
  let conv = conversations.get(phone) || db.getConversation(phone);
  if (!conv) {
    logger.warn(`Konuşma bulunamadı: ${phone}`);
    return false;
  }
  conv.isHumanHandoff = true;
  conv.humanAgent = agent;
  conv.state = STATES.HUMAN_HANDOFF;
  saveConvState(phone, conv);
  logger.info(`[HANDOFF] ${phone} → ${agent} tarafından devralındı`);
  return true;
}

function disableHumanHandoff(phone, { conversations, saveConvState }) {
  let conv = conversations.get(phone) || db.getConversation(phone);
  if (!conv) return false;
  conv.isHumanHandoff = false;
  conv.humanAgent = null;
  conv.data = { _closedAt: Date.now() };
  conv.state = STATES.IDLE;
  saveConvState(phone, conv);
  logger.info(`[HANDOFF] ${phone} → bot'a geri döndü`);
  return true;
}

async function sendHumanMessage(phone, text, agent, { conversations, saveConvState }) {
  const { sendText } = require('../../evolutionTransport');

  const lowerText = text.toLowerCase().trim();

  // /bot komutu
  if (lowerText.startsWith('/bot')) {
    logger.info(`[ADMIN CMD] /bot komutu algılandı → ${phone}`);
    db.saveMessage(phone, 'human', '[/bot sipariş komutu]', 'text', { agent });
    const { handleBotOrderCommand } = require('./botOrder');
    await handleBotOrderCommand(phone, text, agent);
    return;
  }

  // /fiyat komutu
  if (lowerText === '/fiyat' || lowerText === '/fiyat botu') {
    const { activatePriceBot } = require('./partialBot');
    activatePriceBot(phone, agent, { conversations, saveConvState });
    logger.info(`[ADMIN CMD] /fiyat komutu algılandı → ${phone} fiyat botu aktif`);
    db.saveMessage(phone, 'human', '[/fiyat komutu]', 'text', { agent });
    return;
  }

  // /siparis komutu
  if (lowerText === '/siparis' || lowerText === '/sipariş' || lowerText === '/siparis botu') {
    const { activateOrderBot } = require('./partialBot');
    activateOrderBot(phone, agent, { conversations, saveConvState });
    logger.info(`[ADMIN CMD] /siparis komutu algılandı → ${phone} sipariş botu aktif`);
    db.saveMessage(phone, 'human', '[/siparis komutu]', 'text', { agent });
    return;
  }

  // Normal mesaj gönder
  await sendText(phone, text);
  db.saveMessage(phone, 'human', text, 'text', { agent });
  logger.info(`[HUMAN] ${agent} → ${phone}: ${text.substring(0, 50)}...`);

  // Onay isteme pattern'i algıla
  const approvalPatterns = [
    'onay veriyorum', 'onay vermeniz', 'uygunsa', 'uygundur yazmanız',
    'onaylıyorum yazmanız', 'onayınızı', 'baskıya alınacaktır',
    'onay vermenizi', 'onay bekliyoruz', 'onayınızı bekliyoruz'
  ];
  const isApprovalRequest = approvalPatterns.some(p => lowerText.includes(p));
  if (isApprovalRequest) {
    let conv = conversations.get(phone) || db.getConversation(phone);
    if (conv) {
      conv.state = STATES.AWAITING_APPROVAL;
      conv.isHumanHandoff = false;
      conv.humanAgent = agent;
      saveConvState(phone, conv);
      logger.info(`[APPROVAL REQUEST] ${phone} → AWAITING_APPROVAL state'ine geçirildi (admin onay istedi)`);
    }
  }
}

function requestApproval(phone, agent, { conversations, saveConvState }) {
  let conv = conversations.get(phone) || db.getConversation(phone);
  if (!conv) {
    logger.warn(`Konuşma bulunamadı (requestApproval): ${phone}`);
    return false;
  }
  conv.state = STATES.AWAITING_APPROVAL;
  conv.isHumanHandoff = false;
  conv.humanAgent = agent;
  saveConvState(phone, conv);
  logger.info(`[APPROVAL REQUEST] ${phone} → AWAITING_APPROVAL (admin: ${agent})`);
  return true;
}

module.exports = { triggerHumanHandoff, enableHumanHandoff, disableHumanHandoff, sendHumanMessage, requestApproval };
