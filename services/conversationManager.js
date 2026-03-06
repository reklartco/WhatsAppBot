const {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendCTAButton,
  downloadMedia
} = require('./whatsappService');
const { calculatePrice } = require('./priceCalculator');
const { createCustomer, createOrder, getOrderStatus } = require('./woocommerceService');
const { saveFile } = require('./fileService');
const { validateEmail, validateSize, validatePhone } = require('../utils/validator');
const db = require('./database');
const logger = require('../utils/logger');
const customerService = require('./customerService');
const statsService = require('./statsService');

// ========== KONUŞMA DURUMLARI ==========

const STATES = {
  IDLE: 'IDLE',
  MAIN_MENU: 'MAIN_MENU',
  SELECT_MATERIAL: 'SELECT_MATERIAL',
  SELECT_SIZE: 'SELECT_SIZE',
  ENTER_CUSTOM_SIZE: 'ENTER_CUSTOM_SIZE',
  SELECT_QUANTITY: 'SELECT_QUANTITY',
  ENTER_CUSTOM_QTY: 'ENTER_CUSTOM_QTY',
  SHOW_PRICE: 'SHOW_PRICE',
  SELECT_CUSTOMER_TYPE: 'SELECT_CUSTOMER_TYPE',
  ENTER_BIREYSEL_INFO: 'ENTER_BIREYSEL_INFO',
  ENTER_KURUMSAL_INFO: 'ENTER_KURUMSAL_INFO',
  ENTER_ADDRESS: 'ENTER_ADDRESS',
  ASK_SHIPPING_SAME: 'ASK_SHIPPING_SAME',
  ENTER_SHIPPING_ADDRESS: 'ENTER_SHIPPING_ADDRESS',
  ENTER_EMAIL: 'ENTER_EMAIL',
  CONFIRM_ORDER: 'CONFIRM_ORDER',
  AWAITING_FILE: 'AWAITING_FILE',
  ORDER_TRACKING: 'ORDER_TRACKING',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF',
  LABEL_INFO: 'LABEL_INFO',
  LABEL_INFO_DETAIL: 'LABEL_INFO_DETAIL',
};

// In-memory cache
const conversations = new Map();

// ========== MALZEME TİPLERİ (WordPress admin kodları) ==========
const MATERIALS = {
  'kuse': { name: 'Kuşe', code: 'kuse' },
  'opak': { name: 'Opak (Suya Dayanıklı)', code: 'opak' },
  'seffaf': { name: 'Şeffaf', code: 'seffaf' },
  '300gr_mat_kuse': { name: '300gr Mat Kuşe', code: 'parlak' },
  '350gr_mat_kuse': { name: '350gr Mat Kuşe', code: '350grmat' },
  '170gr_parlak_kuse': { name: '170gr Parlak Kuşe', code: '170grkuse' },
  'kraft_300gr': { name: 'Kraft (300gr)', code: 'kraft' },
  '300gr_amerikan_bristol': { name: '300gr Amerikan Bristol', code: '300gramerikan' },
  '350gr_amerikan_bristol': { name: '350gr Amerikan Bristol', code: '350gramerikan' },
};

const MATERIAL_GROUPS = [
  {
    title: 'Standart Etiketler',
    rows: [
      { id: 'kuse', title: 'Kuşe', description: 'En çok tercih edilen' },
      { id: 'opak', title: 'Opak (Suya Dayanıklı)', description: '' },
      { id: 'seffaf', title: 'Şeffaf', description: '' },
      { id: 'ozel_malzeme', title: 'Özel Malzeme Türü', description: 'Müşteri temsilcisi yönlendirir' },
    ]
  },
  {
    title: 'Kalın / Karton Etiketler',
    rows: [
      { id: '300gr_mat_kuse', title: '300gr Mat Kuşe', description: '' },
      { id: '350gr_mat_kuse', title: '350gr Mat Kuşe', description: '' },
      { id: '170gr_parlak_kuse', title: '170gr Parlak Kuşe', description: '' },
      { id: 'kraft_300gr', title: 'Kraft (300gr)', description: '' },
      { id: '300gr_amerikan_bristol', title: '300gr Amerikan Bristol', description: '' },
      { id: '350gr_amerikan_bristol', title: '350gr Amerikan Bristol', description: '' },
      { id: 'diger', title: 'Diğer', description: 'Müşteri temsilcisi yönlendirir' },
    ]
  }
];

const MATERIAL_INDEX = MATERIAL_GROUPS.flatMap(g => g.rows.map(r => r.id));

// ========== TETİKLEME KELİMELERİ ==========
// İlk kelime tetikleyicileri — mesajın İLK kelimesi bunlardan biriyse bot başlar
const GREETING_TRIGGERS = [
  'merhaba', 'merhabalar', 'selam', 'selamlar', 'slm', 'mrb',
  'hey', 'hi', 'hello', 'helo', 'sa', 'as',
  'günaydın', 'hayırlı',
];

// Cümle içinde geçtiğinde tetikleyen kelimeler
const KEYWORD_TRIGGERS = [
  'bilgi', 'fiyat', 'sipariş', 'etiket', 'sticker', 'baskı',
  'hakkında', 'menü', 'menu', 'yardım', 'başla', 'başlat',
  'hizmet', 'ürün', 'katalog', 'kaça', 'ne kadar',
];

// Tam cümle / kalıp tetikleyiciler
const PHRASE_TRIGGERS = [
  'iyi günler', 'iyi akşamlar', 'hayırlı günler',
  'bilgi almak istiyorum', 'bilgi alabilir miyim',
  'fiyat öğrenmek istiyorum', 'fiyat ne kadar', 'fiyat bilgisi',
  'sipariş vermek istiyorum', 'sipariş ver',
  'etiket bastırmak', 'etiket baskı',
  'nasıl sipariş', 'ne yapıyorsunuz',
  'kaç tl', 'ne kadar',
  'reklamınızı gördüm', 'reklamdan geldim', 'reklam',
  'daha fazla bilgi', 'detaylı bilgi',
];

function isTriggerWord(text) {
  if (!text) return false;
  // Noktalama temizle, küçük harf
  const cleaned = text.toLowerCase().trim().replace(/[!?,.:;'"()\-\u00BF\u00A1]/g, '').trim();
  if (!cleaned) return false;

  const words = cleaned.split(/\s+/);
  const firstWord = words[0];

  // 1. İlk kelime selamlama mı?
  if (GREETING_TRIGGERS.includes(firstWord)) return true;

  // 2. Tam kalıp eşleşmesi
  for (const phrase of PHRASE_TRIGGERS) {
    if (cleaned.includes(phrase)) return true;
  }

  // 3. Anahtar kelime mesajda geçiyor mu?
  for (const kw of KEYWORD_TRIGGERS) {
    if (kw.includes(' ')) {
      if (cleaned.includes(kw)) return true;
    } else {
      if (words.includes(kw)) return true;
    }
  }

  return false;
}

// ========== YARDIMCI ==========
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ========== ANA İŞLEME FONKSİYONU ==========

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
  // Medya mesajları için caption ve metadata kaydet
  const mediaCaption = msgContent.image?.caption || msgContent.document?.caption || '';
  const mediaMetadata = msgContent.image || msgContent.document || {};
  const displayContent = msgContent.text || mediaCaption || `[${msgContent.type}]`;
  db.saveMessage(from, 'inbound', displayContent, msgContent.type, mediaMetadata);

  try {
    // ===== HUMAN HANDOFF =====
    if (conv.isHumanHandoff && conv.state === STATES.HUMAN_HANDOFF) {
      if (msgContent.text && ['bot', 'robot', 'otomasyon'].includes(msgContent.text.toLowerCase().trim())) {
        conv.isHumanHandoff = false;
        conv.humanAgent = null;
        conv.state = STATES.IDLE;
        saveConvState(from, conv);
        await sendTextMessage(from, 'Otomatik sisteme geri döndünüz. Size nasıl yardımcı olabilirim?');
        await handleIdle(from, name, conv, msgContent);
        saveConvState(from, conv);
        return;
      }
      logger.info(`[HUMAN HANDOFF] ${from}: ${msgContent.text || msgContent.type}`);
      saveConvState(from, conv);
      return;
    }

    // ===== BOT ON/OFF KONTROLÜ =====
    const customer = customerService.getOrCreateCustomer(from, name);
    if (customer && !customer.botEnabled) {
      // Bot kapalı — sadece handoff keyword'lerini geçir
      const lowerText = (msgContent.text || '').toLowerCase().trim();
      const handoffKeywords = ['0', 'insan', 'operatör', 'yetkili', 'müdür', 'destek', 'bot', 'robot', 'otomasyon'];
      if (!handoffKeywords.includes(lowerText)) {
        logger.info(`[BOT OFF] ${from}: mesaj yoksayıldı (bot kapalı)`);
        saveConvState(from, conv);
        return;
      }
    }

    // ===== İPTAL =====
    if (msgContent.text && ['iptal', 'sıfırla', 'vazgeç', 'cancel'].includes(msgContent.text.toLowerCase().trim())) {
      deleteConvState(from);
      await sendTextMessage(from, 'İşlem iptal edildi. Yeniden başlamak için herhangi bir mesaj gönderin.');
      return;
    }

    // ===== İNSAN OPERATÖR =====
    if (msgContent.text && ['0', 'insan', 'operatör', 'yetkili', 'müdür', 'destek'].includes(msgContent.text.toLowerCase().trim())) {
      await triggerHumanHandoff(from, name, conv);
      return;
    }

    // ===== TETİKLEME KELİMELERİ (ana menüyü yeniden başlat) =====
    if (msgContent.text && conv.state !== STATES.IDLE && conv.state !== STATES.MAIN_MENU && isTriggerWord(msgContent.text)) {
      conv.data = {};
      conv.state = STATES.IDLE;
      await handleIdle(from, name, conv, msgContent);
      saveConvState(from, conv);
      return;
    }

    // ===== ERROR RECOVERY MENÜ KONTROLÜ =====
    if (conv.data._errorRecoveryMenu && msgContent.text) {
      const choice = msgContent.text.trim();
      if (choice === '1') {
        // Ana menüye dön
        conv.data = {};
        conv.data._errorRecoveryMenu = false;
        conv.state = STATES.IDLE;
        await handleIdle(from, name, conv, msgContent);
        saveConvState(from, conv);
        return;
      } else if (choice === '2') {
        // Müşteri temsilcisine bağlan
        conv.data._errorRecoveryMenu = false;
        await triggerHumanHandoff(from, name, conv);
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
    }

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
        await handleOrderConfirm(from, conv, msgContent);
        break;
      case STATES.AWAITING_FILE:
        await handleFileUpload(from, conv, message, msgContent);
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

// ========== HUMAN HANDOFF TETİKLEME ==========

async function triggerHumanHandoff(from, name, conv) {
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

// ========== ETİKET BİLGİ MENÜSÜ ==========

const LABEL_INFO_DATA = {
  1: {
    name: 'Kuşe Etiket',
    detail:
      `*Kuşe Etiket* 🏷️\n\n` +
      `En yaygın kullanılan etiket türüdür. Parlak ve mat seçenekleri mevcuttur.\n\n` +
      `✅ Ürün etiketi, barkod, adres etiketi için ideal\n` +
      `✅ Yüksek baskı kalitesi\n` +
      `✅ Uygun fiyatlı\n\n` +
      `Kullanım alanları: Gıda ambalajı, kozmetik, e-ticaret kargo etiketi, raf etiketi`
  },
  2: {
    name: 'Şeffaf Etiket',
    detail:
      `*Şeffaf Etiket* ✨\n\n` +
      `Cam, plastik ve düz yüzeylerde şık bir görünüm sunar.\n\n` +
      `✅ Ürünün kendi rengini ön plana çıkarır\n` +
      `✅ Kozmetik, içecek şişeleri için tercih edilir\n` +
      `✅ Premium görünüm\n\n` +
      `Kullanım alanları: Şişe etiketi, kavanoz etiketi, cam ambalaj, parfüm kutusu`
  },
  3: {
    name: 'Kraft Etiket',
    detail:
      `*Kraft Etiket* 🌿\n\n` +
      `Doğal, vintage görünüm sunan kahverengi kraft kağıt üzerine baskı.\n\n` +
      `✅ El yapımı ürünler için mükemmel\n` +
      `✅ Organik ve doğal ürün hissi\n` +
      `✅ Çevre dostu görünüm\n\n` +
      `Kullanım alanları: El yapımı sabun, organik gıda, butik ürünler, hediyelik ambalaj`
  },
  4: {
    name: 'Karton Etiket',
    detail:
      `*Karton Etiket* 📋\n\n` +
      `300gr-350gr kalın karton üzerine baskı. Sert ve dayanıklı yapı.\n\n` +
      `✅ Askılı etiket (hang tag) için uygun\n` +
      `✅ Fiyat kartı olarak kullanılabilir\n` +
      `✅ Premium ürün hissi\n\n` +
      `Kullanım alanları: Giyim askılı etiket, fiyat kartı, ürün bilgi kartı, kartvizit`
  },
  5: {
    name: 'Özel Malzeme',
    detail:
      `*Özel Malzeme Etiketler* 🌟\n\n` +
      `Metalize, hologram, kumaş gibi özel malzemeler.\n\n` +
      `✅ Hologram güvenlik etiketi\n` +
      `✅ Metalize (altın/gümüş) lüks görünüm\n` +
      `✅ Kumaş etiket (tekstil)\n\n` +
      `Özel malzeme talepleriniz için müşteri temsilcimizle görüşmenizi öneriyoruz.`
  }
};

async function showLabelInfoMenu(from) {
  await sendTextMessage(from,
    `📋 *Etiket Türlerimiz:*\n\n` +
    `1. *Kuşe Etiket* — En yaygın kullanılan etiket türü. Parlak ve mat seçenekleri var. Ürün etiketi, barkod, adres etiketi için ideal.\n\n` +
    `2. *Şeffaf Etiket* — Cam, plastik yüzeylerde şık durur. Kozmetik, içecek şişeleri için tercih edilir.\n\n` +
    `3. *Kraft Etiket* — Doğal, vintage görünüm. El yapımı ürünler, organik gıda için popüler.\n\n` +
    `4. *Karton Etiket* — 300gr-350gr kalın karton. Askılı etiket, fiyat kartı için uygun.\n\n` +
    `5. *Özel Malzeme* — Metalize, hologram, kumaş vb. özel ihtiyaçlar.\n\n` +
    `Detaylı bilgi almak istediğiniz etiket numarasını yazın veya *0* ile ana menüye dönün.`
  );
}

async function handleLabelInfo(from, conv, msgContent) {
  const text = msgContent.text?.trim();

  if (text === '0') {
    conv.data = {};
    conv.state = STATES.IDLE;
    await handleIdle(from, conv.name || 'Müşteri', conv, msgContent);
    return;
  }

  const num = parseInt(text);
  if (num >= 1 && num <= 5 && LABEL_INFO_DATA[num]) {
    const info = LABEL_INFO_DATA[num];
    conv.data.selectedLabelInfo = num;
    await sendTextMessage(from, info.detail);

    await sendTextMessage(from,
      `Bu etiket türü için fiyat hesaplamak ister misiniz?\n\n` +
      `1. ✅ Evet, fiyat hesapla\n` +
      `2. 🔙 Diğer etiket türlerine bak\n` +
      `3. 🏠 Ana menüye dön`
    );
    conv.state = STATES.LABEL_INFO_DETAIL;
  } else {
    conv.data.errorCount = (conv.data.errorCount || 0) + 1;
    if (conv.data.errorCount >= 3) {
      await sendTextMessage(from,
        'Anlaşılan zorluk yaşıyorsunuz. Lütfen 1-5 arası bir numara girin veya *0* ile ana menüye dönün.'
      );
      conv.data.errorCount = 0;
    } else {
      await sendTextMessage(from,
        'Lütfen 1-5 arası bir numara seçin veya *0* ile ana menüye dönün.'
      );
    }
  }
}

async function handleLabelInfoDetail(from, conv, msgContent) {
  const text = msgContent.text?.trim();

  if (text === '1') {
    // Fiyat hesaplamaya yönlendir
    await showMaterialList(from);
    conv.data.isQuoteOnly = true;
    conv.data.errorCount = 0;
    conv.state = STATES.SELECT_MATERIAL;
  } else if (text === '2') {
    // Etiket listesine geri dön
    conv.data.errorCount = 0;
    await showLabelInfoMenu(from);
    conv.state = STATES.LABEL_INFO;
  } else if (text === '3' || text === '0') {
    // Ana menüye dön
    conv.data = {};
    conv.state = STATES.IDLE;
    await handleIdle(from, conv.name || 'Müşteri', conv, msgContent);
  } else {
    await sendTextMessage(from, 'Lütfen 1, 2 veya 3 yazarak seçim yapın.');
  }
}

// ========== HATA YÖNETİMİ (ERROR RECOVERY) ==========

function getMainMenuText() {
  return (
    `1. 🏷️ Fiyat Hesapla\n` +
    `2. 📦 Sipariş Ver\n` +
    `3. ℹ️ Etiket Türleri Hakkında Bilgi\n` +
    `4. 👤 Müşteri Temsilcisine Bağlan\n` +
    `5. 📋 Sipariş Takibi`
  );
}

async function handleMainMenuError(from, conv) {
  conv.data.errorCount = (conv.data.errorCount || 0) + 1;

  if (conv.data.errorCount >= 5) {
    await sendTextMessage(from,
      `Anlaşılan zorluk yaşıyorsunuz. Size yardımcı olabilmem için:\n\n` +
      `1. Ana menüye dön\n` +
      `2. Müşteri temsilcisine bağlan`
    );
    conv.data.errorCount = 0;
    conv.data._errorRecoveryMenu = true;
  } else if (conv.data.errorCount >= 3) {
    // Önceki state'e geri dön (main menu zaten ilk adım, sadece uyarı ver)
    await sendTextMessage(from,
      `Anlayamadım. Lütfen 1-5 arası bir numara yazarak seçim yapın:\n\n` +
      getMainMenuText()
    );
  } else {
    await sendTextMessage(from,
      `Anlayamadım. Lütfen numara ile seçim yapın:\n\n` +
      getMainMenuText()
    );
  }
}

/**
 * Genel error recovery fonksiyonu — tüm state handler'larda kullanılır.
 * 3 hatalı giriş → Önceki state'e geri dön + uyarı
 * 5+ hatalı giriş → Ana menü / human handoff öner
 * @returns {boolean} true ise handler'dan çıkılmalı (recovery tetiklendi)
 */
async function handleStateError(from, conv, defaultMsg) {
  conv.data.errorCount = (conv.data.errorCount || 0) + 1;

  if (conv.data.errorCount >= 5) {
    await sendTextMessage(from,
      `Anlaşılan zorluk yaşıyorsunuz. Size yardımcı olabilmem için:\n\n` +
      `1. Ana menüye dön\n` +
      `2. Müşteri temsilcisine bağlan`
    );
    conv.data.errorCount = 0;
    conv.data._errorRecoveryMenu = true;
    conv.data._previousState = conv.state;
    conv.state = STATES.MAIN_MENU;
    return true;
  } else if (conv.data.errorCount >= 3 && conv.data.previousState) {
    // 3 hatalı girişte önceki adıma geri dön
    await sendTextMessage(from,
      `Birkaç hatalı giriş yaptınız. Sizi bir önceki adıma yönlendiriyorum.`
    );
    conv.state = conv.data.previousState;
    conv.data.errorCount = 0;
    return true;
  } else {
    await sendTextMessage(from, defaultMsg);
    return false;
  }
}

/** Başarılı bir state geçişinde error counter'ı sıfırla ve önceki state'i kaydet */
function onSuccessfulTransition(conv, fromState) {
  conv.data.previousState = fromState;
  conv.data.errorCount = 0;
}

// ========== DURUM İŞLEYİCİLERİ ==========

async function handleIdle(from, name, conv, msgContent) {
  const firstName = name.split(' ')[0];

  await sendTextMessage(from,
    `Merhaba ${firstName}! 👋 Ben *1E Yapay Zeka Asistanı*nızım.\n\n` +
    `Sizler için fiyat hesaplayıp, sipariş oluşturabilirim.\n\n` +
    `Size nasıl yardımcı olabilirim?\n\n` +
    `1. 🏷️ Fiyat Hesapla\n` +
    `2. 📦 Sipariş Ver\n` +
    `3. ℹ️ Etiket Türleri Hakkında Bilgi\n` +
    `4. 👤 Müşteri Temsilcisine Bağlan\n` +
    `5. 📋 Sipariş Takibi\n\n` +
    `Daha özel sorularınız için *4* tuşu ile müşteri temsilcimize ulaşabilirsiniz.`
  );

  conv.state = STATES.MAIN_MENU;
}

async function handleMainMenu(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'price_inquiry' ||
      selection?.includes('fiyat') || selection?.includes('hesapla')) {
    await showMaterialList(from);
    conv.data.isQuoteOnly = true;
    conv.state = STATES.SELECT_MATERIAL;

  } else if (selection === 'new_order' ||
      selection?.includes('sipariş') || selection?.includes('etiket')) {
    await showMaterialList(from);
    conv.data.isQuoteOnly = false;
    conv.state = STATES.SELECT_MATERIAL;

  } else if (selection === 'label_info' || selection?.includes('bilgi')) {
    await showLabelInfoMenu(from);
    conv.state = STATES.LABEL_INFO;

  } else if (selection === 'customer_rep' || selection?.includes('temsilci') || selection?.includes('insan')) {
    await triggerHumanHandoff(from, conv.name, conv);

  } else if (selection === 'track_order' || selection?.includes('takip')) {
    await sendTextMessage(from,
      'Sipariş takibi için sipariş numaranızı girin:\n(Örnek: 12345)'
    );
    conv.state = STATES.ORDER_TRACKING;

  } else {
    await handleMainMenuError(from, conv);
  }
}

async function showMaterialList(from) {
  let text = `Etiket Türlerinden Hangisi?\n\n`;
  text += `*Standart Etiketler*\n`;
  text += `1. Kuşe (En çok tercih edilen)\n`;
  text += `2. Opak (Suya Dayanıklı)\n`;
  text += `3. Şeffaf\n`;
  text += `4. Özel Malzeme Türü\n\n`;
  text += `*Kalın / Karton Etiketler*\n`;
  text += `5. 300gr Mat Kuşe\n`;
  text += `6. 350gr Mat Kuşe\n`;
  text += `7. 170gr Parlak Kuşe\n`;
  text += `8. Kraft (300gr)\n`;
  text += `9. 300gr Amerikan Bristol\n`;
  text += `10. 350gr Amerikan Bristol\n`;
  text += `11. Diğer\n\n`;
  text += `Lütfen numara ile seçim yapın.`;
  await sendTextMessage(from, text);
}

async function handleMaterialSelect(from, conv, msgContent) {
  let materialId = msgContent.listId || msgContent.text?.toLowerCase();

  const num = parseInt(materialId);
  if (num >= 1 && num <= MATERIAL_INDEX.length) {
    materialId = MATERIAL_INDEX[num - 1];
  }

  // Özel malzeme veya Diğer → human handoff
  if (materialId === 'ozel_malzeme' || materialId === 'diger') {
    await triggerHumanHandoff(from, conv.name, conv);
    return;
  }

  const material = MATERIALS[materialId];

  if (!material) {
    const recovered = await handleStateError(from, conv, 'Geçersiz seçim. Lütfen listeden bir numara seçin.');
    if (recovered) return;
    return;
  }

  onSuccessfulTransition(conv, STATES.SELECT_MATERIAL);
  conv.data.material = material;

  await sendTextMessage(from,
    `${material.name} seçildi.\n\n` +
    `Etiket boyutunu seçin:\n` +
    `1. 50x50 mm\n` +
    `2. 100x50 mm\n` +
    `3. Özel Boyut\n\n` +
    `Ölçünüzü mm cinsinden giriniz.\n` +
    `Direkt ölçü girebilirsiniz. (Örn: 75x50)`
  );

  conv.state = STATES.SELECT_SIZE;
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
    // Direkt ölçü girişi
    const parsed = parseSize(selection);
    if (parsed) {
      if (parsed.width < 10 || parsed.width > 500 || parsed.height < 10 || parsed.height > 500) {
        await sendTextMessage(from, 'Boyut 10mm ile 500mm arasında olmalıdır. Lütfen tekrar girin.');
        return;
      }
      onSuccessfulTransition(conv, STATES.SELECT_SIZE);
      conv.data.width = parsed.width;
      conv.data.height = parsed.height;
      await showQuantityOptions(from, conv);
    } else {
      const recovered = await handleStateError(from, conv,
        'Geçersiz boyut. Örnek format: 75x50\n\n' +
        '1. 50x50 mm\n2. 100x50 mm\n3. Özel Boyut'
      );
      if (recovered) return;
    }
  }
}

async function handleCustomSize(from, conv, msgContent) {
  const parsed = parseSize(msgContent.text);

  if (!parsed) {
    const recovered = await handleStateError(from, conv,
      'Geçersiz format. Lütfen şu formatta girin: GenişlikxYükseklik\nÖrnek: 75x50, 100x70, 30x20'
    );
    if (recovered) return;
    return;
  }

  if (parsed.width < 10 || parsed.width > 500 || parsed.height < 10 || parsed.height > 500) {
    await sendTextMessage(from, 'Boyut 10mm ile 500mm arasında olmalıdır. Lütfen tekrar girin.');
    return;
  }

  onSuccessfulTransition(conv, STATES.ENTER_CUSTOM_SIZE);
  conv.data.width = parsed.width;
  conv.data.height = parsed.height;
  await showQuantityOptions(from, conv);
}

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

async function handleQuantitySelect(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'qty_100') {
    conv.data.quantity = 100;
  } else if (selection === 'qty_250') {
    conv.data.quantity = 250;
  } else if (selection === 'qty_1000') {
    conv.data.quantity = 1000;
  } else {
    const qty = parseInt(selection);
    if (qty && qty >= 50) {
      conv.data.quantity = qty;
    } else {
      const recovered = await handleStateError(from, conv,
        'Geçersiz adet. Minimum 50 adet sipariş verilir.\n\n' +
        '1. 100 Adet\n2. 250 Adet\n3. 1.000 Adet\n\nVeya direkt adet yazınız.'
      );
      if (recovered) return;
      return;
    }
  }

  onSuccessfulTransition(conv, STATES.SELECT_QUANTITY);
  await calculateAndShowPrice(from, conv);
}

async function handleCustomQuantity(from, conv, msgContent) {
  const qty = parseInt(msgContent.text);

  if (!qty || qty < 50) {
    const recovered = await handleStateError(from, conv,
      'Minimum sipariş adedi 50\'dir. Lütfen geçerli bir adet girin.'
    );
    if (recovered) return;
    return;
  }

  if (qty > 1000000) {
    await sendTextMessage(from, 'Çok yüksek adet. Lütfen 1.000.000 ve altı girin veya bizi arayın.');
    return;
  }

  onSuccessfulTransition(conv, STATES.ENTER_CUSTOM_QTY);
  conv.data.quantity = qty;
  await calculateAndShowPrice(from, conv);
}

async function calculateAndShowPrice(from, conv) {
  await sendTextMessage(from, 'Fiyat hesaplanıyor...');

  try {
    const priceResult = await calculatePrice({
      material: conv.data.material.code,
      width: conv.data.width,
      height: conv.data.height,
      quantity: conv.data.quantity
    });

    conv.data.price = priceResult;

    let priceText =
      `*SİPARİŞ ÖZETİ*\n\n` +
      `Malzeme: ${conv.data.material.name}\n` +
      `Boyut: ${conv.data.width}x${conv.data.height} mm\n` +
      `Adet: ${formatNumber(conv.data.quantity)}\n`;

    if (priceResult.sheets) {
      priceText += `Tabaka: ${priceResult.sheets} adet (${priceResult.labelsPerSheet} etiket/tabaka)\n`;
    }

    if (priceResult.discount > 0) {
      priceText += `İndirim: %${priceResult.discount} (-${priceResult.discountAmount} TL)\n`;
    }

    priceText += `Ara Toplam: ${priceResult.totalPrice} TL +KDV\n`;
    priceText += `KDV (%20): ${priceResult.kdvAmount} TL\n`;

    if (priceResult.freeShipping) {
      priceText += `Kargo: *Ücretsiz* 🚚\n`;
    } else {
      priceText += `Kargo: ${priceResult.kargoFee} TL\n`;
    }

    priceText += `\n*TOPLAM: ${priceResult.grandTotal} TL*\n`;
    priceText += `Tahmini Teslimat: ${priceResult.deliveryDays} iş günü`;

    await sendTextMessage(from, priceText);

    await sendTextMessage(from,
      `Tasarımınız siparişiniz oluşturulduktan sonra alınacaktır.\n\n` +
      `Siparişi onaylıyor musunuz?\n` +
      `1. Onayla\n` +
      `2. Değiştir\n` +
      `3. İptal`
    );

    conv.state = STATES.SHOW_PRICE;
  } catch (error) {
    logger.error('Fiyat hesaplama hatası:', error);
    await sendTextMessage(from, 'Fiyat hesaplanamadı. Lütfen tekrar deneyin veya "iptal" yazarak yeniden başlayın.\n\nMüşteri temsilcimize bağlanmak için *0* yazın.');
  }
}

async function handlePriceResponse(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'confirm_order' || selection?.includes('onayla') || selection?.includes('evet')) {
    onSuccessfulTransition(conv, STATES.SHOW_PRICE);
    await sendTextMessage(from,
      `Fatura türünüzü seçin:\n\n` +
      `1. Bireysel\n` +
      `2. Kurumsal`
    );
    conv.state = STATES.SELECT_CUSTOMER_TYPE;
  } else if (selection === 'change_options' || selection?.includes('değiştir')) {
    conv.data = {};
    await handleIdle(from, conv.name, conv, msgContent);
  } else if (selection === 'cancel_order' || selection === 'cancel' || selection?.includes('iptal')) {
    deleteConvState(from);
    conv._deleted = true;
    await sendTextMessage(from, 'Sipariş iptal edildi. Tekrar görüşmek üzere!');
  } else {
    await handleStateError(from, conv,
      'Lütfen seçim yapın:\n\n1. Onayla\n2. Değiştir\n3. İptal'
    );
  }
}

// ========== MÜŞTERİ BİLGİ TOPLAMA ==========

async function handleCustomerType(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'bireysel' || selection?.includes('bireysel')) {
    onSuccessfulTransition(conv, STATES.SELECT_CUSTOMER_TYPE);
    conv.data.customerType = 'bireysel';
    await sendTextMessage(from,
      `Lütfen aşağıdaki bilgileri satır satır yazınız:\n\n` +
      `Ad Soyad\n` +
      `Telefon\n` +
      `TC Kimlik No\n\n` +
      `_TC kimlik numaranız faturalandırma için gereklidir._`
    );
    conv.state = STATES.ENTER_BIREYSEL_INFO;
  } else if (selection === 'kurumsal' || selection?.includes('kurumsal')) {
    onSuccessfulTransition(conv, STATES.SELECT_CUSTOMER_TYPE);
    conv.data.customerType = 'kurumsal';
    await sendTextMessage(from,
      `Lütfen aşağıdaki bilgileri satır satır yazınız:\n\n` +
      `Şirket Ünvanı (tam ünvan lütfen)\n` +
      `Vergi Dairesi\n` +
      `Vergi No\n` +
      `Telefon`
    );
    conv.state = STATES.ENTER_KURUMSAL_INFO;
  } else {
    await handleStateError(from, conv,
      'Lütfen fatura türünüzü seçin:\n\n1. Bireysel\n2. Kurumsal'
    );
  }
}

// ===== BİREYSEL — TEK SEFERDE =====

async function handleBireyselInfo(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  if (!text) {
    await sendTextMessage(from,
      'Lütfen bilgilerinizi satır satır yazın:\n\nAd Soyad\nTelefon\nTC Kimlik No'
    );
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 3) {
    await sendTextMessage(from,
      'Eksik bilgi. Lütfen 3 satır halinde yazın:\n\nAd Soyad\nTelefon\nTC Kimlik No\n\nÖrnek:\nMustafa Yılmaz\n05321234567\n12345678901'
    );
    return;
  }

  const fullName = lines[0];
  const phone = lines[1].replace(/\s/g, '');
  const tc = lines[2].replace(/\s/g, '');

  // Ad Soyad kontrol
  const nameParts = fullName.split(/\s+/);
  if (nameParts.length < 2 || fullName.length < 4) {
    await sendTextMessage(from, 'Ad ve soyadınızı eksiksiz yazın.\n\nÖrnek:\nMustafa Yılmaz\n05321234567\n12345678901');
    return;
  }

  // Telefon kontrol
  if (phone.length < 10) {
    await sendTextMessage(from, 'Telefon numarası geçersiz.\n\nÖrnek:\nMustafa Yılmaz\n05321234567\n12345678901');
    return;
  }

  // TC kontrol
  if (!/^\d{11}$/.test(tc)) {
    await sendTextMessage(from, 'TC Kimlik numarası 11 haneli olmalıdır.\n\nÖrnek:\nMustafa Yılmaz\n05321234567\n12345678901');
    return;
  }

  conv.data.firstName = nameParts[0];
  conv.data.lastName = nameParts.slice(1).join(' ');
  conv.data.phone = phone;
  conv.data.tcNo = tc;

  await sendTextMessage(from, 'Adresinizi girin:\n(İl, ilçe, açık adres)');
  conv.state = STATES.ENTER_ADDRESS;
}

// ===== KURUMSAL — TEK SEFERDE =====

async function handleKurumsalInfo(from, conv, msgContent) {
  const text = msgContent.text?.trim();
  if (!text) {
    await sendTextMessage(from,
      'Lütfen bilgilerinizi satır satır yazın:\n\nŞirket Ünvanı\nVergi Dairesi\nVergi No\nTelefon'
    );
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 4) {
    await sendTextMessage(from,
      'Eksik bilgi. Lütfen 4 satır halinde yazın:\n\nŞirket Ünvanı (tam ünvan)\nVergi Dairesi\nVergi No\nTelefon\n\n' +
      'Örnek:\nABC Teknoloji A.Ş.\nKadıköy VD\n1234567890\n05321234567'
    );
    return;
  }

  const companyTitle = lines[0];
  const taxOffice = lines[1];
  const taxNo = lines[2].replace(/\s/g, '');
  const phone = lines[3].replace(/\s/g, '');

  if (companyTitle.length < 3) {
    await sendTextMessage(from, 'Şirket ünvanı çok kısa. Tam ünvanı yazın.');
    return;
  }

  if (taxOffice.length < 2) {
    await sendTextMessage(from, 'Vergi dairesi geçersiz. Lütfen tekrar yazın.');
    return;
  }

  if (taxNo.length < 10) {
    await sendTextMessage(from, 'Vergi numarası en az 10 haneli olmalıdır.');
    return;
  }

  if (phone.length < 10) {
    await sendTextMessage(from, 'Telefon numarası geçersiz.');
    return;
  }

  conv.data.companyTitle = companyTitle;
  conv.data.taxOffice = taxOffice;
  conv.data.taxNo = taxNo;
  conv.data.phone = phone;
  // Kurumsal fatura için isim alanına şirket ünvanı
  conv.data.firstName = companyTitle;
  conv.data.lastName = '';

  await sendTextMessage(from, 'Adresinizi girin:\n(İl, ilçe, açık adres)');
  conv.state = STATES.ENTER_ADDRESS;
}

// ===== ADRES ve KARGO =====

async function handleAddress(from, conv, msgContent) {
  const address = msgContent.text?.trim();

  if (!address || address.length < 10) {
    await sendTextMessage(from, 'Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin.');
    return;
  }

  conv.data.billingAddress = address;

  await sendTextMessage(from,
    `Kargo adresiniz fatura adresiniz ile aynı mı?\n\n` +
    `1. Evet, Aynı\n` +
    `2. Hayır, Farklı`
  );
  conv.state = STATES.ASK_SHIPPING_SAME;
}

async function handleShippingSame(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'shipping_same' || selection?.includes('aynı') || selection?.includes('evet')) {
    conv.data.shippingAddress = conv.data.billingAddress;
    await askEmail(from, conv);
  } else if (selection === 'shipping_different' || selection?.includes('farklı') || selection?.includes('hayır')) {
    await sendTextMessage(from, 'Kargo teslimat adresini girin:\n(İl, ilçe, açık adres)');
    conv.state = STATES.ENTER_SHIPPING_ADDRESS;
  } else {
    await sendTextMessage(from,
      'Kargo adresiniz fatura adresiniz ile aynı mı?\n\n1. Evet, Aynı\n2. Hayır, Farklı'
    );
  }
}

async function handleShippingAddress(from, conv, msgContent) {
  const address = msgContent.text?.trim();
  if (!address || address.length < 10) {
    await sendTextMessage(from, 'Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin.');
    return;
  }
  conv.data.shippingAddress = address;
  await askEmail(from, conv);
}

// ===== E-POSTA (ÜYELİK) =====

async function askEmail(from, conv) {
  await sendTextMessage(from, 'Üyelik oluşturmak için e-posta adresinizi yazın:');
  conv.state = STATES.ENTER_EMAIL;
}

async function handleEmail(from, conv, msgContent) {
  const email = msgContent.text?.trim();
  if (!validateEmail(email)) {
    const recovered = await handleStateError(from, conv,
      'Geçersiz e-posta adresi. Lütfen doğru formatta girin:\nÖrnek: info@firma.com'
    );
    if (recovered) return;
    return;
  }
  onSuccessfulTransition(conv, STATES.ENTER_EMAIL);
  conv.data.email = email;
  await showOrderSummary(from, conv);
}

// ===== SİPARİŞ ÖZETİ =====

async function showOrderSummary(from, conv) {
  const p = conv.data.price;
  let summaryText =
    `*SİPARİŞ ÖZETİ*\n\n` +
    `Malzeme: ${conv.data.material.name}\n` +
    `Boyut: ${conv.data.width}x${conv.data.height} mm\n` +
    `Adet: ${formatNumber(conv.data.quantity)}\n` +
    `Toplam: ${p.totalPrice} TL +KDV\n` +
    `KDV: ${p.kdvAmount} TL\n`;

  if (!p.freeShipping) {
    summaryText += `Kargo: ${p.kargoFee} TL\n`;
  } else {
    summaryText += `Kargo: Ücretsiz\n`;
  }

  summaryText += `*ÖDENECEK: ${p.grandTotal} TL*\n\n`;

  if (conv.data.customerType === 'bireysel') {
    summaryText +=
      `Ad Soyad: ${conv.data.firstName} ${conv.data.lastName}\n` +
      `Telefon: ${conv.data.phone}\n` +
      `TC: ${conv.data.tcNo}\n`;
  } else {
    summaryText +=
      `Şirket: ${conv.data.companyTitle}\n` +
      `Vergi Dairesi: ${conv.data.taxOffice}\n` +
      `Vergi No: ${conv.data.taxNo}\n` +
      `Telefon: ${conv.data.phone}\n`;
  }

  summaryText +=
    `E-posta: ${conv.data.email}\n` +
    `Fatura Adresi: ${conv.data.billingAddress}\n`;

  if (conv.data.shippingAddress !== conv.data.billingAddress) {
    summaryText += `Kargo Adresi: ${conv.data.shippingAddress}\n`;
  }

  await sendTextMessage(from, summaryText);

  await sendTextMessage(from,
    `Her şey doğru mu? Siparişinizi oluşturayım mı?\n\n` +
    `1. Oluştur\n` +
    `2. İptal Et`
  );

  conv.state = STATES.CONFIRM_ORDER;
}

// ===== SİPARİŞ ONAY =====

async function handleOrderConfirm(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'final_cancel' || selection?.includes('iptal')) {
    deleteConvState(from);
    conv._deleted = true;
    await sendTextMessage(from, 'Sipariş iptal edildi. Tekrar bekleriz!');
    return;
  }

  if (selection !== 'final_confirm' && !selection?.includes('oluştur') && !selection?.includes('evet')) {
    await sendTextMessage(from, 'Lütfen onaylayın veya iptal edin:\n\n1. Oluştur\n2. İptal Et');
    return;
  }

  await sendTextMessage(from, 'Hesabınız ve siparişiniz oluşturuluyor...');

  try {
    const customerData = {
      email: conv.data.email,
      phone: conv.data.phone || from,
      customerType: conv.data.customerType,
      billingAddress: conv.data.billingAddress,
      shippingAddress: conv.data.shippingAddress,
      first_name: conv.data.firstName,
      last_name: conv.data.lastName || '',
    };

    if (conv.data.customerType === 'bireysel') {
      customerData.tcNo = conv.data.tcNo;
    } else {
      customerData.company = conv.data.companyTitle;
      customerData.taxNo = conv.data.taxNo;
      customerData.taxOffice = conv.data.taxOffice;
    }

    const customer = await createCustomer(customerData);
    conv.data.customerId = customer.id;

    const order = await createOrder({
      customerId: customer.id,
      material: conv.data.material,
      width: conv.data.width,
      height: conv.data.height,
      quantity: conv.data.quantity,
      totalPrice: conv.data.price.totalRaw,
      unitPrice: conv.data.price.unitPrice,
      grandTotal: conv.data.price.grandTotal,
      kargoFee: conv.data.price.kargoFee,
      sheets: conv.data.price.sheets,
      labelsPerSheet: conv.data.price.labelsPerSheet,
      customerData: customerData
    });

    conv.data.orderId = order.id;
    conv.data.orderNumber = order.number;
    conv.data.paymentUrl = order.payment_url;

    // İstatistik ve CRM sync
    statsService.recordOrderStat();
    try {
      await customerService.syncCustomerFromWC(from);
    } catch (e) { logger.error('Post-order WC sync hatası:', e.message); }

    let confirmText =
      `*SİPARİŞİNİZ OLUŞTURULDU!* ✅\n\n` +
      `Sipariş No: #${order.number}\n` +
      `Hesap: ${conv.data.email}\n` +
      `Şifreniz: 123456\n\n` +
      `⚠️ Lütfen giriş yaparak şifrenizi yenileyin.\n\n` +
      `Giriş: https://1etiket.com.tr/hesabim/\n` +
      `Şifre Yenileme: https://1etiket.com.tr/hesabim/edit-account/`;

    await sendTextMessage(from, confirmText);

    await sendCTAButton(from,
      `Ödemenizi aşağıdaki linkten yapabilirsiniz:\n\n` +
      `Havale/EFT veya Kredi Kartı ile ödeyebilirsiniz.\n` +
      `Toplam: ${conv.data.price.grandTotal} TL`,
      'Ödeme Yap',
      order.payment_url
    );

    setTimeout(async () => {
      await sendTextMessage(from,
        `Tasarımınızı bize gönderin:\n\n` +
        `Kabul edilen formatlar:\n` +
        `- Canva Linki\n` +
        `- PDF (tercih edilen)\n` +
        `- AI (Adobe Illustrator)\n` +
        `- PNG/JPEG (min 300 DPI)\n\n` +
        `Dosyayı bu sohbete sürükleyip bırakın veya Canva linkinizi yapıştırın.`
      );
      conv.state = STATES.AWAITING_FILE;
      saveConvState(from, conv);
    }, 3000);

  } catch (error) {
    logger.error('Sipariş oluşturma hatası:', error);
    await sendTextMessage(from,
      'Sipariş oluşturulurken bir hata oluştu. Lütfen tekrar deneyin veya "iptal" yazarak yeniden başlayın.\n\nMüşteri temsilcimize bağlanmak için *0* yazın.'
    );
  }
}

// ===== DOSYA / LİNK YÜKLEME =====

async function handleFileUpload(from, conv, message, msgContent) {
  // Canva veya herhangi bir URL linki
  if (msgContent && msgContent.text) {
    const urlMatch = msgContent.text.match(/https?:\/\/\S+/i);
    if (urlMatch) {
      await sendTextMessage(from,
        `Tasarım linkiniz alındı! ✅\n\n` +
        `Link: ${urlMatch[0]}\n` +
        `Sipariş: #${conv.data.orderNumber}\n\n` +
        `Siparişiniz baskı kuyruğuna alındı.\n` +
        `Durum güncellemelerini bu sohbetten takip edebilirsiniz.\n\n` +
        `Teşekkür ederiz!`
      );
      conv.state = STATES.IDLE;
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
        `Siparişiniz baskı kuyruğuna alındı.\n` +
        `Durum güncellemelerini bu sohbetten takip edebilirsiniz.\n\n` +
        `Teşekkür ederiz!`
      );

      conv.state = STATES.IDLE;

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

// ===== SİPARİŞ TAKİP =====

async function handleOrderTracking(from, conv, msgContent) {
  const orderNumber = msgContent.text?.trim();

  if (!orderNumber || isNaN(orderNumber)) {
    await sendTextMessage(from, 'Geçersiz sipariş numarası. Lütfen sadece rakam girin.');
    return;
  }

  try {
    const status = await getOrderStatus(orderNumber);

    const statusText = {
      'pending': 'Ödeme Bekleniyor',
      'processing': 'Hazırlanıyor / Baskıda',
      'on-hold': 'Beklemede',
      'completed': 'Tamamlandı',
      'shipped': 'Kargoya Verildi',
      'cancelled': 'İptal Edildi',
      'refunded': 'İade Edildi'
    };

    await sendTextMessage(from,
      `*Sipariş #${orderNumber}*\n\n` +
      `Durum: ${statusText[status.status] || status.status}\n` +
      `Tarih: ${status.date}\n` +
      `Toplam: ${status.total} TL\n` +
      (status.tracking ? `Kargo Takip: ${status.tracking}\n` : '') +
      `\nDetay: https://1etiket.com.tr/hesabim/`
    );

    conv.state = STATES.IDLE;
  } catch (error) {
    await sendTextMessage(from,
      `Sipariş #${orderNumber} bulunamadı. Lütfen sipariş numaranızı kontrol edin.`
    );
  }
}

// ========== HUMAN HANDOFF FONKSİYONLARI ==========

async function sendHumanMessage(phone, text, agent = 'admin') {
  const { sendText } = require('./evolutionTransport');
  await sendText(phone, text);
  db.saveMessage(phone, 'human', text, 'text', { agent });
  logger.info(`[HUMAN] ${agent} → ${phone}: ${text.substring(0, 50)}...`);
}

function enableHumanHandoff(phone, agent = 'admin') {
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

function disableHumanHandoff(phone) {
  let conv = conversations.get(phone) || db.getConversation(phone);
  if (!conv) return false;
  conv.isHumanHandoff = false;
  conv.humanAgent = null;
  conv.state = STATES.IDLE;
  saveConvState(phone, conv);
  logger.info(`[HANDOFF] ${phone} → bot'a geri döndü`);
  return true;
}

// ========== STATE PERSISTENCE ==========

function saveConvState(phone, conv) {
  conversations.set(phone, conv);
  db.saveConversation(phone, conv);
}

function deleteConvState(phone) {
  conversations.delete(phone);
  db.deleteConversation(phone);
}

// ========== KONUŞMA TEMİZLEME ==========

const CONVERSATION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 saat

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

// ========== YARDIMCI FONKSİYONLAR ==========

function extractMessageContent(message) {
  switch (message.type) {
    case 'text':
      return { text: message.text.body, type: 'text' };
    case 'interactive':
      if (message.interactive.type === 'button_reply') {
        return {
          buttonId: message.interactive.button_reply.id,
          text: message.interactive.button_reply.title,
          type: 'button'
        };
      }
      if (message.interactive.type === 'list_reply') {
        return {
          listId: message.interactive.list_reply.id,
          text: message.interactive.list_reply.title,
          type: 'list'
        };
      }
      return { text: '', type: 'interactive' };
    case 'document':
      return { text: '', type: 'document', document: message.document };
    case 'image':
      return { text: '', type: 'image', image: message.image };
    default:
      return { text: '', type: message.type };
  }
}

function parseNumberedReply(text, currentState) {
  if (!text) return null;
  const num = parseInt(text.trim());
  if (isNaN(num) || num < 1) return null;

  switch (currentState) {
    case STATES.MAIN_MENU: {
      const menuMap = { 1: 'price_inquiry', 2: 'new_order', 3: 'label_info', 4: 'customer_rep', 5: 'track_order' };
      if (menuMap[num]) return { buttonId: menuMap[num] };
      break;
    }
    case STATES.SELECT_SIZE: {
      const sizeMap = { 1: 'size_50x50', 2: 'size_100x50', 3: 'size_custom' };
      if (sizeMap[num]) return { buttonId: sizeMap[num] };
      break;
    }
    case STATES.SELECT_QUANTITY: {
      const qtyMap = { 1: 'qty_100', 2: 'qty_250', 3: 'qty_1000' };
      if (qtyMap[num]) return { buttonId: qtyMap[num] };
      break;
    }
    case STATES.SHOW_PRICE: {
      const priceMap = { 1: 'confirm_order', 2: 'change_options', 3: 'cancel_order' };
      if (priceMap[num]) return { buttonId: priceMap[num] };
      break;
    }
    case STATES.SELECT_CUSTOMER_TYPE: {
      const typeMap = { 1: 'bireysel', 2: 'kurumsal' };
      if (typeMap[num]) return { buttonId: typeMap[num] };
      break;
    }
    case STATES.ASK_SHIPPING_SAME: {
      const shipMap = { 1: 'shipping_same', 2: 'shipping_different' };
      if (shipMap[num]) return { buttonId: shipMap[num] };
      break;
    }
    case STATES.CONFIRM_ORDER: {
      const confMap = { 1: 'final_confirm', 2: 'final_cancel' };
      if (confMap[num]) return { buttonId: confMap[num] };
      break;
    }
    case STATES.SELECT_MATERIAL: {
      if (num >= 1 && num <= MATERIAL_INDEX.length) {
        return { listId: MATERIAL_INDEX[num - 1] };
      }
      break;
    }
  }
  return null;
}

function parseSize(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*[x×*]\s*(\d+)/i);
  if (!match) return null;
  return { width: parseInt(match[1]), height: parseInt(match[2]) };
}

module.exports = {
  processMessage,
  extractMessageContent,
  parseSize,
  parseNumberedReply,
  sendHumanMessage,
  enableHumanHandoff,
  disableHumanHandoff,
  STATES,
  MATERIALS,
  MATERIAL_GROUPS,
  conversations,
  cleanupStaleConversations,
  stopCleanup,
  CONVERSATION_TIMEOUT_MS
};
