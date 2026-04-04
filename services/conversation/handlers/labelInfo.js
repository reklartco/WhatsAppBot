const { sendTextMessage } = require('../../whatsappService');
const { STATES, MATERIALS } = require('../states');
const { tryNLtoCart } = require('../parseOrder');

const LABEL_INFO_DATA = {
  1: {
    name: 'Kuşe Etiket',
    detail:
      `*Kuşe Etiket* 🏷️\n\n` +
      `En yaygın ve en uygun fiyatlı etiket türüdür.\n\n` +
      `✅ Yüksek baskı kalitesi\n` +
      `✅ Uygun fiyatlı\n` +
      `❌ Suya dayanıklı değildir\n\n` +
      `Kullanım alanları: Ürün etiketi, barkod, adres etiketi, kargo etiketi, raf etiketi`
  },
  2: {
    name: 'Opak Etiket',
    detail:
      `*Opak Etiket* 💧\n\n` +
      `Kuşe etiket ile arasındaki tek fark suya dayanıklı olmasıdır.\n\n` +
      `✅ Suya dayanıklı\n` +
      `✅ Yüksek baskı kalitesi\n` +
      `✅ Dayanıklı yapışkan\n\n` +
      `Kullanım alanları: Dış mekan ürünleri, soğuk zincir ürünleri, kozmetik, temizlik ürünleri`
  },
  3: {
    name: 'Şeffaf Etiket',
    detail:
      `*Şeffaf Etiket* ✨\n\n` +
      `Arkası şeffaf etikettir. Zemini renkli veya beyaz etiket kullanmak istemiyorsanız sizin için uygundur.\n\n` +
      `✅ Suya dayanıklı\n` +
      `✅ Ürünün kendi rengini ön plana çıkarır\n` +
      `✅ Premium görünüm\n\n` +
      `Kullanım alanları: Şişe etiketi, kavanoz etiketi, cam ambalaj, kozmetik`
  },
  4: {
    name: 'Kraft Etiket',
    detail:
      `*Kraft Etiket* 🌿\n\n` +
      `Kendiliğinden zemini kraft karton görünümlüdür. Karton değildir, arkası yapışkanlıdır.\n\n` +
      `✅ Doğal, vintage görünüm\n` +
      `✅ Yapışkanlı\n` +
      `✅ Organik ve doğal ürün hissi\n\n` +
      `Kullanım alanları: El yapımı ürünler, organik gıda, butik ürünler, hediyelik ambalaj`
  },
  5: {
    name: 'Karton Etiket',
    detail:
      `*Karton Etiket* 📋\n\n` +
      `Ürün etiketleri ve kartvizit baskıları için kullanılan dayanıklı kartondur. İsteğe bağlı olarak ip deliği açılabilir.\n\n` +
      `✅ Sert ve dayanıklı yapı\n` +
      `✅ Askılı etiket için uygun\n` +
      `✅ Kartvizit baskısı yapılabilir\n\n` +
      `Kullanım alanları: Giyim askılı etiket, fiyat kartı, ürün bilgi kartı, kartvizit`
  },
  6: {
    name: 'Metalize Etiket',
    detail:
      `*Metalize Etiket* ✨\n\n` +
      `Altın ve gümüş görünümlü, parlak yüzeyiyle premium ürün etiketleri için uygundur.\n\n` +
      `✅ Altın ve gümüş renk seçenekleri\n` +
      `✅ Parlak yüzey\n` +
      `✅ Lüks ve premium görünüm\n\n` +
      `Kullanım alanları: Premium ürünler, kozmetik, parfüm, hediye ambalajı`
  },
  7: {
    name: 'Hologram Etiket',
    detail:
      `*Hologram Etiket* 🌟\n\n` +
      `Ürünlerinize orijinallik ve güven ibaresi eklemek istediğinizde tercih edebilirsiniz.\n\n` +
      `✅ Orijinallik güvencesi\n` +
      `✅ Kopyalanması zor\n` +
      `✅ Dikkat çekici görünüm\n\n` +
      `Kullanım alanları: Güvenlik etiketi, orijinal ürün damgası, marka koruma, belge güvenliği`
  }
};

async function showLabelInfoMenu(from) {
  await sendTextMessage(from,
    `📋 *Etiket Türlerimiz:*\n\n` +
    `1. *Kuşe Etiket* — En yaygın ve en uygun fiyatlı etiket türüdür. Suya dayanıklı değildir.\n\n` +
    `2. *Opak Etiket* — Kuşe etiket ile arasındaki tek farkı suya dayanıklı olmasıdır.\n\n` +
    `3. *Şeffaf Etiket* — Arkası şeffaf etikettir. Suya dayanıklıdır.\n\n` +
    `4. *Kraft Etiket* — Kraft karton görünümlü, arkası yapışkanlıdır.\n\n` +
    `5. *Karton Etiket* — Dayanıklı karton. İsteğe bağlı ip deliği açılabilir.\n\n` +
    `6. *Metalize Etiket* — Altın ve gümüş görünümlü, premium ürünler için.\n\n` +
    `7. *Hologram Etiket* — Orijinallik ve güven ibaresi için.\n\n` +
    `Detaylı bilgi almak istediğiniz etiket numarasını yazın veya *0* ile ana menüye dönün.`
  );
}

async function handleLabelInfo(from, conv, msgContent) {
  const text = msgContent.text?.trim();

  if (text === '0') {
    conv.data = {};
    conv.state = STATES.IDLE;
    const { handleIdle } = require('./idle');
    await handleIdle(from, conv.name || 'Müşteri', conv, msgContent);
    return;
  }

  const num = parseInt(text);
  if (num >= 1 && num <= 7 && LABEL_INFO_DATA[num]) {
    const info = LABEL_INFO_DATA[num];
    conv.data.selectedLabelInfo = num;
    await sendTextMessage(from, info.detail);

    await sendTextMessage(from,
      `Bu etiket türü için fiyat hesaplamak ister misiniz?\n\n` +
      `1. ✅ Evet, fiyat hesapla\n` +
      `2. 🔙 Diğer etiket türlerine bak\n` +
      `3. 🏠 Ana menüye dön`
    );
    conv.state = STATES.LABEL_INFO_DETAIL;
  } else {
    if (text && text.length >= 8) {
      const nlResult = await tryNLtoCart(from, conv, text);
      if (nlResult) return;
    }

    conv.data.errorCount = (conv.data.errorCount || 0) + 1;
    if (conv.data.errorCount >= 3) {
      await sendTextMessage(from,
        'Anlaşılan zorluk yaşıyorsunuz. Lütfen 1-7 arası bir numara girin veya *0* ile ana menüye dönün.\n\n' +
        'Ayrıca doğal dilde de sorabilirsiniz. Örneğin: "gıda ürünü için su geçirmez etiket lazım"'
      );
      conv.data.errorCount = 0;
    } else {
      await sendTextMessage(from,
        'Lütfen 1-7 arası bir numara seçin veya *0* ile ana menüye dönün.'
      );
    }
  }
}

// Label info numarası → MATERIALS key eşlemesi
const LABEL_TO_MATERIAL = { 1: 'kuse', 2: 'opak', 3: 'seffaf', 4: 'kraft', 5: 'karton', 6: 'metalize', 7: 'hologram' };

async function handleLabelInfoDetail(from, conv, msgContent) {
  const text = msgContent.text?.trim();

  if (text === '1') {
    const materialKey = conv.data._recommendedMaterial || LABEL_TO_MATERIAL[conv.data.selectedLabelInfo];
    if (materialKey && MATERIALS[materialKey]) {
      conv.data.material = MATERIALS[materialKey];
      conv.data.isQuoteOnly = true;
      conv.data.errorCount = 0;
      delete conv.data._recommendedMaterial;
      await sendTextMessage(from,
        `*${conv.data.material.name}* seçildi.\n\n` +
        `Ölçülerinizi mm cinsinden yazın (min: 10mm, max: 460mm).\n` +
        `Örnek: 50x30`
      );
      conv.state = STATES.SELECT_SIZE;
      return;
    }
    // Fallback: malzeme belirlenemezse listeye yönlendir
    const { showMaterialList } = require('./mainMenu');
    await showMaterialList(from);
    conv.data.isQuoteOnly = true;
    conv.data.errorCount = 0;
    conv.state = STATES.SELECT_MATERIAL;
  } else if (text === '2') {
    conv.data.errorCount = 0;
    await showLabelInfoMenu(from);
    conv.state = STATES.LABEL_INFO;
  } else if (text === '3' || text === '0') {
    conv.data = {};
    conv.state = STATES.IDLE;
    const { handleIdle } = require('./idle');
    await handleIdle(from, conv.name || 'Müşteri', conv, msgContent);
  } else {
    await sendTextMessage(from, 'Lütfen 1, 2 veya 3 yazarak seçim yapın.');
  }
}

module.exports = { handleLabelInfo, handleLabelInfoDetail, showLabelInfoMenu, LABEL_INFO_DATA };
