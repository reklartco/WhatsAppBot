# 1etiket WhatsApp Bot - Proje Durum Raporu

**Son Guncelleme:** 2026-03-05

---

## Genel Bakis

WhatsApp uzerinden etiket/sticker siparis otomasyonu. Musteri WhatsApp'tan mesaj yazarak malzeme secer, boyut ve adet belirler, fiyat alir, siparis olusturur ve odeme yapar.

---

## Tamamlanan Isler

### Kod Gelistirme (TAMAMLANDI)

| Modul | Dosya | Durum |
|-------|-------|-------|
| Ana Sunucu | `server.js` | Tamamlandi |
| WhatsApp Servisi | `services/whatsappService.js` | Tamamlandi |
| Konusma Yoneticisi | `services/conversationManager.js` | Tamamlandi |
| Fiyat Hesaplama | `services/priceCalculator.js` | Tamamlandi |
| WooCommerce Servisi | `services/woocommerceService.js` | Tamamlandi |
| Dosya Servisi | `services/fileService.js` | Tamamlandi |
| Logger | `utils/logger.js` | Tamamlandi |
| Validator | `utils/validator.js` | Tamamlandi |

### Ozellikler (TAMAMLANDI)

- [x] WhatsApp Cloud API webhook entegrasyonu (GET dogrulama + POST mesaj isleme)
- [x] Konusma state machine (17 farkli durum)
- [x] 8 malzeme tipi (Kuse, Kraft, Seffaf PP, Beyaz PP, Vellum, Silver, Gold, Hologram)
- [x] Boyut secimi (hazir + ozel boyut)
- [x] Adet secimi (hazir + ozel adet, min 50)
- [x] Laminasyon secimi (Yok, Parlak, Mat)
- [x] Otomatik fiyat hesaplama
- [x] WooCommerce musteri olusturma
- [x] WooCommerce siparis olusturma
- [x] Odeme linki gonderme (CTA Button)
- [x] Baski dosyasi yukleme (PDF, AI, PNG, JPEG)
- [x] Siparis takip
- [x] WooCommerce webhook (siparis durum bildirimi)
- [x] Konusma zamanlayici (30 dk inaktivite = temizle)
- [x] Iptal/sifirla komutlari

### Test (TAMAMLANDI)

- [x] Unit testler yazildi (7 test dosyasi)
- [x] Jest konfigurasyonu hazir

### Deploy Yapilandirmasi (TAMAMLANDI)

- [x] Dockerfile
- [x] docker-compose.yml
- [x] ecosystem.config.js (PM2)
- [x] Nginx reverse proxy config
- [x] .env.example
- [x] .gitignore
- [x] Ortam degiskeni dogrulama scripti (`scripts/validate-env.js`)
- [x] DEPLOYMENT.md rehberi

---

## Altyapi Durumu

| Bilesken | Durum | Not |
|----------|-------|-----|
| VPS Sunucu | HAZIR | Satin alindi |
| Chatwoot | KURULDU | VPS uzerinde calisiyor |
| Git Repo | BEKLIYOR | GitHub'a push edilecek |
| Bot Deploy | BEKLIYOR | Docker Compose ile deploy edilecek |
| Domain/SSL | BEKLIYOR | Subdomain + SSL gerekli |
| Nginx | BEKLIYOR | VPS'te kurulacak |

---

## Siradaki Adimlar

### Adim 1: Git Repo ve Deploy (SIRADAKI)
1. Git repo baslat, GitHub'a push et
2. VPS'te clone yap
3. Docker Compose ile bot'u calistir
4. Nginx + SSL kur

### Adim 2: Meta WhatsApp API Kurulumu
1. Meta Developer'da uygulama olustur
2. WhatsApp Business API erisimi al
3. Phone Number ID, Business ID, Token al
4. Kalici token olustur
5. Webhook kaydi yap (HTTPS gerekli)

### Adim 3: WooCommerce API Baglantisi
1. REST API anahtarlari olustur (Consumer Key/Secret)
2. `.env` dosyasina ekle
3. Fiyat hesaplama API endpoint'ini dogrula
4. WooCommerce webhook tanimla (siparis bildirimleri)

### Adim 4: Chatwoot Entegrasyonu
1. Chatwoot <-> WhatsApp Bot arasindaki baglanti
2. Canli destek devir mekanizmasi (bot cevaplayamazsa Chatwoot'a aktar)

### Adim 5: Test ve Go-Live
1. Test telefon numarasiyla ucan test
2. Siparis akisini bastan sona test et
3. Gercek telefon numarasi ile yayina al

---

## Teknik Detaylar

- **Runtime:** Node.js 20
- **Framework:** Express.js
- **API'ler:** WhatsApp Cloud API v21.0, WooCommerce REST API
- **Deploy:** Docker Compose
- **Process Manager:** PM2 (alternatif)
- **Reverse Proxy:** Nginx
- **SSL:** Let's Encrypt (Certbot)
- **Port:** 3000 (dahili)

## Dosya Yapisi

```
WhatsApp-Chatbot/
├── server.js                    # Ana sunucu, route'lar
├── services/
│   ├── whatsappService.js       # WhatsApp API islemleri
│   ├── conversationManager.js   # Konusma state machine
│   ├── priceCalculator.js       # Fiyat hesaplama
│   ├── woocommerceService.js    # WooCommerce API islemleri
│   └── fileService.js           # Dosya yukleme islemleri
├── utils/
│   ├── logger.js                # Loglama
│   └── validator.js             # Girdi dogrulama
├── __tests__/                   # Jest testleri
├── deploy/
│   └── nginx.conf               # Nginx yapilandirmasi
├── scripts/
│   └── validate-env.js          # Ortam degiskeni dogrulama
├── Dockerfile                   # Docker image
├── docker-compose.yml           # Docker Compose
├── ecosystem.config.js          # PM2 yapilandirmasi
├── .env.example                 # Ornek ortam degiskenleri
└── package.json
```
