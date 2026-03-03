const { calculatePriceLocal } = require('../services/priceCalculator');

describe('calculatePriceLocal', () => {
  test('kuşe etiket için temel fiyat hesaplaması doğru çalışır', () => {
    const result = calculatePriceLocal({
      material: 'kuse',
      width: 100,    // 10cm
      height: 100,   // 10cm
      quantity: 100,
      lamination: 'none'
    });

    // Alan: 10cm * 10cm = 100cm², Birim fiyat: 100 * 0.005 = 0.50
    // İndirim yok (100 adet < 250), Toplam: 0.50 * 100 = 50.00
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
    // Çok küçük boyut ile
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

    // Varsayılan: 0.005 (kuşe ile aynı)
    expect(parseFloat(result.unitPrice)).toBeGreaterThan(0);
    expect(parseFloat(result.totalPrice)).toBeGreaterThan(0);
  });
});
