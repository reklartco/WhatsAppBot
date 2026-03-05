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
