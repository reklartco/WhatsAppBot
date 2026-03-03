/**
 * WooCommerce Service Testleri
 *
 * createCustomer, createOrder, getOrderStatus ve extractCity fonksiyonlarını test eder.
 * WooCommerce REST API mocklanır.
 */

// WooCommerce REST API'yi mockla
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();

jest.mock('@woocommerce/woocommerce-rest-api', () => ({
  default: jest.fn().mockImplementation(() => ({
    get: mockGet,
    post: mockPost,
    put: mockPut
  }))
}));

const { createCustomer, createOrder, getOrderStatus, extractCity } = require('../services/woocommerceService');

describe('extractCity', () => {
  test('adresten şehir adını doğru çıkarır', () => {
    expect(extractCity('Çankaya Ankara')).toBe('Ankara');
    expect(extractCity('Nilüfer Bursa')).toBe('Bursa');
  });

  test('Türkçe İ/ı karakterli şehirler toLocaleLowerCase ile eşleşir', () => {
    // BUG-001 düzeltmesi sonrası bu testler geçmeli
    expect(extractCity('Kadıköy, İstanbul')).toBe('Istanbul');
    expect(extractCity('Konak İzmir')).toBe('Izmir');
  });

  test('küçük harfle yazılmış şehirleri bulur', () => {
    expect(extractCity('merkez antalya')).toBe('Antalya');
    expect(extractCity('adana seyhan')).toBe('Adana');
  });

  test('şehir bulunamazsa boş string döner', () => {
    expect(extractCity('Bilinmeyen Adres 123')).toBe('');
    expect(extractCity('')).toBe('');
  });

  test('adresin herhangi bir yerindeki şehri bulur', () => {
    expect(extractCity('Atatürk Cad. No:5, Konya, Türkiye')).toBe('Konya');
    expect(extractCity('Kartal Mah. Samsun İli')).toBe('Samsun');
  });

  test('tüm 81 il için en azından birkaç büyük ili tanır', () => {
    const testCities = [
      ['istanbul', 'Istanbul'],
      ['ankara', 'Ankara'],
      ['izmir', 'Izmir'],
      ['bursa', 'Bursa'],
      ['antalya', 'Antalya'],
      ['gaziantep', 'Gaziantep'],
      ['konya', 'Konya'],
      ['trabzon', 'Trabzon'],
    ];
    for (const [input, expected] of testCities) {
      expect(extractCity(input)).toBe(expected);
    }
  });
});

describe('createCustomer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('mevcut müşteri bulunduğunda günceller ve döner', async () => {
    const existingCustomer = { id: 42, email: 'test@test.com' };
    mockGet.mockResolvedValue({ data: [existingCustomer] });
    mockPut.mockResolvedValue({ data: existingCustomer });

    const result = await createCustomer({
      email: 'test@test.com',
      first_name: 'Ali',
      last_name: 'Yılmaz',
      phone: '905551234567',
      address: 'Kadıköy İstanbul',
      company: 'Test Ltd.'
    });

    expect(result).toEqual(existingCustomer);
    expect(mockGet).toHaveBeenCalledWith('customers', { email: 'test@test.com' });
    expect(mockPut).toHaveBeenCalledWith('customers/42', expect.objectContaining({
      meta_data: expect.arrayContaining([
        expect.objectContaining({ key: 'whatsapp_number', value: '905551234567' })
      ])
    }));
  });

  test('mevcut müşteri yoksa yeni oluşturur', async () => {
    const newCustomer = { id: 99, email: 'yeni@test.com' };
    mockGet.mockResolvedValue({ data: [] });
    mockPost.mockResolvedValue({ data: newCustomer });

    const result = await createCustomer({
      email: 'yeni@test.com',
      first_name: 'Veli',
      last_name: '',
      phone: '905559876543',
      address: 'Çankaya Ankara',
      company: ''
    });

    expect(result).toEqual(newCustomer);
    expect(mockPost).toHaveBeenCalledWith('customers', expect.objectContaining({
      email: 'yeni@test.com',
      first_name: 'Veli',
      billing: expect.objectContaining({
        country: 'TR',
        phone: '905559876543'
      }),
      meta_data: expect.arrayContaining([
        expect.objectContaining({ key: 'account_created_via', value: 'whatsapp_bot' })
      ])
    }));
  });

  test('API hatası fırlatıldığında hata yükseltilir', async () => {
    mockGet.mockRejectedValue(new Error('API bağlantı hatası'));

    await expect(createCustomer({
      email: 'hata@test.com',
      first_name: 'Test',
      last_name: '',
      phone: '905551111111',
      address: 'Test adres',
      company: ''
    })).rejects.toThrow('API bağlantı hatası');
  });

  test('mevcut müşteri araması boş data döndüğünde yeni oluşturur', async () => {
    mockGet.mockResolvedValue({ data: null });
    mockPost.mockResolvedValue({ data: { id: 100 } });

    const result = await createCustomer({
      email: 'test@test.com',
      first_name: 'Test',
      last_name: '',
      phone: '905551111111',
      address: 'Test',
      company: ''
    });

    expect(result).toEqual({ id: 100 });
    expect(mockPost).toHaveBeenCalledWith('customers', expect.anything());
  });
});

describe('createOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('doğru payload ile sipariş oluşturur', async () => {
    const orderResponse = {
      id: 200,
      number: '2001',
      status: 'pending',
      total: '125.00',
      payment_url: 'https://example.com/pay/200',
      order_key: 'wc_order_abc123'
    };
    mockPost.mockResolvedValue({ data: orderResponse });

    const result = await createOrder({
      customerId: 42,
      material: { name: 'Kuşe Etiket', code: 'kuse' },
      width: 50,
      height: 50,
      quantity: 500,
      lamination: 'glossy',
      totalPrice: '125.00',
      unitPrice: '0.2500'
    });

    expect(result.id).toBe(200);
    expect(result.number).toBe('2001');
    expect(result.payment_url).toBe('https://example.com/pay/200');

    expect(mockPost).toHaveBeenCalledWith('orders', expect.objectContaining({
      customer_id: 42,
      status: 'pending',
      currency: 'TRY',
      line_items: expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringContaining('Kuşe Etiket'),
          total: '125.00'
        })
      ]),
      meta_data: expect.arrayContaining([
        expect.objectContaining({ key: 'order_source', value: 'whatsapp' }),
        expect.objectContaining({ key: 'lamination_type', value: 'glossy' })
      ])
    }));
  });

  test('payment_url yoksa fallback URL oluşturulur', async () => {
    process.env.WC_URL = 'https://1etiket.com.tr';
    mockPost.mockResolvedValue({
      data: {
        id: 201,
        number: '2002',
        status: 'pending',
        total: '50.00',
        payment_url: '',
        order_key: 'wc_order_xyz'
      }
    });

    const result = await createOrder({
      customerId: 1,
      material: { name: 'Kraft', code: 'kraft' },
      width: 30, height: 30, quantity: 100,
      lamination: 'none', totalPrice: '50.00', unitPrice: '0.50'
    });

    expect(result.payment_url).toContain('/checkout/order-pay/201');
    expect(result.payment_url).toContain('key=wc_order_xyz');
  });

  test('laminasyon metni doğru dönüştürülür', async () => {
    mockPost.mockResolvedValue({
      data: { id: 1, number: '1', status: 'pending', total: '10', payment_url: 'url', order_key: 'k' }
    });

    await createOrder({
      customerId: 1,
      material: { name: 'Test', code: 'test' },
      width: 50, height: 50, quantity: 100,
      lamination: 'matte', totalPrice: '10', unitPrice: '0.10'
    });

    const payload = mockPost.mock.calls[0][1];
    const laminationMeta = payload.line_items[0].meta_data.find(m => m.key === 'Laminasyon');
    expect(laminationMeta.value).toBe('Mat');
  });

  test('API hatası fırlatıldığında hata yükseltilir', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: 'Invalid product' } } });

    await expect(createOrder({
      customerId: 1,
      material: { name: 'Test', code: 'test' },
      width: 50, height: 50, quantity: 100,
      lamination: 'none', totalPrice: '10', unitPrice: '0.10'
    })).rejects.toBeDefined();
  });
});

describe('getOrderStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sipariş bulunduğunda durum bilgilerini döner', async () => {
    mockGet.mockResolvedValue({
      data: [{
        status: 'processing',
        total: '125.00',
        date_created: '2026-03-01T10:00:00',
        meta_data: [
          { key: 'tracking_number', value: 'TR123456789' }
        ]
      }]
    });

    const result = await getOrderStatus('2001');

    expect(result.status).toBe('processing');
    expect(result.total).toBe('125.00');
    expect(result.tracking).toBe('TR123456789');
    expect(result.date).toBeDefined();

    expect(mockGet).toHaveBeenCalledWith('orders', {
      search: '2001',
      per_page: 1
    });
  });

  test('kargo takip numarası yoksa null döner', async () => {
    mockGet.mockResolvedValue({
      data: [{
        status: 'pending',
        total: '50.00',
        date_created: '2026-03-01T10:00:00',
        meta_data: []
      }]
    });

    const result = await getOrderStatus('1001');

    expect(result.tracking).toBeNull();
  });

  test('sipariş bulunamadığında hata fırlatır', async () => {
    mockGet.mockResolvedValue({ data: [] });

    await expect(getOrderStatus('9999')).rejects.toThrow('Sipariş bulunamadı');
  });

  test('data null geldiğinde hata fırlatır', async () => {
    mockGet.mockResolvedValue({ data: null });

    await expect(getOrderStatus('9999')).rejects.toThrow('Sipariş bulunamadı');
  });

  test('API hatası fırlatıldığında hata yükseltilir', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    await expect(getOrderStatus('1001')).rejects.toThrow('Network error');
  });
});
