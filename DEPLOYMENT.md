# Sistemi Aktif Hale Getirme Rehberi

## Gereksinimler

- VPS sunucu (DigitalOcean, Hetzner, AWS, vs.) — min 1GB RAM
- Domain veya subdomain (örn: `bot.1etiket.com.tr`)
- Meta Business hesabı + WhatsApp Business API erişimi
- WooCommerce REST API anahtarları
- Node.js 18+ veya Docker

---

## Adım 1: Meta Business & WhatsApp Kurulumu

### 1.1 Meta Business Hesabı

1. https://business.facebook.com adresinden iş hesabınıza giriş yapın
2. Sol menüden **Ayarlar** > **İş Hesabı Bilgileri** sayfasından **Business ID**'nizi not edin

### 1.2 WhatsApp Business API Uygulaması

1. https://developers.facebook.com adresine gidin
2. **Uygulama Oluştur** > **İş** türünü seçin
3. Sol menüden **WhatsApp** > **Başlarken** bölümüne gidin
4. Buradan şu bilgileri alın:
   - **Phone Number ID** → `.env` dosyasında `WHATSAPP_PHONE_ID`
   - **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ID`
   - **Geçici Access Token** → `WHATSAPP_TOKEN` (ilk test için)

### 1.3 Kalıcı Token Oluşturma

Geçici token 24 saat sonra sona erer. Kalıcı token için:

1. **Uygulama** > **Ayarlar** > **Temel** bölümünde **App Secret**'ı kopyalayın
2. **Business Ayarları** > **Sistem Kullanıcıları** sayfasına gidin
3. **Sistem Kullanıcısı Ekle** > Admin rolünde
4. **Token Oluştur** > Uygulama seçin > İzinler:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Oluşturulan token'ı `.env` dosyasında `WHATSAPP_TOKEN` olarak kaydedin

### 1.4 Webhook'u Test Telefon Numarasıyla Deneme

Meta geliştiriciler panelinde **WhatsApp** > **API Kurulumu** bölümünden en fazla 5 test numarası ekleyebilirsiniz. Gerçek numara almadan önce bu numaralarla test edin.

---

## Adım 2: WooCommerce API Anahtarları

1. WordPress admin paneli > **WooCommerce** > **Ayarlar** > **Gelişmiş** > **REST API**
2. **Anahtar Ekle**:
   - Açıklama: `WhatsApp Bot`
   - Kullanıcı: Admin
   - İzinler: **Okuma/Yazma**
3. Oluşturulan anahtarları `.env` dosyasına kopyalayın:
   - **Consumer Key** → `WC_CONSUMER_KEY`
   - **Consumer Secret** → `WC_CONSUMER_SECRET`

### WooCommerce Webhook (Sipariş Durum Bildirimi)

1. **WooCommerce** > **Ayarlar** > **Gelişmiş** > **Webhooklar**
2. **Webhook Ekle**:
   - Ad: `WhatsApp Bot Sipariş Bildirimi`
   - Durum: Aktif
   - Konu: **Sipariş güncellendi**
   - Teslimat URL: `https://bot.1etiket.com.tr/webhook/woocommerce`
   - Gizli: Bir secret belirleyin → `.env`'de `WC_WEBHOOK_SECRET`

---

## Adım 3: Sunucu Kurulumu

### Seçenek A: PM2 ile (Önerilen)

```bash
# 1. Sunucuya bağlan
ssh root@sunucu-ip

# 2. Node.js kur
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. PM2 kur
sudo npm install -g pm2

# 4. Projeyi sunucuya al
git clone <repo-url> /opt/whatsapp-bot
cd /opt/whatsapp-bot

# 5. Bağımlılıkları kur
npm ci --omit=dev

# 6. .env dosyasını oluştur
cp .env.example .env
nano .env  # Gerçek değerleri girin

# 7. Ortam doğrulaması
npm run validate

# 8. PM2 ile başlat
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Sunucu yeniden başladığında otomatik çalışsın
```

### Seçenek B: Docker ile

```bash
# 1. .env dosyasını oluştur
cp .env.example .env
nano .env

# 2. Docker ile başlat
docker compose up -d

# 3. Logları kontrol et
docker compose logs -f
```

---

## Adım 4: SSL ve Nginx

Meta webhook'ları **sadece HTTPS** üzerinden çalışır. SSL şarttır.

```bash
# 1. Nginx kur
sudo apt install nginx -y

# 2. Certbot kur (SSL için)
sudo apt install certbot python3-certbot-nginx -y

# 3. Nginx config'i kopyala
sudo cp deploy/nginx.conf /etc/nginx/sites-available/whatsapp-bot
sudo ln -s /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/

# 4. Domain'i sunucu IP'sine yönlendirin (DNS A kaydı)
# bot.1etiket.com.tr → sunucu-ip

# 5. SSL sertifikası al
sudo certbot --nginx -d bot.1etiket.com.tr

# 6. Nginx'i yeniden başlat
sudo nginx -t
sudo systemctl restart nginx
```

---

## Adım 5: Meta Webhook Kayıt

SSL ve sunucu hazır olduktan sonra:

1. https://developers.facebook.com > Uygulamanız > **WhatsApp** > **Yapılandırma**
2. **Callback URL**: `https://bot.1etiket.com.tr/webhook/whatsapp`
3. **Verify Token**: `.env`'deki `WHATSAPP_VERIFY_TOKEN` değeri
4. **Doğrula ve Kaydet** butonuna tıklayın
5. **Webhook Alanları** altında şunları işaretleyin:
   - `messages` — Gelen mesajlar

Bu adımda Meta sunucunuza bir GET isteği gönderir. Sunucu çalışıyor ve URL doğruysa `challenge` döner ve webhook kaydedilir.

---

## Adım 6: Test

```bash
# 1. Health check
curl https://bot.1etiket.com.tr/health
# Beklenen: {"status":"ok","uptime":...}

# 2. Test telefon numarasından WhatsApp'ta mesaj gönderin
# "Merhaba" yazın, bot karşılama mesajı ile yanıt vermeli

# 3. Logları izle
pm2 logs 1etiket-whatsapp-bot    # PM2 ile
docker compose logs -f            # Docker ile
```

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| Webhook doğrulanmıyor | `WHATSAPP_VERIFY_TOKEN` .env ile Meta paneldeki aynı mı? |
| Mesaj gönderilmiyor | `WHATSAPP_TOKEN` süresi dolmuş olabilir. Kalıcı token oluşturun |
| 403 Forbidden | Nginx config'te proxy_pass doğru port'u mu gösteriyor? |
| WooCommerce bağlanamıyor | `WC_URL` doğru mu? HTTP/HTTPS? API anahtarları okuma/yazma mı? |
| Bot cevap vermiyor | `pm2 logs` ile hata mesajlarını kontrol edin |
| SSL sertifika hatası | `certbot renew --dry-run` ile test edin |

## Ortam Doğrulama

Herhangi bir zamanda `.env` ayarlarını kontrol etmek için:

```bash
npm run validate
```

Bu komut tüm zorunlu değişkenleri, WooCommerce ve WhatsApp API bağlantılarını test eder.
