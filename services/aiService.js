const logger = require('../utils/logger');
const db = require('./database');

// ========== AI SESSİZ GÖZLEM SERVİSİ ==========
// Claude API ile konuşmaları sessizce analiz eder.
// MÜŞTERİYE HİÇBİR ZAMAN MESAJ GÖNDERMEZ.
// Sadece gözlem kaydeder, admin panelde raporlar.

let Anthropic = null;
let client = null;

// Lazy init — ANTHROPIC_API_KEY yoksa hiç yüklenmez
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    if (!Anthropic) {
      Anthropic = require('@anthropic-ai/sdk');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    logger.info('[AI] Claude API bağlantısı hazır');
    return client;
  } catch (e) {
    logger.warn(`[AI] Claude SDK yüklenemedi: ${e.message}`);
    return null;
  }
}

/**
 * AI servisi aktif mi?
 */
function shouldObserve() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ========== RATE LIMITING ==========
// Telefon başına 30 saniye debounce
const lastObservation = new Map();
const DEBOUNCE_MS = 30000;

function isRateLimited(phone) {
  const last = lastObservation.get(phone);
  if (last && Date.now() - last < DEBOUNCE_MS) return true;
  lastObservation.set(phone, Date.now());
  return false;
}

// ========== CONTENT FILTERING ==========

function shouldSkipContent(text) {
  if (!text || text.length < 6) return true;
  // Pure sayılar (menü seçimleri)
  if (/^\d{1,3}$/.test(text.trim())) return true;
  // Çok kısa tekil kelimeler
  if (text.trim().split(/\s+/).length <= 1 && text.length < 10) return true;
  return false;
}

// ========== ANA GÖZLEM FONKSİYONU ==========

const SYSTEM_PROMPT = `Sen bir e-ticaret asistanısın. 1Etiket.com.tr bir etiket/sticker baskı firması.
WhatsApp üzerinden müşteri konuşmalarını SESSİZCE gözlemliyorsun.
Müşteriye HİÇBİR ZAMAN mesaj göndermiyorsun. Sadece gözlem raporluyorsun.

Aşağıdaki durumları tespit et:
- order_intent: Müşteri sipariş vermek istiyor (ürün, boyut, adet belirtti)
- price_agreement: Müşteri fiyatı kabul etti veya pazarlık yapıyor
- payment_confirmed: Ödeme yapıldığından bahsediliyor
- complaint: Şikayet veya memnuniyetsizlik
- upsell_opportunity: Ek satış fırsatı (büyük adet, farklı ürün ilgisi)
- urgent_request: Acil teslimat veya zaman baskısı
- competitor_mention: Rakip firma bahsi

Her gözlem için JSON formatında yanıt ver:
{
  "observations": [
    {
      "type": "order_intent|price_agreement|payment_confirmed|complaint|upsell_opportunity|urgent_request|competitor_mention",
      "confidence": 0.0-1.0,
      "summary": "Kısa açıklama (Türkçe)",
      "details": {}
    }
  ]
}

Eğer tespit edecek önemli bir şey yoksa boş dizi dön: { "observations": [] }
Sadece confidence >= 0.5 olan gözlemleri raporla.`;

/**
 * Konuşmayı sessizce gözlemle (fire-and-forget)
 * @param {string} phone - Telefon numarası
 * @param {string} messageText - Mesaj içeriği
 * @param {string} direction - 'inbound' | 'human' | 'outbound'
 * @param {string} conversationState - FSM state
 */
async function observe(phone, messageText, direction, conversationState) {
  // Guard: API key yoksa skip
  if (!shouldObserve()) return;

  // Guard: kısa/anlamsız mesajları skip
  if (shouldSkipContent(messageText)) return;

  // Guard: rate limit
  if (isRateLimited(phone)) return;

  try {
    const apiClient = getClient();
    if (!apiClient) return;

    // Son mesaj geçmişini al (context için)
    const recentMessages = db.getMessageHistory(phone, 10);
    const contextLines = recentMessages.map(m => {
      const dir = m.direction === 'inbound' ? 'MÜŞTERİ' :
                  m.direction === 'human' ? 'TEMSİLCİ' : 'BOT';
      return `[${dir}] ${m.content}`;
    }).join('\n');

    const userMessage = `Konuşma durumu: ${conversationState}
Yeni mesaj yönü: ${direction === 'inbound' ? 'MÜŞTERİ' : direction === 'human' ? 'TEMSİLCİ' : 'BOT'}
Yeni mesaj: "${messageText}"

Son konuşma geçmişi:
${contextLines}`;

    const response = await apiClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    const aiText = response.content?.[0]?.text || '';

    // JSON parse
    let parsed;
    try {
      // JSON bloğunu çıkar (```json ... ``` veya düz JSON)
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      logger.warn(`[AI] JSON parse hatası: ${e.message}`);
      return;
    }

    const observations = parsed.observations || [];

    // confidence >= 0.5 olanları kaydet
    for (const obs of observations) {
      if (obs.confidence >= 0.5) {
        db.saveAiObservation(
          phone,
          obs.type,
          obs.confidence,
          { summary: obs.summary, details: obs.details || {} },
          aiText,
          [messageText]
        );
        logger.info(`[AI] Gözlem kaydedildi: ${phone} — ${obs.type} (${(obs.confidence * 100).toFixed(0)}%) — ${obs.summary}`);
      }
    }
  } catch (error) {
    // Fire-and-forget — hataları logla, asla throw etme
    logger.error(`[AI] Gözlem hatası (${phone}): ${error.message}`);
  }
}

/**
 * Bir konuşmanın tüm geçmişini toplu analiz et
 * @param {string} phone - Telefon numarası
 * @param {number} limit - Kaç mesaj analiz edilsin
 */
async function analyzeHistory(phone, limit = 50) {
  if (!shouldObserve()) return { analyzed: 0, observations: 0 };

  try {
    const apiClient = getClient();
    if (!apiClient) return { analyzed: 0, observations: 0 };

    const messages = db.getMessageHistory(phone, limit);
    if (messages.length < 3) return { analyzed: 0, observations: 0 };

    const contextLines = messages.map(m => {
      const dir = m.direction === 'inbound' ? 'MÜŞTERİ' :
                  m.direction === 'human' ? 'TEMSİLCİ' : 'BOT';
      return `[${dir}] ${m.content}`;
    }).join('\n');

    const userMessage = `Aşağıdaki WhatsApp konuşmasının TAMAMINI analiz et.
Tüm önemli gözlemleri raporla (sipariş niyeti, fiyat anlaşması, şikayet, upsell fırsatı vb.)

Konuşma (${messages.length} mesaj):
${contextLines}`;

    const response = await apiClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    const aiText = response.content?.[0]?.text || '';

    let parsed;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { analyzed: messages.length, observations: 0 };
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { analyzed: messages.length, observations: 0 };
    }

    const observations = parsed.observations || [];
    let savedCount = 0;

    for (const obs of observations) {
      if (obs.confidence >= 0.5) {
        db.saveAiObservation(
          phone, obs.type, obs.confidence,
          { summary: obs.summary, details: obs.details || {} },
          aiText, ['batch_analysis']
        );
        savedCount++;
        logger.info(`[AI-BATCH] ${phone} — ${obs.type} (${(obs.confidence * 100).toFixed(0)}%) — ${obs.summary}`);
      }
    }

    return { analyzed: messages.length, observations: savedCount };
  } catch (error) {
    logger.error(`[AI-BATCH] Analiz hatası (${phone}): ${error.message}`);
    return { analyzed: 0, observations: 0, error: error.message };
  }
}

/**
 * Tüm aktif konuşmaları toplu analiz et
 * @param {number} maxConversations - En fazla kaç konuşma
 */
async function batchAnalyzeAll(maxConversations = 50) {
  if (!shouldObserve()) return { total: 0, analyzed: 0, observations: 0 };

  const conversations = db.getActiveConversations();
  const toAnalyze = conversations.slice(0, maxConversations);
  let totalObservations = 0;
  let analyzedCount = 0;

  for (const conv of toAnalyze) {
    try {
      const result = await analyzeHistory(conv.phone, 50);
      totalObservations += result.observations;
      if (result.analyzed > 0) analyzedCount++;

      // Rate limit: her analiz arası 2 saniye bekle
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      logger.error(`[AI-BATCH] ${conv.phone} hatası: ${e.message}`);
    }
  }

  logger.info(`[AI-BATCH] Toplu analiz tamamlandı: ${analyzedCount}/${toAnalyze.length} konuşma, ${totalObservations} gözlem`);
  return { total: toAnalyze.length, analyzed: analyzedCount, observations: totalObservations };
}

// ========== NL-TO-CART: DOĞAL DİLDEN SİPARİŞ BİLGİSİ ÇIKARMA ==========

const NL_ORDER_SYSTEM_PROMPT = `Sen 1Etiket.com.tr'nin etiket/sticker baskı siparişi asistanısın.
Müşterinin doğal dilde yazdığı mesajdan sipariş bilgilerini çıkarman gerekiyor.

Mevcut malzeme kodları ve isimleri:
=== ANA MALZEMELER (menüde gösterilen) ===
- kuse: Kuşe Etiket (en yaygın, kağıt etiket) — DEFAULT MALZEME
- opak: Opak Etiket (suya dayanıklı, plastik)
- seffaf: Şeffaf Etiket (transparan, suya dayanıklı)
- kraft: Kraft Etiket (doğal kahverengi, organik görünüm)
- karton: 350gr Mat Kuşe Etiket (kalın, karton benzeri, askılı etiket)
- metalize: Metalize Etiket (altın/gümüş, premium)
- hologram: Dijital Yaldızlı Etiket (yaldız, varak, premium)
=== GİZLİ MALZEMELER (menüde yok ama fiyat hesaplanabilir) ===
- parlak: Parlak Kuşe Etiket (parlak, glossy kuşe)
- 300grmatselefonlu: 300gr Mat Kuşe Selefonlu (selefonlu, laminasyonlu, 300gr)
- 350grmatselefonlu: 350gr Mat Kuşe Selefonlu (selefonlu, laminasyonlu, 350gr)
- 300gramerikan: 300gr Amerikan Bristol (amerikan bristol, kartvizit kağıdı, 300gr)
- 350gramerikan: 350gr Amerikan Bristol (amerikan bristol, kalın kartvizit, 350gr)
- sarap: Şarap Kağıdı Sticker (şarap kağıdı, şarap etiketi, wine label)
- kirilgan-etiket: Kırılgan Etiket (kırılgan, fragile, güvenlik etiketi)
- yumurta-kabugu-sticker: Yumurta Kabuğu Etiketi (yumurta kabuğu, textured, dokulu)
- ozel-kagit: Özel Kağıt Etiket (özel kağıt, special paper)
- fantezi-kagidi: Fantezi Kağıdı Etiketi (fantezi, fantazi, dekoratif kağıt)
- 170grkuse: 170gr Parlak Kuşe (170gr, ince kuşe, parlak kuşe karton)
- hologram-metalize: Hologram Metalize (hologram metalize, holografik metalik)

BOYUT KURALLARI:
- Boyut mm cinsindendir. Min 10mm, max 460mm.
- Müşteri cm yazarsa 10 ile çarp (5cm → 50mm).
- "5x5" → width: 50, height: 50 (cm varsay, küçük sayılar)
- "50x50" → width: 50, height: 50 (mm)
- TEK BOYUT = KARE: "5 cm" → width: 50, height: 50 (kare etiket)
- TEK BOYUT = KARE: "50 mm" → width: 50, height: 50
- TEK BOYUT = KARE: "3 santim" → width: 30, height: 30
- "yuvarlak 5cm" → width: 50, height: 50 (çap = genişlik = yükseklik)
- "çap 3cm" → width: 30, height: 30

MALZEME KURALLARI:
- "kuşe", "kuse", "kağıt" → kuse
- "opak", "plastik" → opak
- "şeffaf", "transparan", "saydam" → seffaf
- "kraft", "kahverengi kağıt" → kraft
- "karton", "mat kuşe", "350gr mat", "askılı etiket", "kalın etiket" → karton
- "metalize", "altın", "gümüş", "gold", "silver" → metalize
- "hologram", "holografik", "yaldız", "yaldızlı", "varak" → hologram
- "parlak kuşe", "parlak etiket", "glossy" → parlak
- "300gr selefonlu", "300gr mat selefonlu", "selefonlu 300" → 300grmatselefonlu
- "350gr selefonlu", "350gr mat selefonlu", "selefonlu 350" → 350grmatselefonlu
- "amerikan bristol", "bristol 300", "300gr amerikan" → 300gramerikan
- "kalın amerikan", "bristol 350", "350gr amerikan" → 350gramerikan
- "şarap kağıdı", "şarap etiketi", "wine label" → sarap
- "kırılgan", "kırılgan etiket", "fragile", "güvenlik etiketi" → kirilgan-etiket
- "yumurta kabuğu", "dokulu etiket", "textured" → yumurta-kabugu-sticker
- "özel kağıt" → ozel-kagit
- "fantezi", "fantezi kağıdı", "dekoratif" → fantezi-kagidi
- "170gr", "170gr kuşe", "ince kuşe karton", "parlak kuşe karton" → 170grkuse
- "hologram metalize", "holografik metalik" → hologram-metalize
- ÖNEMLİ: Malzeme belirtilmemişse "kuse" dön (default malzeme). null DÖNME.
- Sadece "etiket" kelimesi geçiyorsa → kuse (default)
- isDefaultMaterial: true ise malzeme müşteri tarafından belirtilmedi demek

ADET KURALLARI:
- Minimum adet: 50
- "er/ar/şer/şar" eki: dağıtım eki demek. "100'er adet" = her çeşitten 100 adet
- "5 model 100'er adet" → varietyCount: 5, quantity: 500 (5 × 100)
- "3 çeşit 200şer" → varietyCount: 3, quantity: 600 (3 × 200)
- "toplam 500 adet" → quantity: 500 (toplam belirtilmişse doğrudan al)
- "5 farklı model 100er adet 5 cm toplam 500 adet" → kuse, 50x50mm, qty: 500, variety: 5

ÇEŞİT/MODEL KURALLARI:
- varietyCount: kaç farklı tasarım/çeşit/model (varsayılan 1)
- "farklı model", "farklı tasarım", "farklı çeşit" → varietyCount sayısını bul

JSON olarak yanıt ver:
{
  "material": "kuse|opak|seffaf|kraft|karton|metalize|hologram|parlak|300grmatselefonlu|350grmatselefonlu|300gramerikan|350gramerikan|sarap|kirilgan-etiket|yumurta-kabugu-sticker|ozel-kagit|fantezi-kagidi|170grkuse|hologram-metalize",
  "isDefaultMaterial": true|false,
  "width": number_mm,
  "height": number_mm,
  "quantity": number,
  "varietyCount": number,
  "confidence": 0.0-1.0,
  "notes": "varsa ek notlar"
}

Eğer yeterli bilgi yoksa veya anlayamıyorsan:
{ "material": null, "width": null, "height": null, "quantity": null, "confidence": 0, "notes": "neden parse edemediğin" }`;

/**
 * Doğal dilden sipariş bilgisi çıkar (NL-to-Cart)
 * @param {string} text - Müşterinin doğal dilde yazdığı mesaj
 * @returns {Object|null} { material, width, height, quantity, varietyCount }
 */
async function parseNaturalLanguageOrder(text) {
  if (!shouldObserve()) return null;
  if (!text || text.length < 5) return null;

  try {
    const apiClient = getClient();
    if (!apiClient) return null;

    const response = await apiClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: NL_ORDER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }]
    });

    const aiText = response.content?.[0]?.text || '';

    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Confidence düşükse null dön
    if (!parsed.confidence || parsed.confidence < 0.5) return null;

    // Malzeme null gelirse default kuşe yap
    if (!parsed.material) {
      parsed.material = 'kuse';
      parsed.isDefaultMaterial = true;
    }

    // Boyut olmazsa olmaz
    if (!parsed.width || !parsed.height) return null;

    // Bounds check (boyut)
    if (parsed.width < 10 || parsed.width > 460 || parsed.height < 10 || parsed.height > 460) return null;

    // Adet varsa bounds check
    const hasQuantity = parsed.quantity && parsed.quantity >= 50;
    if (parsed.quantity && parsed.quantity > 1000000) return null;

    logger.info(`[AI-NL] Parse başarılı: ${text.substring(0, 50)} → ${parsed.material} ${parsed.width}x${parsed.height}mm ${hasQuantity ? parsed.quantity + ' adet' : 'adet yok'} (conf: ${parsed.confidence})`);

    return {
      material: parsed.material,
      isDefaultMaterial: parsed.isDefaultMaterial || false,
      width: Math.round(parsed.width),
      height: Math.round(parsed.height),
      quantity: hasQuantity ? Math.round(parsed.quantity) : null,
      varietyCount: parsed.varietyCount || 1
    };
  } catch (error) {
    logger.error(`[AI-NL] Parse hatası: ${error.message}`);
    return null;
  }
}

// ========== AI ÜRÜN ÖNERİSİ ==========

const RECOMMEND_SYSTEM_PROMPT = `Sen 1Etiket.com.tr'nin etiket uzmanısın.
Müşterinin kullanım alanına göre en uygun etiket malzemesini öneriyorsun.

Malzeme bilgi bankası:
=== ANA MALZEMELER ===
1. Kuşe Etiket (kuse): Kağıt bazlı, ekonomik. Kuru ortamlar, ofis, kargo, adres etiketleri. Suya dayanıksız. En uygun fiyatlı.
2. Opak Etiket (opak): Plastik (PP), suya/yağa dayanıklı. Dış ortam, kozmetik, temizlik ürünleri. Beyaz zemin.
3. Şeffaf Etiket (seffaf): Transparan PP, suya/yağa dayanıklı. Cam/şişe, gıda ambalajı, premium ürünler. Ürün rengi görünür.
4. Kraft Etiket (kraft): Doğal kahverengi kağıt. Organik/doğal ürünler, el yapımı, butik. Vintage/rustik görünüm.
5. 350gr Mat Kuşe Etiket (karton): Kalın mat kuşe kağıt. Askılı etiket (giyim, tekstil), ip deliği açılabilir. Fiyat etiketi, karton etiket.
6. Metalize Etiket (metalize): Altın/gümüş metalik. Premium ürünler, şarap, kozmetik. Lüks görünüm.
7. Dijital Yaldızlı Etiket (hologram): Yaldız/varak efektli premium etiket. Lüks ambalaj, özel tasarım, şık görünüm.
=== EK MALZEMELER ===
8. Parlak Kuşe Etiket (parlak): Glossy parlak kuşe. Parlak yüzey istenen ürünler.
9. 300gr Mat Kuşe Selefonlu (300grmatselefonlu): Mat selefonlu laminasyonlu. Dayanıklı, kaliteli baskı.
10. 350gr Mat Kuşe Selefonlu (350grmatselefonlu): Kalın selefonlu laminasyonlu. Askılı etiket, premium kartlar.
11. 300gr Amerikan Bristol (300gramerikan): Amerikan bristol karton. Kartvizit benzeri etiketler.
12. 350gr Amerikan Bristol (350gramerikan): Kalın amerikan bristol. Dayanıklı karton etiketler.
13. Şarap Kağıdı Sticker (sarap): Özel şarap etiketi kağıdı. Şarap şişesi, premium içecekler.
14. Kırılgan Etiket (kirilgan-etiket): Güvenlik etiketi. Açılınca kırılır/parçalanır. Garanti, mühür, güvenlik.
15. Yumurta Kabuğu Etiketi (yumurta-kabugu-sticker): Dokulu yüzey, tekstürlü. El yapımı ürünler, butik.
16. Özel Kağıt Etiket (ozel-kagit): Özel amaçlı kağıt etiketler.
17. Fantezi Kağıdı Etiketi (fantezi-kagidi): Dekoratif fantezi kağıt. Hediye, özel günler, ambalaj.
18. 170gr Parlak Kuşe (170grkuse): İnce parlak kuşe karton. Broşür benzeri etiketler.
19. Hologram Metalize (hologram-metalize): Holografik metalik efekt. Güvenlik, premium ambalaj.

Yanıtını Türkçe olarak kısa ve net ver:
- Önerilen malzeme ve neden
- Avantajları (2-3 madde)
- Alternatif varsa kısaca belirt
- Max 4-5 cümle`;

/**
 * Müşterinin kullanım alanına göre ürün önerisi
 * @param {string} description - Müşterinin ihtiyaç açıklaması
 * @returns {Object|null} { recommendation, materialCode }
 */
async function recommendProduct(description) {
  if (!shouldObserve()) return null;
  if (!description || description.length < 5) return null;

  try {
    const apiClient = getClient();
    if (!apiClient) return null;

    const response = await apiClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: RECOMMEND_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: description }]
    });

    const aiText = response.content?.[0]?.text || '';
    if (!aiText) return null;

    // Önerilen malzeme kodunu çıkar
    const materialCodes = ['kuse', 'opak', 'seffaf', 'kraft', 'karton', 'metalize', 'hologram', 'parlak', '300grmatselefonlu', '350grmatselefonlu', '300gramerikan', '350gramerikan', 'sarap', 'kirilgan-etiket', 'yumurta-kabugu-sticker', 'ozel-kagit', 'fantezi-kagidi', '170grkuse', 'hologram-metalize'];
    let detectedCode = null;
    const lowerText = aiText.toLowerCase();
    for (const code of materialCodes) {
      if (lowerText.includes(code)) {
        detectedCode = code;
        break;
      }
    }

    logger.info(`[AI-RECOMMEND] Öneri: ${description.substring(0, 50)} → ${detectedCode || 'belirsiz'}`);

    return {
      recommendation: aiText,
      materialCode: detectedCode
    };
  } catch (error) {
    logger.error(`[AI-RECOMMEND] Öneri hatası: ${error.message}`);
    return null;
  }
}

module.exports = {
  observe,
  shouldObserve,
  analyzeHistory,
  batchAnalyzeAll,
  parseNaturalLanguageOrder,
  recommendProduct
};
