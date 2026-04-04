/**
 * Türkçe → ASCII karakter normalizasyonu
 * Bot'un tüm keyword matching'lerinde kullanılır
 */
function normalizeTurkish(text) {
  if (!text) return '';
  return text
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .toLowerCase();
}

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

module.exports = { validateEmail, validateSize, validatePhone, normalizeTurkish };
