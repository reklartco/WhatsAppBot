/**
 * Server HTTP Endpoint Testleri
 *
 * Express uygulamasının doğru route'ları tanımladığını
 * ve health endpoint'inin çalıştığını test eder.
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

// supertest yok, basit HTTP test
const http = require('http');

describe('Server', () => {
  let app, server;

  beforeAll((done) => {
    process.env.WEBHOOK_PATH = '/webhook/whatsapp';
    process.env.PORT = '0'; // Rastgele port
    app = require('../server');
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  function makeRequest(method, path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on('error', reject);
      if (method === 'POST') req.write('{}');
      req.end();
    });
  }

  test('GET /health 200 ve status ok döner', async () => {
    const res = await makeRequest('GET', '/health');

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  test('GET /webhook/whatsapp webhook doğrulama endpoint çalışır', async () => {
    const res = await makeRequest('GET', '/webhook/whatsapp');
    expect(res.statusCode).toBe(200);
  });
});
