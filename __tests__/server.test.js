/**
 * Server HTTP Endpoint Testleri — Genişletilmiş
 *
 * Express uygulaması, health endpoint, WhatsApp webhook routing,
 * ve WooCommerce webhook endpoint'ini test eder.
 */

// Tüm servisleri mockla
jest.mock('../services/whatsappService', () => ({
  verifyWebhook: jest.fn((req, res) => res.status(200).send('ok')),
  handleWebhook: jest.fn((req, res) => res.sendStatus(200)),
  sendTextMessage: jest.fn().mockResolvedValue({})
}));

jest.mock('../services/conversationManager', () => ({
  processMessage: jest.fn()
}));

const http = require('http');
const crypto = require('crypto');
const { sendTextMessage } = require('../services/whatsappService');

describe('Server', () => {
  let app, server;

  beforeAll((done) => {
    process.env.WEBHOOK_PATH = '/webhook/whatsapp';
    process.env.PORT = '0';
    process.env.WC_WEBHOOK_SECRET = 'test_wc_secret';
    app = require('../server');
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeRequest(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const options = {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  function signPayload(body, secret) {
    return crypto.createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('base64');
  }

  // ==========================================
  // HEALTH ENDPOINT
  // ==========================================

  describe('GET /health', () => {
    test('200 ve status ok döner', async () => {
      const res = await makeRequest('GET', '/health');

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================
  // WHATSAPP WEBHOOK
  // ==========================================

  describe('WhatsApp Webhook', () => {
    test('GET /webhook/whatsapp çalışır', async () => {
      const res = await makeRequest('GET', '/webhook/whatsapp');
      expect(res.statusCode).toBe(200);
    });

    test('POST /webhook/whatsapp çalışır', async () => {
      const res = await makeRequest('POST', '/webhook/whatsapp', {});
      expect(res.statusCode).toBe(200);
    });
  });

  // ==========================================
  // WOOCOMMERCE WEBHOOK
  // ==========================================

  describe('POST /webhook/woocommerce', () => {
    test('geçerli imza ile 200 döner', async () => {
      const body = {
        id: 100,
        number: '1001',
        status: 'processing',
        billing: { phone: '905551234567' },
        meta_data: [
          { key: 'whatsapp_number', value: '905551234567' },
          { key: 'order_source', value: 'whatsapp' }
        ]
      };

      const signature = signPayload(body, 'test_wc_secret');

      const res = await makeRequest('POST', '/webhook/woocommerce', body, {
        'x-wc-webhook-signature': signature
      });

      expect(res.statusCode).toBe(200);
    });

    test('geçersiz imza ile 401 döner', async () => {
      const body = { id: 100, status: 'processing' };

      const res = await makeRequest('POST', '/webhook/woocommerce', body, {
        'x-wc-webhook-signature': 'invalid_signature'
      });

      expect(res.statusCode).toBe(401);
    });

    test('processing durumu mesaj gönderir', async () => {
      const body = {
        id: 100,
        number: '1001',
        status: 'processing',
        billing: { phone: '905551234567' },
        meta_data: [
          { key: 'whatsapp_number', value: '905551234567' },
          { key: 'order_source', value: 'whatsapp' }
        ]
      };

      const signature = signPayload(body, 'test_wc_secret');

      await makeRequest('POST', '/webhook/woocommerce', body, {
        'x-wc-webhook-signature': signature
      });

      // Async işlem — küçük bir bekleme
      await new Promise(r => setTimeout(r, 100));

      expect(sendTextMessage).toHaveBeenCalledWith(
        '905551234567',
        expect.stringContaining('#1001')
      );
      expect(sendTextMessage).toHaveBeenCalledWith(
        '905551234567',
        expect.stringContaining('hazırlanmaya')
      );
    });

    test('completed durumu mesaj gönderir', async () => {
      const body = {
        id: 101,
        number: '1002',
        status: 'completed',
        billing: { phone: '905559876543' },
        meta_data: [
          { key: 'whatsapp_number', value: '905559876543' },
          { key: 'order_source', value: 'whatsapp' }
        ]
      };

      const signature = signPayload(body, 'test_wc_secret');

      await makeRequest('POST', '/webhook/woocommerce', body, {
        'x-wc-webhook-signature': signature
      });

      await new Promise(r => setTimeout(r, 100));

      expect(sendTextMessage).toHaveBeenCalledWith(
        '905559876543',
        expect.stringContaining('tamamlandı')
      );
    });

    test('WhatsApp kaynaklı olmayan sipariş yok sayılır', async () => {
      const body = {
        id: 102,
        number: '1003',
        status: 'processing',
        billing: { phone: '905551234567' },
        meta_data: [
          { key: 'order_source', value: 'website' }
        ]
      };

      const signature = signPayload(body, 'test_wc_secret');

      await makeRequest('POST', '/webhook/woocommerce', body, {
        'x-wc-webhook-signature': signature
      });

      await new Promise(r => setTimeout(r, 100));

      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    test('whatsapp_number meta_data varsa o kullanılır', async () => {
      const body = {
        id: 103,
        number: '1004',
        status: 'on-hold',
        billing: { phone: '905550000000' },
        meta_data: [
          { key: 'whatsapp_number', value: '905559999999' },
          { key: 'order_source', value: 'whatsapp' }
        ]
      };

      const signature = signPayload(body, 'test_wc_secret');

      await makeRequest('POST', '/webhook/woocommerce', body, {
        'x-wc-webhook-signature': signature
      });

      await new Promise(r => setTimeout(r, 100));

      // whatsapp_number meta_data'sındaki numara kullanılmalı
      expect(sendTextMessage).toHaveBeenCalledWith(
        '905559999999',
        expect.any(String)
      );
    });

    test('bilinmeyen durum mesaj göndermez', async () => {
      const body = {
        id: 104,
        number: '1005',
        status: 'trash',
        billing: { phone: '905551234567' },
        meta_data: [
          { key: 'whatsapp_number', value: '905551234567' },
          { key: 'order_source', value: 'whatsapp' }
        ]
      };

      const signature = signPayload(body, 'test_wc_secret');

      await makeRequest('POST', '/webhook/woocommerce', body, {
        'x-wc-webhook-signature': signature
      });

      await new Promise(r => setTimeout(r, 100));

      expect(sendTextMessage).not.toHaveBeenCalled();
    });
  });
});
