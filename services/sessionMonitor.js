const EventEmitter = require('events');
const { getInstanceStatus, restartInstance, getQRCode } = require('./evolutionTransport');
const logger = require('../utils/logger');

// ========== OTURUM İZLEME SERVİSİ ==========

class SessionMonitor extends EventEmitter {
  constructor() {
    super();
    this.isConnected = false;
    this.lastQR = null;
    this.checkInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.statusHistory = [];
  }

  /**
   * Monitörü başlat
   */
  start(intervalMs = 30000) {
    logger.info('Oturum monitörü başlatıldı');

    // Global emitter olarak kaydet (whatsappService kullanır)
    global.connectionEmitter = this;

    // Connection event'lerini dinle
    this.on('connectionUpdate', ({ state, statusReason }) => {
      this.handleStateChange(state, statusReason);
    });

    this.on('qrcodeUpdate', ({ qr }) => {
      this.lastQR = qr;
      logger.warn('Yeni QR kodu oluşturuldu — admin panelinden tarayın');
    });

    // Periyodik durum kontrolü
    this.checkInterval = setInterval(() => this.checkConnection(), intervalMs);
    this.checkInterval.unref();

    // İlk kontrol
    this.checkConnection();
  }

  /**
   * Monitörü durdur
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    global.connectionEmitter = null;
    logger.info('Oturum monitörü durduruldu');
  }

  /**
   * Bağlantı durumunu kontrol et
   */
  async checkConnection() {
    try {
      const status = await getInstanceStatus();
      const state = status?.instance?.state || status?.state || 'unknown';

      this.addStatusHistory(state);

      if (state === 'open' || state === 'connected') {
        if (!this.isConnected) {
          logger.info('WhatsApp bağlantısı aktif');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
        }
      } else if (state === 'close' || state === 'disconnected') {
        if (this.isConnected) {
          logger.warn('WhatsApp bağlantısı koptu!');
          this.isConnected = false;
          this.emit('disconnected');
        }
        await this.attemptReconnect();
      } else if (state === 'not_found') {
        logger.warn('Instance bulunamadı — oluşturulması gerekiyor');
        this.isConnected = false;
      }
    } catch (error) {
      logger.error('Bağlantı kontrol hatası:', error.message);
    }
  }

  /**
   * Otomatik yeniden bağlanma
   */
  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Maksimum yeniden bağlanma denemesi (${this.maxReconnectAttempts}) aşıldı`);
      this.emit('maxReconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Yeniden bağlanma denemesi ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    try {
      await restartInstance();
      // Yeniden başlatma sonrası biraz bekle
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      logger.error('Yeniden bağlanma hatası:', error.message);
    }
  }

  /**
   * Durum geçmişine ekle (son 100 kayıt)
   */
  addStatusHistory(state) {
    this.statusHistory.push({ state, timestamp: Date.now() });
    if (this.statusHistory.length > 100) {
      this.statusHistory.shift();
    }
  }

  /**
   * Mevcut durumu al
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastQR: this.lastQR ? '(mevcut)' : null,
      historyLength: this.statusHistory.length,
      lastCheck: this.statusHistory.length > 0
        ? this.statusHistory[this.statusHistory.length - 1]
        : null
    };
  }
}

// Singleton instance
const monitor = new SessionMonitor();

module.exports = monitor;
