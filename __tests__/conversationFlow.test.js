/**
 * Konuşma Akışı Entegrasyon Testleri
 *
 * State machine geçişlerini ve her handler'ın davranışını test eder.
 * Tüm dış bağımlılıklar (WhatsApp API, WooCommerce, PriceCalculator) mocklanır.
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
  sendListMessage
} = require('../services/whatsappService');
const { calculatePrice } = require('../services/priceCalculator');
const { createCustomer, createOrder, getOrderStatus } = require('../services/woocommerceService');

const {
  processMessage,
  conversations,
  STATES
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

describe('Konuşma Akışı — State Machine Geçişleri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    conversations.clear();
  });

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

  describe('İptal komutu', () => {
    test('"iptal" her durumda konuşmayı sıfırlar', async () => {
      await processMessage(PHONE, NAME, textMsg('Merhaba'));
      await processMessage(PHONE, NAME, buttonMsg('new_order', 'Sipariş Ver'));

      const convBefore = conversations.get(PHONE);
      expect(convBefore).toBeDefined();

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
  });

  describe('Eşzamanlı konuşmalar', () => {
    test('iki farklı müşteri bağımsız konuşmalara sahip olur', async () => {
      const PHONE_A = '905551111111';
      const PHONE_B = '905552222222';

      // A başlasın
      await processMessage(PHONE_A, 'Ali', textMsg('Merhaba'));
      // B başlasın
      await processMessage(PHONE_B, 'Veli', textMsg('Merhaba'));

      // A sipariş seçsin
      await processMessage(PHONE_A, 'Ali', buttonMsg('new_order', 'Sipariş Ver'));
      // B takip seçsin
      await processMessage(PHONE_B, 'Veli', buttonMsg('track_order', 'Sipariş Takip'));

      const convA = conversations.get(PHONE_A);
      const convB = conversations.get(PHONE_B);

      expect(convA.state).toBe(STATES.SELECT_MATERIAL);
      expect(convB.state).toBe(STATES.ORDER_TRACKING);
      expect(convA.name).toBe('Ali');
      expect(convB.name).toBe('Veli');
    });
  });
});
