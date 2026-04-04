const { STATES, MATERIALS, MATERIAL_GROUPS, MATERIAL_INDEX } = require('./states');

function parseNumberedReply(text, currentState) {
  if (!text) return null;
  const trimmed = text.trim();

  if (!/^\d{1,2}\.?$/.test(trimmed)) return null;

  const num = parseInt(trimmed);
  if (isNaN(num) || num < 1) return null;

  switch (currentState) {
    case STATES.MAIN_MENU: {
      const menuMap = { 1: 'price_inquiry', 2: 'label_info', 3: 'customer_rep' };
      if (menuMap[num]) return { buttonId: menuMap[num] };
      break;
    }
    case STATES.SELECT_SIZE: {
      const sizeMap = { 1: 'size_50x50', 2: 'size_100x50', 3: 'size_custom' };
      if (sizeMap[num]) return { buttonId: sizeMap[num] };
      break;
    }
    case STATES.SELECT_QUANTITY: {
      const qtyMap = { 1: 'qty_100', 2: 'qty_250', 3: 'qty_1000' };
      if (qtyMap[num]) return { buttonId: qtyMap[num] };
      break;
    }
    case STATES.ASK_DESIGN_VARIETY: {
      const designMap = { 1: 'single_design', 2: 'multiple_design' };
      if (designMap[num]) return { buttonId: designMap[num] };
      break;
    }
    case STATES.SHOW_PRICE: {
      const priceMap = { 1: 'create_order', 2: 'add_to_cart', 3: 'change_options', 4: 'cancel_order', 5: 'customer_service' };
      if (priceMap[num]) return { buttonId: priceMap[num] };
      break;
    }
    case STATES.SELECT_CUSTOMER_TYPE: {
      const typeMap = { 1: 'bireysel', 2: 'kurumsal' };
      if (typeMap[num]) return { buttonId: typeMap[num] };
      break;
    }
    case STATES.ASK_SHIPPING_SAME: {
      const shipMap = { 1: 'shipping_same', 2: 'shipping_different' };
      if (shipMap[num]) return { buttonId: shipMap[num] };
      break;
    }
    case STATES.CONFIRM_ORDER: {
      const confMap = { 1: 'final_confirm', 2: 'final_edit', 3: 'final_cancel' };
      if (confMap[num]) return { buttonId: confMap[num] };
      break;
    }
    case STATES.SELECT_MATERIAL: {
      if (num >= 1 && num <= MATERIAL_INDEX.length) {
        return { listId: MATERIAL_INDEX[num - 1] };
      }
      break;
    }
    case STATES.AWAITING_APPROVAL: {
      const approvalMap = { 1: 'approve', 2: 'change' };
      if (approvalMap[num]) return { buttonId: approvalMap[num] };
      break;
    }
    case STATES.EDIT_FIELD_SELECT: {
      if (num >= 1 && num <= 8) return { buttonId: `edit_field_${num}` };
      break;
    }
  }
  return null;
}

function getReplyLabel(reply, state) {
  const labels = {
    'price_inquiry': 'Fiyat Sorgula',
    'new_order': 'Yeni Sipariş',
    'label_info': 'Etiket Bilgi',
    'customer_rep': 'Müşteri Temsilcisi',
    'track_order': 'Sipariş Takip',
    'size_50x50': '50×50mm',
    'size_100x50': '100×50mm',
    'size_custom': 'Özel Boyut',
    'qty_100': '100 Adet',
    'qty_250': '250 Adet',
    'qty_1000': '1000 Adet',
    'single_design': 'Tek Tasarım',
    'multiple_design': 'Çoklu Tasarım',
    'create_order': 'Sipariş Oluştur',
    'add_to_cart': 'Ekleme Yap',
    'change_options': 'Değiştir',
    'cancel_order': 'İptal Et',
    'customer_service': 'Müşteri Hizmetleri',
    'bireysel': 'Bireysel',
    'kurumsal': 'Kurumsal',
    'shipping_same': 'Aynı Adres',
    'shipping_different': 'Farklı Adres',
    'final_confirm': 'Oluştur',
    'final_edit': 'Düzenle',
    'final_cancel': 'İptal Et',
    'approve': 'Onay Veriyorum',
    'change': 'Değişiklik İstiyorum',
  };

  if (reply.buttonId && labels[reply.buttonId]) {
    return labels[reply.buttonId];
  }

  if (reply.listId && state === STATES.SELECT_MATERIAL) {
    const mat = MATERIALS[reply.listId];
    if (mat) return mat.name;
    const row = MATERIAL_GROUPS.flatMap(g => g.rows).find(r => r.id === reply.listId);
    if (row) return row.title;
  }

  return null;
}

module.exports = { parseNumberedReply, getReplyLabel };
