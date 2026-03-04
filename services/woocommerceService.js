const crypto = require('crypto');
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const logger = require('../utils/logger');

let WooCommerce;

function getWooCommerceClient() {
  if (!WooCommerce) {
    WooCommerce = new WooCommerceRestApi({
      url: process.env.WC_URL,
      consumerKey: process.env.WC_CONSUMER_KEY,
      consumerSecret: process.env.WC_CONSUMER_SECRET,
      version: 'wc/v3'
    });
  }
  return WooCommerce;
}

/**
 * Müşteri oluştur veya mevcut müşteriyi bul
 * Telefon numarasına göre eşleştirme yapılır
 */
async function createCustomer({ email, first_name, last_name, phone, address, company }) {
  const wc = getWooCommerceClient();
  try {
    // Önce mevcut müşteriyi kontrol et (e-posta ile)
    const existing = await wc.get('customers', { email: email });

    if (existing.data && existing.data.length > 0) {
      logger.info(`Mevcut müşteri bulundu: ${email} (ID: ${existing.data[0].id})`);

      // WhatsApp numarasını güncelle
      await wc.put(`customers/${existing.data[0].id}`, {
        meta_data: [
          { key: 'whatsapp_number', value: phone },
          { key: 'order_source', value: 'whatsapp' }
        ]
      });

      return existing.data[0];
    }

    // Yeni müşteri oluştur
    const newCustomer = await wc.post('customers', {
      email: email,
      first_name: first_name,
      last_name: last_name || '',
      username: email.split('@')[0] + '_' + Date.now().toString(36),
      password: crypto.randomBytes(16).toString('hex'),
      billing: {
        first_name: first_name,
        last_name: last_name || '',
        company: company || '',
        address_1: address,
        city: extractCity(address),
        state: '',
        postcode: '',
        country: 'TR',
        email: email,
        phone: phone
      },
      shipping: {
        first_name: first_name,
        last_name: last_name || '',
        company: company || '',
        address_1: address,
        city: extractCity(address),
        country: 'TR'
      },
      meta_data: [
        { key: 'whatsapp_number', value: phone },
        { key: 'order_source', value: 'whatsapp' },
        { key: 'account_created_via', value: 'whatsapp_bot' }
      ]
    });

    logger.info(`Yeni müşteri oluşturuldu: ${email} (ID: ${newCustomer.data.id})`);
    return newCustomer.data;

  } catch (error) {
    logger.error('Müşteri oluşturma hatası:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Sipariş oluştur
 */
async function createOrder({ customerId, material, width, height, quantity, lamination, totalPrice, unitPrice, phone }) {
  const wc = getWooCommerceClient();
  try {
    const laminationText = { 'none': 'Yok', 'glossy': 'Parlak', 'matte': 'Mat' };

    const order = await wc.post('orders', {
      customer_id: customerId,
      status: 'pending',
      currency: 'TRY',
      set_paid: false,
      line_items: [
        {
          name: `${material.name} - ${width}×${height}mm - ${quantity} Adet`,
          quantity: 1,
          total: totalPrice.toString(),
          subtotal: totalPrice.toString(),
          meta_data: [
            { key: 'Malzeme', value: material.name },
            { key: 'Boyut', value: `${width}×${height} mm` },
            { key: 'Adet', value: quantity.toString() },
            { key: 'Birim Fiyat', value: `${unitPrice} ₺` },
            { key: 'Laminasyon', value: laminationText[lamination] || 'Yok' }
          ]
        }
      ],
      meta_data: [
        { key: 'order_source', value: 'whatsapp' },
        { key: 'whatsapp_number', value: phone || '' },
        { key: 'material_code', value: material.code },
        { key: 'label_width', value: width.toString() },
        { key: 'label_height', value: height.toString() },
        { key: 'label_quantity', value: quantity.toString() },
        { key: 'lamination_type', value: lamination },
        { key: 'print_file_status', value: 'awaiting' }
      ]
    });

    logger.info(`Sipariş oluşturuldu: #${order.data.number} (ID: ${order.data.id})`);

    return {
      id: order.data.id,
      number: order.data.number,
      status: order.data.status,
      total: order.data.total,
      payment_url: order.data.payment_url || `${process.env.WC_URL}/checkout/order-pay/${order.data.id}/?key=${order.data.order_key}`
    };

  } catch (error) {
    logger.error('Sipariş oluşturma hatası:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Sipariş durumu sorgula
 */
async function getOrderStatus(orderNumber) {
  const wc = getWooCommerceClient();
  try {
    const orders = await wc.get('orders', {
      search: orderNumber,
      per_page: 1
    });

    if (!orders.data || orders.data.length === 0) {
      throw new Error('Sipariş bulunamadı');
    }

    const order = orders.data[0];

    return {
      status: order.status,
      total: order.total,
      date: new Date(order.date_created).toLocaleDateString('tr-TR'),
      tracking: order.meta_data?.find(m => m.key === 'tracking_number')?.value || null
    };
  } catch (error) {
    logger.error('Sipariş sorgulama hatası:', error.message);
    throw error;
  }
}

/**
 * Adresten şehir çıkar (basit)
 */
function extractCity(address) {
  const cities = ['istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana',
    'konya', 'gaziantep', 'mersin', 'kayseri', 'eskişehir', 'diyarbakır',
    'samsun', 'denizli', 'şanlıurfa', 'malatya', 'trabzon', 'erzurum',
    'van', 'batman', 'elazığ', 'manisa', 'balıkesir', 'kocaeli', 'sakarya',
    'tekirdağ', 'muğla', 'hatay', 'kahramanmaraş', 'mardin', 'aydın',
    'afyon', 'aksaray', 'amasya', 'ardahan', 'artvin', 'bartın', 'bayburt',
    'bilecik', 'bingöl', 'bitlis', 'bolu', 'burdur', 'çanakkale', 'çankırı',
    'çorum', 'düzce', 'edirne', 'giresun', 'gümüşhane', 'hakkari', 'ığdır',
    'isparta', 'karabük', 'karaman', 'kars', 'kastamonu', 'kırıkkale',
    'kırklareli', 'kırşehir', 'kilis', 'muş', 'nevşehir', 'niğde',
    'ordu', 'osmaniye', 'rize', 'siirt', 'sinop', 'sivas', 'şırnak',
    'tokat', 'tunceli', 'uşak', 'yalova', 'yozgat', 'zonguldak'];

  const addressLower = address.toLocaleLowerCase('tr-TR');
  for (const city of cities) {
    if (addressLower.includes(city)) {
      return city.charAt(0).toUpperCase() + city.slice(1);
    }
  }
  return '';
}

module.exports = { createCustomer, createOrder, getOrderStatus, extractCity };
