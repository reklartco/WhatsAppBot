/**
 * Dedup DB'yi önceden doldurma scripti
 *
 * Amaç: messages tablosundan daha önce gönderilmiş bildirim mesajlarını
 * sent_notifications tablosuna ekleyerek, sessiz saat bittiğinde
 * tekrar gönderilmesini önlemek.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'whatsapp-bot.db');
console.log(`DB path: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// sent_notifications tablosunun var olduğundan emin ol
db.exec(`
  CREATE TABLE IF NOT EXISTS sent_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL,
    status TEXT NOT NULL,
    phone TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    UNIQUE(order_number, status)
  )
`);

// Bildirim mesajı pattern'leri
const patterns = [
  { regex: /Siparişiniz #(\d+) baskıya alındı/i, status: 'processing' },
  { regex: /Siparişiniz #(\d+) kargoya verildi/i, status: 'shipped' },
  { regex: /Siparişiniz #(\d+) tamamlandı/i, status: 'completed' },
  { regex: /Sipariş #(\d+).*onaylandı/i, status: 'processing' },
  { regex: /Sipariş #(\d+).*baskıda/i, status: 'processing' },
  { regex: /Sipariş #(\d+).*kargo/i, status: 'shipped' },
  { regex: /#(\d+).*baskıya alındı/i, status: 'processing' },
  { regex: /#(\d+).*kargoya verildi/i, status: 'shipped' },
];

// Son 7 günün outbound mesajlarını al
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
const messages = db.prepare(`
  SELECT phone, content, timestamp
  FROM messages
  WHERE direction = 'outbound'
    AND timestamp > ?
  ORDER BY timestamp DESC
`).all(sevenDaysAgo);

console.log(`Son 7 günde ${messages.length} outbound mesaj bulundu`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO sent_notifications (order_number, status, phone, sent_at)
  VALUES (?, ?, ?, ?)
`);

let inserted = 0;
let skipped = 0;

for (const msg of messages) {
  if (!msg.content) continue;

  for (const pattern of patterns) {
    const match = msg.content.match(pattern.regex);
    if (match) {
      const orderNumber = match[1];
      const result = insertStmt.run(orderNumber, pattern.status, msg.phone || '', msg.timestamp || Date.now());
      if (result.changes > 0) {
        inserted++;
        console.log(`  + Eklendi: Sipariş #${orderNumber} / ${pattern.status} / ${msg.phone}`);
      } else {
        skipped++;
      }
      break; // Bir mesaj bir pattern'e eşleşti, diğerlerini kontrol etme
    }
  }
}

console.log(`\nSonuç: ${inserted} yeni kayıt eklendi, ${skipped} zaten mevcuttu`);

// Mevcut kayıt sayısını göster
const total = db.prepare('SELECT COUNT(*) as count FROM sent_notifications').get();
console.log(`Toplam sent_notifications kaydı: ${total.count}`);

db.close();
console.log('Tamamlandı!');
