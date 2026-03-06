const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const logger = require('../utils/logger');

let WooCommerce;
let cachedProductId = null;

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

// ========== TÜRKİYE İL KODLARI (WooCommerce uyumlu) ==========

const TR_STATES = {
  'adana': 'TR01', 'adiyaman': 'TR02', 'adıyaman': 'TR02', 'afyon': 'TR03',
  'afyonkarahisar': 'TR03', 'agri': 'TR04', 'ağrı': 'TR04',
  'amasya': 'TR05', 'ankara': 'TR06', 'antalya': 'TR07', 'artvin': 'TR08',
  'aydin': 'TR09', 'aydın': 'TR09', 'balikesir': 'TR10', 'balıkesir': 'TR10',
  'bilecik': 'TR11', 'bingol': 'TR12', 'bingöl': 'TR12',
  'bitlis': 'TR13', 'bolu': 'TR14', 'burdur': 'TR15', 'bursa': 'TR16',
  'canakkale': 'TR17', 'çanakkale': 'TR17', 'cankiri': 'TR18', 'çankırı': 'TR18',
  'corum': 'TR19', 'çorum': 'TR19', 'denizli': 'TR20',
  'diyarbakir': 'TR21', 'diyarbakır': 'TR21',
  'edirne': 'TR22', 'elazig': 'TR23', 'elazığ': 'TR23',
  'erzincan': 'TR24', 'erzurum': 'TR25',
  'eskisehir': 'TR26', 'eskişehir': 'TR26',
  'gaziantep': 'TR27', 'giresun': 'TR28',
  'gumushane': 'TR29', 'gümüşhane': 'TR29',
  'hakkari': 'TR30', 'hatay': 'TR31', 'isparta': 'TR32',
  'mersin': 'TR33', 'icel': 'TR33', 'içel': 'TR33',
  'istanbul': 'TR34', 'İstanbul': 'TR34',
  'izmir': 'TR35', 'İzmir': 'TR35',
  'kars': 'TR36', 'kastamonu': 'TR37', 'kayseri': 'TR38',
  'kirklareli': 'TR39', 'kırklareli': 'TR39',
  'kirsehir': 'TR40', 'kırşehir': 'TR40',
  'kocaeli': 'TR41', 'konya': 'TR42',
  'kutahya': 'TR43', 'kütahya': 'TR43',
  'malatya': 'TR44', 'manisa': 'TR45',
  'kahramanmaras': 'TR46', 'kahramanmaraş': 'TR46',
  'mardin': 'TR47', 'mugla': 'TR48', 'muğla': 'TR48',
  'mus': 'TR49', 'muş': 'TR49',
  'nevsehir': 'TR50', 'nevşehir': 'TR50',
  'nigde': 'TR51', 'niğde': 'TR51',
  'ordu': 'TR52', 'rize': 'TR53', 'sakarya': 'TR54',
  'samsun': 'TR55', 'siirt': 'TR56', 'sinop': 'TR57', 'sivas': 'TR58',
  'tekirdag': 'TR59', 'tekirdağ': 'TR59',
  'tokat': 'TR60', 'trabzon': 'TR61', 'tunceli': 'TR62',
  'sanliurfa': 'TR63', 'şanlıurfa': 'TR63',
  'usak': 'TR64', 'uşak': 'TR64',
  'van': 'TR65', 'yozgat': 'TR66', 'zonguldak': 'TR67',
  'aksaray': 'TR68', 'bayburt': 'TR69', 'karaman': 'TR70',
  'kirikkale': 'TR71', 'kırıkkale': 'TR71',
  'batman': 'TR72',
  'sirnak': 'TR73', 'şırnak': 'TR73',
  'bartin': 'TR74', 'bartın': 'TR74',
  'ardahan': 'TR75',
  'igdir': 'TR76', 'ığdır': 'TR76',
  'yalova': 'TR77',
  'karabuk': 'TR78', 'karabük': 'TR78',
  'kilis': 'TR79', 'osmaniye': 'TR80',
  'duzce': 'TR81', 'düzce': 'TR81'
};

// İl isimlerinin WC state name karşılıkları (başlıkları)
const TR_STATE_NAMES = {
  'TR01': 'Adana', 'TR02': 'Adıyaman', 'TR03': 'Afyon', 'TR04': 'Ağrı',
  'TR05': 'Amasya', 'TR06': 'Ankara', 'TR07': 'Antalya', 'TR08': 'Artvin',
  'TR09': 'Aydın', 'TR10': 'Balıkesir', 'TR11': 'Bilecik', 'TR12': 'Bingöl',
  'TR13': 'Bitlis', 'TR14': 'Bolu', 'TR15': 'Burdur', 'TR16': 'Bursa',
  'TR17': 'Çanakkale', 'TR18': 'Çankırı', 'TR19': 'Çorum', 'TR20': 'Denizli',
  'TR21': 'Diyarbakır', 'TR22': 'Edirne', 'TR23': 'Elazığ', 'TR24': 'Erzincan',
  'TR25': 'Erzurum', 'TR26': 'Eskişehir', 'TR27': 'Gaziantep', 'TR28': 'Giresun',
  'TR29': 'Gümüşhane', 'TR30': 'Hakkari', 'TR31': 'Hatay', 'TR32': 'Isparta',
  'TR33': 'Mersin', 'TR34': 'İstanbul', 'TR35': 'İzmir', 'TR36': 'Kars',
  'TR37': 'Kastamonu', 'TR38': 'Kayseri', 'TR39': 'Kırklareli', 'TR40': 'Kırşehir',
  'TR41': 'Kocaeli', 'TR42': 'Konya', 'TR43': 'Kütahya', 'TR44': 'Malatya',
  'TR45': 'Manisa', 'TR46': 'Kahramanmaraş', 'TR47': 'Mardin', 'TR48': 'Muğla',
  'TR49': 'Muş', 'TR50': 'Nevşehir', 'TR51': 'Niğde', 'TR52': 'Ordu',
  'TR53': 'Rize', 'TR54': 'Sakarya', 'TR55': 'Samsun', 'TR56': 'Siirt',
  'TR57': 'Sinop', 'TR58': 'Sivas', 'TR59': 'Tekirdağ', 'TR60': 'Tokat',
  'TR61': 'Trabzon', 'TR62': 'Tunceli', 'TR63': 'Şanlıurfa', 'TR64': 'Uşak',
  'TR65': 'Van', 'TR66': 'Yozgat', 'TR67': 'Zonguldak', 'TR68': 'Aksaray',
  'TR69': 'Bayburt', 'TR70': 'Karaman', 'TR71': 'Kırıkkale', 'TR72': 'Batman',
  'TR73': 'Şırnak', 'TR74': 'Bartın', 'TR75': 'Ardahan', 'TR76': 'Iğdır',
  'TR77': 'Yalova', 'TR78': 'Karabük', 'TR79': 'Kilis', 'TR80': 'Osmaniye',
  'TR81': 'Düzce'
};

/**
 * Adresten il bilgisi çıkar ve WooCommerce state koduna dönüştür
 * @returns {{ stateCode: string, stateName: string }}
 */
function extractState(address) {
  if (!address) return { stateCode: '', stateName: '' };

  const addressLower = address.toLocaleLowerCase('tr-TR');

  // Önce uzun isimli illeri dene (kahramanmaraş, afyonkarahisar vb.)
  const sortedCities = Object.keys(TR_STATES).sort((a, b) => b.length - a.length);

  for (const city of sortedCities) {
    const cityLower = city.toLocaleLowerCase('tr-TR');
    if (addressLower.includes(cityLower)) {
      const code = TR_STATES[city];
      const name = TR_STATE_NAMES[code] || city;
      return { stateCode: code, stateName: name };
    }
  }

  return { stateCode: '', stateName: '' };
}

/**
 * Adresten ilçe/semt bilgisi çıkar
 * Format beklentisi: "İl, İlçe, Mahalle Cadde Sokak No" veya "İl İlçe Mahalle..."
 */
function extractDistrict(address, stateName) {
  if (!address) return '';
  if (!stateName) return '';

  // Adres parçalama stratejisi:
  // 1. Virgülle ayrılmışsa 2. parça ilçe
  // 2. Boşlukla ayrılmışsa il'den sonraki kelime ilçe
  // 3. Adres keyword'lerini atla

  const addressKeywords = [
    'mah', 'mahalle', 'mahallesi', 'cad', 'cadde', 'caddesi',
    'sok', 'sokak', 'sokağı', 'no', 'no:', 'kat', 'kat:',
    'daire', 'd:', 'apt', 'apartman', 'blok', 'site',
    'bulvar', 'bulvarı', 'sk', 'cd', 'bul'
  ];

  // Virgülle ayrılmış format: "İzmir, Konak, ..."
  const commaParts = address.split(',').map(p => p.trim()).filter(p => p.length > 0);
  if (commaParts.length >= 2) {
    // İl'i bul ve ilçeyi al
    const stateNameLower = stateName.toLocaleLowerCase('tr-TR');
    for (let i = 0; i < commaParts.length; i++) {
      if (commaParts[i].toLocaleLowerCase('tr-TR').includes(stateNameLower)) {
        // İl bu parçada, bir sonraki parça ilçe
        if (i + 1 < commaParts.length) {
          const candidate = commaParts[i + 1].trim();
          // Adres keyword değilse ilçe olarak kabul et
          if (candidate.length >= 2 && !addressKeywords.includes(candidate.toLocaleLowerCase('tr-TR'))) {
            return capitalizeFirst(candidate);
          }
        }
        // İl bu parçada ama başka kelime de olabilir (ör: "İzmir Konak")
        const stateIdx = commaParts[i].toLocaleLowerCase('tr-TR').indexOf(stateNameLower);
        const afterState = commaParts[i].substring(stateIdx + stateName.length).trim();
        if (afterState.length >= 2) {
          const firstWord = afterState.split(/\s+/)[0];
          if (!addressKeywords.includes(firstWord.toLocaleLowerCase('tr-TR')) && !/^\d+$/.test(firstWord)) {
            return capitalizeFirst(firstWord);
          }
        }
        break;
      }
    }
  }

  // Boşlukla ayrılmış format: "İzmir Konak İsmet kaptan mah..."
  const stateNameLower = stateName.toLocaleLowerCase('tr-TR');
  const addressLower = address.toLocaleLowerCase('tr-TR');
  const stateIdx = addressLower.indexOf(stateNameLower);

  if (stateIdx !== -1) {
    const afterState = address.substring(stateIdx + stateName.length).trim();
    const words = afterState.split(/[\s,]+/).filter(w => w.length > 0);

    for (const word of words) {
      const wordLower = word.toLocaleLowerCase('tr-TR');
      // Adres keyword veya rakam değilse ilçe kabul et
      if (wordLower.length >= 2 &&
          !addressKeywords.includes(wordLower) &&
          !addressKeywords.some(kw => wordLower.startsWith(kw + '.')) &&
          !/^\d+$/.test(word) &&
          !/^no[:.]?\d*$/i.test(word)) {
        return capitalizeFirst(word);
      }
      // Eğer adres keyword'üne geldiyse dur (ilçe bulunamadı)
      if (addressKeywords.includes(wordLower) || wordLower.endsWith('.')) {
        break;
      }
    }

    // İl başta değilse, il'den önceki kelimeye de bak
    if (stateIdx > 0) {
      const beforeState = address.substring(0, stateIdx).trim();
      const beforeWords = beforeState.split(/[\s,]+/).filter(w => w.length > 0);
      if (beforeWords.length > 0) {
        const lastWord = beforeWords[beforeWords.length - 1];
        const lastWordLower = lastWord.toLocaleLowerCase('tr-TR');
        if (lastWordLower.length >= 2 &&
            !addressKeywords.includes(lastWordLower) &&
            !/^\d+$/.test(lastWord)) {
          return capitalizeFirst(lastWord);
        }
      }
    }
  }

  return '';
}

function capitalizeFirst(str) {
  if (!str) return '';
  // Türkçe uyumlu capitalize
  return str.charAt(0).toLocaleUpperCase('tr-TR') + str.slice(1);
}

/**
 * WhatsApp siparişleri için placeholder ürün al veya oluştur
 */
async function getOrCreatePlaceholderProduct() {
  if (cachedProductId) return cachedProductId;

  const wc = getWooCommerceClient();

  // SKU ile ara
  try {
    const existing = await wc.get('products', { sku: 'whatsapp-etiket-siparis', per_page: 1 });
    if (existing.data && existing.data.length > 0) {
      cachedProductId = existing.data[0].id;
      logger.info(`Placeholder ürün bulundu: ID ${cachedProductId}`);
      return cachedProductId;
    }
  } catch (e) { /* devam */ }

  // Yoksa oluştur
  const product = await wc.post('products', {
    name: 'Özel Etiket Baskısı (WhatsApp)',
    type: 'simple',
    sku: 'whatsapp-etiket-siparis',
    regular_price: '0',
    catalog_visibility: 'hidden',
    status: 'private',
    description: 'WhatsApp bot üzerinden oluşturulan etiket siparişleri için placeholder ürün.'
  });

  cachedProductId = product.data.id;
  logger.info(`Placeholder ürün oluşturuldu: ID ${cachedProductId}`);
  return cachedProductId;
}

/**
 * Müşteri oluştur veya mevcut müşteriyi bul
 */
async function createCustomer({ email, first_name, last_name, phone, customerType, billingAddress, shippingAddress, company, tcNo, taxNo, taxOffice }) {
  const wc = getWooCommerceClient();
  try {
    // Adres bilgilerini çıkar
    const billingState = extractState(billingAddress);
    const billingDistrict = extractDistrict(billingAddress, billingState.stateName);
    const shipAddr = shippingAddress || billingAddress;
    const shippingState = extractState(shipAddr);
    const shippingDistrict = extractDistrict(shipAddr, shippingState.stateName);

    const existing = await wc.get('customers', { email: email });

    if (existing.data && existing.data.length > 0) {
      logger.info(`Mevcut müşteri bulundu: ${email} (ID: ${existing.data[0].id})`);

      const metaData = [
        { key: 'whatsapp_number', value: phone },
        { key: 'order_source', value: 'whatsapp' },
        { key: 'customer_type', value: customerType }
      ];

      if (customerType === 'bireysel' && tcNo) {
        metaData.push({ key: 'tc_kimlik_no', value: tcNo });
      }
      if (customerType === 'kurumsal') {
        if (taxNo) metaData.push({ key: 'vergi_no', value: taxNo });
        if (taxOffice) metaData.push({ key: 'vergi_dairesi', value: taxOffice });
      }

      await wc.put(`customers/${existing.data[0].id}`, {
        billing: {
          first_name: first_name,
          last_name: last_name || '',
          company: company || '',
          address_1: billingAddress,
          city: billingDistrict,
          state: billingState.stateCode,
          postcode: '',
          country: 'TR',
          email: email,
          phone: phone
        },
        shipping: {
          first_name: first_name,
          last_name: last_name || '',
          company: company || '',
          address_1: shipAddr,
          city: shippingDistrict,
          state: shippingState.stateCode,
          country: 'TR'
        },
        meta_data: metaData
      });

      return existing.data[0];
    }

    const metaData = [
      { key: 'whatsapp_number', value: phone },
      { key: 'order_source', value: 'whatsapp' },
      { key: 'account_created_via', value: 'whatsapp_bot' },
      { key: 'customer_type', value: customerType }
    ];

    if (customerType === 'bireysel' && tcNo) {
      metaData.push({ key: 'tc_kimlik_no', value: tcNo });
    }
    if (customerType === 'kurumsal') {
      if (taxNo) metaData.push({ key: 'vergi_no', value: taxNo });
      if (taxOffice) metaData.push({ key: 'vergi_dairesi', value: taxOffice });
    }

    const newCustomer = await wc.post('customers', {
      email: email,
      first_name: first_name,
      last_name: last_name || '',
      username: email.split('@')[0] + '_' + Date.now().toString(36),
      password: '123456',
      billing: {
        first_name: first_name,
        last_name: last_name || '',
        company: company || '',
        address_1: billingAddress,
        city: billingDistrict,
        state: billingState.stateCode,
        postcode: '',
        country: 'TR',
        email: email,
        phone: phone
      },
      shipping: {
        first_name: first_name,
        last_name: last_name || '',
        company: company || '',
        address_1: shipAddr,
        city: shippingDistrict,
        state: shippingState.stateCode,
        country: 'TR'
      },
      meta_data: metaData
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
async function createOrder({ customerId, material, width, height, quantity, totalPrice, unitPrice, grandTotal, kargoFee, sheets, labelsPerSheet, customerData }) {
  const wc = getWooCommerceClient();
  try {
    const productId = await getOrCreatePlaceholderProduct();

    // Adet formatı (Alpine uyumlu)
    const qtyFormatted = quantity.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    // totalPrice raw number → WooCommerce decimal string
    const totalPriceStr = (typeof totalPrice === 'number') ? totalPrice.toFixed(2) : totalPrice;

    // Adres bilgilerini çıkar
    const billingAddr = customerData?.billingAddress || '';
    const billingState = extractState(billingAddr);
    const billingDistrict = extractDistrict(billingAddr, billingState.stateName);

    const shipAddr = customerData?.shippingAddress || billingAddr;
    const shippingState = extractState(shipAddr);
    const shippingDistrict = extractDistrict(shipAddr, shippingState.stateName);

    // Fatura bilgileri
    const billingData = {
      first_name: customerData?.first_name || '',
      last_name: customerData?.last_name || '',
      company: customerData?.company || '',
      address_1: billingAddr,
      address_2: '',
      city: billingDistrict,
      state: billingState.stateCode,
      postcode: '',
      country: 'TR',
      email: customerData?.email || '',
      phone: customerData?.phone || ''
    };

    // Gönderim bilgileri
    const shippingData = {
      first_name: customerData?.first_name || '',
      last_name: customerData?.last_name || '',
      company: customerData?.company || '',
      address_1: shipAddr,
      address_2: '',
      city: shippingDistrict,
      state: shippingState.stateCode,
      postcode: '',
      country: 'TR'
    };

    // Sipariş meta — WPDesk Checkout Fields uyumlu
    const orderMeta = [
      { key: 'order_source', value: 'whatsapp' },
      { key: 'material_code', value: material.code },
      { key: 'label_width', value: width.toString() },
      { key: 'label_height', value: height.toString() },
      { key: 'label_quantity', value: quantity.toString() },
      { key: 'print_file_status', value: 'awaiting' }
    ];

    // WPDesk custom billing meta fields
    if (customerData?.customerType) {
      orderMeta.push({
        key: '_billing_a',
        value: customerData.customerType === 'kurumsal' ? 'Kurumsal' : 'Bireysel'
      });
    }

    // Şirket türü (WPDesk field)
    if (customerData?.customerType === 'kurumsal') {
      orderMeta.push({ key: '_billing_sirket_turu', value: '' });
    } else {
      orderMeta.push({ key: '_billing_sirket_turu', value: '' });
    }

    // TC Kimlik No (WPDesk field: _billing_billing_tc)
    orderMeta.push({
      key: '_billing_billing_tc',
      value: customerData?.tcNo || ''
    });

    // Vergi Numarası (WPDesk field: _billing_billing_taxnr)
    orderMeta.push({
      key: '_billing_billing_taxnr',
      value: customerData?.taxNo || ''
    });

    // Vergi Dairesi (WPDesk field: _billing_billing_tax)
    orderMeta.push({
      key: '_billing_billing_tax',
      value: customerData?.taxOffice || ''
    });

    // Müşteri Notu (WPDesk field)
    orderMeta.push({
      key: '_billing_musteri_notu',
      value: ''
    });

    // Line item meta (Sipariş Detayları)
    const lineItemMeta = [
      { key: 'Kağıt Türü', value: `${material.name}` },
      { key: 'Boyut', value: `${width} × ${height} mm` },
      { key: 'Adet', value: qtyFormatted },
    ];
    if (sheets) {
      lineItemMeta.push({ key: 'Tabaka', value: sheets.toString() });
    }

    const orderData = {
      customer_id: customerId,
      status: 'pending',
      currency: 'TRY',
      set_paid: false,
      billing: billingData,
      shipping: shippingData,
      line_items: [
        {
          product_id: productId,
          name: `${material.name} Etiket - ${width}×${height}mm (${qtyFormatted} adet)`,
          quantity: 1,
          total: totalPriceStr,
          subtotal: totalPriceStr,
          meta_data: lineItemMeta
        }
      ],
      shipping_lines: kargoFee > 0 ? [
        {
          method_id: 'flat_rate',
          method_title: 'Kargo',
          total: kargoFee.toString()
        }
      ] : [
        {
          method_id: 'free_shipping',
          method_title: 'Ücretsiz Kargo',
          total: '0'
        }
      ],
      meta_data: orderMeta
    };

    // Kargo adresi farklıysa müşteri notu ekle
    if (customerData?.shippingAddress && customerData.shippingAddress !== customerData.billingAddress) {
      orderData.customer_note = `Kargo adresi fatura adresinden farklıdır. Kargo adresi: ${customerData.shippingAddress}`;
    }

    const order = await wc.post('orders', orderData);

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

// ========== CRM QUERY FONKSİYONLARI ==========

/**
 * Telefon numarasıyla WC müşteri ara
 */
async function getCustomerByPhone(phone) {
  const wc = getWooCommerceClient();
  try {
    const res = await wc.get('customers', { search: phone, per_page: 5 });
    if (!res.data || res.data.length === 0) return null;

    // Telefon eşleşmesi
    const match = res.data.find(c =>
      c.billing?.phone?.replace(/\D/g, '').includes(phone.slice(-10)) ||
      c.meta_data?.some(m => m.key === 'whatsapp_number' && m.value?.includes(phone.slice(-10)))
    );
    return match || (res.data.length === 1 ? res.data[0] : null);
  } catch (error) {
    logger.error('WC müşteri arama hatası:', error.message);
    return null;
  }
}

/**
 * Müşteri siparişlerini getir
 */
async function getCustomerOrders(customerId, perPage = 5) {
  const wc = getWooCommerceClient();
  try {
    const res = await wc.get('orders', {
      customer: customerId,
      per_page: perPage,
      orderby: 'date',
      order: 'desc'
    });
    return res.data || [];
  } catch (error) {
    logger.error('WC siparişler hatası:', error.message);
    return [];
  }
}

/**
 * Müşteri toplam sipariş ve harcama hesapla
 */
async function getCustomerTotals(customerId) {
  const wc = getWooCommerceClient();
  try {
    const res = await wc.get('orders', {
      customer: customerId,
      per_page: 100,
      status: 'completed,processing'
    });
    const orders = res.data || [];
    return {
      totalOrders: orders.length,
      totalSpending: orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0)
    };
  } catch (error) {
    logger.error('WC toplamlar hatası:', error.message);
    return { totalOrders: 0, totalSpending: 0 };
  }
}

module.exports = {
  createCustomer,
  createOrder,
  getOrderStatus,
  extractState,
  extractDistrict,
  getWooCommerceClient,
  getCustomerByPhone,
  getCustomerOrders,
  getCustomerTotals,
  TR_STATE_NAMES
};
