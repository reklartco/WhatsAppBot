/**
 * WhatsApp Service Testleri
 *
 * Bu testler verifyWebhook ve handleWebhook fonksiyonlarını
 * ve mesaj gönderme fonksiyonlarının doğru payload oluşturmasını test eder.
 */

// WhatsApp Service'i yüklemeden önce conversationManager'ı mockla
jest.mock('../services/conversationManager', () => ({
  processMessage: jest.fn().mockResolvedValue(undefined)
}));

// axios'u mockla
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn()
}));

const axios = require('axios');
const { processMessage } = require('../services/conversationManager');

// Environment değişkenlerini ayarla
process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
process.env.WHATSAPP_PHONE_ID = '123456';
process.env.WHATSAPP_TOKEN = 'test_token';

const {
  verifyWebhook,
  handleWebhook,
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendCTAButton,
  sendMessage
} = require('../services/whatsappService');

describe('verifyWebhook', () => {
  let req, res;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      sendStatus: jest.fn()
    };
  });

  test('doğru token ile 200 ve challenge döner', () => {
    req.query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test_verify_token',
      'hub.challenge': 'challenge_123'
    };

    verifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('challenge_123');
  });

  test('yanlış token ile 403 döner', () => {
    req.query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'challenge_123'
    };

    verifyWebhook(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });

  test('yanlış mode ile 403 döner', () => {
    req.query = {
      'hub.mode': 'unsubscribe',
      'hub.verify_token': 'test_verify_token',
      'hub.challenge': 'challenge_123'
    };

    verifyWebhook(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });

  test('eksik parametreler ile 403 döner', () => {
    req.query = {};

    verifyWebhook(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });
});

describe('handleWebhook', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = { sendStatus: jest.fn() };
  });

  test('her zaman 200 döner', async () => {
    req = { body: {} };
    await handleWebhook(req, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test('whatsapp_business_account olmayan body yok sayılır', async () => {
    req = { body: { object: 'other' } };
    await handleWebhook(req, res);
    expect(processMessage).not.toHaveBeenCalled();
  });

  test('gelen metin mesajını processMessage\'a iletir', async () => {
    req = {
      body: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '905551234567',
                type: 'text',
                text: { body: 'Merhaba' }
              }],
              contacts: [{
                profile: { name: 'Test Müşteri' }
              }]
            }
          }]
        }]
      }
    };

    await handleWebhook(req, res);

    expect(processMessage).toHaveBeenCalledWith(
      '905551234567',
      'Test Müşteri',
      expect.objectContaining({ type: 'text' })
    );
  });

  test('durum güncellemesi mesajı processMessage çağırmaz', async () => {
    req = {
      body: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              statuses: [{
                id: 'msg123',
                status: 'delivered'
              }]
            }
          }]
        }]
      }
    };

    await handleWebhook(req, res);
    expect(processMessage).not.toHaveBeenCalled();
  });

  test('contact profil adı yoksa "Müşteri" kullanılır', async () => {
    req = {
      body: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '905551234567',
                type: 'text',
                text: { body: 'Test' }
              }],
              contacts: [{}]
            }
          }]
        }]
      }
    };

    await handleWebhook(req, res);

    expect(processMessage).toHaveBeenCalledWith(
      '905551234567',
      'Müşteri',
      expect.anything()
    );
  });
});

describe('sendMessage fonksiyonları', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({
      data: { messages: [{ id: 'msg_123' }] }
    });
  });

  test('sendTextMessage doğru payload gönderir', async () => {
    await sendTextMessage('905551234567', 'Test mesajı');

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        messaging_product: 'whatsapp',
        to: '905551234567',
        type: 'text',
        text: { body: 'Test mesajı' }
      }),
      expect.any(Object)
    );
  });

  test('sendButtonMessage butonları doğru formatta gönderir', async () => {
    await sendButtonMessage('905551234567', 'Seçin:', [
      { id: 'btn1', title: 'Buton 1' },
      { id: 'btn2', title: 'Buton 2' }
    ]);

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'interactive',
        interactive: expect.objectContaining({
          type: 'button',
          body: { text: 'Seçin:' }
        })
      }),
      expect.any(Object)
    );
  });

  test('sendButtonMessage 20 karakterden uzun başlıkları kırpar', async () => {
    await sendButtonMessage('905551234567', 'Test', [
      { id: 'btn1', title: 'Bu çok uzun bir buton başlığıdır' }
    ]);

    const payload = axios.post.mock.calls[0][1];
    const buttonTitle = payload.interactive.action.buttons[0].reply.title;
    expect(buttonTitle.length).toBeLessThanOrEqual(20);
  });

  test('sendListMessage doğru yapıda gönderir', async () => {
    await sendListMessage('905551234567', 'Seçin:', 'Malzeme Seç', [{
      title: 'Malzemeler',
      rows: [{ id: 'kuse', title: 'Kuşe' }]
    }]);

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'interactive',
        interactive: expect.objectContaining({
          type: 'list'
        })
      }),
      expect.any(Object)
    );
  });

  test('sendCTAButton URL ile doğru formatta gönderir', async () => {
    await sendCTAButton('905551234567', 'Ödeme yapın', 'Ödeme', 'https://example.com/pay');

    const payload = axios.post.mock.calls[0][1];
    expect(payload.interactive.action.parameters.url).toBe('https://example.com/pay');
  });

  test('sendMessage API hatası fırlattığında hata yükseltilir', async () => {
    axios.post.mockRejectedValue({
      response: { data: { error: 'Invalid token' } },
      message: 'Request failed'
    });

    await expect(sendMessage('905551234567', { type: 'text', text: { body: 'test' } }))
      .rejects.toBeDefined();
  });
});
