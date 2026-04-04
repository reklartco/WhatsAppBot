const { sendTextMessage } = require('./whatsappService');
const { normalizeTurkish } = require('../utils/validator');
const db = require('./database');
const logger = require('../utils/logger');
const customerService = require('./customerService');

// ===== Paylaşılan Modüller =====
const { STATES, MATERIALS, MATERIAL_GROUPS, MATERIAL_INDEX } = require('./conversation/states');
const { isTriggerWord, isFarewellMessage, isHandoffFarewell } = require('./conversation/triggers');
const { extractMessageContent } = require('./conversation/helpers');
const { parseNumberedReply, getReplyLabel } = require('./conversation/numberedReply');
const { parseSize } = require('./conversation/parseSize');

// ===== Handlers =====
const { handleIdle } = require('./conversation/handlers/idle');
const { handleMainMenu, showMaterialList } = require('./conversation/handlers/mainMenu');
const { handleMaterialSelect } = require('./conversation/handlers/material');
const { handleSizeSelect, handleCustomSize } = require('./conversation/handlers/size');
const { handleQuantitySelect, handleCustomQuantity } = require('./conversation/handlers/quantity');
const { handleDesignVariety } = require('./conversation/handlers/designVariety');
const { calculateAndShowPrice, handlePriceResponse } = require('./conversation/handlers/price');
const { handleCustomerType, handleBireyselInfo, handleKurumsalInfo } = require('./conversation/handlers/customerInfo');
const { handleAddress, handleShippingSame, handleShippingAddress } = require('./conversation/handlers/address');
const { handleAskEmail, handleEmail } = require('./conversation/handlers/email');
const { showOrderSummary } = require('./conversation/handlers/orderSummary');
const { handleOrderConfirm } = require('./conversation/handlers/orderConfirm');
const { handleEditFieldSelect, handleEditFieldInput, showEditFieldMenu } = require('./conversation/handlers/orderEdit');
const { handleFileUpload } = require('./conversation/handlers/fileUpload');
const { handleApproval } = require('./conversation/handlers/approval');
const { handleAwaitingPayment } = require('./conversation/handlers/payment');
const { handleOrderTracking } = require('./conversation/handlers/orderTracking');
const { handleLabelInfo, handleLabelInfoDetail } = require('./conversation/handlers/labelInfo');
const { triggerHumanHandoff, enableHumanHandoff, disableHumanHandoff, sendHumanMessage, requestApproval } = require('./conversation/handlers/humanHandoff');
const { handlePartialBotPrice, handlePartialBotOrder, activatePriceBot, activateOrderBot } = require('./conversation/handlers/partialBot');

// ===== In-memory cache =====
const conversations = new Map();

// ===== State Persistence =====
function saveConvState(phone, conv) {
  conversations.set(phone, conv);
  db.saveConversation(phone, conv);
}

function deleteConvState(phone) {
  conversations.delete(phone);
  db.deleteConversation(phone);
}

// ===== Context objesi (handler'lara inject edilen bağımlılıklar) =====
const ctx = { conversations, saveConvState, deleteConvState };

// ===== ANA İŞLEME FONKSİYONU =====
async function processMessage(from, name, message) {
  let conv = conversations.get(from);
  if (!conv) {
    const dbConv = db.getConversation(from);
    if (dbConv) {
      conv = {
        state: dbConv.state,
        name: dbConv.name,
        data: dbConv.data,
        isHumanHandoff: dbConv.isHumanHandoff,
        humanAgent: dbConv.humanAgent,
        lastActivity: dbConv.lastActivity,
        createdAt: dbConv.createdAt
      };
    }
  }

  if (!conv) {
    conv = {
      state: STATES.IDLE,
      name: name,
      data: {},
      isHumanHandoff: false,
      humanAgent: null,
      lastActivity: Date.now(),
      createdAt: Date.now()
    };
  }

  conv.lastActivity = Date.now();
  conv.name = name;

  const msgContent = extractMessageContent(message);
  const mediaCaption = msgContent.image?.caption || msgContent.document?.caption || '';
  const mediaMetadata = msgContent.image || msgContent.document || {};
  const displayContent = msgContent.text || mediaCaption || `[${msgContent.type}]`;
  db.saveMessage(from, 'inbound', displayContent, msgContent.type, mediaMetadata);

  // ===== VEDA SONRASI GUARD =====
  if (conv.state === STATES.IDLE && conv.data._closedAt) {
    const guardText = normalizeTurkish((msgContent.text || '').toLowerCase().trim());
    const isExplicitRestart =
      guardText === 'bot' || guardText === 'robot' || guardText === 'merhaba' || guardText === 'selam' ||
      guardText === 'menu' || guardText === 'menü' ||
      guardText.startsWith('bot ') || guardText.startsWith('merhaba ') || guardText.startsWith('selam ');
    if (!isExplicitRestart) {
      logger.info(`[CLOSED GUARD] ${from}: Veda sonrası mesaj yoksayıldı — "${(msgContent.text || '').substring(0, 40)}"`);
      conversations.set(from, conv);
      return;
    }
    delete conv.data._closedAt;
    logger.info(`[CLOSED GUARD] ${from}: Yeniden aktifleştirildi — "${guardText}"`);
  }

  try {
    // ===== HUMAN HANDOFF =====
    if (conv.isHumanHandoff && conv.state === STATES.HUMAN_HANDOFF) {
      if (msgContent.text && ['bot', 'robot', 'otomasyon'].includes(msgContent.text.toLowerCase().trim())) {
        conv.isHumanHandoff = false;
        conv.humanAgent = null;
        conv.data = {};
        conv.state = STATES.MAIN_MENU;
        saveConvState(from, conv);
        await sendTextMessage(from,
          `Otomatik sisteme geri döndünüz. Size nasıl yardımcı olabiliriz?\n\n` +
          `1. Fiyat Hesaplama\n` +
          `2. Etiket Türleri Hakkında Bilgi\n` +
          `3. Müşteri Temsilcisi`
        );
        return;
      }

      // Handoff farewell algılama
      if (msgContent.text) {
        if (isHandoffFarewell(msgContent.text)) {
          const firstName = (conv.name || '').split(' ')[0] || '';
          await sendTextMessage(from,
            `Bizi tercih ettiğiniz için teşekkürler${firstName ? ' ' + firstName : ''} 🙏\n` +
            `Başka sorularınız olursa *bot* yazmanız yeterlidir. İyi günler! 😊`
          );
          conv.isHumanHandoff = false;
          conv.humanAgent = null;
          conv.data = { _closedAt: Date.now() };
          conv.state = STATES.IDLE;
          saveConvState(from, conv);
          logger.info(`[FAREWELL] ${from} → Handoff kapatıldı (müşteri veda etti)`);
          return;
        }
      }
      logger.info(`[HUMAN HANDOFF] ${from}: ${msgContent.text || msgContent.type}`);
      saveConvState(from, conv);
      return;
    }

    // ===== PARTIAL BOT =====
    if (conv.state === STATES.PARTIAL_BOT_PRICE) {
      await handlePartialBotPrice(from, conv, msgContent);
      saveConvState(from, conv);
      return;
    }
    if (conv.state === STATES.PARTIAL_BOT_ORDER) {
      await handlePartialBotOrder(from, conv, msgContent);
      saveConvState(from, conv);
      return;
    }

    // ===== BOT ON/OFF =====
    const customer = customerService.getOrCreateCustomer(from, name);
    if (customer && !customer.botEnabled) {
      const lowerText = (msgContent.text || '').toLowerCase().trim();
      const handoffKeywords = ['0', 'insan', 'operatör', 'yetkili', 'müdür', 'destek', 'bot', 'robot', 'otomasyon'];
      if (!handoffKeywords.includes(lowerText)) {
        logger.info(`[BOT OFF] ${from}: mesaj yoksayıldı (bot kapalı)`);
        saveConvState(from, conv);
        return;
      }
    }

    // ===== İPTAL =====
    if (msgContent.text) {
      const cancelNorm = normalizeTurkish(msgContent.text.trim());
      if (['iptal', 'sifirla', 'vazgec', 'cancel'].includes(cancelNorm)) {
        deleteConvState(from);
        await sendTextMessage(from, 'İşlem iptal edildi. Yeniden başlamak için herhangi bir mesaj gönderin.');
        return;
      }
    }

    // ===== İNSAN OPERATÖR =====
    if (msgContent.text) {
      const opNorm = normalizeTurkish(msgContent.text.trim());
      if (['0', 'insan', 'operator', 'yetkili', 'mudur', 'destek'].includes(opNorm)) {
        await triggerHumanHandoff(from, name, conv, ctx);
        return;
      }
    }

    // ===== KAPANIŞ / VEDA MESAJI =====
    const farewellSkipStates = [STATES.IDLE, STATES.HUMAN_HANDOFF, STATES.AWAITING_APPROVAL];
    if (msgContent.text && !farewellSkipStates.includes(conv.state)) {
      if (isFarewellMessage(msgContent.text)) {
        const firstName = (conv.name || '').split(' ')[0] || '';
        const farewellMsg = firstName
          ? `Bizi tercih ettiğiniz için teşekkürler ${firstName} 🙏\nBaşka sorularınız olursa *bot* yazmanız yeterlidir. İyi günler! 😊`
          : `Bizi tercih ettiğiniz için teşekkürler 🙏\nBaşka sorularınız olursa *bot* yazmanız yeterlidir. İyi günler! 😊`;
        await sendTextMessage(from, farewellMsg);
        conv.data = { _closedAt: Date.now() };
        conv.state = STATES.IDLE;
        saveConvState(from, conv);
        return;
      }
    }

    // ===== TETİKLEME KELİMELERİ =====
    const protectedStates = [STATES.AWAITING_APPROVAL, STATES.AWAITING_PAYMENT, STATES.AWAITING_FILE, STATES.CONFIRM_ORDER];
    if (msgContent.text && conv.state !== STATES.IDLE && conv.state !== STATES.MAIN_MENU && !protectedStates.includes(conv.state) && isTriggerWord(msgContent.text)) {
      conv.data = {};
      conv.state = STATES.IDLE;
      await handleIdle(from, name, conv, msgContent);
      saveConvState(from, conv);
      return;
    }

    // ===== ERROR RECOVERY MENÜ =====
    if (conv.data._errorRecoveryMenu && msgContent.text) {
      const choice = msgContent.text.trim();
      if (choice === '1') {
        conv.data = {};
        conv.data._errorRecoveryMenu = false;
        conv.state = STATES.IDLE;
        await handleIdle(from, name, conv, msgContent);
        saveConvState(from, conv);
        return;
      } else if (choice === '2') {
        conv.data._errorRecoveryMenu = false;
        await triggerHumanHandoff(from, name, conv, ctx);
        saveConvState(from, conv);
        return;
      }
      conv.data._errorRecoveryMenu = false;
    }

    // ===== NUMBERED REPLY =====
    const numberedReply = parseNumberedReply(msgContent.text, conv.state);
    if (numberedReply) {
      msgContent.buttonId = numberedReply.buttonId;
      msgContent.listId = numberedReply.listId;
      const replyLabel = getReplyLabel(numberedReply, conv.state);
      if (replyLabel) {
        try { db.updateLastMessageMeta(from, { resolvedLabel: replyLabel }); } catch (e) {}
      }
    }

    // ===== STATE ROUTING =====
    switch (conv.state) {
      case STATES.IDLE:
        await handleIdle(from, name, conv, msgContent);
        break;
      case STATES.MAIN_MENU:
        await handleMainMenu(from, conv, msgContent);
        break;
      case STATES.SELECT_MATERIAL:
        await handleMaterialSelect(from, conv, msgContent);
        break;
      case STATES.SELECT_SIZE:
        await handleSizeSelect(from, conv, msgContent);
        break;
      case STATES.ENTER_CUSTOM_SIZE:
        await handleCustomSize(from, conv, msgContent);
        break;
      case STATES.SELECT_QUANTITY:
        await handleQuantitySelect(from, conv, msgContent);
        break;
      case STATES.ENTER_CUSTOM_QTY:
        await handleCustomQuantity(from, conv, msgContent);
        break;
      case STATES.ASK_DESIGN_VARIETY:
        await handleDesignVariety(from, conv, msgContent);
        break;
      case STATES.SHOW_PRICE:
        await handlePriceResponse(from, conv, msgContent);
        break;
      case STATES.SELECT_CUSTOMER_TYPE:
        await handleCustomerType(from, conv, msgContent);
        break;
      case STATES.ENTER_BIREYSEL_INFO:
        await handleBireyselInfo(from, conv, msgContent);
        break;
      case STATES.ENTER_KURUMSAL_INFO:
        await handleKurumsalInfo(from, conv, msgContent);
        break;
      case STATES.ENTER_ADDRESS:
        await handleAddress(from, conv, msgContent);
        break;
      case STATES.ASK_SHIPPING_SAME:
        await handleShippingSame(from, conv, msgContent);
        break;
      case STATES.ENTER_SHIPPING_ADDRESS:
        await handleShippingAddress(from, conv, msgContent);
        break;
      case STATES.ENTER_EMAIL:
        await handleEmail(from, conv, msgContent);
        break;
      case STATES.CONFIRM_ORDER:
        await handleOrderConfirm(from, conv, msgContent, { deleteConvState, showEditFieldMenu });
        break;
      case STATES.EDIT_FIELD_SELECT:
        await handleEditFieldSelect(from, conv, msgContent);
        break;
      case STATES.EDIT_FIELD_INPUT:
        await handleEditFieldInput(from, conv, msgContent);
        break;
      case STATES.AWAITING_FILE:
        await handleFileUpload(from, conv, message, msgContent);
        break;
      case STATES.AWAITING_APPROVAL:
        await handleApproval(from, conv, msgContent);
        break;
      case STATES.ASK_EMAIL:
        await handleAskEmail(from, conv, msgContent);
        break;
      case STATES.AWAITING_PAYMENT:
        await handleAwaitingPayment(from, conv, msgContent, { triggerHumanHandoff: (f, n, c) => triggerHumanHandoff(f, n, c, ctx) });
        break;
      case STATES.ORDER_TRACKING:
        await handleOrderTracking(from, conv, msgContent);
        break;
      case STATES.LABEL_INFO:
        await handleLabelInfo(from, conv, msgContent);
        break;
      case STATES.LABEL_INFO_DETAIL:
        await handleLabelInfoDetail(from, conv, msgContent);
        break;
      default:
        await handleIdle(from, name, conv, msgContent);
    }

    if (!conv._deleted) {
      saveConvState(from, conv);
    }

  } catch (error) {
    logger.error(`İşleme hatası (${from}):`, error);
    await sendTextMessage(from,
      'Bir hata oluştu, özür dileriz. Lütfen tekrar deneyin veya "iptal" yazarak yeniden başlayın.\n\n' +
      'İsterseniz müşteri temsilcimize bağlanabilirsiniz, *0* yazmanız yeterli.'
    );
  }
}

// ===== KONUŞMA TEMİZLEME =====
const CONVERSATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function cleanupStaleConversations() {
  const now = Date.now();
  for (const [phone, conv] of conversations) {
    if (!conv.isHumanHandoff && now - conv.lastActivity > CONVERSATION_TIMEOUT_MS) {
      conversations.delete(phone);
      logger.info(`Cache temizlendi: ${phone}`);
    }
  }
  db.cleanupStaleConversations(CONVERSATION_TIMEOUT_MS);
}

const cleanupInterval = setInterval(cleanupStaleConversations, 10 * 60 * 1000);
cleanupInterval.unref();

function stopCleanup() {
  clearInterval(cleanupInterval);
}

// ===== PUBLIC API =====
module.exports = {
  processMessage,
  extractMessageContent,
  parseSize,
  parseNumberedReply,
  sendHumanMessage: (phone, text, agent = 'admin') => sendHumanMessage(phone, text, agent, ctx),
  enableHumanHandoff: (phone, agent = 'admin') => enableHumanHandoff(phone, agent, ctx),
  disableHumanHandoff: (phone) => disableHumanHandoff(phone, ctx),
  requestApproval: (phone, agent = 'admin') => requestApproval(phone, agent, ctx),
  activatePriceBot: (phone, agent = 'admin') => activatePriceBot(phone, agent, ctx),
  activateOrderBot: (phone, agent = 'admin') => activateOrderBot(phone, agent, ctx),
  STATES,
  MATERIALS,
  MATERIAL_GROUPS,
  conversations,
  cleanupStaleConversations,
  stopCleanup,
  CONVERSATION_TIMEOUT_MS
};
