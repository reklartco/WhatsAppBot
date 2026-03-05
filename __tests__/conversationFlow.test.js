/**
 * Konuşma Akışı Entegrasyon Testleri — Genişletilmiş
 *
 * Tüm state machine geçişlerini ve her handler'ın davranışını test eder.
 * Satır 335-623 arası dahil: handleLamination, handlePriceResponse,
 * handleEmail, handleAddress, handleCompany, handleCompanyName,
 * handleOrderConfirm, handleFileUpload
 */

// Dış bağımlılıkları mockla
jest.mock('../services/whatsappService', () => ({
  sendTextMessage: jest.fn().mockResolvedValue({}),
  sendButtonMessage: jest.fn().mockResolvedValue({}),
  sendListMessage: jest.fn().mockResolvedValue({}),
  sendCTAButton: jest.fn().mockResolvedValue({}),
  downloadMedia: jest.fn().mockResolvedValue({
    buffer: Buffer.from('test'),
    mimeType: 'application/pdf',
    fileSize: 1024
  })
}));

jest.mock('../services/priceCalculator', () => ({
  calculatePrice: jest.fn().mockResolvedValue({
    unitPrice: '0.1250',
    totalPrice: '62.50',
    deliveryDays: '3-5',
    discount: 0
  })
}));

jest.mock('../services/woocommerceService', () => ({
  createCustomer: jest.fn().mockResolvedValue({ id: 1, email: 'test@test.com' }),
  createOrder: jest.fn().mockResolvedValue({
    id: 100,
    number: '1001',
    status: 'pending',
    total: '62.50',
    payment_url: 'https://example.com/pay/100'
  }),
  getOrderStatus: jest.fn().mockResolvedValue({
    status: 'processing',
    total: '62.50',
    date: '03.03.2026',
    tracking: null
  })
}));

jest.mock('../services/fileService', () => ({
  saveFile: jest.fn().mockResolvedValue('/uploads/test/file.pdf')
}));

const {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendCTAButton,
  downloadMedia
} = require('../services/whatsappService');
const { calculatePrice } = require('../services/priceCalculator');
const { createCustomer, createOrder, getOrderStatus } = require('../services/woocommerceService');
const { saveFile } = require('../services/fileService');

const {
  processMessage,
  conversations,
  STATES,
  cleanupStaleConversations,
  stopCleanup,
  CONVERSATION_TIMEOUT_MS
} = require('../services/conversationManager');

const PHONE = '905551234567';
const NAME = 'Test Müşteri';

// Yardımcı: Metin mesajı oluştur
function textMsg(body) {
  return { type: 'text', text: { body } };
}

// Yardımcı: Buton yanıtı oluştur
function buttonMsg(id, title) {
  return {
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: { id, title }
    }
  };
}

// Yardımcı: Liste yanıtı oluştur
function listMsg(id, title) {
  return {
    type: 'interactive',
    interactive: {
      type: 'list_reply',
      list_reply: { id, title }
    }
  };
}

// Konuşmayı belirli bir duruma hızlıca getirmek için
async function advanceToLamination() {
  await processMessage(PHONE, NAME, textMsg('Merhaba'));
  await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));
  await processMessage(PHONE, NAME, listMsg('kuse', 'Kuşe Etiket'));
  await processMessage(PHONE, NAME, buttonMsg('size_50x50', '50x50 mm'));
  await processMessage(PHONE, NAME, buttonMsg('qty_500', '500 Adet'));
}

async function advanceToShowPrice() {
  await advanceToLamination();
  await processMessage(PHONE, NAME, buttonMsg('lam_glossy', 'Parlak Laminasyon'));
}

async function advanceToEmail() {
  await advanceToShowPrice();
  await processMessage(PHONE, NAME, buttonMsg('confirm_order', 'Onayla'));
}

async function advanceToAddress() {
  await advanceToEmail();
  await processMessage(PHONE, NAME, textMsg('test@firma.com'));
}

async function advanceToCompany() {
  await advanceToAddress();
  await processMessage(PHONE, NAME, textMsg('Atatürk Cad. No:15, Kadıköy, İstanbul'));
}

async function advanceToConfirmOrder() {
  await advanceToCompany();
  await processMessage(PHONE, NAME, buttonMsg('skip_company', 'Bireysel Devam'));
}

describe('Konuşma Akışı — State Machine Geçişleri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    conversations.clear();
    // setInterval temizleme
    stopCleanup();
  });

  // ==========================================
  // MEVCUT TESTLER (IDLE → QUANTITY arası)
  // ==========================================

  describe('IDLE → MAIN_MENU', () => {
    test('ilk mesajda karşılama ve ana menü gösterilir', async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Merhaba Test')
      );
      expect(sendButtonMessage).toHaveBeenCalledWith(
        PHONE,
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ id: 'new_order' }),
          expect.objectContaining({ id: 'price_inquiry' }),
          expect.objectContaining({ id: 'track_order' })
        ])
      );

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.MAIN_MENU);
    });
  });

  describe('MAIN_MENU → SELECT_MATERIAL', () => {
    beforeEach(async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      jest.clearAllMocks();
    });

    test('"new_order" butonu malzeme listesini gösterir', async () => {
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));

      expect(sendListMessage).toHaveBeenCalled();
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_MATERIAL);
      expect(conv.data.isQuoteOnly).toBe(false);
    });

    test('"price_inquiry" butonu isQuoteOnly=true ile malzeme listesi gösterir', async () => {
      await processMessage(PHONE, NAME, buttonMsg('price_inquiry', 'Fiyat Öğren'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_MATERIAL);
      expect(conv.data.isQuoteOnly).toBe(true);
    });

    test('"track_order" butonu sipariş takip moduna geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('track_order', 'Sipariş Takip'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('sipariş numaranızı')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ORDER_TRACKING);
    });

    test('tanınmayan mesaj ana menüyü tekrar gösterir', async () => {
      await processMessage(PHONE, NAME, textMsg('asdfgh'));

      expect(sendButtonMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Anlayamadım'),
        expect.any(Array)
      );
    });

    test('"sipariş" içeren metin mesajı da malzeme listesine yönlendirir', async () => {
      await processMessage(PHONE, NAME, textMsg('sipariş vermek istiyorum'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_MATERIAL);
    });
  });

  describe('SELECT_MATERIAL → SELECT_SIZE', () => {
    beforeEach(async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));
      jest.clearAllMocks();
    });

    test('geçerli malzeme seçimi boyut seçimine geçer', async () => {
      await processMessage(PHONE, NAME, listMsg('kuse', 'Kuşe Etiket'));

      expect(sendButtonMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Kuşe Etiket'),
        expect.arrayContaining([
          expect.objectContaining({ id: 'size_50x50' }),
          expect.objectContaining({ id: 'size_custom' })
        ])
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_SIZE);
      expect(conv.data.material.code).toBe('kuse');
    });

    test('geçersiz malzeme seçimi hata mesajı gösterir', async () => {
      await processMessage(PHONE, NAME, textMsg('bilinmeyen'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Geçersiz')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_MATERIAL);
    });
  });

  describe('SELECT_SIZE → SELECT_QUANTITY', () => {
    beforeEach(async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));
      await processMessage(PHONE, NAME, listMsg('kuse', 'Kuşe Etiket'));
      jest.clearAllMocks();
    });

    test('50x50 butonu adet seçimine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('size_50x50', '50x50 mm'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_QUANTITY);
      expect(conv.data.width).toBe(50);
      expect(conv.data.height).toBe(50);
    });

    test('100x50 butonu adet seçimine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('size_100x50', '100x50 mm'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_QUANTITY);
      expect(conv.data.width).toBe(100);
      expect(conv.data.height).toBe(50);
    });

    test('özel boyut seçeneği özel boyut girişine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('size_custom', 'Özel Boyut'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_CUSTOM_SIZE);
    });

    test('doğrudan "75x50" yazmak da çalışır', async () => {
      await processMessage(PHONE, NAME, textMsg('75x50'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_QUANTITY);
      expect(conv.data.width).toBe(75);
      expect(conv.data.height).toBe(50);
    });

    test('geçersiz boyut girişi hata mesajı gösterir', async () => {
      await processMessage(PHONE, NAME, textMsg('abc'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Geçersiz boyut')
      );
    });
  });

  describe('ENTER_CUSTOM_SIZE', () => {
    beforeEach(async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));
      await processMessage(PHONE, NAME, listMsg('kuse', 'Kuşe Etiket'));
      await processMessage(PHONE, NAME, buttonMsg('size_custom', 'Özel Boyut'));
      jest.clearAllMocks();
    });

    test('geçerli özel boyut adet seçimine geçer', async () => {
      await processMessage(PHONE, NAME, textMsg('75x50'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_QUANTITY);
      expect(conv.data.width).toBe(75);
      expect(conv.data.height).toBe(50);
    });

    test('sınır dışı boyut reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('5x5'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('10mm ile 500mm')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_CUSTOM_SIZE);
    });

    test('geçersiz format reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('büyük'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Geçersiz format')
      );
    });
  });

  describe('SELECT_QUANTITY → SELECT_LAMINATION', () => {
    beforeEach(async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));
      await processMessage(PHONE, NAME, listMsg('kuse', 'Kuşe Etiket'));
      await processMessage(PHONE, NAME, buttonMsg('size_50x50', '50x50 mm'));
      jest.clearAllMocks();
    });

    test('100 adet butonu laminasyon seçimine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('qty_100', '100 Adet'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_LAMINATION);
      expect(conv.data.quantity).toBe(100);
    });

    test('500 adet butonu laminasyon seçimine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('qty_500', '500 Adet'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_LAMINATION);
      expect(conv.data.quantity).toBe(500);
    });

    test('özel adet seçeneği özel adet girişine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('qty_custom', 'Farklı Adet'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_CUSTOM_QTY);
    });

    test('doğrudan geçerli adet yazılabilir', async () => {
      await processMessage(PHONE, NAME, textMsg('200'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_LAMINATION);
      expect(conv.data.quantity).toBe(200);
    });

    test('minimum altı adet reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('10'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Minimum 50')
      );
    });
  });

  describe('ENTER_CUSTOM_QTY', () => {
    beforeEach(async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));
      await processMessage(PHONE, NAME, listMsg('kuse', 'Kuşe Etiket'));
      await processMessage(PHONE, NAME, buttonMsg('size_50x50', '50x50 mm'));
      await processMessage(PHONE, NAME, buttonMsg('qty_custom', 'Farklı Adet'));
      jest.clearAllMocks();
    });

    test('geçerli özel adet laminasyona geçer', async () => {
      await processMessage(PHONE, NAME, textMsg('750'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SELECT_LAMINATION);
      expect(conv.data.quantity).toBe(750);
    });

    test('50 altı reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('25'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Minimum')
      );
    });

    test('1.000.000 üstü reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('2000000'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Çok yüksek')
      );
    });
  });

  // ==========================================
  // YENİ TESTLER: SELECT_LAMINATION → SHOW_PRICE
  // ==========================================

  describe('SELECT_LAMINATION → SHOW_PRICE (handleLamination)', () => {
    beforeEach(async () => {
      await advanceToLamination();
      jest.clearAllMocks();
    });

    test('parlak laminasyon seçimi fiyat hesaplatır ve SHOW_PRICE durumuna geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('lam_glossy', 'Parlak'));

      expect(calculatePrice).toHaveBeenCalledWith(expect.objectContaining({
        material: 'kuse',
        width: 50,
        height: 50,
        quantity: 500,
        lamination: 'glossy'
      }));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('SİPARİŞ ÖZETİ')
      );
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('62.50 TL')
      );

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.SHOW_PRICE);
      expect(conv.data.lamination).toBe('glossy');
      expect(conv.data.price.totalPrice).toBe('62.50');
    });

    test('mat laminasyon seçimi doğru çalışır', async () => {
      await processMessage(PHONE, NAME, buttonMsg('lam_matte', 'Mat'));

      const conv = conversations.get(PHONE);
      expect(conv.data.lamination).toBe('matte');
      expect(conv.state).toBe(STATES.SHOW_PRICE);
    });

    test('laminasyonsuz seçim doğru çalışır', async () => {
      await processMessage(PHONE, NAME, buttonMsg('lam_none', 'Laminasyonsuz'));

      const conv = conversations.get(PHONE);
      expect(conv.data.lamination).toBe('none');
    });

    test('tanınmayan laminasyon seçimi varsayılan "none" olarak işlenir', async () => {
      await processMessage(PHONE, NAME, textMsg('birşey'));

      const conv = conversations.get(PHONE);
      expect(conv.data.lamination).toBe('none');
    });

    test('isQuoteOnly ise "Bu fiyatla sipariş vermek ister misiniz?" mesajı gösterilir', async () => {
      // isQuoteOnly true olacak şekilde tekrar kur
      conversations.clear();
      jest.clearAllMocks();
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('price_inquiry', 'Fiyat Öğren'));
      await processMessage(PHONE, NAME, listMsg('kuse', 'Kuşe'));
      await processMessage(PHONE, NAME, buttonMsg('size_50x50', '50x50'));
      await processMessage(PHONE, NAME, buttonMsg('qty_500', '500'));
      jest.clearAllMocks();

      await processMessage(PHONE, NAME, buttonMsg('lam_none', 'Yok'));

      expect(sendButtonMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Bu fiyatla sipariş'),
        expect.arrayContaining([
          expect.objectContaining({ id: 'confirm_order' })
        ])
      );
    });

    test('fiyat hesaplama hatası mesaj gösterir', async () => {
      calculatePrice.mockRejectedValueOnce(new Error('API down'));

      await processMessage(PHONE, NAME, buttonMsg('lam_none', 'Yok'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Fiyat hesaplanamadı')
      );
    });
  });

  // ==========================================
  // SHOW_PRICE → ENTER_EMAIL (handlePriceResponse)
  // ==========================================

  describe('SHOW_PRICE → ENTER_EMAIL (handlePriceResponse)', () => {
    beforeEach(async () => {
      await advanceToShowPrice();
      jest.clearAllMocks();
    });

    test('onaylama e-posta girişine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('confirm_order', 'Onayla'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('e-posta')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_EMAIL);
    });

    test('"evet" metni de onaylama olarak kabul edilir', async () => {
      await processMessage(PHONE, NAME, textMsg('evet'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_EMAIL);
    });

    test('"değiştir" seçeneği başa döner', async () => {
      await processMessage(PHONE, NAME, buttonMsg('change_options', 'Değiştir'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.MAIN_MENU);
      expect(conv.data.material).toBeUndefined(); // data sıfırlandı
    });

    test('iptal seçeneği konuşmayı siler', async () => {
      await processMessage(PHONE, NAME, buttonMsg('cancel_order', 'İptal'));

      expect(conversations.has(PHONE)).toBe(false);
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('iptal edildi')
      );
    });
  });

  // ==========================================
  // ENTER_EMAIL → ENTER_ADDRESS (handleEmail)
  // ==========================================

  describe('ENTER_EMAIL → ENTER_ADDRESS (handleEmail)', () => {
    beforeEach(async () => {
      await advanceToEmail();
      jest.clearAllMocks();
    });

    test('geçerli e-posta adres girişine geçer', async () => {
      await processMessage(PHONE, NAME, textMsg('ali@firma.com'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_ADDRESS);
      expect(conv.data.email).toBe('ali@firma.com');
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('adresinizi girin')
      );
    });

    test('geçersiz e-posta reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('gecersiz'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Geçersiz e-posta')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_EMAIL);
    });

    test('@ işareti olmayan e-posta reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('ali.firma.com'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_EMAIL);
    });
  });

  // ==========================================
  // ENTER_ADDRESS → ENTER_COMPANY (handleAddress)
  // ==========================================

  describe('ENTER_ADDRESS → ENTER_COMPANY (handleAddress)', () => {
    beforeEach(async () => {
      await advanceToAddress();
      jest.clearAllMocks();
    });

    test('geçerli adres firma seçimine geçer', async () => {
      await processMessage(PHONE, NAME, textMsg('Atatürk Cad. No:15, Kadıköy, İstanbul'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_COMPANY);
      expect(conv.data.address).toBe('Atatürk Cad. No:15, Kadıköy, İstanbul');
      expect(sendButtonMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Firma'),
        expect.any(Array)
      );
    });

    test('çok kısa adres reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('kısa'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Adres çok kısa')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_ADDRESS);
    });

    test('boş adres reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg(''));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.ENTER_ADDRESS);
    });
  });

  // ==========================================
  // ENTER_COMPANY → CONFIRM_ORDER (handleCompany + handleCompanyName)
  // ==========================================

  describe('ENTER_COMPANY → CONFIRM_ORDER (handleCompany)', () => {
    beforeEach(async () => {
      await advanceToCompany();
      jest.clearAllMocks();
    });

    test('"skip_company" bireysel devam ile sipariş özetine geçer', async () => {
      await processMessage(PHONE, NAME, buttonMsg('skip_company', 'Bireysel'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.CONFIRM_ORDER);
      expect(conv.data.company).toBe('');
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('SON SİPARİŞ ÖZETİ')
      );
    });

    test('"add_company" firma adı girişine yönlendirir', async () => {
      await processMessage(PHONE, NAME, buttonMsg('add_company', 'Firma Adı Ekle'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.AWAITING_COMPANY_NAME);
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Firma adınızı')
      );
    });

    test('doğrudan firma adı yazmak da çalışır', async () => {
      await processMessage(PHONE, NAME, textMsg('ABC Teknoloji Ltd. Şti.'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.CONFIRM_ORDER);
      expect(conv.data.company).toBe('ABC Teknoloji Ltd. Şti.');
    });
  });

  describe('AWAITING_COMPANY_NAME', () => {
    beforeEach(async () => {
      await advanceToCompany();
      await processMessage(PHONE, NAME, buttonMsg('add_company', 'Firma Adı Ekle'));
      jest.clearAllMocks();
    });

    test('geçerli firma adı sipariş özetine geçer', async () => {
      await processMessage(PHONE, NAME, textMsg('Test Şirketi A.Ş.'));

      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.CONFIRM_ORDER);
      expect(conv.data.company).toBe('Test Şirketi A.Ş.');
    });

    test('çok kısa firma adı reddedilir', async () => {
      await processMessage(PHONE, NAME, textMsg('A'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('çok kısa')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.AWAITING_COMPANY_NAME);
    });
  });

  // ==========================================
  // CONFIRM_ORDER → AWAITING_FILE (handleOrderConfirm)
  // ==========================================

  describe('CONFIRM_ORDER (handleOrderConfirm)', () => {
    beforeEach(async () => {
      await advanceToConfirmOrder();
      jest.clearAllMocks();
    });

    test('final_confirm ile sipariş oluşturulur', async () => {
      await processMessage(PHONE, NAME, buttonMsg('final_confirm', 'Oluştur'));

      expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@firma.com',
        first_name: 'Test',
        last_name: 'Müşteri',
        phone: PHONE
      }));

      expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({
        customerId: 1,
        material: expect.objectContaining({ code: 'kuse' }),
        width: 50,
        height: 50,
        quantity: 500,
        lamination: 'glossy',
        totalPrice: '62.50'
      }));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('SİPARİŞİNİZ OLUŞTURULDU')
      );
      expect(sendCTAButton).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Ödeme'),
        'Ödeme Yap',
        'https://example.com/pay/100'
      );
    });

    test('"evet" metni de onay olarak kabul edilir', async () => {
      await processMessage(PHONE, NAME, textMsg('evet oluştur'));

      expect(createCustomer).toHaveBeenCalled();
      expect(createOrder).toHaveBeenCalled();
    });

    test('final_cancel konuşmayı siler', async () => {
      await processMessage(PHONE, NAME, buttonMsg('final_cancel', 'İptal Et'));

      expect(conversations.has(PHONE)).toBe(false);
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('iptal edildi')
      );
    });

    test('tanınmayan mesaj tekrar onay/iptal seçenekleri gösterir', async () => {
      await processMessage(PHONE, NAME, textMsg('bilmiyorum'));

      expect(sendButtonMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('onaylayın veya iptal'),
        expect.any(Array)
      );
    });

    test('sipariş oluşturma hatası hata mesajı gösterir', async () => {
      createCustomer.mockRejectedValueOnce(new Error('WooCommerce API error'));

      await processMessage(PHONE, NAME, buttonMsg('final_confirm', 'Oluştur'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('hata oluştu')
      );
    });
  });

  // ==========================================
  // AWAITING_FILE (handleFileUpload)
  // ==========================================

  describe('AWAITING_FILE (handleFileUpload)', () => {
    beforeEach(async () => {
      // Konuşmayı doğrudan AWAITING_FILE durumuna getir
      conversations.set(PHONE, {
        state: STATES.AWAITING_FILE,
        name: NAME,
        data: {
          orderId: 100,
          orderNumber: '1001'
        },
        lastActivity: Date.now()
      });
      jest.clearAllMocks();
    });

    test('doküman dosyası başarıyla işlenir', async () => {
      const docMessage = {
        type: 'document',
        document: { id: 'media_123', filename: 'etiket.pdf' }
      };

      await processMessage(PHONE, NAME, docMessage);

      expect(downloadMedia).toHaveBeenCalledWith('media_123');
      expect(saveFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'etiket.pdf',
        100
      );
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('başarıyla alındı')
      );
      const conv = conversations.get(PHONE);
      expect(conv.state).toBe(STATES.IDLE);
    });

    test('resim dosyası başarıyla işlenir', async () => {
      const imgMessage = {
        type: 'image',
        image: { id: 'media_456' }
      };

      await processMessage(PHONE, NAME, imgMessage);

      expect(downloadMedia).toHaveBeenCalledWith('media_456');
      expect(saveFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('baski_100'),
        100
      );
    });

    test('dosya indirme hatası hata mesajı gösterir', async () => {
      downloadMedia.mockRejectedValueOnce(new Error('Download failed'));

      const docMessage = {
        type: 'document',
        document: { id: 'media_err', filename: 'test.pdf' }
      };

      await processMessage(PHONE, NAME, docMessage);

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Dosya alınamadı')
      );
    });

    test('desteklenmeyen mesaj tipi dosya gönderme hatırlatması gösterir', async () => {
      await processMessage(PHONE, NAME, textMsg('merhaba'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('baskı dosyanızı gönderin')
      );
    });
  });

  // ==========================================
  // İPTAL VE ÖZEL DURUMLAR
  // ==========================================

  describe('İptal komutu', () => {
    test('"iptal" her durumda konuşmayı sıfırlar', async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));

      jest.clearAllMocks();
      await processMessage(PHONE, NAME, textMsg('iptal'));

      expect(conversations.has(PHONE)).toBe(false);
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('iptal edildi')
      );
    });

    test('"vazgeç" de çalışır', async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, textMsg('vazgeç'));

      expect(conversations.has(PHONE)).toBe(false);
    });

    test('"cancel" de çalışır', async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, textMsg('cancel'));

      expect(conversations.has(PHONE)).toBe(false);
    });

    test('"sıfırla" da çalışır', async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, textMsg('sıfırla'));

      expect(conversations.has(PHONE)).toBe(false);
    });
  });

  describe('Sipariş Takip', () => {
    beforeEach(async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('track_order', 'Sipariş Takip'));
      jest.clearAllMocks();
    });

    test('geçerli sipariş numarası sipariş durumunu gösterir', async () => {
      await processMessage(PHONE, NAME, textMsg('1001'));

      expect(getOrderStatus).toHaveBeenCalledWith('1001');
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('#1001')
      );
    });

    test('geçersiz sipariş numarası hata gösterir', async () => {
      await processMessage(PHONE, NAME, textMsg('abc'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('Geçersiz sipariş')
      );
    });

    test('bulunamayan sipariş hata mesajı gösterir', async () => {
      getOrderStatus.mockRejectedValueOnce(new Error('Sipariş bulunamadı'));

      await processMessage(PHONE, NAME, textMsg('9999'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('bulunamadı')
      );
    });

    test('kargo takip numaralı sipariş takip bilgisi gösterir', async () => {
      getOrderStatus.mockResolvedValueOnce({
        status: 'completed',
        total: '100.00',
        date: '01.03.2026',
        tracking: 'TR123456789'
      });

      await processMessage(PHONE, NAME, textMsg('2001'));

      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('TR123456789')
      );
    });
  });

  describe('Eşzamanlı konuşmalar', () => {
    test('iki farklı müşteri bağımsız konuşmalara sahip olur', async () => {
      const PHONE_A = '905551111111';
      const PHONE_B = '905552222222';

      await processMessage(PHONE_A, 'Ali', textMsg('Merhaba'));
      await processMessage(PHONE_B, 'Veli', textMsg('Merhaba'));

      await processMessage(PHONE_A, 'Ali', buttonMsg('new_order', 'Sipariş Ver'));
      await processMessage(PHONE_B, 'Veli', buttonMsg('track_order', 'Sipariş Takip'));

      const convA = conversations.get(PHONE_A);
      const convB = conversations.get(PHONE_B);

      expect(convA.state).toBe(STATES.SELECT_MATERIAL);
      expect(convB.state).toBe(STATES.ORDER_TRACKING);
      expect(convA.name).toBe('Ali');
      expect(convB.name).toBe('Veli');
    });
  });

  // ==========================================
  // KONUŞMA TEMİZLEME MEKANİZMASI (BUG-003)
  // ==========================================

  describe('Konuşma temizleme mekanizması', () => {
    test('zaman aşımına uğrayan konuşmalar temizlenir', () => {
      conversations.set('905551111111', {
        state: STATES.SELECT_MATERIAL,
        name: 'Eski',
        data: {},
        lastActivity: Date.now() - CONVERSATION_TIMEOUT_MS - 1000 // 30dk + 1sn önce
      });
      conversations.set('905552222222', {
        state: STATES.ENTER_EMAIL,
        name: 'Aktif',
        data: {},
        lastActivity: Date.now() // şu an aktif
      });

      cleanupStaleConversations();

      expect(conversations.has('905551111111')).toBe(false);
      expect(conversations.has('905552222222')).toBe(true);
    });

    test('tüm zaman aşımına uğramış konuşmalar temizlenir', () => {
      const oldTime = Date.now() - CONVERSATION_TIMEOUT_MS - 5000;
      conversations.set('905551111111', { state: STATES.IDLE, name: 'A', data: {}, lastActivity: oldTime });
      conversations.set('905552222222', { state: STATES.IDLE, name: 'B', data: {}, lastActivity: oldTime });
      conversations.set('905553333333', { state: STATES.IDLE, name: 'C', data: {}, lastActivity: oldTime });

      cleanupStaleConversations();

      expect(conversations.size).toBe(0);
    });

    test('aktif konuşmalar temizlenmez', () => {
      conversations.set('905551111111', {
        state: STATES.MAIN_MENU,
        name: 'Aktif',
        data: {},
        lastActivity: Date.now()
      });

      cleanupStaleConversations();

      expect(conversations.has('905551111111')).toBe(true);
    });
  });

  // ==========================================
  // HATA YAKALAMA
  // ==========================================

  describe('Genel hata yakalama', () => {
    test('beklenmeyen hata kullanıcıya mesaj gösterir', async () => {
      // sendTextMessage'ı ilk çağrıda hata fırlat
      sendTextMessage.mockRejectedValueOnce(new Error('unexpected'));

      await processMessage(PHONE, NAME, textMsg('Merhaba'));

      // Hata sonrası kullanıcıya bilgi mesajı gönderilir
      expect(sendTextMessage).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining('hata oluştu')
      );
    });
  });
});
