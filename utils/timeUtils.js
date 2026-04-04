/**
 * Zaman yardımcı fonksiyonları — Türkiye saati (UTC+3, DST yok)
 */

const TURKEY_UTC_OFFSET = 3; // Türkiye her zaman UTC+3
const QUIET_START = 18; // 18:00'den sonra sessiz
const QUIET_END = 10;   // 10:00'a kadar sessiz

/**
 * Şu anki Türkiye saatini döndürür (0-23)
 */
function getTurkeyHour() {
  const now = new Date();
  return (now.getUTCHours() + TURKEY_UTC_OFFSET) % 24;
}

/**
 * Şu an sessiz saat mi? (18:00 - 10:00 arası = sessiz)
 * true → mesaj gönderme, beklet
 */
function isQuietHours() {
  const hour = getTurkeyHour();
  // 18:00-23:59 veya 00:00-09:59 → sessiz
  return hour >= QUIET_START || hour < QUIET_END;
}

/**
 * Bir sonraki 10:00 Türkiye saatine kaç milisaniye var?
 * Sessiz saatte mesaj gönderme yerine bu kadar bekleyip gönder
 */
function msUntilNextActiveHour() {
  const now = new Date();
  const turkeyHour = (now.getUTCHours() + TURKEY_UTC_OFFSET) % 24;
  const turkeyMin = now.getUTCMinutes();

  let hoursUntil;
  if (turkeyHour >= QUIET_START) {
    // 18:00-23:59 → ertesi gün 10:00'a kadar
    hoursUntil = (24 - turkeyHour) + QUIET_END;
  } else {
    // 00:00-09:59 → bugün 10:00'a kadar
    hoursUntil = QUIET_END - turkeyHour;
  }

  // Dakika farkını çıkar (tam saate yuvarla)
  const msUntil = (hoursUntil * 60 - turkeyMin) * 60 * 1000;
  return Math.max(msUntil, 60000); // Minimum 1 dakika
}

/**
 * Bir sonraki aktif saatin Unix timestamp'ini döndürür
 */
function getNextActiveTimestamp() {
  return Date.now() + msUntilNextActiveHour();
}

module.exports = {
  getTurkeyHour,
  isQuietHours,
  msUntilNextActiveHour,
  getNextActiveTimestamp,
  QUIET_START,
  QUIET_END
};
