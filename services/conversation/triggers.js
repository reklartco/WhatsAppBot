const { normalizeTurkish } = require('../../utils/validator');

// ========== TETİKLEME KELİMELERİ ==========
// İlk kelime tetikleyicileri — mesajın İLK kelimesi bunlardan biriyse bot başlar
const GREETING_TRIGGERS = [
  'merhaba', 'merhabalar', 'selam', 'selamlar', 'slm', 'mrb',
  'hey', 'hi', 'hello', 'helo', 'sa', 'as',
  'günaydın', 'hayırlı',
];

// Cümle içinde geçtiğinde tetikleyen kelimeler
const KEYWORD_TRIGGERS = [
  'bilgi', 'fiyat', 'sipariş', 'etiket', 'sticker', 'baskı',
  'hakkında', 'menü', 'menu', 'yardım', 'başla', 'başlat',
  'hizmet', 'ürün', 'katalog', 'kaça', 'ne kadar',
];

// Tam cümle / kalıp tetikleyiciler
const PHRASE_TRIGGERS = [
  'iyi günler', 'iyi akşamlar', 'hayırlı günler',
  'bilgi almak istiyorum', 'bilgi alabilir miyim',
  'fiyat öğrenmek istiyorum', 'fiyat ne kadar', 'fiyat bilgisi',
  'sipariş vermek istiyorum', 'sipariş ver',
  'etiket bastırmak', 'etiket baskı',
  'nasıl sipariş', 'ne yapıyorsunuz',
  'kaç tl', 'ne kadar',
  'reklamınızı gördüm', 'reklamdan geldim', 'reklam',
  'daha fazla bilgi', 'detaylı bilgi',
];

function isTriggerWord(text) {
  if (!text) return false;
  const cleaned = text.toLowerCase().trim().replace(/[!?,.:;'"()\-\u00BF\u00A1]/g, '').trim();
  if (!cleaned) return false;

  const words = cleaned.split(/\s+/);
  const firstWord = words[0];

  // 1. İlk kelime selamlama mı?
  if (GREETING_TRIGGERS.includes(firstWord)) return true;

  // 2. Tam kalıp eşleşmesi
  for (const phrase of PHRASE_TRIGGERS) {
    if (cleaned.includes(phrase)) return true;
  }

  // 3. Anahtar kelime mesajda geçiyor mu?
  for (const kw of KEYWORD_TRIGGERS) {
    if (kw.includes(' ')) {
      if (cleaned.includes(kw)) return true;
    } else {
      if (words.includes(kw)) return true;
    }
  }

  return false;
}

// ========== FAREWELL (VEDA) ALGILAMA ==========

const FAREWELL_EXACT = [
  'tesekkurler', 'tesekkur ederim', 'sagol', 'sagolun', 'eyvallah',
  'kolay gelsin', 'iyi gunler', 'iyi aksamlar', 'iyi geceler',
  'gorusuruz', 'hoscakal', 'allah razi olsun', 'cok tesekkurler',
  'tesekkur ediyorum', 'cok sagolun', 'tamam tesekkurler',
  'ok tesekkurler', 'tsk', 'tskler', 'eyv', 'saol', 'tsk ederim',
  'hayirli gunler', 'hayirli aksamlar',
];

const FAREWELL_PARTIAL = ['tesekkur', 'kolay gelsin', 'gorusuruz', 'hayirli gunler'];

// Handoff'taki farewell kelimeleri (Türkçe karakterli)
const HANDOFF_FAREWELL_EXACT = [
  'teşekkürler', 'tesekkurler', 'teşekkür ederim', 'sağol', 'sagol',
  'kolay gelsin', 'iyi günler', 'iyi akşamlar', 'görüşürüz',
  'çok teşekkürler', 'cok tesekkurler', 'tşk', 'tsk', 'eyv', 'saol',
  'çok sağolun', 'tamam teşekkürler', 'hayırlı günler',
];

const HANDOFF_FAREWELL_PARTIAL = ['teşekkür', 'tesekkur', 'kolay gelsin', 'görüşürüz'];

function isFarewellMessage(text) {
  if (!text) return false;
  const farewellText = normalizeTurkish(text.trim().replace(/[!.,?;:)(\-]/g, ''));
  const isFarewell = FAREWELL_EXACT.some(f => farewellText === f || farewellText === f + 'r');
  const isPartial = !isFarewell && farewellText.length < 40 &&
    FAREWELL_PARTIAL.some(f => farewellText.includes(f));
  return isFarewell || isPartial;
}

function isHandoffFarewell(text) {
  if (!text) return false;
  const hwText = text.toLowerCase().trim().replace(/[!.,?;:)(\-]/g, '').trim();
  const isFarewell = HANDOFF_FAREWELL_EXACT.some(f => hwText === f || hwText === f + 'r');
  const isPartial = !isFarewell && hwText.length < 40 &&
    HANDOFF_FAREWELL_PARTIAL.some(f => hwText.includes(f));
  return isFarewell || isPartial;
}

module.exports = {
  GREETING_TRIGGERS,
  KEYWORD_TRIGGERS,
  PHRASE_TRIGGERS,
  isTriggerWord,
  isFarewellMessage,
  isHandoffFarewell,
};
