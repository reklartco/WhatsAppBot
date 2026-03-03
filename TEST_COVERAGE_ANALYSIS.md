# Test Kapsam Analizi ve İyileştirme Önerileri

## Mevcut Durum Özeti (Başlangıç Testleri Sonrası)

| Dosya | Satır % | Branch % | Fonksiyon % | Durum |
|-------|---------|----------|-------------|-------|
| **validator.js** | 100% | 100% | 100% | Tam kapsam |
| **fileService.js** | 100% | 100% | 100% | Tam kapsam |
| **whatsappService.js** | 91.48% | 85.71% | 88.88% | İyi kapsam |
| **priceCalculator.js** | 80% | 68.18% | 50% | Kısmi kapsam |
| **logger.js** | 80% | 100% | 66.66% | Kısmi kapsam |
| **conversationManager.js** | 56.79% | 56.05% | 60.86% | Kısmi kapsam — hala eksik |
| **server.js** | 41.02% | 16.66% | 20% | Eksik |
| **woocommerceService.js** | 21.42% | 6.25% | 16.66% | Kritik eksik |
| **GENEL TOPLAM** | **59.47%** | **50.19%** | **59.61%** | |

> Başlangıçta genel kapsam %19.9 idi, eklenen testlerle %59.47'ye yükseldi (81 test).
> Aşağıda hala iyileştirilmesi gereken alanlar detaylandırılmıştır.

---

## Kritik İyileştirme Alanları (Öncelik Sırasına Göre)

### 1. YÜKSEK ÖNCELİK: Konuşma Yöneticisi (conversationManager.js) — %9.87 kapsam

Bu dosya uygulamanın kalbidir ve neredeyse hiç test edilmemiş durumda.

**Test edilmesi gereken alanlar:**

- **State Machine geçişleri**: Her durum (IDLE → MAIN_MENU → SELECT_MATERIAL → ...) arası geçişlerin doğruluğu
- **processMessage ana akışı**: İptal komutu, bilinmeyen durum, hata yakalama
- **handleIdle**: Karşılama mesajı ve doğru durum değişikliği
- **handleMainMenu**: Her 3 seçenek (sipariş, fiyat, takip) + tanınmayan mesaj
- **handleMaterialSelect**: Geçerli/geçersiz malzeme seçimi
- **handleSizeSelect**: Standart boyutlar, özel boyut, doğrudan boyut girişi
- **handleCustomSize**: Geçerli/geçersiz/sınır dışı boyut
- **handleQuantitySelect**: Standart adetler, özel adet, minimum kontrol
- **handleCustomQuantity**: Min/max sınırları
- **handleLamination**: Laminasyon seçimi ve fiyat hesaplama tetikleme
- **handlePriceResponse**: Onayla/değiştir/iptal seçenekleri
- **handleEmail**: Geçerli/geçersiz e-posta
- **handleAddress**: Kısa/geçerli adres
- **handleCompany**: Firma ekle/atla/firma adı yaz
- **handleOrderConfirm**: Onay/iptal/geçersiz seçim ve WooCommerce entegrasyonu
- **handleFileUpload**: Doküman/resim/geçersiz dosya tipi
- **handleOrderTracking**: Geçerli/geçersiz sipariş numarası

**Tahmini etki**: Bu tek dosyanın kapsamlı test edilmesi genel kapsamı %50+ artırır.

### 2. YÜKSEK ÖNCELİK: WhatsApp Servisi (whatsappService.js) — %14.89 kapsam

**Test edilmesi gereken alanlar:**

- **verifyWebhook**: Doğru token ile doğrulama, yanlış token ile red, eksik parametreler
- **handleWebhook**:
  - `whatsapp_business_account` olmayan body
  - Durum güncellemesi (statuses) mesajları
  - Normal metin mesajı
  - Hatalı body yapısı
- **sendTextMessage**: Doğru API çağrısı formatı
- **sendButtonMessage**: Buton limiti (max 3), başlık uzunluğu kırpma (20 char)
- **sendListMessage**: Section yapısı, buton metni kırpma
- **sendCTAButton**: URL ve metin doğruluğu
- **downloadMedia**: 2 aşamalı indirme süreci (URL al + dosya indir)
- **sendMessage**: Hata durumları, ağ hataları, timeout

### 3. ORTA ÖNCELİK: WooCommerce Servisi (woocommerceService.js) — %21.42 kapsam

**Test edilmesi gereken alanlar:**

- **createCustomer**:
  - Mevcut müşteri bulunduğunda güncelleme
  - Yeni müşteri oluşturma
  - API hata durumları
- **createOrder**:
  - Sipariş payload yapısı
  - Laminasyon metin dönüşümü
  - Ödeme URL oluşturma (payment_url vs fallback)
- **getOrderStatus**:
  - Sipariş bulunduğunda
  - Sipariş bulunamadığında
  - Kargo takip numarası olan/olmayan durumlar
- **extractCity** (mevcut testleri genişlet):
  - **BUG**: Türkçe İ/ı/Ş/ş/Ç/ç/Ü/ü/Ö/ö/Ğ/ğ karakterli şehirler eşleşmiyor
  - Birden fazla şehir adı geçen adresler

### 4. ORTA ÖNCELİK: Fiyat Hesaplama (priceCalculator.js) — %80 kapsam

**Eksik alanlar:**

- **calculatePrice (API çağrısı)**: Bu fonksiyon hiç test edilmemiş
  - Başarılı API yanıtı
  - API hatası → fallback'e düşme
  - Timeout durumu
  - Yanlış API yanıt formatı

### 5. DÜŞÜK ÖNCELİK: Server (server.js) — %0 kapsam

**Test edilmesi gereken alanlar:**

- **Health endpoint**: GET /health yanıtı
- **WhatsApp webhook routing**: GET ve POST doğru handler'a yönleniyor mu
- **WooCommerce webhook**:
  - İmza doğrulaması (geçerli/geçersiz)
  - Durum mesajı gönderme (processing, completed, vs.)
  - WhatsApp kaynaklı olmayan sipariş filtreleme
  - WhatsApp numarası bulunamayan durum

---

## Tespit Edilen Bug'lar

### BUG-001: extractCity — Türkçe karakter sorunu (Kritik)

**Dosya**: `services/woocommerceService.js:150-165`

**Sorun**: `address.toLowerCase()` fonksiyonu Türkçe büyük harfleri standart küçük harflere dönüştürmez:
- `'İstanbul'.toLowerCase()` → `'i̇stanbul'` (noktlalı i), `'istanbul'` değil
- `'İzmir'.toLowerCase()` → `'i̇zmir'`, `'izmir'` değil

**Etki**: Müşteri adresinde şehir adı büyük harfle başlıyorsa (ki genellikle öyledir), şehir eşleşmesi başarısız olur. Bu da WooCommerce'de city alanının boş kalmasına neden olur.

**Çözüm önerisi**:
```javascript
function extractCity(address) {
  // Türkçe locale ile lowercase dönüşümü
  const addressLower = address.toLocaleLowerCase('tr-TR');
  // ...
}
```

### BUG-002: handleCompany — Tanımsız durum

**Dosya**: `services/conversationManager.js`

**Sorun**: `handleCompany` fonksiyonunda `conv.state = 'AWAITING_COMPANY_NAME'` olarak set ediliyor ama bu durum `STATES` enum'unda tanımlı değil ve `processMessage`'daki switch'te karşılığı yok. Bu duruma düşen konuşmalar sonraki mesajda `default` case'e giderek `handleIdle`'a yönlenir.

### BUG-003: Konuşma temizleme mekanizması yok

**Sorun**: `conversations` Map'i hiçbir zaman temizlenmiyor. 500+ müşteri/ay hacminde memory leak oluşur. Eski konuşmaları temizleyen bir mekanizma gerekli.

---

## Yeni Test Önerileri (Detaylı)

### Öneri 1: Konuşma Akışı Entegrasyon Testleri

Tam bir sipariş akışını baştan sona test eden entegrasyon testleri:

```
1. Müşteri "Merhaba" yazar → IDLE → MAIN_MENU
2. "Sipariş Ver" butonuna basar → MAIN_MENU → SELECT_MATERIAL
3. "kuse" seçer → SELECT_MATERIAL → SELECT_SIZE
4. "50x50" seçer → SELECT_SIZE → SELECT_QUANTITY
5. "500" seçer → SELECT_QUANTITY → SELECT_LAMINATION
6. "Parlak" seçer → SELECT_LAMINATION → SHOW_PRICE
7. "Onayla" der → SHOW_PRICE → ENTER_EMAIL
8. ... sipariş tamamlanana kadar
```

### Öneri 2: WhatsApp API Mock Testleri

Axios mocklanarak tüm API çağrıları test edilmeli:
- Mesaj gönderme başarı/hata senaryoları
- Rate limiting davranışı
- Media indirme iki aşamalı süreci

### Öneri 3: Eşzamanlı Konuşma Testleri

Birden fazla müşterinin aynı anda farklı aşamalarda olduğu senaryolar.

### Öneri 4: Sınır Değer Testleri (Edge Cases)

- Çok uzun metin mesajları
- Özel karakter içeren e-postalar
- Sınır boyutlar (10x10mm, 500x500mm)
- Minimum/maksimum adet (50, 1.000.000)
- Boş/null/undefined girdiler her handler için

---

## Kapsam Hedefleri

| Metrik | Mevcut | Hedef (Kısa Vade) | Hedef (Uzun Vade) |
|--------|--------|--------------------|--------------------|
| Satır | 19.9% | 60% | 80% |
| Branch | 14.78% | 50% | 70% |
| Fonksiyon | 17.3% | 65% | 85% |

## Öncelik Sırası

1. `conversationManager.js` — State machine testleri (en yüksek etki)
2. `whatsappService.js` — Webhook ve mesaj gönderme testleri
3. `server.js` — HTTP endpoint testleri (supertest ile)
4. `woocommerceService.js` — API mock testleri
5. `priceCalculator.js` — API çağrısı ve fallback testleri
6. Entegrasyon testleri — Uçtan uca akış testleri
