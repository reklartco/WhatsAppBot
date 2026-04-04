const { sendTextMessage } = require('../../whatsappService');
const { STATES, MATERIALS, MATERIAL_INDEX } = require('../states');
const { normalizeTurkish } = require('../../../utils/validator');
const { handleStateError, onSuccessfulTransition } = require('../errorRecovery');
const { tryNLtoCart } = require('../parseOrder');
const logger = require('../../../utils/logger');

async function handleMaterialSelect(from, conv, msgContent) {
  let materialId = msgContent.listId || msgContent.text?.toLowerCase();

  const num = parseInt(materialId);
  if (num >= 1 && num <= MATERIAL_INDEX.length) {
    materialId = MATERIAL_INDEX[num - 1];
  }

  let material = MATERIALS[materialId];

  // İsim ile arama (Türkçe normalize)
  if (!material && materialId) {
    const norm = normalizeTurkish(materialId);
    const nameMap = {
      'kuse': 'kuse', 'kagit etiket': 'kuse',
      'opak': 'opak', 'plastik': 'opak',
      'seffaf': 'seffaf', 'transparan': 'seffaf', 'saydam': 'seffaf',
      'kraft': 'kraft', 'kahverengi': 'kraft',
      'karton': 'karton', 'mat kuse': 'karton', '350gr mat': 'karton', 'askili etiket': 'karton',
      'metalize': 'metalize', 'metalik': 'metalize', 'altin': 'metalize', 'gumus': 'metalize',
      'yaldiz': 'hologram', 'yaldizli': 'hologram', 'varak': 'hologram',
      'parlak kuse': 'parlak', 'parlak etiket': 'parlak', 'glossy': 'parlak',
      '300gr selefonlu': '300grmatselefonlu', '300gr mat selefonlu': '300grmatselefonlu',
      '350gr selefonlu': '350grmatselefonlu', '350gr mat selefonlu': '350grmatselefonlu',
      'selefonlu': '350grmatselefonlu', 'laminasyonlu': '350grmatselefonlu',
      '300gr amerikan': '300gramerikan', 'amerikan bristol': '300gramerikan', 'bristol': '300gramerikan',
      '350gr amerikan': '350gramerikan',
      'sarap kagidi': 'sarap', 'sarap etiketi': 'sarap', 'wine': 'sarap',
      'kirilgan': 'kirilgan-etiket', 'fragile': 'kirilgan-etiket', 'guvenlik etiketi': 'kirilgan-etiket',
      'yumurta kabugu': 'yumurta-kabugu-sticker', 'dokulu': 'yumurta-kabugu-sticker',
      'ozel kagit': 'ozel-kagit',
      'fantezi': 'fantezi-kagidi', 'dekoratif': 'fantezi-kagidi',
      '170gr': '170grkuse', '170gr kuse': '170grkuse', 'ince kuse': '170grkuse',
      'hologram metalize': 'hologram-metalize', 'holografik metalik': 'hologram-metalize',
    };
    for (const [keyword, matKey] of Object.entries(nameMap)) {
      if (norm.includes(keyword)) {
        material = MATERIALS[matKey];
        break;
      }
    }
  }

  // Hâlâ bulunamadıysa NL-to-Cart dene
  if (!material && materialId && materialId.length >= 5) {
    const nlResult = await tryNLtoCart(from, conv, materialId);
    if (nlResult) return;
  }

  if (!material) {
    const recovered = await handleStateError(from, conv, 'Geçersiz seçim. Lütfen listeden bir numara seçin veya malzeme adını yazın.\nÖrnek: kuşe, opak, şeffaf, kraft');
    if (recovered) return;
    return;
  }

  onSuccessfulTransition(conv, STATES.SELECT_MATERIAL);
  conv.data.material = material;

  // FALLBACK: Önceki mesajdan kayıtlı boyut+adet varsa direkt hesapla
  if (conv.data._pendingWidth && conv.data._pendingHeight) {
    conv.data.width = conv.data._pendingWidth;
    conv.data.height = conv.data._pendingHeight;
    delete conv.data._pendingWidth;
    delete conv.data._pendingHeight;

    if (conv.data._pendingQuantity && conv.data._pendingQuantity >= 50) {
      conv.data.quantity = conv.data._pendingQuantity;
      delete conv.data._pendingQuantity;
      logger.info(`[MATERIAL-SELECT] ${from}: Kayıtlı boyut+adet ile direkt fiyat → ${material.name} ${conv.data.width}x${conv.data.height}mm ${conv.data.quantity} adet`);
      const { calculateAndShowPrice } = require('./price');
      await calculateAndShowPrice(from, conv);
    } else {
      delete conv.data._pendingQuantity;
      logger.info(`[MATERIAL-SELECT] ${from}: Kayıtlı boyut ile adet sorulacak → ${material.name} ${conv.data.width}x${conv.data.height}mm`);
      const { showQuantityOptions } = require('./size');
      await showQuantityOptions(from, conv);
    }
    return;
  }

  await sendTextMessage(from,
    `${material.name} seçildi.\n\n` +
    `Etiket boyutunu seçin:\n` +
    `1. 50x50 mm\n` +
    `2. 100x50 mm\n` +
    `3. Özel Boyut\n\n` +
    `Direkt ölçü girebilirsiniz. (Örn: 75x50)\n` +
    `📏 Min: 10mm — Maks: 460mm`
  );

  conv.state = STATES.SELECT_SIZE;
}

module.exports = { handleMaterialSelect };
