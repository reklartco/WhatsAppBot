/**
 * PriceCalculator Testleri — calculatePrice API fonksiyonu dahil
 */

jest.mock('axios');
const axios = require('axios');
const { calculatePrice, calculatePriceLocal } = require('../services/priceCalculator');

describe('calculatePrice (API çağrısı)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PRICE_API_URL = 'https://api.example.com/price';
    process.env.PRICE_API_KEY = 'test-key';
  });

  test('başarılı API yanıtında doğru formatta sonuç döner', async () => {
    axios.post.mockResolvedValue({
      data: {
        unit_price: '0.1500',
        total_price: '75.00',
        delivery_days: '3-5',
        discount: 10
      }
    });

    const result = await calculatePrice({
      material: 'kuse',
      width: 50,
      height: 50,
      quantity: 500,
      lamination: 'none'
    });

    expect(result.unitPrice).toBe('0.1500');
    expect(result.totalPrice).toBe('75.00');
    expect(result.deliveryDays).toBe('3-5');
    expect(result.discount).toBe(10);

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.example.com/price',
      expect.objectContaining({
        material: 'kuse',
        width: 50,
        height: 50,
        quantity: 500,
        lamination: 'none'
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'test-key'
        }),
        timeout: 10000
      })
    );
  });

  test('API delivery_days yoksa varsayılan "3-5" kullanılır', async () => {
    axios.post.mockResolvedValue({
      data: {
        unit_price: '0.10',
        total_price: '50.00'
      }
    });

    const result = await calculatePrice({
      material: 'kuse', width: 50, height: 50, quantity: 500, lamination: 'none'
    });

    expect(result.deliveryDays).toBe('3-5');
    expect(result.discount).toBe(0);
  });

  test('API hatası durumunda yerel hesaplamaya fallback yapar', async () => {
    axios.post.mockRejectedValue(new Error('Network error'));

    const result = await calculatePrice({
      material: 'kuse',
      width: 50,
      height: 50,
      quantity: 100,
      lamination: 'none'
    });

    // calculatePriceLocal sonucu dönmeli
    expect(result.unitPrice).toBeDefined();
    expect(result.totalPrice).toBeDefined();
    expect(result.deliveryDays).toBeDefined();
    expect(parseFloat(result.totalPrice)).toBeGreaterThan(0);
  });

  test('API timeout durumunda yerel hesaplamaya fallback yapar', async () => {
    axios.post.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });

    const result = await calculatePrice({
      material: 'kraft',
      width: 100,
      height: 50,
      quantity: 1000,
      lamination: 'glossy'
    });

    expect(parseFloat(result.totalPrice)).toBeGreaterThan(0);
  });

  test('API yanıtında response.data varsa loglama yapılır', async () => {
    axios.post.mockRejectedValue({
      response: { data: { error: 'Invalid API key' } },
      message: 'Request failed'
    });

    const result = await calculatePrice({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'none'
    });

    // Fallback çalışmış olmalı
    expect(result).toBeDefined();
    expect(parseFloat(result.totalPrice)).toBeGreaterThan(0);
  });
});

describe('calculatePriceLocal', () => {
  test('kuşe etiket için temel fiyat hesaplaması doğru çalışır', () => {
    const result = calculatePriceLocal({
      material: 'kuse',
      width: 100,
      height: 100,
      quantity: 100,
      lamination: 'none'
    });

    expect(parseFloat(result.unitPrice)).toBeCloseTo(0.5, 2);
    expect(parseFloat(result.totalPrice)).toBeCloseTo(50.0, 0);
    expect(result.discount).toBe(0);
  });

  test('laminasyon çarpanları doğru uygulanır', () => {
    const base = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'none'
    });
    const glossy = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'glossy'
    });
    const matte = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'matte'
    });

    expect(parseFloat(glossy.unitPrice)).toBeCloseTo(parseFloat(base.unitPrice) * 1.15, 4);
    expect(parseFloat(matte.unitPrice)).toBeCloseTo(parseFloat(base.unitPrice) * 1.18, 4);
  });

  test('miktar indirimleri doğru uygulanır', () => {
    const qty100 = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'none'
    });
    const qty250 = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 250, lamination: 'none'
    });
    const qty500 = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 500, lamination: 'none'
    });
    const qty1000 = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 1000, lamination: 'none'
    });
    const qty5000 = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 5000, lamination: 'none'
    });

    expect(qty100.discount).toBe(0);
    expect(qty250.discount).toBe(5);
    expect(qty500.discount).toBe(10);
    expect(qty1000.discount).toBe(20);
    expect(qty5000.discount).toBe(30);
  });

  test('farklı malzemeler farklı fiyat verir', () => {
    const kuse = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'none'
    });
    const hologram = calculatePriceLocal({
      material: 'hologram', width: 50, height: 50, quantity: 100, lamination: 'none'
    });

    expect(parseFloat(hologram.unitPrice)).toBeGreaterThan(parseFloat(kuse.unitPrice));
  });

  test('minimum birim fiyat 0.02 TL olarak uygulanır', () => {
    const result = calculatePriceLocal({
      material: 'kuse', width: 10, height: 10, quantity: 5000, lamination: 'none'
    });

    expect(parseFloat(result.unitPrice)).toBeGreaterThanOrEqual(0.02);
  });

  test('teslimat süresi miktar ile değişir', () => {
    const small = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'none'
    });
    const large = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 6000, lamination: 'none'
    });
    const veryLarge = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 11000, lamination: 'none'
    });

    expect(small.deliveryDays).toBe('3-5');
    expect(large.deliveryDays).toBe('5-7');
    expect(veryLarge.deliveryDays).toBe('7-10');
  });

  test('bilinmeyen malzeme için varsayılan fiyat kullanılır', () => {
    const result = calculatePriceLocal({
      material: 'bilinmeyen', width: 50, height: 50, quantity: 100, lamination: 'none'
    });

    expect(parseFloat(result.unitPrice)).toBeGreaterThan(0);
    expect(parseFloat(result.totalPrice)).toBeGreaterThan(0);
  });

  test('bilinmeyen laminasyon tipi için çarpan 1.0 uygulanır', () => {
    const base = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'none'
    });
    const unknown = calculatePriceLocal({
      material: 'kuse', width: 50, height: 50, quantity: 100, lamination: 'unknown'
    });

    expect(parseFloat(unknown.unitPrice)).toBeCloseTo(parseFloat(base.unitPrice), 4);
  });
});
