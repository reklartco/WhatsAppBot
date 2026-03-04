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
const logger = require('../utils/logger');

// ========== KONUŞMA DURUMLARI ==========

const conversations = new Map();

const STATES = {
  IDLE: 'IDLE',
  MAIN_MENU: 'MAIN_MENU',
  SELECT_MATERIAL: 'SELECT_MATERIAL',
  SELECT_SIZE: 'SELECT_SIZE',
  ENTER_CUSTOM_SIZE: 'ENTER_CUSTOM_SIZE',
  SELECT_QUANTITY: 'SELECT_QUANTITY',
  ENTER_CUSTOM_QTY: 'ENTER_CUSTOM_QTY',
  SELECT_LAMINATION: 'SELECT_LAMINATION',
  SHOW_PRICE: 'SHOW_PRICE',
  ENTER_EMAIL: 'ENTER_EMAIL',
  ENTER_ADDRESS: 'ENTER_ADDRESS',
  ENTER_COMPANY: 'ENTER_COMPANY',
  CONFIRM_ORDER: 'CONFIRM_ORDER',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  AWAITING_FILE: 'AWAITING_FILE',
  AWAITING_COMPANY_NAME: 'AWAITING_COMPANY_NAME',
  ORDER_TRACKING: 'ORDER_TRACKING',
};

// ========== MALZEME TİPLERİ ==========
const MATERIALS = {
  'kuse': { name: 'Kuşe Etiket', code: 'kuse', priceMultiplier: 1.0 },
  'kraft': { name: 'Kraft Etiket', code: 'kraft', priceMultiplier: 1.15 },
  'seffaf_pp': { name: 'Şeffaf PP Etiket', code: 'seffaf_pp', priceMultiplier: 1.40 },
  'beyaz_pp': { name: 'Beyaz PP Etiket', code: 'beyaz_pp', priceMultiplier: 1.35 },
  'vellum': { name: 'Vellum Etiket', code: 'vellum', priceMultiplier: 1.20 },
  'silver': { name: 'Silver Etiket', code: 'silver', priceMultiplier: 1.80 },
  'gold': { name: 'Gold Etiket', code: 'gold', priceMultiplier: 1.85 },
  'hologram': { name: 'Hologram Etiket', code: 'hologram', priceMultiplier: 2.10 },
};

// ========== ANA İŞLEME FONKSİYONU ==========

async function processMessage(from, name, message) {
  let conv = conversations.get(from) || {
    state: STATES.IDLE,
    name: name,
    data: {},
    lastActivity: Date.now()
  };

  conv.lastActivity = Date.now();

  const msgContent = extractMessageContent(message);

  try {
    if (msgContent.text && ['iptal', 'sıfırla', 'vazgeç', 'cancel'].includes(msgContent.text.toLowerCase().trim())) {
      conversations.delete(from);
      await sendTextMessage(from, 'İşlem iptal edildi. Yeniden başlamak için herhangi bir mesaj gönderin.');
      return;
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
      case STATES.SELECT_LAMINATION:
        await handleLamination(from, conv, msgContent);
        break;
      case STATES.SHOW_PRICE:
        await handlePriceResponse(from, conv, msgContent);
        break;
      case STATES.ENTER_EMAIL:
        await handleEmail(from, conv, msgContent);
        break;
      case STATES.ENTER_ADDRESS:
        await handleAddress(from, conv, msgContent);
        break;
      case STATES.ENTER_COMPANY:
        await handleCompany(from, conv, msgContent);
        break;
      case STATES.AWAITING_COMPANY_NAME:
        await handleCompanyName(from, conv, msgContent);
        break;
      case STATES.CONFIRM_ORDER:
        await handleOrderConfirm(from, conv, msgContent);
        break;
      case STATES.AWAITING_FILE:
        await handleFileUpload(from, conv, message);
        break;
      case STATES.ORDER_TRACKING:
        await handleOrderTracking(from, conv, msgContent);
        break;
      default:
        await handleIdle(from, name, conv, msgContent);
    }

    // Handler iptal/silme yaptıysa tekrar ekleme
    if (!conv._deleted) {
      conversations.set(from, conv);
    }

  } catch (error) {
    logger.error(`İşleme hatası (${from}):`, error);
    await sendTextMessage(from,
      'Bir hata oluştu, özür dileriz. Lütfen tekrar deneyin veya "iptal" yazın.'
    );
  }
}

// ========== DURUM İŞLEYİCİLERİ ==========

async function handleIdle(from, name, conv, msgContent) {
  const firstName = name.split(' ')[0];

  await sendTextMessage(from,
    `Merhaba ${firstName}!\n\n` +
    `1etiket.com.tr'ye hoş geldiniz.\n` +
    `Etiket ve sticker baskı siparişleriniz için buradayız.`
  );

  await sendButtonMessage(from,
    'Size nasıl yardımcı olabilirim?',
    [
      { id: 'new_order', title: 'Sipariş Ver' },
      { id: 'price_inquiry', title: 'Fiyat Öğren' },
      { id: 'track_order', title: 'Sipariş Takip' }
    ]
  );

  conv.state = STATES.MAIN_MENU;
}

async function handleMainMenu(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'new_order' || selection === 'price_inquiry' ||
      selection?.includes('sipariş') || selection?.includes('fiyat') ||
      selection?.includes('etiket')) {
    await sendListMessage(from,
      'Etiket malzemesini seçin:\n\n' +
      'Kuşe etiket en çok tercih edilen standart malzemedir.',
      'Malzeme Seç',
      [{
        title: 'Etiket Malzemeleri',
        rows: Object.entries(MATERIALS).map(([id, mat]) => ({
          id: id,
          title: mat.name,
          description: mat.code === 'kuse' ? 'En çok tercih edilen' : ''
        }))
      }]
    );
    conv.data.isQuoteOnly = (selection === 'price_inquiry');
    conv.state = STATES.SELECT_MATERIAL;

  } else if (selection === 'track_order' || selection?.includes('takip')) {
    await sendTextMessage(from,
      'Sipariş takibi için sipariş numaranızı girin:\n(Örnek: 12345)'
    );
    conv.state = STATES.ORDER_TRACKING;

  } else {
    await sendButtonMessage(from,
      'Anlayamadım. Lütfen aşağıdaki seçeneklerden birini seçin:',
      [
        { id: 'new_order', title: 'Sipariş Ver' },
        { id: 'price_inquiry', title: 'Fiyat Öğren' },
        { id: 'track_order', title: 'Sipariş Takip' }
      ]
    );
  }
}

async function handleMaterialSelect(from, conv, msgContent) {
  const materialId = msgContent.listId || msgContent.text?.toLowerCase();
  const material = MATERIALS[materialId];

  if (!material) {
    await sendTextMessage(from, 'Geçersiz seçim. Lütfen listeden bir malzeme seçin.');
    return;
  }

  conv.data.material = material;

  await sendButtonMessage(from,
    `${material.name} seçildi.\n\nŞimdi etiket boyutunu seçin:`,
    [
      { id: 'size_50x50', title: '50x50 mm' },
      { id: 'size_100x50', title: '100x50 mm' },
      { id: 'size_custom', title: 'Özel Boyut' }
    ]
  );

  conv.state = STATES.SELECT_SIZE;
}

async function handleSizeSelect(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'size_50x50') {
    conv.data.width = 50;
    conv.data.height = 50;
    await showQuantityOptions(from, conv);
  } else if (selection === 'size_100x50') {
    conv.data.width = 100;
    conv.data.height = 50;
    await showQuantityOptions(from, conv);
  } else if (selection === 'size_custom') {
    await sendTextMessage(from,
      'Özel boyutu mm cinsinden girin:\n' +
      'Format: GenişlikxYükseklik\n' +
      'Örnek: 75x50 veya 70x70'
    );
    conv.state = STATES.ENTER_CUSTOM_SIZE;
  } else {
    const parsed = parseSize(selection);
    if (parsed) {
      conv.data.width = parsed.width;
      conv.data.height = parsed.height;
      await showQuantityOptions(from, conv);
    } else {
      await sendTextMessage(from, 'Geçersiz boyut. Örnek format: 75x50');
    }
  }
}

async function handleCustomSize(from, conv, msgContent) {
  const parsed = parseSize(msgContent.text);

  if (!parsed) {
    await sendTextMessage(from,
      'Geçersiz format. Lütfen şu formatta girin: GenişlikxYükseklik\n' +
      'Örnek: 75x50, 100x70, 30x20'
    );
    return;
  }

  if (parsed.width < 10 || parsed.width > 500 || parsed.height < 10 || parsed.height > 500) {
    await sendTextMessage(from,
      'Boyut 10mm ile 500mm arasında olmalıdır. Lütfen tekrar girin.'
    );
    return;
  }

  conv.data.width = parsed.width;
  conv.data.height = parsed.height;
  await showQuantityOptions(from, conv);
}

async function showQuantityOptions(from, conv) {
  await sendButtonMessage(from,
    `Boyut: ${conv.data.width}x${conv.data.height} mm\n\nKaç adet sipariş vermek istersiniz?`,
    [
      { id: 'qty_100', title: '100 Adet' },
      { id: 'qty_500', title: '500 Adet' },
      { id: 'qty_custom', title: 'Farklı Adet' }
    ]
  );
  conv.state = STATES.SELECT_QUANTITY;
}

async function handleQuantitySelect(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'qty_100') {
    conv.data.quantity = 100;
  } else if (selection === 'qty_500') {
    conv.data.quantity = 500;
  } else if (selection === 'qty_custom') {
    await sendTextMessage(from, 'Kaç adet istediğinizi yazın (min: 50):');
    conv.state = STATES.ENTER_CUSTOM_QTY;
    return;
  } else {
    const qty = parseInt(selection);
    if (qty && qty >= 50) {
      conv.data.quantity = qty;
    } else {
      await sendTextMessage(from, 'Geçersiz adet. Minimum 50 adet sipariş verilir.');
      return;
    }
  }

  await showLaminationOptions(from, conv);
}

async function handleCustomQuantity(from, conv, msgContent) {
  const qty = parseInt(msgContent.text);

  if (!qty || qty < 50) {
    await sendTextMessage(from, 'Minimum sipariş adedi 50\'dir. Lütfen geçerli bir adet girin.');
    return;
  }

  if (qty > 1000000) {
    await sendTextMessage(from, 'Çok yüksek adet. Lütfen 1.000.000 ve altı girin veya toptan teklif için bizi arayın.');
    return;
  }

  conv.data.quantity = qty;
  await showLaminationOptions(from, conv);
}

async function showLaminationOptions(from, conv) {
  await sendButtonMessage(from,
    'Laminasyon ister misiniz?',
    [
      { id: 'lam_none', title: 'Laminasyonsuz' },
      { id: 'lam_glossy', title: 'Parlak Laminasyon' },
      { id: 'lam_matte', title: 'Mat Laminasyon' }
    ]
  );
  conv.state = STATES.SELECT_LAMINATION;
}

async function handleLamination(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  const laminationMap = {
    'lam_none': 'none',
    'lam_glossy': 'glossy',
    'lam_matte': 'matte'
  };

  conv.data.lamination = laminationMap[selection] || 'none';

  await sendTextMessage(from, 'Fiyat hesaplanıyor...');

  try {
    const priceResult = await calculatePrice({
      material: conv.data.material.code,
      width: conv.data.width,
      height: conv.data.height,
      quantity: conv.data.quantity,
      lamination: conv.data.lamination
    });

    conv.data.price = priceResult;

    const laminationText = {
      'none': 'Yok',
      'glossy': 'Parlak',
      'matte': 'Mat'
    };

    await sendTextMessage(from,
      `*SİPARİŞ ÖZETİ*\n\n` +
      `Malzeme: ${conv.data.material.name}\n` +
      `Boyut: ${conv.data.width}x${conv.data.height} mm\n` +
      `Adet: ${conv.data.quantity.toLocaleString('tr-TR')}\n` +
      `Laminasyon: ${laminationText[conv.data.lamination]}\n\n` +
      `*Birim Fiyat: ${priceResult.unitPrice} TL*\n` +
      `*Toplam: ${priceResult.totalPrice} TL* (KDV dahil)\n` +
      `Tahmini Teslimat: ${priceResult.deliveryDays} iş günü`
    );

    if (conv.data.isQuoteOnly) {
      await sendButtonMessage(from,
        'Bu fiyatla sipariş vermek ister misiniz?',
        [
          { id: 'confirm_order', title: 'Sipariş Ver' },
          { id: 'change_options', title: 'Değiştir' },
          { id: 'cancel', title: 'Kapat' }
        ]
      );
    } else {
      await sendButtonMessage(from,
        'Siparişi onaylıyor musunuz?',
        [
          { id: 'confirm_order', title: 'Onayla' },
          { id: 'change_options', title: 'Değiştir' },
          { id: 'cancel_order', title: 'İptal' }
        ]
      );
    }

    conv.state = STATES.SHOW_PRICE;
  } catch (error) {
    logger.error('Fiyat hesaplama hatası:', error);
    await sendTextMessage(from,
      'Fiyat hesaplanamadı. Lütfen tekrar deneyin veya bizi arayın.'
    );
  }
}

async function handlePriceResponse(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'confirm_order' || selection?.includes('onayla') || selection?.includes('evet')) {
    await sendTextMessage(from,
      'Harika! Hesabınızı oluşturmak için e-posta adresinizi girin:'
    );
    conv.state = STATES.ENTER_EMAIL;

  } else if (selection === 'change_options' || selection?.includes('değiştir')) {
    conv.data = {};
    await handleIdle(from, conv.name, conv, msgContent);

  } else if (selection === 'cancel_order' || selection === 'cancel' || selection?.includes('iptal')) {
    conversations.delete(from);
    conv._deleted = true;
    await sendTextMessage(from,
      'Sipariş iptal edildi. Tekrar görüşmek üzere!'
    );
  } else {
    await sendButtonMessage(from,
      'Anlayamadım. Lütfen bir seçenek belirleyin:',
      [
        { id: 'confirm_order', title: 'Onayla' },
        { id: 'change_options', title: 'Değiştir' },
        { id: 'cancel_order', title: 'İptal' }
      ]
    );
  }
}

async function handleEmail(from, conv, msgContent) {
  const email = msgContent.text?.trim();

  if (!validateEmail(email)) {
    await sendTextMessage(from,
      'Geçersiz e-posta adresi. Lütfen doğru formatta girin:\nÖrnek: info@firma.com'
    );
    return;
  }

  conv.data.email = email;
  await sendTextMessage(from,
    'Teslimat adresinizi girin:\n(İl, ilçe, açık adres)'
  );
  conv.state = STATES.ENTER_ADDRESS;
}

async function handleAddress(from, conv, msgContent) {
  const address = msgContent.text?.trim();

  if (!address || address.length < 10) {
    await sendTextMessage(from,
      'Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin.'
    );
    return;
  }

  conv.data.address = address;

  await sendButtonMessage(from,
    'Firma adı eklemek ister misiniz? (Fatura için)',
    [
      { id: 'add_company', title: 'Firma Adı Ekle' },
      { id: 'skip_company', title: 'Bireysel Devam' }
    ]
  );
  conv.state = STATES.ENTER_COMPANY;
}

async function handleCompany(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'add_company') {
    await sendTextMessage(from, 'Firma adınızı yazın:');
    conv.state = STATES.AWAITING_COMPANY_NAME;
    return;
  }

  if (selection === 'skip_company') {
    conv.data.company = '';
  } else {
    conv.data.company = selection;
  }

  await showOrderSummary(from, conv);
}

async function handleCompanyName(from, conv, msgContent) {
  const companyName = msgContent.text?.trim();

  if (!companyName || companyName.length < 2) {
    await sendTextMessage(from, 'Firma adı çok kısa. Lütfen geçerli bir firma adı girin.');
    return;
  }

  conv.data.company = companyName;
  await showOrderSummary(from, conv);
}

async function showOrderSummary(from, conv) {
  const laminationText = {
    'none': 'Yok', 'glossy': 'Parlak', 'matte': 'Mat'
  };

  await sendTextMessage(from,
    `*SON SİPARİŞ ÖZETİ*\n\n` +
    `${conv.data.material.name}\n` +
    `${conv.data.width}x${conv.data.height} mm\n` +
    `${conv.data.quantity.toLocaleString('tr-TR')} adet\n` +
    `Laminasyon: ${laminationText[conv.data.lamination]}\n` +
    `Toplam: ${conv.data.price.totalPrice} TL\n\n` +
    `${conv.data.email}\n` +
    `${conv.data.address}\n` +
    (conv.data.company ? `${conv.data.company}\n` : '') +
    `${from}`
  );

  await sendButtonMessage(from,
    'Her şey doğru mu? Siparişi oluşturayım mı?',
    [
      { id: 'final_confirm', title: 'Oluştur' },
      { id: 'final_cancel', title: 'İptal Et' }
    ]
  );

  conv.state = STATES.CONFIRM_ORDER;
}

async function handleOrderConfirm(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'final_cancel' || selection?.includes('iptal')) {
    conversations.delete(from);
    conv._deleted = true;
    await sendTextMessage(from, 'Sipariş iptal edildi. Tekrar bekleriz!');
    return;
  }

  if (selection !== 'final_confirm' && !selection?.includes('oluştur') && !selection?.includes('evet')) {
    await sendButtonMessage(from, 'Lütfen onaylayın veya iptal edin:', [
      { id: 'final_confirm', title: 'Oluştur' },
      { id: 'final_cancel', title: 'İptal Et' }
    ]);
    return;
  }

  await sendTextMessage(from, 'Hesabınız ve siparişiniz oluşturuluyor...');

  try {
    const customer = await createCustomer({
      email: conv.data.email,
      first_name: conv.name.split(' ')[0],
      last_name: conv.name.split(' ').slice(1).join(' ') || '',
      phone: from,
      address: conv.data.address,
      company: conv.data.company || ''
    });

    conv.data.customerId = customer.id;

    const order = await createOrder({
      customerId: customer.id,
      material: conv.data.material,
      width: conv.data.width,
      height: conv.data.height,
      quantity: conv.data.quantity,
      lamination: conv.data.lamination,
      totalPrice: conv.data.price.totalPrice,
      unitPrice: conv.data.price.unitPrice,
      phone: from
    });

    conv.data.orderId = order.id;
    conv.data.orderNumber = order.number;
    conv.data.paymentUrl = order.payment_url;

    await sendTextMessage(from,
      `*SİPARİŞİNİZ OLUŞTURULDU!*\n\n` +
      `Sipariş No: #${order.number}\n` +
      `Hesap: ${conv.data.email}\n\n` +
      `Siparişinizi takip etmek için:\nhttps://1etiket.com.tr/hesabim/`
    );

    await sendCTAButton(from,
      `Ödemenizi aşağıdaki linkten yapabilirsiniz:\n\n` +
      `Havale/EFT veya Kredi Kartı ile ödeyebilirsiniz.\n` +
      `Toplam: ${conv.data.price.totalPrice} TL`,
      'Ödeme Yap',
      order.payment_url
    );

    await sendTextMessage(from,
      `Son adım! Baskı dosyanızı gönderin:\n\n` +
      `Kabul edilen formatlar:\n` +
      `- PDF (tercih edilen)\n` +
      `- AI (Adobe Illustrator)\n` +
      `- PNG/JPEG (min 300 DPI)\n\n` +
      `Dosyayı bu sohbete sürükleyip bırakın.`
    );
    conv.state = STATES.AWAITING_FILE;

  } catch (error) {
    logger.error('Sipariş oluşturma hatası:', error);
    await sendTextMessage(from,
      'Sipariş oluşturulurken bir hata oluştu. ' +
      'Lütfen tekrar deneyin veya bizi arayın.'
    );
  }
}

async function handleFileUpload(from, conv, message) {
  if (message.type === 'document' || message.type === 'image') {
    const mediaId = message.document?.id || message.image?.id;
    const fileName = message.document?.filename || `baski_${conv.data.orderId}.jpg`;

    try {
      await sendTextMessage(from, 'Dosyanız alınıyor...');

      const media = await downloadMedia(mediaId);
      const savedPath = await saveFile(media.buffer, fileName, conv.data.orderId);

      await sendTextMessage(from,
        `Dosyanız başarıyla alındı!\n\n` +
        `Dosya: ${fileName}\n` +
        `Sipariş: #${conv.data.orderNumber}\n\n` +
        `Siparişiniz baskı kuyruğuna alındı. ` +
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
      'Lütfen baskı dosyanızı gönderin (PDF, PNG, JPEG veya AI).'
    );
  }
}

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

// ========== KONUŞMA TEMİZLEME ==========

const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 dakika

function cleanupStaleConversations() {
  const now = Date.now();
  for (const [phone, conv] of conversations) {
    if (now - conv.lastActivity > CONVERSATION_TIMEOUT_MS) {
      conversations.delete(phone);
      logger.info(`Zaman aşımı — konuşma temizlendi: ${phone}`);
    }
  }
}

// Her 10 dakikada bir eski konuşmaları temizle
const cleanupInterval = setInterval(cleanupStaleConversations, 10 * 60 * 1000);
cleanupInterval.unref(); // Test/process çıkışını bloklamasın

// Graceful shutdown için
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
  STATES,
  MATERIALS,
  conversations,
  cleanupStaleConversations,
  stopCleanup,
  CONVERSATION_TIMEOUT_MS
};
