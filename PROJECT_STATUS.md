# 1etiket WhatsApp Bot - Proje Durum Raporu

**Son Guncelleme:** 2026-03-05

---

## Genel Bakis

WhatsApp uzerinden etiket/sticker siparis otomasyonu. Musteri WhatsApp'tan mesaj yazarak malzeme secer, boyut ve adet belirler, fiyat alir, siparis olusturur ve odeme yapar.

---

## Sunucu Bilgileri

| Bilgi | Deger |
|-------|-------|
| VPS IP | `77.237.233.132` |
| SSH | `ssh root@77.237.233.132` |
| Chatwoot Yolu | `/opt/chatwoot` |
| Chatwoot URL | `http://77.237.233.132:3000` |
| Saglayici | Contabo (vmi3127197) |
| GitHub Repo | `https://github.com/reklartco/WhatsAppBot.git` |

### Port Plani

| Servis | Port |
|--------|------|
| Chatwoot | 3000 |
| Evolution API | 8080 |
| WhatsApp Bot | 3001 |
| PostgreSQL | 5432 (sadece localhost) |
| Redis | 6379 (sadece localhost) |

### Chatwoot Docker Yapisi

- **Konum:** `/opt/chatwoot/docker-compose.yaml`
- **Image:** `chatwoot/chatwoot:latest`
- **DB:** `pgvector/pgvector:pg16` (user: postgres, pass: chatwoot_pass, db: chatwoot)
- **Redis:** `redis:alpine` (sifre .env'de)
- **Container'lar:**
  - `chatwoot-rails-1` — Ana uygulama (port 3000)
  - `chatwoot-sidekiq-1` — Arka plan islemci
  - `chatwoot-redis-1` — Redis cache
  - `chatwoot-postgres-1` — PostgreSQL veritabani
- **Volume'lar:** storage_data, postgres_data, redis_data

---

## Mimari (Guncellenmis)

```
Musteri (WhatsApp)
    |
Evolution API (WhatsApp Web - QR kod ile baglanir)
    |                    |
WhatsApp Bot          Chatwoot
(otomasyon)          (canli destek)
    |
WooCommerce (1etiket.com.tr)
```

> NOT: Meta WhatsApp Business API askida oldugu icin Evolution API (unofficial WhatsApp Web) kullaniliyor.

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
| VPS Sunucu | HAZIR | 77.237.233.132 |
| Chatwoot | KURULDU | Docker ile /opt/chatwoot - port 3000 |
| Git Repo | TAMAMLANDI | github.com/reklartco/WhatsAppBot |
| Evolution API | BEKLIYOR | Docker ile kurulacak - port 8080 |
| WhatsApp Bot | BEKLIYOR | Docker ile deploy edilecek - port 3001 |
| Domain/SSL | BEKLIYOR | Subdomain + SSL gerekli |
| Meta API | ASKIDA | Hesap askiya alinmis, Evolution API kullanilacak |

---

## Siradaki Adimlar

### Adim 1: Evolution API Kurulumu (SIRADAKI)
1. VPS'te Evolution API Docker container'i kur
2. QR kod ile WhatsApp bagla
3. Chatwoot entegrasyonunu yap

### Adim 2: Bot Kodunu Evolution API'ye Uyarla
1. whatsappService.js -> Evolution API endpointlerine guncelle
2. Webhook handler'lari Evolution API formatina uyarla
3. docker-compose.yml guncelle (port 3001)

### Adim 3: WooCommerce API Baglantisi
1. REST API anahtarlari olustur (Consumer Key/Secret)
2. `.env` dosyasina ekle
3. Fiyat hesaplama API endpoint'ini dogrula
4. WooCommerce webhook tanimla (siparis bildirimleri)

### Adim 4: Test ve Go-Live
1. Evolution API + Bot + Chatwoot entegrasyon testi
2. Siparis akisini bastan sona test et
3. Yayina al

---

## Teknik Detaylar

- **Runtime:** Node.js 20
- **Framework:** Express.js
- **API'ler:** Evolution API (WhatsApp Web), WooCommerce REST API
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
