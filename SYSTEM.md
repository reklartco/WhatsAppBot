# 1Etiket WhatsApp Bot — Sistem Dokumantasyonu

> Son guncelleme: 2026-03-06 | Versiyon: 2.0 (Phase 1 tamamlandi)

---

## 1. Proje Ozeti

WhatsApp Web tabanli etiket siparis otomasyon botu. Meta Business API kullanmiyor, bunun yerine **Evolution API (Baileys)** uzerinden WhatsApp Web baglantisi kuruyor.

- **Urun:** 1etiket.com.tr — Ozel etiket/sticker uretimi
- **Bot Yetenekleri:** Fiyat hesaplama, siparis olusturma, siparis takibi, WooCommerce entegrasyonu
- **Admin Panel:** React + Vite ile gelistirilmis CRM paneli
- **Altyapi:** Docker Compose (4 servis), Contabo VPS

---

## 2. Sunucu Bilgileri

| Bilgi | Deger |
|-------|-------|
| VPS IP | `77.237.233.132` |
| Saglayici | Contabo |
| SSH Baglanti | `ssh -i ~/.ssh/id_ed25519 root@77.237.233.132` |
| Bot Dizini | `/opt/1etiket-bot/` |
| Panel URL | `http://77.237.233.132/panel/` |
| Eski Panel | `http://77.237.233.132/panel-legacy/panel.html` |
| Health Check | `http://77.237.233.132:3000/health` |
| Evolution API | `http://77.237.233.132:8080` (ic ag: `http://evolution-api:8080`) |

### Nginx Reverse Proxy

Nginx, 80 portundan gelen istekleri yonlendirir:
- `/` → `localhost:3000` (bot + panel)
- Evolution API dogrudan `:8080` portunda erisiliyor

---

## 3. Docker Compose Mimarisi

```
docker-compose.yml — 4 servis:
┌─────────────────┬────────────────────────────────────────┐
│ Servis           │ Aciklama                               │
├─────────────────┼────────────────────────────────────────┤
│ evolution-api   │ WhatsApp Web baglanti katmani          │
│                 │ Image: evoapicloud/evolution-api:v2.3.7│
│                 │ Port: 8080                             │
├─────────────────┼────────────────────────────────────────┤
│ redis           │ Cache + session (128MB, LRU)           │
│                 │ Image: redis:7-alpine                  │
├─────────────────┼────────────────────────────────────────┤
│ postgres        │ Evolution API verisi                   │
│                 │ Image: postgres:15-alpine              │
│                 │ DB: evolution                          │
├─────────────────┼────────────────────────────────────────┤
│ bot             │ Node.js is mantigi + React panel       │
│                 │ Build: Dockerfile (multi-stage)        │
│                 │ Port: 3000                             │
│                 │ Volumes: uploads, logs, data           │
└─────────────────┴────────────────────────────────────────┘
```

### Docker Volumes
- `evolution_instances` — WhatsApp session verileri
- `redis_data` — Cache verileri
- `postgres_data` — Evolution API PostgreSQL
- `./uploads` — Musteri baski dosyalari
- `./logs` — Bot log dosyalari
- `./data` — SQLite veritabani (`bot.db`)

---

## 4. Deploy Komutlari

### Tam Deploy (build + restart)
```bash
ssh -i ~/.ssh/id_ed25519 root@77.237.233.132
cd /opt/1etiket-bot
docker compose up -d --build bot
```

### Sadece Bot Restart
```bash
docker compose restart bot
```

### Tum Servisleri Baslat
```bash
docker compose up -d
```

### Log Izleme
```bash
docker compose logs -f bot --tail 100
docker compose logs -f evolution-api --tail 50
```

### Container Durumu
```bash
docker compose ps
```

### Dosya Yukleme (Lokalden VPS'e)
```bash
# Tek dosya
scp -i ~/.ssh/id_ed25519 services/database.js root@77.237.233.132:/opt/1etiket-bot/services/

# Klasor (node_modules haric)
scp -i ~/.ssh/id_ed25519 -r panel/src root@77.237.233.132:/opt/1etiket-bot/panel/
```

---

## 5. Dockerfile (Multi-Stage Build)

```
Stage 1 (panel-builder):
  - node:20-alpine
  - WORKDIR /panel
  - npm ci && npm run build
  - Vite ciktisi: /public/panel-app/ (outDir: '../public/panel-app')

Stage 2 (bot):
  - node:20-alpine
  - apk: python3, make, g++ (better-sqlite3 icin)
  - npm ci --omit=dev
  - COPY server.js, services/, utils/, public/
  - COPY --from=panel-builder /public/panel-app/ → ./public/panel-app/
  - Non-root user: appuser
  - Port: 3000
```

**ONEMLI:** Vite `outDir` ayari `../public/panel-app` oldugu icin Docker Stage 1'de cikti `/public/panel-app/` altinda olusur. Dockerfile'da `COPY --from=panel-builder /public/panel-app/ ./public/panel-app/` seklinde kopyalanir.

---

## 6. Dosya Yapisi

```
/opt/1etiket-bot/
├── server.js                    # Express sunucu + tum API endpoint'leri
├── package.json                 # Node.js bagimliliklar (v2.0.0)
├── Dockerfile                   # Multi-stage build
├── docker-compose.yml           # 4 servis tanimlamasi
├── .env                         # Ortam degiskenleri (GIZLI)
│
├── services/
│   ├── database.js              # SQLite (better-sqlite3) — conversations, messages, customers, daily_stats
│   ├── conversationManager.js   # 18 state FSM + human handoff + bot ON/OFF gate
│   ├── whatsappService.js       # Webhook handler + mesaj gonderme + admin WA mesaj yakalama
│   ├── evolutionTransport.js    # Evolution API REST client (axios)
│   ├── messageQueue.js          # Anti-ban rate limiting (20/dk, kisi basi cooldown)
│   ├── sessionMonitor.js        # QR reconnect + baglanti izleme
│   ├── customerService.js       # CRM: musteri profili, WC sync, segment hesaplama
│   ├── statsService.js          # Dashboard istatistikleri
│   ├── woocommerceService.js    # WooCommerce REST API client
│   ├── priceCalculator.js       # Etiket fiyat hesaplama
│   └── fileService.js           # Baski dosyasi yonetimi
│
├── utils/
│   └── logger.js                # Winston logger
│
├── public/
│   ├── panel.html               # Eski vanilla JS panel (panel-legacy)
│   └── panel-app/               # React build ciktisi (Vite)
│       ├── index.html
│       └── assets/              # JS + CSS bundle
│
├── panel/                       # React kaynak kodu
│   ├── package.json             # react 18, vite 5
│   ├── vite.config.js           # base: '/panel/', outDir: '../public/panel-app'
│   ├── index.html
│   └── src/
│       ├── main.jsx             # React entry point
│       ├── App.jsx              # Auth routing (login vs main)
│       ├── api/
│       │   └── client.js        # fetch wrapper + tum API cagrilari
│       ├── contexts/
│       │   ├── AuthContext.jsx   # Secret-based auth state
│       │   └── AppContext.jsx    # Conversations, selectedPhone, stats, profile
│       ├── hooks/
│       │   └── usePolling.js    # Polling intervalleri (5s/3s/10s/15s)
│       ├── pages/
│       │   ├── LoginPage.jsx    # Admin secret giris ekrani
│       │   └── MainLayout.jsx   # 3 kolonlu layout (sidebar + chat + profil)
│       ├── components/
│       │   ├── sidebar/
│       │   │   ├── Sidebar.jsx
│       │   │   ├── SidebarHeader.jsx   # Baslik + cikis butonu
│       │   │   ├── StatsBar.jsx        # Konusma/mesaj sayilari
│       │   │   ├── TabBar.jsx          # Tumu | Bekleyen | Musteriler
│       │   │   └── ConversationList.jsx # Konusma + musteri listesi
│       │   ├── chat/
│       │   │   ├── ChatArea.jsx        # Chat container
│       │   │   ├── ChatHeader.jsx      # Musteri adi + profil/handoff butonlari
│       │   │   ├── MessageList.jsx     # Mesaj baloncuklari + medya gosterimi
│       │   │   └── MessageInput.jsx    # Mesaj gonderme input'u
│       │   ├── customer/
│       │   │   └── CustomerProfilePanel.jsx  # 360 derece musteri profili (sag panel)
│       │   └── common/
│       │       └── ConnectionIndicator.jsx   # Yesil/kirmizi baglanti noktasi
│       └── styles/
│           └── globals.css      # WhatsApp karanlik tema + tum stiller
│
├── uploads/
│   └── baski-dosyalari/         # Musteri baski dosyalari
├── logs/                        # Winston log dosyalari
└── data/
    └── bot.db                   # SQLite veritabani
```

---

## 7. Ortam Degiskenleri (.env)

```env
# Evolution API
EVOLUTION_BASE_URL=http://evolution-api:8080
EVOLUTION_APIKEY=<evolution-api-key>
EVOLUTION_INSTANCE=1etiket-main
EVOLUTION_WEBHOOK_PATH=/webhook/evolution

# WooCommerce
WC_URL=https://1etiket.com.tr
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...
WC_WEBHOOK_SECRET=<webhook-secret>

# Admin Panel
ADMIN_SECRET=1etiket_admin_2024_secret

# Webhook
WEBHOOK_PUBLIC_URL=http://77.237.233.132:3000/webhook/evolution

# PostgreSQL (Evolution icin)
POSTGRES_PASSWORD=<postgres-password>

# Genel
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

---

## 8. API Endpoint'leri

### Auth
Tum `/admin/*` endpoint'leri `x-admin-secret` header'i veya `?secret=` query parametresi gerektirir.

### Instance Yonetimi
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | `/admin/instance/status` | WhatsApp baglanti durumu |
| GET | `/admin/instance/qr` | QR kodu al |
| POST | `/admin/instance/create` | Instance olustur |
| POST | `/admin/instance/webhook` | Webhook URL ayarla |

### Konusma Yonetimi
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | `/admin/conversations` | Aktif konusma listesi |
| GET | `/admin/conversations/handoff` | Human handoff bekleyenler |
| GET | `/admin/conversations/:phone/messages` | Mesaj gecmisi (metadata dahil) |
| POST | `/admin/conversations/:phone/send` | Admin mesaj gonder `{ text, agent }` |
| POST | `/admin/conversations/:phone/handoff` | Handoff baslat |
| POST | `/admin/conversations/:phone/release` | Bota geri don |

### Musteri Yonetimi (CRM)
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | `/admin/customers` | Musteri listesi (segment/limit/search filtre) |
| GET | `/admin/customers/:phone` | 360 derece musteri profili |
| POST | `/admin/customers/:phone/bot-toggle` | Bot ON/OFF `{ enabled: bool }` |
| POST | `/admin/customers/:phone/sync` | WC senkronizasyon tetikle |
| POST | `/admin/customers/:phone/segment` | Segment guncelle `{ segment }` |

### Medya
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | `/admin/media/:messageId` | Medya indirme (resim/belge) — `?secret=` ile auth |

### Istatistik & Baglanti
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | `/admin/stats` | Temel istatistikler + queue + monitor |
| GET | `/admin/stats/dashboard` | Kapsamli dashboard verileri |
| GET | `/admin/connection/status` | Detayli baglanti durumu |
| GET | `/health` | Health check (auth gerektirmez) |

### Webhook'lar
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| POST | `/webhook/evolution` | Evolution API webhook (mesaj gelme) |
| POST | `/webhook/woocommerce` | WC siparis durum bildirimleri |

---

## 9. Veritabani Yapisi (SQLite)

Dosya: `/opt/1etiket-bot/data/bot.db`

### Tablolar

**conversations** — Aktif konusmalar
- `phone` (PK), `name`, `state` (FSM), `data` (JSON), `is_human_handoff`, `created_at`, `updated_at`, `last_activity`

**messages** — Mesaj gecmisi
- `id` (PK), `phone`, `direction` (inbound/outbound/human), `content`, `message_type` (text/image/document/audio/location), `metadata` (JSON), `created_at`

**handoff_notes** — Human handoff notlari
- `id`, `phone`, `agent`, `note`, `created_at`

**customers** — CRM musteri profilleri
- `phone` (PK), `wc_customer_id`, `name`, `email`, `city`, `customer_type`, `segment` (vip/normal/risk/sleeping), `channel_source`, `total_orders`, `total_spending`, `last_order_*`, `bot_enabled`, `wc_last_sync`, `created_at`, `updated_at`

**daily_stats** — Gunluk istatistikler
- `date` (PK), `total_conversations`, `new_conversations`, `total_messages`, `inbound_messages`, `outbound_messages`, `human_messages`, `handoff_count`, `orders_created`, `unique_contacts`

---

## 10. Bot FSM (Conversation States)

18 state'li siparis akisi:

```
IDLE → MAIN_MENU → SELECT_MATERIAL → SELECT_SIZE → SELECT_QUANTITY
→ SHOW_PRICE → SELECT_CUSTOMER_TYPE
→ ENTER_BIREYSEL_INFO / ENTER_KURUMSAL_INFO
→ ENTER_ADDRESS → ENTER_EMAIL → CONFIRM_ORDER → AWAITING_FILE
→ ORDER_TRACKING
→ HUMAN_HANDOFF (herhangi state'ten erisilebilir)
```

### Human Handoff Mekanizmasi
- Musteri "insan/operator/yetkili/destek" yazarsa → bot susup insana yonlendirir
- Admin panelden mesaj gondererek cevaplar
- Musteri "bot" veya "0" yazarsa → otomatik sisteme geri doner
- DB'de `is_human_handoff` flag'i ile yonetilir

### Bot ON/OFF
- `customers.bot_enabled` ile musteri bazli kontrol
- Bot OFF → siparis akisi calismaz, mesajlar yine DB'ye kaydedilir
- Admin hala mesaj gonderebilir
- WooCommerce bildirimleri hala gider

---

## 11. Polling Intervalleri (React Panel)

| Veri | Interval | Aciklama |
|------|----------|----------|
| Konusmalar | 5 saniye | `/admin/conversations` |
| Mesajlar | 3 saniye | `/admin/conversations/:phone/messages` |
| Dashboard stats | 10 saniye | `/admin/stats/dashboard` |
| Baglanti durumu | 15 saniye | `/admin/connection/status` |

---

## 12. WooCommerce Senkronizasyon

| Tetikleyici | Aciklama | Siklik |
|-------------|----------|--------|
| Yeni konusma | Musteri WC'de aranir, bulunursa link | Bir kez |
| Siparis olusturma | Musteri + siparis verileri guncellenir | Hemen |
| Admin "Sync" tiklar | Tam musteri + siparis guncelleme | Istek uzerine |
| Profil panel acilir | `wc_last_sync > 1 saat` ise otomatik | Istek uzerine |
| Background cron | Tum linkli musteriler | 6 saatte bir |

### Segment Hesaplama
- **VIP:** 3+ siparis VEYA 1000+ TL harcama
- **Sleeping:** 30+ gun inaktif
- **Risk:** Manuel atanir
- **Normal:** Varsayilan

---

## 13. Medya Gosterimi

Panel'de resimler dogrudan goruntulenir:

1. Evolution API webhook ile mesaj gelir → `metadata` JSON'a medya bilgileri kaydedilir (id, mimeType, caption)
2. React `MessageList.jsx` icindeki `MediaContent` bileşeni medya turune gore render eder
3. Resimler icin: `/admin/media/:messageId?secret=...` endpoint'i cagirilir
4. Backend, Evolution API `downloadMediaBase64()` ile medyayi alip browser'a iletir
5. `<img>` tag'lari custom header gonderemez, bu yuzden auth `?secret=` query parametresi ile yapilir
6. Medya Evolution API'de gecici olarak saklanir — eski medya expire olabilir

---

## 14. Onemli Teknik Notlar

### Admin WhatsApp Mesajlari
- Evolution API webhook `data.key.fromMe = true` dondurur hem bot hem admin WA mesajlari icin
- `whatsappService.js` icerisinde duplicate detection yapilir: son 30 saniye icindeki outbound mesajlarla karsilastirilir
- Ayni content yoksa `direction: 'human'` olarak kaydedilir
- Log'da `[ADMIN-WA]` olarak gorunur

### Numbered List Sistemi
- WhatsApp Web'de native butonlar calismadigi icin numara secimi kullanilir
- Kullanici "1", "2", "3" gibi rakam yazarak secim yapar
- `parseNumberedReply()` fonksiyonu state'e gore dogru ID'ye donusturur

### Anti-Ban
- `messageQueue.js` ile rate limiting: max 20 mesaj/dakika
- Kisi basi cooldown suresi var
- Mesajlar kuyruga alinip sirayla gonderilir

### Panel Asset Path
- Vite config'de `base: '/panel/'` ayari zorunlu
- Bu olmadan asset'ler `/assets/...` yerine `/panel/assets/...` altinda aranir ve 404 verir
- Express'te `app.use('/panel', express.static(panelAppPath))` ile serve edilir

---

## 15. Lokal Gelistirme

### Backend
```bash
cd WhatsApp-Chatbot
cp .env.example .env  # .env duzenlenmeli
npm install
npm run dev           # nodemon ile hot reload
```

### Panel (React)
```bash
cd WhatsApp-Chatbot/panel
npm install
npm run dev           # Vite dev server — localhost:5173
                      # /admin/* istekleri localhost:3000'e proxy edilir
```

### Panel Build
```bash
npm run panel:build   # veya: cd panel && npm run build
                      # Cikti: public/panel-app/
```

---

## 16. Tema & Tasarim

WhatsApp karanlik tema:
- `--bg: #111b21` (ana arkaplan)
- `--sidebar-bg: #1f2c34` (sidebar)
- `--card-bg: #233138` (kartlar)
- `--accent: #00a884` (yesil vurgu)
- `--danger: #ea4335` (kirmizi)
- `--text: #e9edef` (ana metin)
- `--text-muted: #8696a0` (soluk metin)

Segment Badge Renkleri:
- VIP: `#00a884` (yesil)
- Normal: `#8696a0` (gri)
- Risk: `#ea4335` (kirmizi)
- Sleeping: `#f5a623` (turuncu)

---

## 17. Phase 1 Tamamlanan Ozellikler

- [x] Musteri profili karti (360 derece gorunum)
- [x] Son siparis gosterimi
- [x] Bot ON/OFF musteri bazli toggle
- [x] Toplam harcama & siparis sayisi
- [x] Baglanti durumu gostergesi (yesil/kirmizi dot)
- [x] Kalici DB istatistikleri
- [x] WooCommerce senkronizasyon (manuel + otomatik)
- [x] Segment yonetimi (VIP/Normal/Risk/Sleeping)
- [x] Medya goruntuleme (resim, belge, ses, konum)
- [x] Admin WhatsApp mesajlarini panelde gosterme
- [x] React + Vite panel (multi-stage Docker build)
- [x] Turkce karakter destegi

---

## 18. Sonraki Fazlar (Roadmap)

### Phase 2 — Gelismis Mesajlasma
- Socket.io real-time mesajlasma (polling yerine)
- Mesaj durumu (gonderildi/iletildi/okundu)
- Emoji picker + dosya gonderme
- Sablon mesajlar
- PostgreSQL migrasyonu

### Phase 3 — Otomasyon & Raporlar
- Otomatik mesaj kurallari
- Zamanlanmis mesajlar
- Detayli raporlar + grafikler
- Musteri segmentasyonu otomasyonu

### Phase 4 — Coklu Kanal
- Instagram DM entegrasyonu
- E-posta entegrasyonu
- Birlesik mesaj kutusu

---

## 19. Hizli Referans

```bash
# VPS'e baglan
ssh -i ~/.ssh/id_ed25519 root@77.237.233.132

# Deploy
cd /opt/1etiket-bot && docker compose up -d --build bot

# Log izle
docker compose logs -f bot --tail 100

# Health check
curl http://77.237.233.132:3000/health

# Panel eris
http://77.237.233.132/panel/
# Admin secret: 1etiket_admin_2024_secret

# Container durumu
docker compose ps

# Bot restart
docker compose restart bot

# Tum servisleri restart
docker compose restart

# DB yedek al
docker compose exec bot cat /app/data/bot.db > backup_bot.db

# Evolution API durumu
curl -H "apikey: <EVOLUTION_APIKEY>" http://77.237.233.132:8080/instance/fetchInstances
```
