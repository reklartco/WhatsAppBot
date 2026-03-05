# 1etiket.com.tr — WhatsApp Business Otomasyon Projesi

## Proje Genel Bakış

**Amaç:** WhatsApp üzerinden gelen müşterilere otomatik fiyat hesaplama, sipariş oluşturma, üyelik açma ve ödeme alma sistemi kurmak.

**Bütçe:** ~200 ₺/ay (sadece Meta mesaj ücretleri — hosting mevcut sitede)

**Hacim:** 500+ müşteri/ay

**Teknoloji Stack:** WhatsApp Cloud API + Node.js Webhook Server + WooCommerce REST API + Mevcut WordPress Sitesi

---

## Sistem Mimarisi

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   MÜŞTERİ   │────▶│  Meta WhatsApp   │────▶│  Webhook Server     │
│  (WhatsApp)  │◀────│  Cloud API       │◀────│  (Node.js)          │
└─────────────┘     └──────────────────┘     │                     │
                                              │  ┌───────────────┐  │
                                              │  │ Konuşma       │  │
                                              │  │ Yönetici      │  │
                                              │  │ (State Machine│  │
                                              │  └───────┬───────┘  │
                                              └─────────┼───────────┘
                                                        │
                              ┌──────────────────────────┼──────────────────────┐
                              │                          │                      │
                    ┌─────────▼─────────┐   ┌───────────▼──────────┐  ┌────────▼────────┐
                    │  Fiyat Hesaplama  │   │  WooCommerce REST    │  │  Dosya Yönetimi │
                    │  API Endpoint     │   │  API                 │  │  (Baskı Dosyası)│
                    │  (WordPress)      │   │  - Müşteri Oluştur   │  │                 │
                    └───────────────────┘   │  - Sipariş Oluştur   │  └─────────────────┘
                                            │  - Ödeme Linki       │
                                            └──────────────────────┘
```

---

## BÖLÜM 1: WhatsApp Cloud API Kurulumu

### 1.1 Ön Gereksinimler

- Facebook Business hesabı (business.facebook.com)
- Meta Developer hesabı (developers.facebook.com)
- Doğrulanmış işletme (ticaret sicil belgesi veya vergi levhası)
- WhatsApp'a bağlanacak telefon numarası (mevcut WhatsApp hesabı olmayan veya taşınacak)
- HTTPS destekli webhook URL'si (mevcut sunucunuzda)

### 1.2 Adım Adım API Erişimi

**Adım 1 — Meta Business Suite'te İşletme Doğrulaması:**
```
1. business.facebook.com → Ayarlar → İş Bilgileri → Doğrulama
2. Gerekli belgeler:
   - Ticaret sicil gazetesi VEYA
   - Vergi levhası VEYA
   - Elektrik/telefon faturası (işletme adına)
3. Doğrulama süresi: 1-3 iş günü
```

**Adım 2 — Developer Uygulaması Oluşturma:**
```
1. developers.facebook.com → My Apps → Create App
2. Use case: "Other" seç
3. App type: "Business" seç
4. App adı: "1etiket WhatsApp Bot"
5. Business hesabını bağla
```

**Adım 3 — WhatsApp Ürünü Ekleme:**
```
1. App Dashboard → Add Product → WhatsApp → Set Up
2. WhatsApp Business Account seç veya oluştur
3. Test telefon numarası otomatik atanır (geliştirme için)
```

**Adım 4 — Gerçek Telefon Numarası Ekleme:**
```
1. WhatsApp → Getting Started → Add phone number
2. Görünen isim: "1etiket.com.tr" (onay gerektirir)
3. SMS veya sesli arama ile doğrula
4. ÖNEMLİ: Bu numara artık normal WhatsApp'ta kullanılamaz!
```

**Adım 5 — Kalıcı Erişim Tokeni Oluşturma:**
```
1. Business Settings → System Users → Add
2. Adı: "whatsapp-bot"
3. Rolü: Admin
4. Token oluştur → whatsapp_business_messaging ve
   whatsapp_business_management izinlerini ekle
5. Bu token süresiz geçerlidir, güvenli sakla!
```

**Adım 6 — Webhook Ayarı:**
```
Callback URL: https://api.1etiket.com.tr/webhook/whatsapp
Verify Token: sizin_belirlediginiz_gizli_token

Abone olunacak alanlar:
✅ messages
✅ message_deliveries
✅ message_reads
✅ messaging_postbacks
```

### 1.3 Meta Mesaj Ücretleri (Türkiye — Güncel)

| Kategori | Mesaj Başına | Açıklama |
|---|---|---|
| Service (Gelen) | **ÜCRETSİZ** | Müşteri başlattığı, 24 saat pencere içi |
| Utility (Pencere içi) | **ÜCRETSİZ** | 24 saat içinde gönderilen sipariş bildirimi |
| Utility (Pencere dışı) | $0,0053 (~0,19 ₺) | Pencere kapandıktan sonra şablon mesaj |
| Marketing | $0,0109 (~0,39 ₺) | Promosyon, kampanya |
| Authentication | $0,0053 (~0,19 ₺) | OTP, şifre sıfırlama |

**Tahmini aylık maliyet (500 müşteri):** ~100-200 ₺

---

## BÖLÜM 2: Node.js Webhook Sunucusu

### 2.1 Proje Yapısı

```
whatsapp-bot/
├── package.json
├── .env
├── server.js                    # Ana sunucu & webhook handler
├── config/
│   ├── database.js              # MySQL/SQLite bağlantısı
│   └── whatsapp.js              # WhatsApp API yapılandırması
├── services/
│   ├── whatsappService.js       # Mesaj gönderme/alma servisi
│   ├── conversationManager.js   # Konuşma durumu yönetimi (state machine)
│   ├── priceCalculator.js       # Fiyat hesaplama API çağrısı
│   ├── woocommerceService.js    # WooCommerce müşteri/sipariş işlemleri
│   └── fileService.js           # Baskı dosyası indirme/kaydetme
├── flows/
│   ├── mainMenu.js              # Ana menü akışı
│   ├── orderFlow.js             # Sipariş akışı
│   ├── priceInquiry.js          # Fiyat sorgulama akışı
│   ├── orderTracking.js         # Sipariş takip akışı
│   └── fileUpload.js            # Baskı dosyası yükleme akışı
├── templates/
│   └── messages.js              # Mesaj şablonları (TR)
├── models/
│   └── conversation.js          # Konuşma durumu modeli
└── utils/
    ├── validator.js             # Girdi doğrulama (boyut, email vb.)
    └── logger.js                # Loglama
```

### 2.2 Environment Değişkenleri (.env)

```env
# WhatsApp Cloud API
WHATSAPP_TOKEN=EAAxxxxxxx...          # System User kalıcı token
WHATSAPP_PHONE_ID=123456789012345     # Telefon numarası ID
WHATSAPP_BUSINESS_ID=123456789012345  # Business Account ID
WHATSAPP_VERIFY_TOKEN=1etiket_wh_verify_2024  # Webhook doğrulama

# WooCommerce REST API
WC_URL=https://1etiket.com.tr
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxx

# Fiyat Hesaplama API
PRICE_API_URL=https://1etiket.com.tr/wp-json/1etiket/v1/calculate-price
PRICE_API_KEY=your_internal_api_key

# Sunucu
PORT=3000
NODE_ENV=production
WEBHOOK_PATH=/webhook/whatsapp

# Veritabanı (konuşma durumları için)
DB_PATH=./data/conversations.db

# Dosya Depolama
UPLOAD_DIR=./uploads/baski-dosyalari
MAX_FILE_SIZE=25000000  # 25MB (WhatsApp limiti)
```

### 2.3 Ana Sunucu (server.js)

```javascript
const express = require('express');
const dotenv = require('dotenv');
const { handleWebhook, verifyWebhook } = require('./services/whatsappService');
const logger = require('./utils/logger');

dotenv.config();
const app = express();

// WhatsApp webhook'u JSON body gönderir
app.use(express.json());

// Webhook doğrulama (GET) - Meta bu endpoint'i doğrulamak için çağırır
app.get(process.env.WEBHOOK_PATH, verifyWebhook);

// Gelen mesajlar (POST) - Her mesajda Meta bu endpoint'e POST atar
app.post(process.env.WEBHOOK_PATH, handleWebhook);

// Sağlık kontrolü
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`WhatsApp Bot sunucusu ${PORT} portunda çalışıyor`);
});
```

### 2.4 WhatsApp Servisi (services/whatsappService.js)

```javascript
const axios = require('axios');
const { processMessage } = require('./conversationManager');
const logger = require('../utils/logger');

const GRAPH_API = 'https://graph.facebook.com/v21.0';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

// ========== WEBHOOK HANDLER'LAR ==========

/**
 * Meta webhook doğrulaması (ilk kurulumda bir kez çağrılır)
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook doğrulandı');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

/**
 * Gelen mesajları işle
 * Meta her mesaj/durum değişikliğinde buraya POST atar
 */
async function handleWebhook(req, res) {
  // Meta 200 OK bekler — geç cevap verirseniz tekrar gönderir
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Durum güncellemeleri (delivered, read) — loglama için
    if (value?.statuses) {
      const status = value.statuses[0];
      logger.info(`Mesaj ${status.id}: ${status.status}`);
      return;
    }

    // Gelen mesaj
    if (value?.messages) {
      const message = value.messages[0];
      const contact = value.contacts?.[0];
      const from = message.from; // Müşteri telefon numarası (905xxxxxxxxx)
      const name = contact?.profile?.name || 'Müşteri';

      logger.info(`Gelen mesaj: ${from} (${name}) — Tip: ${message.type}`);

      // Konuşma yöneticisine gönder
      await processMessage(from, name, message);
    }
  } catch (error) {
    logger.error('Webhook işleme hatası:', error);
  }
}

// ========== MESAJ GÖNDERME FONKSİYONLARI ==========

/**
 * Düz metin mesajı gönder
 */
async function sendTextMessage(to, text) {
  return sendMessage(to, { type: 'text', text: { body: text } });
}

/**
 * Reply Buttons mesajı gönder (max 3 buton)
 * Müşteri butona basarak seçim yapar
 */
async function sendButtonMessage(to, bodyText, buttons) {
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn, i) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title.substring(0, 20) }
        }))
      }
    }
  });
}

/**
 * List Message gönder (max 10 seçenek)
 * Materyal seçimi gibi çok seçenekli durumlar için
 */
async function sendListMessage(to, bodyText, buttonText, sections) {
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText.substring(0, 20),
        sections: sections
      }
    }
  });
}

/**
 * CTA URL Button — Ödeme linki için
 */
async function sendCTAButton(to, bodyText, buttonText, url) {
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: buttonText,
          url: url
        }
      }
    }
  });
}

/**
 * Medya dosyası indir (müşterinin gönderdiği baskı dosyası)
 */
async function downloadMedia(mediaId) {
  // 1. Media URL'sini al
  const urlResponse = await axios.get(
    `${GRAPH_API}/${mediaId}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );

  // 2. Dosyayı indir
  const fileResponse = await axios.get(urlResponse.data.url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: 'arraybuffer'
  });

  return {
    buffer: fileResponse.data,
    mimeType: urlResponse.data.mime_type,
    fileSize: urlResponse.data.file_size
  };
}

/**
 * Temel mesaj gönderme fonksiyonu
 */
async function sendMessage(to, messageContent) {
  try {
    const response = await axios.post(
      `${GRAPH_API}/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        ...messageContent
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`Mesaj gönderildi: ${to} — ID: ${response.data.messages[0].id}`);
    return response.data;
  } catch (error) {
    logger.error(`Mesaj gönderme hatası (${to}):`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  verifyWebhook,
  handleWebhook,
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendCTAButton,
  downloadMedia
};
```

### 2.5 Konuşma Yöneticisi — State Machine (services/conversationManager.js)

```javascript
const {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendCTAButton,
  downloadMedia
} = require('./whatsappService');
const { calculatePrice } = require('./priceCalculator');
const { createCustomer, createOrder, getOrderStatus } = require('./woocommerceService');
const { saveFile } = require('./fileService');
const { validateEmail, validateSize, validatePhone } = require('../utils/validator');
const logger = require('../utils/logger');

// ========== KONUŞMA DURUMLARI ==========
// Her müşterinin hangi adımda olduğunu takip eder

const conversations = new Map(); // Prodüksiyonda Redis veya SQLite kullanılmalı

const STATES = {
  IDLE: 'IDLE',                       // Başlangıç
  MAIN_MENU: 'MAIN_MENU',            // Ana menü gösterildi
  SELECT_MATERIAL: 'SELECT_MATERIAL', // Malzeme seçimi bekleniyor
  SELECT_SIZE: 'SELECT_SIZE',         // Boyut girişi bekleniyor
  ENTER_CUSTOM_SIZE: 'ENTER_CUSTOM_SIZE', // Özel boyut girişi
  SELECT_QUANTITY: 'SELECT_QUANTITY', // Adet seçimi bekleniyor
  ENTER_CUSTOM_QTY: 'ENTER_CUSTOM_QTY', // Özel adet girişi
  SELECT_LAMINATION: 'SELECT_LAMINATION', // Laminasyon seçimi
  SHOW_PRICE: 'SHOW_PRICE',          // Fiyat gösterildi, onay bekleniyor
  ENTER_EMAIL: 'ENTER_EMAIL',        // E-posta girişi
  ENTER_ADDRESS: 'ENTER_ADDRESS',    // Adres girişi
  ENTER_COMPANY: 'ENTER_COMPANY',    // Firma adı (opsiyonel)
  CONFIRM_ORDER: 'CONFIRM_ORDER',    // Sipariş onayı
  AWAITING_PAYMENT: 'AWAITING_PAYMENT', // Ödeme bekleniyor
  AWAITING_FILE: 'AWAITING_FILE',    // Baskı dosyası bekleniyor
  ORDER_TRACKING: 'ORDER_TRACKING',  // Sipariş takip
};

// ========== MALZEME TİPLERİ ==========
const MATERIALS = {
  'kuse': { name: 'Kuşe Etiket', code: 'kuse', priceMultiplier: 1.0 },
  'kraft': { name: 'Kraft Etiket', code: 'kraft', priceMultiplier: 1.15 },
  'seffaf_pp': { name: 'Şeffaf PP Etiket', code: 'seffaf_pp', priceMultiplier: 1.40 },
  'beyaz_pp': { name: 'Beyaz PP Etiket', code: 'beyaz_pp', priceMultiplier: 1.35 },
  'vellum': { name: 'Vellum Etiket', code: 'vellum', priceMultiplier: 1.20 },
  'silver': { name: 'Silver Etiket', code: 'silver', priceMultiplier: 1.80 },
  'gold': { name: 'Gold Etiket', code: 'gold', priceMultiplier: 1.85 },
  'hologram': { name: 'Hologram Etiket', code: 'hologram', priceMultiplier: 2.10 },
};

// ========== ANA İŞLEME FONKSİYONU ==========

async function processMessage(from, name, message) {
  // Mevcut konuşma durumunu al veya yeni başlat
  let conv = conversations.get(from) || {
    state: STATES.IDLE,
    name: name,
    data: {},
    lastActivity: Date.now()
  };

  conv.lastActivity = Date.now();

  // Mesaj tipine göre içeriği çıkar
  const msgContent = extractMessageContent(message);

  try {
    // "iptal" veya "sıfırla" komutu — her zaman çalışır
    if (msgContent.text && ['iptal', 'sıfırla', 'vazgeç', 'cancel'].includes(msgContent.text.toLowerCase().trim())) {
      conversations.delete(from);
      await sendTextMessage(from, 'İşlem iptal edildi. Yeniden başlamak için herhangi bir mesaj gönderin. 👋');
      return;
    }

    // Duruma göre işle
    switch (conv.state) {
      case STATES.IDLE:
        await handleIdle(from, name, conv, msgContent);
        break;
      case STATES.MAIN_MENU:
        await handleMainMenu(from, conv, msgContent);
        break;
      case STATES.SELECT_MATERIAL:
        await handleMaterialSelect(from, conv, msgContent);
        break;
      case STATES.SELECT_SIZE:
        await handleSizeSelect(from, conv, msgContent);
        break;
      case STATES.ENTER_CUSTOM_SIZE:
        await handleCustomSize(from, conv, msgContent);
        break;
      case STATES.SELECT_QUANTITY:
        await handleQuantitySelect(from, conv, msgContent);
        break;
      case STATES.ENTER_CUSTOM_QTY:
        await handleCustomQuantity(from, conv, msgContent);
        break;
      case STATES.SELECT_LAMINATION:
        await handleLamination(from, conv, msgContent);
        break;
      case STATES.SHOW_PRICE:
        await handlePriceResponse(from, conv, msgContent);
        break;
      case STATES.ENTER_EMAIL:
        await handleEmail(from, conv, msgContent);
        break;
      case STATES.ENTER_ADDRESS:
        await handleAddress(from, conv, msgContent);
        break;
      case STATES.ENTER_COMPANY:
        await handleCompany(from, conv, msgContent);
        break;
      case STATES.CONFIRM_ORDER:
        await handleOrderConfirm(from, conv, msgContent);
        break;
      case STATES.AWAITING_FILE:
        await handleFileUpload(from, conv, message);
        break;
      case STATES.ORDER_TRACKING:
        await handleOrderTracking(from, conv, msgContent);
        break;
      default:
        await handleIdle(from, name, conv, msgContent);
    }

    // Konuşma durumunu kaydet
    conversations.set(from, conv);

  } catch (error) {
    logger.error(`İşleme hatası (${from}):`, error);
    await sendTextMessage(from,
      'Bir hata oluştu, özür dileriz. Lütfen tekrar deneyin veya "iptal" yazın.'
    );
  }
}

// ========== DURUM İŞLEYİCİLERİ ==========

/**
 * İlk mesaj — Karşılama ve Ana Menü
 */
async function handleIdle(from, name, conv, msgContent) {
  const firstName = name.split(' ')[0];

  await sendTextMessage(from,
    `Merhaba ${firstName}! 🏷️\n\n` +
    `1etiket.com.tr'ye hoş geldiniz.\n` +
    `Etiket ve sticker baskı siparişleriniz için buradayız.`
  );

  await sendButtonMessage(from,
    'Size nasıl yardımcı olabilirim?',
    [
      { id: 'new_order', title: '🛒 Sipariş Ver' },
      { id: 'price_inquiry', title: '💰 Fiyat Öğren' },
      { id: 'track_order', title: '📦 Sipariş Takip' }
    ]
  );

  conv.state = STATES.MAIN_MENU;
}

/**
 * Ana menü seçimi
 */
async function handleMainMenu(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'new_order' || selection === 'price_inquiry' ||
      selection?.includes('sipariş') || selection?.includes('fiyat') ||
      selection?.includes('etiket')) {
    // Malzeme seçim listesini göster
    await sendListMessage(from,
      '📋 Etiket malzemesini seçin:\n\n' +
      'Kuşe etiket en çok tercih edilen standart malzemedir.',
      'Malzeme Seç',
      [{
        title: 'Etiket Malzemeleri',
        rows: Object.entries(MATERIALS).map(([id, mat]) => ({
          id: id,
          title: mat.name,
          description: mat.code === 'kuse' ? '⭐ En çok tercih edilen' : ''
        }))
      }]
    );
    conv.data.isQuoteOnly = (selection === 'price_inquiry');
    conv.state = STATES.SELECT_MATERIAL;

  } else if (selection === 'track_order' || selection?.includes('takip')) {
    await sendTextMessage(from,
      '📦 Sipariş takibi için sipariş numaranızı girin:\n(Örnek: 12345)'
    );
    conv.state = STATES.ORDER_TRACKING;

  } else {
    // Anlaşılamayan mesaj — ana menüyü tekrar göster
    await sendButtonMessage(from,
      'Anlayamadım. Lütfen aşağıdaki seçeneklerden birini seçin:',
      [
        { id: 'new_order', title: '🛒 Sipariş Ver' },
        { id: 'price_inquiry', title: '💰 Fiyat Öğren' },
        { id: 'track_order', title: '📦 Sipariş Takip' }
      ]
    );
  }
}

/**
 * Malzeme seçimi
 */
async function handleMaterialSelect(from, conv, msgContent) {
  const materialId = msgContent.listId || msgContent.text?.toLowerCase();
  const material = MATERIALS[materialId];

  if (!material) {
    await sendTextMessage(from, 'Geçersiz seçim. Lütfen listeden bir malzeme seçin.');
    return;
  }

  conv.data.material = material;

  await sendButtonMessage(from,
    `✅ ${material.name} seçildi.\n\nŞimdi etiket boyutunu seçin:`,
    [
      { id: 'size_50x50', title: '50×50 mm' },
      { id: 'size_100x50', title: '100×50 mm' },
      { id: 'size_custom', title: '📐 Özel Boyut' }
    ]
  );

  conv.state = STATES.SELECT_SIZE;
}

/**
 * Boyut seçimi
 */
async function handleSizeSelect(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'size_50x50') {
    conv.data.width = 50;
    conv.data.height = 50;
    await showQuantityOptions(from, conv);
  } else if (selection === 'size_100x50') {
    conv.data.width = 100;
    conv.data.height = 50;
    await showQuantityOptions(from, conv);
  } else if (selection === 'size_custom') {
    await sendTextMessage(from,
      '📐 Özel boyutu mm cinsinden girin:\n' +
      'Format: GenişlikxYükseklik\n' +
      'Örnek: 75x50 veya 70x70'
    );
    conv.state = STATES.ENTER_CUSTOM_SIZE;
  } else {
    // Belki doğrudan boyut yazmıştır: "7x7" gibi
    const parsed = parseSize(selection);
    if (parsed) {
      conv.data.width = parsed.width;
      conv.data.height = parsed.height;
      await showQuantityOptions(from, conv);
    } else {
      await sendTextMessage(from, 'Geçersiz boyut. Örnek format: 75x50');
    }
  }
}

/**
 * Özel boyut girişi
 */
async function handleCustomSize(from, conv, msgContent) {
  const parsed = parseSize(msgContent.text);

  if (!parsed) {
    await sendTextMessage(from,
      '❌ Geçersiz format. Lütfen şu formatta girin: GenişlikxYükseklik\n' +
      'Örnek: 75x50, 100x70, 30x20'
    );
    return;
  }

  if (parsed.width < 10 || parsed.width > 500 || parsed.height < 10 || parsed.height > 500) {
    await sendTextMessage(from,
      '❌ Boyut 10mm ile 500mm arasında olmalıdır. Lütfen tekrar girin.'
    );
    return;
  }

  conv.data.width = parsed.width;
  conv.data.height = parsed.height;
  await showQuantityOptions(from, conv);
}

/**
 * Adet seçeneklerini göster
 */
async function showQuantityOptions(from, conv) {
  await sendButtonMessage(from,
    `📏 Boyut: ${conv.data.width}×${conv.data.height} mm\n\nKaç adet sipariş vermek istersiniz?`,
    [
      { id: 'qty_100', title: '100 Adet' },
      { id: 'qty_500', title: '500 Adet' },
      { id: 'qty_custom', title: '✏️ Farklı Adet' }
    ]
  );
  conv.state = STATES.SELECT_QUANTITY;
}

/**
 * Adet seçimi
 */
async function handleQuantitySelect(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'qty_100') {
    conv.data.quantity = 100;
  } else if (selection === 'qty_500') {
    conv.data.quantity = 500;
  } else if (selection === 'qty_custom') {
    await sendTextMessage(from, '✏️ Kaç adet istediğinizi yazın (min: 50):');
    conv.state = STATES.ENTER_CUSTOM_QTY;
    return;
  } else {
    const qty = parseInt(selection);
    if (qty && qty >= 50) {
      conv.data.quantity = qty;
    } else {
      await sendTextMessage(from, 'Geçersiz adet. Minimum 50 adet sipariş verilir.');
      return;
    }
  }

  await showLaminationOptions(from, conv);
}

/**
 * Özel adet girişi
 */
async function handleCustomQuantity(from, conv, msgContent) {
  const qty = parseInt(msgContent.text);

  if (!qty || qty < 50) {
    await sendTextMessage(from, '❌ Minimum sipariş adedi 50\'dir. Lütfen geçerli bir adet girin.');
    return;
  }

  if (qty > 1000000) {
    await sendTextMessage(from, '❌ Çok yüksek adet. Lütfen 1.000.000 ve altı girin veya toptan teklif için bizi arayın.');
    return;
  }

  conv.data.quantity = qty;
  await showLaminationOptions(from, conv);
}

/**
 * Laminasyon seçenekleri
 */
async function showLaminationOptions(from, conv) {
  await sendButtonMessage(from,
    'Laminasyon ister misiniz?',
    [
      { id: 'lam_none', title: 'Laminasyonsuz' },
      { id: 'lam_glossy', title: 'Parlak Laminasyon' },
      { id: 'lam_matte', title: 'Mat Laminasyon' }
    ]
  );
  conv.state = STATES.SELECT_LAMINATION;
}

/**
 * Laminasyon seçimi ve fiyat hesaplama
 */
async function handleLamination(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  const laminationMap = {
    'lam_none': 'none',
    'lam_glossy': 'glossy',
    'lam_matte': 'matte'
  };

  conv.data.lamination = laminationMap[selection] || 'none';

  // Fiyat hesapla
  await sendTextMessage(from, '⏳ Fiyat hesaplanıyor...');

  try {
    const priceResult = await calculatePrice({
      material: conv.data.material.code,
      width: conv.data.width,
      height: conv.data.height,
      quantity: conv.data.quantity,
      lamination: conv.data.lamination
    });

    conv.data.price = priceResult;

    const laminationText = {
      'none': 'Yok',
      'glossy': 'Parlak',
      'matte': 'Mat'
    };

    await sendTextMessage(from,
      `📋 *SİPARİŞ ÖZETİ*\n\n` +
      `🏷️ Malzeme: ${conv.data.material.name}\n` +
      `📏 Boyut: ${conv.data.width}×${conv.data.height} mm\n` +
      `📦 Adet: ${conv.data.quantity.toLocaleString('tr-TR')}\n` +
      `✨ Laminasyon: ${laminationText[conv.data.lamination]}\n\n` +
      `💰 *Birim Fiyat: ${priceResult.unitPrice} ₺*\n` +
      `💰 *Toplam: ${priceResult.totalPrice} ₺* (KDV dahil)\n` +
      `🚚 Tahmini Teslimat: ${priceResult.deliveryDays} iş günü`
    );

    if (conv.data.isQuoteOnly) {
      await sendButtonMessage(from,
        'Bu fiyatla sipariş vermek ister misiniz?',
        [
          { id: 'confirm_order', title: '✅ Sipariş Ver' },
          { id: 'change_options', title: '🔄 Değiştir' },
          { id: 'cancel', title: '❌ Kapat' }
        ]
      );
    } else {
      await sendButtonMessage(from,
        'Siparişi onaylıyor musunuz?',
        [
          { id: 'confirm_order', title: '✅ Onayla' },
          { id: 'change_options', title: '🔄 Değiştir' },
          { id: 'cancel_order', title: '❌ İptal' }
        ]
      );
    }

    conv.state = STATES.SHOW_PRICE;
  } catch (error) {
    logger.error('Fiyat hesaplama hatası:', error);
    await sendTextMessage(from,
      '❌ Fiyat hesaplanamadı. Lütfen tekrar deneyin veya bizi arayın.'
    );
  }
}

/**
 * Fiyat gösterildi — müşteri yanıtı
 */
async function handlePriceResponse(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'confirm_order' || selection?.includes('onayla') || selection?.includes('evet')) {
    await sendTextMessage(from,
      '📧 Harika! Hesabınızı oluşturmak için e-posta adresinizi girin:'
    );
    conv.state = STATES.ENTER_EMAIL;

  } else if (selection === 'change_options' || selection?.includes('değiştir')) {
    conv.data = {};
    await handleIdle(from, conv.name, conv, msgContent);

  } else if (selection === 'cancel_order' || selection === 'cancel' || selection?.includes('iptal')) {
    conversations.delete(from);
    await sendTextMessage(from,
      'Sipariş iptal edildi. Tekrar görüşmek üzere! 👋'
    );
  }
}

/**
 * E-posta girişi
 */
async function handleEmail(from, conv, msgContent) {
  const email = msgContent.text?.trim();

  if (!validateEmail(email)) {
    await sendTextMessage(from,
      '❌ Geçersiz e-posta adresi. Lütfen doğru formatta girin:\nÖrnek: info@firma.com'
    );
    return;
  }

  conv.data.email = email;
  await sendTextMessage(from,
    '📍 Teslimat adresinizi girin:\n(İl, ilçe, açık adres)'
  );
  conv.state = STATES.ENTER_ADDRESS;
}

/**
 * Adres girişi
 */
async function handleAddress(from, conv, msgContent) {
  const address = msgContent.text?.trim();

  if (!address || address.length < 10) {
    await sendTextMessage(from,
      '❌ Adres çok kısa. Lütfen il, ilçe ve açık adresi eksiksiz girin.'
    );
    return;
  }

  conv.data.address = address;

  await sendButtonMessage(from,
    'Firma adı eklemek ister misiniz? (Fatura için)',
    [
      { id: 'add_company', title: '🏢 Firma Adı Ekle' },
      { id: 'skip_company', title: '👤 Bireysel Devam' }
    ]
  );
  conv.state = STATES.ENTER_COMPANY;
}

/**
 * Firma adı (opsiyonel)
 */
async function handleCompany(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text;

  if (selection === 'add_company') {
    await sendTextMessage(from, '🏢 Firma adınızı yazın:');
    conv.state = 'AWAITING_COMPANY_NAME';
    return;
  }

  if (selection === 'skip_company') {
    conv.data.company = '';
  } else {
    // Firma adı yazılmış
    conv.data.company = selection;
  }

  await showOrderSummary(from, conv);
}

/**
 * Son sipariş özeti ve onay
 */
async function showOrderSummary(from, conv) {
  const laminationText = {
    'none': 'Yok', 'glossy': 'Parlak', 'matte': 'Mat'
  };

  await sendTextMessage(from,
    `📋 *SON SİPARİŞ ÖZETİ*\n\n` +
    `🏷️ ${conv.data.material.name}\n` +
    `📏 ${conv.data.width}×${conv.data.height} mm\n` +
    `📦 ${conv.data.quantity.toLocaleString('tr-TR')} adet\n` +
    `✨ Laminasyon: ${laminationText[conv.data.lamination]}\n` +
    `💰 Toplam: ${conv.data.price.totalPrice} ₺\n\n` +
    `📧 ${conv.data.email}\n` +
    `📍 ${conv.data.address}\n` +
    (conv.data.company ? `🏢 ${conv.data.company}\n` : '') +
    `📱 ${from}`
  );

  await sendButtonMessage(from,
    'Her şey doğru mu? Siparişi oluşturayım mı?',
    [
      { id: 'final_confirm', title: '✅ Oluştur' },
      { id: 'final_cancel', title: '❌ İptal Et' }
    ]
  );

  conv.state = STATES.CONFIRM_ORDER;
}

/**
 * Sipariş oluşturma — WooCommerce entegrasyonu
 */
async function handleOrderConfirm(from, conv, msgContent) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  if (selection === 'final_cancel' || selection?.includes('iptal')) {
    conversations.delete(from);
    await sendTextMessage(from, 'Sipariş iptal edildi. Tekrar bekleriz! 👋');
    return;
  }

  if (selection !== 'final_confirm' && !selection?.includes('oluştur') && !selection?.includes('evet')) {
    await sendButtonMessage(from, 'Lütfen onaylayın veya iptal edin:', [
      { id: 'final_confirm', title: '✅ Oluştur' },
      { id: 'final_cancel', title: '❌ İptal Et' }
    ]);
    return;
  }

  await sendTextMessage(from, '⏳ Hesabınız ve siparişiniz oluşturuluyor...');

  try {
    // 1. WooCommerce'de müşteri hesabı oluştur
    const customer = await createCustomer({
      email: conv.data.email,
      first_name: conv.name.split(' ')[0],
      last_name: conv.name.split(' ').slice(1).join(' ') || '',
      phone: from,
      address: conv.data.address,
      company: conv.data.company || ''
    });

    conv.data.customerId = customer.id;

    // 2. Siparişi oluştur
    const order = await createOrder({
      customerId: customer.id,
      material: conv.data.material,
      width: conv.data.width,
      height: conv.data.height,
      quantity: conv.data.quantity,
      lamination: conv.data.lamination,
      totalPrice: conv.data.price.totalPrice,
      unitPrice: conv.data.price.unitPrice
    });

    conv.data.orderId = order.id;
    conv.data.orderNumber = order.number;
    conv.data.paymentUrl = order.payment_url;

    // 3. Müşteriye bildir
    await sendTextMessage(from,
      `✅ *SİPARİŞİNİZ OLUŞTURULDU!*\n\n` +
      `📋 Sipariş No: #${order.number}\n` +
      `🔐 Hesap Şifreniz: 123456\n` +
      `📧 Giriş: ${conv.data.email}\n\n` +
      `Siparişinizi takip etmek için:\n` +
      `🌐 https://1etiket.com.tr/hesabim/\n\n` +
      `⚠️ Lütfen şifrenizi giriş yaptıktan sonra değiştirin.`
    );

    // 4. Ödeme linki gönder
    await sendCTAButton(from,
      `💳 Ödemenizi aşağıdaki linkten yapabilirsiniz:\n\n` +
      `Havale/EFT veya Kredi Kartı ile ödeyebilirsiniz.\n` +
      `Toplam: ${conv.data.price.totalPrice} ₺`,
      '💳 Ödeme Yap',
      order.payment_url
    );

    // 5. Baskı dosyası iste
    setTimeout(async () => {
      await sendTextMessage(from,
        `📎 Son adım! Baskı dosyanızı gönderin:\n\n` +
        `Kabul edilen formatlar:\n` +
        `• PDF (tercih edilen)\n` +
        `• AI (Adobe Illustrator)\n` +
        `• PNG/JPEG (min 300 DPI)\n\n` +
        `Dosyayı bu sohbete sürükleyip bırakın veya 📎 simgesine basın.`
      );
      conv.state = STATES.AWAITING_FILE;
      conversations.set(from, conv);
    }, 3000);

  } catch (error) {
    logger.error('Sipariş oluşturma hatası:', error);
    await sendTextMessage(from,
      '❌ Sipariş oluşturulurken bir hata oluştu. ' +
      'Lütfen tekrar deneyin veya 0212 XXX XX XX numarasından bizi arayın.'
    );
  }
}

/**
 * Baskı dosyası yükleme
 */
async function handleFileUpload(from, conv, message) {
  if (message.type === 'document' || message.type === 'image') {
    const mediaId = message.document?.id || message.image?.id;
    const fileName = message.document?.filename || `baski_${conv.data.orderId}.jpg`;
    const mimeType = message.document?.mime_type || message.image?.mime_type;

    // Desteklenen formatları kontrol et
    const allowedTypes = [
      'application/pdf',
      'image/png', 'image/jpeg',
      'application/postscript', // AI dosyaları
      'application/illustrator'
    ];

    // Dosyayı indir ve kaydet
    try {
      await sendTextMessage(from, '⏳ Dosyanız alınıyor...');

      const media = await downloadMedia(mediaId);
      const savedPath = await saveFile(media.buffer, fileName, conv.data.orderId);

      await sendTextMessage(from,
        `✅ Dosyanız başarıyla alındı!\n\n` +
        `📎 Dosya: ${fileName}\n` +
        `📋 Sipariş: #${conv.data.orderNumber}\n\n` +
        `Siparişiniz baskı kuyruğuna alındı. ` +
        `Durum güncellemelerini bu sohbetten takip edebilirsiniz.\n\n` +
        `Teşekkür ederiz! 🙏`
      );

      // Konuşmayı tamamla
      conv.state = STATES.IDLE;

    } catch (error) {
      logger.error('Dosya indirme hatası:', error);
      await sendTextMessage(from,
        '❌ Dosya alınamadı. Lütfen tekrar gönderin veya e-posta ile gönderin: info@1etiket.com.tr'
      );
    }
  } else {
    await sendTextMessage(from,
      '📎 Lütfen baskı dosyanızı gönderin (PDF, PNG, JPEG veya AI).\n' +
      'Dosya göndermek için 📎 simgesine basın.'
    );
  }
}

/**
 * Sipariş takip
 */
async function handleOrderTracking(from, conv, msgContent) {
  const orderNumber = msgContent.text?.trim();

  if (!orderNumber || isNaN(orderNumber)) {
    await sendTextMessage(from, '❌ Geçersiz sipariş numarası. Lütfen sadece rakam girin.');
    return;
  }

  try {
    const status = await getOrderStatus(orderNumber);

    const statusText = {
      'pending': '⏳ Ödeme Bekleniyor',
      'processing': '🖨️ Hazırlanıyor / Baskıda',
      'on-hold': '⏸️ Beklemede',
      'completed': '✅ Tamamlandı',
      'shipped': '📦 Kargoya Verildi',
      'cancelled': '❌ İptal Edildi',
      'refunded': '💰 İade Edildi'
    };

    await sendTextMessage(from,
      `📦 *Sipariş #${orderNumber}*\n\n` +
      `Durum: ${statusText[status.status] || status.status}\n` +
      `Tarih: ${status.date}\n` +
      `Toplam: ${status.total} ₺\n` +
      (status.tracking ? `🚚 Kargo Takip: ${status.tracking}\n` : '') +
      `\n🌐 Detay: https://1etiket.com.tr/hesabim/`
    );

    conv.state = STATES.IDLE;
  } catch (error) {
    await sendTextMessage(from,
      `❌ Sipariş #${orderNumber} bulunamadı. Lütfen sipariş numaranızı kontrol edin.`
    );
  }
}

// ========== YARDIMCI FONKSİYONLAR ==========

/**
 * Mesaj içeriğini tipine göre çıkar
 */
function extractMessageContent(message) {
  switch (message.type) {
    case 'text':
      return { text: message.text.body, type: 'text' };
    case 'interactive':
      if (message.interactive.type === 'button_reply') {
        return {
          buttonId: message.interactive.button_reply.id,
          text: message.interactive.button_reply.title,
          type: 'button'
        };
      }
      if (message.interactive.type === 'list_reply') {
        return {
          listId: message.interactive.list_reply.id,
          text: message.interactive.list_reply.title,
          type: 'list'
        };
      }
      return { text: '', type: 'interactive' };
    case 'document':
      return { text: '', type: 'document', document: message.document };
    case 'image':
      return { text: '', type: 'image', image: message.image };
    default:
      return { text: '', type: message.type };
  }
}

/**
 * Boyut string'ini parse et: "75x50", "75*50", "75 x 50"
 */
function parseSize(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*[x×*]\s*(\d+)/i);
  if (!match) return null;
  return { width: parseInt(match[1]), height: parseInt(match[2]) };
}

module.exports = { processMessage };
```

### 2.6 Fiyat Hesaplama Servisi (services/priceCalculator.js)

```javascript
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * WordPress'teki fiyat hesaplama API'sini çağır
 * Bu endpoint mevcut WooCommerce fiyat mantığını kullanır
 */
async function calculatePrice({ material, width, height, quantity, lamination }) {
  try {
    const response = await axios.post(process.env.PRICE_API_URL, {
      material,
      width,    // mm cinsinden
      height,   // mm cinsinden
      quantity,
      lamination
    }, {
      headers: {
        'X-API-Key': process.env.PRICE_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      unitPrice: response.data.unit_price,
      totalPrice: response.data.total_price,
      deliveryDays: response.data.delivery_days || '3-5',
      discount: response.data.discount || 0
    };
  } catch (error) {
    logger.error('Fiyat API hatası:', error.response?.data || error.message);

    // Fallback: yerel hesaplama (API çalışmazsa)
    return calculatePriceLocal({ material, width, height, quantity, lamination });
  }
}

/**
 * Yerel fallback fiyat hesaplama
 * API çalışmazsa bu fonksiyon devreye girer
 * ÖNEMLİ: Bu fiyatları kendi birim fiyatlarınıza göre güncelleyin!
 */
function calculatePriceLocal({ material, width, height, quantity, lamination }) {
  // Temel birim fiyatlar (₺/cm²) — GÜNCELLENECEK!
  const basePrices = {
    'kuse': 0.005,
    'kraft': 0.006,
    'seffaf_pp': 0.008,
    'beyaz_pp': 0.007,
    'vellum': 0.006,
    'silver': 0.010,
    'gold': 0.011,
    'hologram': 0.013
  };

  // Alan hesabı (mm → cm)
  const areaCm2 = (width / 10) * (height / 10);

  // Temel birim fiyat
  let unitPrice = areaCm2 * (basePrices[material] || 0.005);

  // Laminasyon çarpanı
  const laminationMultiplier = {
    'none': 1.0,
    'glossy': 1.15,
    'matte': 1.18
  };
  unitPrice *= laminationMultiplier[lamination] || 1.0;

  // Miktar indirimi
  let discount = 0;
  if (quantity >= 5000) discount = 0.30;
  else if (quantity >= 1000) discount = 0.20;
  else if (quantity >= 500) discount = 0.10;
  else if (quantity >= 250) discount = 0.05;

  unitPrice *= (1 - discount);

  // Minimum birim fiyat
  unitPrice = Math.max(unitPrice, 0.02);

  const totalPrice = unitPrice * quantity;

  // Teslimat süresi
  let deliveryDays = '3-5';
  if (quantity > 5000) deliveryDays = '5-7';
  if (quantity > 10000) deliveryDays = '7-10';

  return {
    unitPrice: unitPrice.toFixed(4),
    totalPrice: totalPrice.toFixed(2),
    deliveryDays,
    discount: Math.round(discount * 100)
  };
}

module.exports = { calculatePrice };
```

### 2.7 WooCommerce Servisi (services/woocommerceService.js)

```javascript
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const logger = require('../utils/logger');

const WooCommerce = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: 'wc/v3'
});

/**
 * Müşteri oluştur veya mevcut müşteriyi bul
 * Telefon numarasına göre eşleştirme yapılır
 */
async function createCustomer({ email, first_name, last_name, phone, address, company }) {
  try {
    // Önce mevcut müşteriyi kontrol et (e-posta ile)
    const existing = await WooCommerce.get('customers', { email: email });

    if (existing.data && existing.data.length > 0) {
      logger.info(`Mevcut müşteri bulundu: ${email} (ID: ${existing.data[0].id})`);

      // WhatsApp numarasını güncelle
      await WooCommerce.put(`customers/${existing.data[0].id}`, {
        meta_data: [
          { key: 'whatsapp_number', value: phone },
          { key: 'order_source', value: 'whatsapp' }
        ]
      });

      return existing.data[0];
    }

    // Yeni müşteri oluştur
    const newCustomer = await WooCommerce.post('customers', {
      email: email,
      first_name: first_name,
      last_name: last_name || '',
      username: email.split('@')[0] + '_' + Date.now().toString(36),
      password: '123456', // Standart başlangıç şifresi
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
async function createOrder({ customerId, material, width, height, quantity, lamination, totalPrice, unitPrice }) {
  try {
    const laminationText = { 'none': 'Yok', 'glossy': 'Parlak', 'matte': 'Mat' };

    const order = await WooCommerce.post('orders', {
      customer_id: customerId,
      status: 'pending', // Ödeme bekliyor
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
  try {
    const orders = await WooCommerce.get('orders', {
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
  // Türkiye il listesi ile eşleştirme
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

  const addressLower = address.toLowerCase();
  for (const city of cities) {
    if (addressLower.includes(city)) {
      return city.charAt(0).toUpperCase() + city.slice(1);
    }
  }
  return '';
}

module.exports = { createCustomer, createOrder, getOrderStatus };
```

### 2.8 Dosya Servisi (services/fileService.js)

```javascript
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads/baski-dosyalari';

/**
 * Baskı dosyasını kaydet
 * Her sipariş için ayrı klasör oluşturur
 */
async function saveFile(buffer, fileName, orderId) {
  const orderDir = path.join(UPLOAD_DIR, `siparis_${orderId}`);

  // Klasörü oluştur
  await fs.mkdir(orderDir, { recursive: true });

  // Güvenli dosya adı
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const finalName = `${timestamp}_${safeName}`;
  const filePath = path.join(orderDir, finalName);

  // Dosyayı yaz
  await fs.writeFile(filePath, buffer);

  logger.info(`Dosya kaydedildi: ${filePath} (${buffer.length} bytes)`);

  return filePath;
}

module.exports = { saveFile };
```

### 2.9 Doğrulama Fonksiyonları (utils/validator.js)

```javascript
/**
 * E-posta doğrulama
 */
function validateEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Boyut doğrulama (mm cinsinden)
 */
function validateSize(width, height) {
  return width >= 10 && width <= 500 && height >= 10 && height <= 500;
}

/**
 * Telefon numarası doğrulama (Türkiye)
 */
function validatePhone(phone) {
  // WhatsApp formatı: 905xxxxxxxxx (12 hane)
  const re = /^90[5][0-9]{9}$/;
  return re.test(phone);
}

module.exports = { validateEmail, validateSize, validatePhone };
```

### 2.10 Logger (utils/logger.js)

```javascript
const logger = {
  info: (msg, ...args) => {
    console.log(`[${new Date().toISOString()}] [INFO] ${msg}`, ...args);
  },
  error: (msg, ...args) => {
    console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, ...args);
  },
  warn: (msg, ...args) => {
    console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`, ...args);
  }
};

module.exports = logger;
```

### 2.11 Package.json

```json
{
  "name": "1etiket-whatsapp-bot",
  "version": "1.0.0",
  "description": "1etiket.com.tr WhatsApp sipariş otomasyon botu",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "@woocommerce/woocommerce-rest-api": "^1.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

---

## BÖLÜM 3: WordPress Fiyat Hesaplama API Endpoint'i

Bu PHP kodu, WordPress sitenize eklenir (tema functions.php veya özel plugin).

### 3.1 REST API Endpoint Kayıt

```php
<?php
/**
 * Plugin Name: 1etiket WhatsApp Fiyat API
 * Description: WhatsApp bot için fiyat hesaplama REST API endpoint'i
 * Version: 1.0.0
 */

// Güvenlik kontrolü
if (!defined('ABSPATH')) exit;

/**
 * REST API endpoint'i kaydet
 */
add_action('rest_api_init', function() {

    // Fiyat hesaplama endpoint'i
    register_rest_route('1etiket/v1', '/calculate-price', [
        'methods'  => 'POST',
        'callback' => 'etiket_calculate_price_api',
        'permission_callback' => 'etiket_verify_api_key',
        'args' => [
            'material' => [
                'required' => true,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'width' => [
                'required' => true,
                'type' => 'number',
                'validate_callback' => function($value) {
                    return is_numeric($value) && $value >= 10 && $value <= 500;
                }
            ],
            'height' => [
                'required' => true,
                'type' => 'number',
                'validate_callback' => function($value) {
                    return is_numeric($value) && $value >= 10 && $value <= 500;
                }
            ],
            'quantity' => [
                'required' => true,
                'type' => 'integer',
                'validate_callback' => function($value) {
                    return is_numeric($value) && $value >= 50;
                }
            ],
            'lamination' => [
                'required' => false,
                'type' => 'string',
                'default' => 'none'
            ]
        ]
    ]);
});

/**
 * API Key doğrulama
 */
function etiket_verify_api_key($request) {
    $api_key = $request->get_header('X-API-Key');
    $valid_key = get_option('etiket_whatsapp_api_key', 'your_default_key_here');

    if ($api_key !== $valid_key) {
        return new WP_Error('unauthorized', 'Geçersiz API anahtarı', ['status' => 401]);
    }
    return true;
}

/**
 * Fiyat hesaplama ana fonksiyonu
 * ÖNEMLİ: Bu fonksiyondaki birim fiyatları kendi fiyatlarınıza göre güncelleyin!
 */
function etiket_calculate_price_api($request) {
    $material   = $request->get_param('material');
    $width      = floatval($request->get_param('width'));
    $height     = floatval($request->get_param('height'));
    $quantity   = intval($request->get_param('quantity'));
    $lamination = $request->get_param('lamination') ?: 'none';

    // Malzeme birim fiyatları (₺/cm²) — KENDİ FİYATLARINIZI GİRİN
    $material_prices = [
        'kuse'       => 0.005,
        'kraft'      => 0.006,
        'seffaf_pp'  => 0.008,
        'beyaz_pp'   => 0.007,
        'vellum'     => 0.006,
        'silver'     => 0.010,
        'gold'       => 0.011,
        'hologram'   => 0.013,
    ];

    if (!isset($material_prices[$material])) {
        return new WP_Error('invalid_material', 'Geçersiz malzeme türü', ['status' => 400]);
    }

    // Alan hesabı (mm → cm²)
    $area_cm2 = ($width / 10) * ($height / 10);

    // Temel birim fiyat
    $unit_price = $area_cm2 * $material_prices[$material];

    // Laminasyon çarpanı
    $lamination_multipliers = [
        'none'   => 1.00,
        'glossy' => 1.15,
        'matte'  => 1.18,
    ];
    $unit_price *= $lamination_multipliers[$lamination] ?? 1.0;

    // Miktar indirimi basamakları
    $discount = 0;
    if ($quantity >= 10000) {
        $discount = 0.35;
    } elseif ($quantity >= 5000) {
        $discount = 0.30;
    } elseif ($quantity >= 1000) {
        $discount = 0.20;
    } elseif ($quantity >= 500) {
        $discount = 0.10;
    } elseif ($quantity >= 250) {
        $discount = 0.05;
    }

    $unit_price *= (1 - $discount);

    // Minimum birim fiyat
    $unit_price = max($unit_price, 0.02);

    // Toplam
    $total_price = $unit_price * $quantity;

    // KDV (%20)
    $kdv_amount = $total_price * 0.20;
    $total_with_kdv = $total_price + $kdv_amount;

    // Teslimat süresi
    $delivery_days = '3-5';
    if ($quantity > 10000) $delivery_days = '7-10';
    elseif ($quantity > 5000) $delivery_days = '5-7';

    return rest_ensure_response([
        'success'       => true,
        'material'      => $material,
        'width'         => $width,
        'height'        => $height,
        'quantity'       => $quantity,
        'lamination'    => $lamination,
        'area_cm2'      => round($area_cm2, 2),
        'unit_price'    => round($unit_price, 4),
        'subtotal'      => round($total_price, 2),
        'kdv_rate'      => 20,
        'kdv_amount'    => round($kdv_amount, 2),
        'total_price'   => round($total_with_kdv, 2),
        'discount'      => round($discount * 100),
        'delivery_days' => $delivery_days,
        'currency'      => 'TRY'
    ]);
}
```

---

## BÖLÜM 4: WooCommerce Webhook ile Sipariş Durumu Bildirimleri

### 4.1 WordPress'te Webhook Ayarı

```
WooCommerce → Ayarlar → Gelişmiş → Webhooks → Webhook Ekle

Webhook 1:
  Ad: WhatsApp Sipariş Güncelleme
  Durum: Aktif
  Konu: Sipariş güncellendi
  Teslim URL: https://api.1etiket.com.tr/webhook/woocommerce
  Gizli: wc_webhook_secret_key_buraya
  API Sürümü: WP REST API v3
```

### 4.2 WooCommerce Webhook Handler (server.js'e eklenecek)

```javascript
const crypto = require('crypto');

// WooCommerce webhook endpoint'i
app.post('/webhook/woocommerce', express.json(), async (req, res) => {
  // İmza doğrulama
  const signature = req.headers['x-wc-webhook-signature'];
  const secret = 'wc_webhook_secret_key_buraya';
  const hash = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('base64');

  if (signature !== hash) {
    return res.status(401).send('Geçersiz imza');
  }

  res.sendStatus(200);

  try {
    const order = req.body;
    const orderId = order.id;
    const status = order.status;

    // WhatsApp numarasını bul
    const whatsappNumber = order.meta_data?.find(m => m.key === 'whatsapp_number')?.value
      || order.billing?.phone;

    if (!whatsappNumber) return;

    // Sadece WhatsApp kaynaklı siparişler için bildirim gönder
    const isWhatsAppOrder = order.meta_data?.find(m =>
      m.key === 'order_source' && m.value === 'whatsapp'
    );

    if (!isWhatsAppOrder) return;

    // Durum değişikliğine göre mesaj gönder
    const statusMessages = {
      'processing': `🖨️ Siparişiniz #${order.number} hazırlanmaya başlandı!`,
      'completed': `✅ Siparişiniz #${order.number} tamamlandı ve kargoya hazır!`,
      'on-hold': `⏸️ Siparişiniz #${order.number} beklemede. Lütfen ödemenizi tamamlayın.`,
      'cancelled': `❌ Siparişiniz #${order.number} iptal edildi.`,
      'refunded': `💰 Siparişiniz #${order.number} için iade işlemi başlatıldı.`
    };

    const message = statusMessages[status];
    if (message) {
      const { sendTextMessage } = require('./services/whatsappService');
      await sendTextMessage(whatsappNumber, message);
      logger.info(`WooCommerce bildirim gönderildi: ${whatsappNumber} — Durum: ${status}`);
    }
  } catch (error) {
    logger.error('WooCommerce webhook hatası:', error);
  }
});
```

---

## BÖLÜM 5: Mesaj Şablonları (Meta Onayı Gerekli)

24 saatlik pencere dışında mesaj göndermek için Meta onaylı şablonlar gerekir.

### 5.1 Oluşturulacak Şablonlar

**Şablon 1: siparis_onay (utility)**
```
Dil: Türkçe (tr)
Kategori: Utility
Başlık: Sipariş Onayı
Body:
Merhaba {{1}}! ✅
Siparişiniz başarıyla alındı.

📋 Sipariş No: #{{2}}
💰 Toplam: {{3}} ₺

Siparişinizi buradan takip edebilirsiniz:
Footer: 1etiket.com.tr
Butonlar:
  [URL] Sipariş Takip → https://1etiket.com.tr/hesabim/
```

**Şablon 2: odeme_hatirlatma (utility)**
```
Dil: Türkçe (tr)
Kategori: Utility
Body:
Merhaba {{1}},
#{{2}} numaralı siparişinizin ödemesi henüz tamamlanmadı.

💰 Tutar: {{3}} ₺
Butonlar:
  [URL] Ödeme Yap → https://1etiket.com.tr/checkout/order-pay/{{4}}
```

**Şablon 3: kargo_bildirim (utility)**
```
Dil: Türkçe (tr)
Kategori: Utility
Body:
📦 Siparişiniz kargoya verildi!

Sipariş No: #{{1}}
Kargo Firması: {{2}}
Takip No: {{3}}
Butonlar:
  [URL] Kargo Takip → {{4}}
```

**Şablon 4: hosgeldin_kampanya (marketing)**
```
Dil: Türkçe (tr)
Kategori: Marketing
Body:
Merhaba {{1}}! 🏷️

İlk siparişinize özel *%15 indirim*!
Kupon kodunuz: HOSGELDIN15

Geçerlilik: {{2}}
Butonlar:
  [URL] Sipariş Ver → https://1etiket.com.tr
  [QUICK_REPLY] Bilgilendirme Alma → STOP
```

### 5.2 Şablon Onay Süreci

```
1. Meta Business Suite → WhatsApp Manager → Message Templates
2. "Create Template" → Kategori seç → İçeriği gir
3. Değişkenler {{1}}, {{2}} formatında tanımla
4. Örnek değerler ekle (onay için zorunlu)
5. Gönder → Onay süresi: 1-24 saat (genellikle birkaç dakika)
```

---

## BÖLÜM 6: Sunucu Kurulumu ve Deployment

### 6.1 Mevcut Sunucuda Kurulum (1etiket.com.tr sunucusu)

```bash
# 1. Node.js kurulumu (zaten yoksa)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. PM2 kurulumu (process manager — sunucu restart'ında otomatik başlar)
sudo npm install -g pm2

# 3. Proje klasörünü oluştur
mkdir -p /var/www/whatsapp-bot
cd /var/www/whatsapp-bot

# 4. Dosyaları yükle (FTP/SCP/Git ile)
# Yukarıdaki tüm dosyaları bu klasöre koyun

# 5. Bağımlılıkları yükle
npm install

# 6. .env dosyasını oluştur ve düzenle
cp .env.example .env
nano .env

# 7. Uygulamayı PM2 ile başlat
pm2 start server.js --name "whatsapp-bot"
pm2 save
pm2 startup  # Sunucu restart'ında otomatik başlat
```

### 6.2 Nginx Reverse Proxy Ayarı

Webhook'un HTTPS üzerinden erişilebilir olması ZORUNLUDUR.

```nginx
# /etc/nginx/sites-available/whatsapp-bot.conf

server {
    listen 443 ssl;
    server_name api.1etiket.com.tr;  # VEYA: 1etiket.com.tr altında /api/ path

    ssl_certificate /etc/letsencrypt/live/1etiket.com.tr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/1etiket.com.tr/privkey.pem;

    # WhatsApp webhook
    location /webhook/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Sağlık kontrolü
    location /health {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

```bash
# Etkinleştir ve yeniden başlat
sudo ln -s /etc/nginx/sites-available/whatsapp-bot.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.3 Alternatif: Mevcut Nginx config'e ekleme

Yeni subdomain oluşturmak istemezseniz mevcut 1etiket.com.tr config'ine ekleyin:

```nginx
# Mevcut server bloğunun içine ekle:
location /api/webhook/ {
    proxy_pass http://127.0.0.1:3000/webhook/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Bu durumda webhook URL'si: `https://1etiket.com.tr/api/webhook/whatsapp`

---

## BÖLÜM 7: Test Planı

### 7.1 Geliştirme Aşaması Testleri

```
1. Meta test numarasını kullanarak temel mesaj gönder/al
2. Her konuşma adımını tek tek test et:
   □ Karşılama mesajı
   □ Ana menü butonları
   □ Malzeme listesi
   □ Boyut seçimi (standart + özel)
   □ Adet seçimi (standart + özel)
   □ Laminasyon seçimi
   □ Fiyat hesaplama (API + fallback)
   □ E-posta girişi (geçerli + geçersiz)
   □ Adres girişi
   □ Firma adı (ekleme + atlama)
   □ Sipariş onay özeti
   □ WooCommerce müşteri oluşturma
   □ WooCommerce sipariş oluşturma
   □ Ödeme linki gönderme
   □ Baskı dosyası alma
   □ Sipariş takip
3. Hata durumlarını test et:
   □ Geçersiz boyut girişi
   □ API timeout
   □ WooCommerce bağlantı hatası
   □ İptal komutu (her adımda)
4. Eşzamanlı 5+ konuşma testi
```

### 7.2 Canlıya Alma Öncesi Kontrol Listesi

```
□ Meta Business doğrulaması tamamlandı
□ Gerçek telefon numarası eklendi ve doğrulandı
□ Kalıcı System User token oluşturuldu
□ Webhook URL HTTPS üzerinden erişilebilir
□ Webhook doğrulaması başarılı
□ Şablon mesajlar onaylandı
□ WooCommerce REST API anahtarları oluşturuldu
□ Fiyat hesaplama API'si çalışıyor
□ PM2 ile uygulama çalışıyor ve otomatik başlatma ayarlı
□ Nginx reverse proxy yapılandırıldı
□ SSL sertifikası geçerli
□ .env dosyasında tüm değişkenler doğru
□ Loglama çalışıyor
□ Hata bildirimi ayarlı (opsiyonel: Telegram bot ile)
□ 10 gerçek test siparişi başarıyla tamamlandı
```

---

## BÖLÜM 8: Konuşma Akış Diyagramı

```
Müşteri mesaj atar
        │
        ▼
┌───────────────────┐
│    KARŞILAMA      │
│  "Merhaba! Size   │
│   nasıl yardımcı  │
│   olabilirim?"    │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│    ANA MENÜ       │
│ [Sipariş Ver]     │──────────────────┐
│ [Fiyat Öğren]     │───┐              │
│ [Sipariş Takip]   │─┐ │              │
└───────────────────┘ │ │              │
                      │ │              │
      ┌───────────────┘ │              │
      ▼                 ▼              │
┌──────────┐   ┌───────────────┐       │
│  SİPARİŞ │   │   MALZEME     │◀──────┘
│  TAKİP   │   │   SEÇİMİ     │
│          │   │ (8 seçenek)   │
│ Sipariş  │   └───────┬───────┘
│ no gir   │           │
└──────────┘           ▼
                ┌───────────────┐
                │    BOYUT      │
                │ [50×50]       │
                │ [100×50]      │
                │ [Özel Boyut]  │
                └───────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │    ADET       │
                │ [100] [500]   │
                │ [Farklı Adet] │
                └───────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │  LAMİNASYON   │
                │ [Yok]         │
                │ [Parlak]      │
                │ [Mat]         │
                └───────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │ FİYAT HESAPLA │
                │ API çağrısı   │
                │               │
                │ Özet göster:  │
                │ Malzeme, boyut│
                │ adet, fiyat   │
                └───────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │    ONAY       │
                │ [✅ Onayla]   │───────────┐
                │ [🔄 Değiştir] │──→ Başa   │
                │ [❌ İptal]    │──→ Çıkış  │
                └───────────────┘           │
                                            ▼
                                   ┌───────────────┐
                                   │  E-POSTA      │
                                   │  girişi       │
                                   └───────┬───────┘
                                           │
                                           ▼
                                   ┌───────────────┐
                                   │  ADRES        │
                                   │  girişi       │
                                   └───────┬───────┘
                                           │
                                           ▼
                                   ┌───────────────┐
                                   │  FİRMA ADI    │
                                   │ [Ekle][Atla]  │
                                   └───────┬───────┘
                                           │
                                           ▼
                                   ┌───────────────────┐
                                   │  SİPARİŞ OLUŞTUR  │
                                   │                   │
                                   │ → WooCommerce     │
                                   │   müşteri oluştur │
                                   │ → Sipariş oluştur │
                                   │ → Şifre: 123456   │
                                   └───────┬───────────┘
                                           │
                                           ▼
                                   ┌───────────────────┐
                                   │  ÖDEME LİNKİ      │
                                   │ [💳 Ödeme Yap]    │
                                   │ → WooCommerce      │
                                   │   ödeme sayfası    │
                                   └───────┬───────────┘
                                           │
                                           ▼
                                   ┌───────────────────┐
                                   │  BASKI DOSYASI    │
                                   │  "Dosyanızı       │
                                   │   gönderin"       │
                                   │                   │
                                   │ PDF/AI/PNG kabul  │
                                   └───────┬───────────┘
                                           │
                                           ▼
                                   ┌───────────────────┐
                                   │  TAMAMLANDI ✅    │
                                   │                   │
                                   │ → Dosya kaydedildi│
                                   │ → Sipariş baskı   │
                                   │   kuyruğunda      │
                                   │                   │
                                   │ WooCommerce       │
                                   │ webhook'ları ile  │
                                   │ otomatik          │
                                   │ bildirimler:      │
                                   │ • Baskıda 🖨️     │
                                   │ • Kargoda 📦      │
                                   │ • Teslim ✅       │
                                   └───────────────────┘
```

---

## BÖLÜM 9: Yapılacaklar Listesi (Öncelik Sırasına Göre)

### Faz 1: Altyapı (1-2 gün)
- [ ] Meta Business hesabı oluştur ve doğrulamayı başlat
- [ ] Meta Developer uygulaması oluştur
- [ ] WhatsApp ürünü ekle
- [ ] Test numarası ile mesaj gönder/al

### Faz 2: Sunucu Kurulumu (1 gün)
- [ ] Node.js kurulumu (mevcut sunucuda)
- [ ] PM2 kurulumu
- [ ] Nginx reverse proxy ayarı
- [ ] SSL kontrolü
- [ ] Webhook endpoint'ini oluştur ve Meta'da kaydet

### Faz 3: Bot Geliştirme (3-5 gün)
- [ ] Temel mesaj gönder/al
- [ ] Konuşma akışını oluştur (state machine)
- [ ] Malzeme → Boyut → Adet → Laminasyon akışı
- [ ] Fiyat hesaplama API endpoint'i (WordPress)
- [ ] Fiyat hesaplamayı bota bağla

### Faz 4: WooCommerce Entegrasyonu (2-3 gün)
- [ ] WooCommerce REST API anahtarları oluştur
- [ ] Otomatik müşteri hesabı oluşturma
- [ ] Otomatik sipariş oluşturma
- [ ] Ödeme linki gönderme
- [ ] Sipariş durumu webhook'u
- [ ] Sipariş takip fonksiyonu

### Faz 5: Dosya ve Bildirimler (1-2 gün)
- [ ] Baskı dosyası alma ve kaydetme
- [ ] Şablon mesajları oluştur ve onaylat
- [ ] WooCommerce webhook ile durum bildirimleri
- [ ] Hata bildirimi (Telegram bot ile opsiyonel)

### Faz 6: Test ve Canlıya Alma (2-3 gün)
- [ ] Tüm akışı test et
- [ ] Gerçek telefon numarasını ekle
- [ ] 10 test siparişi oluştur
- [ ] Fiyatları gerçek fiyatlarla güncelle
- [ ] KVKK aydınlatma metni ekle
- [ ] Canlıya al

### Toplam Tahmini Süre: 10-16 gün

---

## BÖLÜM 10: Maliyet Özeti

| Kalem | Tek Seferlik | Aylık |
|---|---|---|
| Meta WhatsApp Cloud API | 0 ₺ | 0 ₺ (platform ücreti yok) |
| Meta mesaj ücretleri (500 müşteri) | — | ~100-200 ₺ |
| VPS / Hosting | 0 ₺ | 0 ₺ (mevcut sunucu) |
| Node.js + npm paketleri | 0 ₺ | 0 ₺ |
| SSL Sertifikası (Let's Encrypt) | 0 ₺ | 0 ₺ |
| Geliştirme (kendiniz yaparsanız) | 0 ₺ | — |
| **TOPLAM** | **0 ₺** | **~100-200 ₺** |

---

## Notlar

- Tüm fiyat hesaplama değerleri örnektir, kendi birim fiyatlarınızı girmeniz gerekir
- `123456` standart şifre prodüksiyonda rastgele üretilmeli ve müşteriye bildirilmelidir
- Konuşma durumları prodüksiyonda Redis veya SQLite'a taşınmalıdır (sunucu yeniden başlatıldığında kaybolmaması için)
- WhatsApp'ta `*bold*` ve `_italic_` markdown formatlaması kullanılabilir
- Aynı anda birden fazla müşteri ile konuşma desteklenir (her telefon numarası ayrı state)
- `iptal` komutu her adımda çalışır — müşteri istediği zaman çıkabilir
