// ========== KONUŞMA DURUMLARI ==========

const STATES = {
  IDLE: 'IDLE',
  MAIN_MENU: 'MAIN_MENU',
  SELECT_MATERIAL: 'SELECT_MATERIAL',
  SELECT_SIZE: 'SELECT_SIZE',
  ENTER_CUSTOM_SIZE: 'ENTER_CUSTOM_SIZE',
  SELECT_QUANTITY: 'SELECT_QUANTITY',
  ENTER_CUSTOM_QTY: 'ENTER_CUSTOM_QTY',
  SHOW_PRICE: 'SHOW_PRICE',
  SELECT_CUSTOMER_TYPE: 'SELECT_CUSTOMER_TYPE',
  ENTER_BIREYSEL_INFO: 'ENTER_BIREYSEL_INFO',
  ENTER_KURUMSAL_INFO: 'ENTER_KURUMSAL_INFO',
  ENTER_ADDRESS: 'ENTER_ADDRESS',
  ASK_SHIPPING_SAME: 'ASK_SHIPPING_SAME',
  ENTER_SHIPPING_ADDRESS: 'ENTER_SHIPPING_ADDRESS',
  ENTER_EMAIL: 'ENTER_EMAIL',
  CONFIRM_ORDER: 'CONFIRM_ORDER',
  AWAITING_FILE: 'AWAITING_FILE',
  ORDER_TRACKING: 'ORDER_TRACKING',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF',
  LABEL_INFO: 'LABEL_INFO',
  LABEL_INFO_DETAIL: 'LABEL_INFO_DETAIL',
  ASK_DESIGN_VARIETY: 'ASK_DESIGN_VARIETY',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  ASK_EMAIL: 'ASK_EMAIL',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PARTIAL_BOT_PRICE: 'PARTIAL_BOT_PRICE',
  PARTIAL_BOT_ORDER: 'PARTIAL_BOT_ORDER',
  EDIT_FIELD_SELECT: 'EDIT_FIELD_SELECT',
  EDIT_FIELD_INPUT: 'EDIT_FIELD_INPUT',
};

// ========== MALZEME TİPLERİ (WordPress admin kodları) ==========
const MATERIALS = {
  // === Menüde gösterilen 7 malzeme ===
  'kuse': { name: 'Kuşe Etiket', code: 'kuse' },
  'opak': { name: 'Opak Etiket', code: 'opak' },
  'seffaf': { name: 'Şeffaf Etiket', code: 'seffaf' },
  'kraft': { name: 'Kraft Etiket', code: 'kraft' },
  'karton': { name: '350gr Mat Kuşe Etiket', code: '350grmat' },
  'metalize': { name: 'Metalize Etiket', code: 'metalize' },
  'hologram': { name: 'Dijital Yaldızlı Etiket', code: 'varak' },
  // === Gizli malzemeler (menüde yok, NL-to-Cart ile erişilebilir) ===
  'parlak': { name: 'Parlak Kuşe Etiket', code: 'parlak' },
  '300grmatselefonlu': { name: '300gr Mat Kuşe Selefonlu', code: '300grmatselefonlu' },
  '350grmatselefonlu': { name: '350gr Mat Kuşe Selefonlu', code: '350grmatselefonlu' },
  '300gramerikan': { name: '300gr Amerikan Bristol', code: '300gramerikan' },
  '350gramerikan': { name: '350gr Amerikan Bristol', code: '350gramerikan' },
  'sarap': { name: 'Şarap Kağıdı Sticker', code: 'sarap' },
  'kirilgan-etiket': { name: 'Kırılgan Etiket', code: 'kirilgan-etiket' },
  'yumurta-kabugu-sticker': { name: 'Yumurta Kabuğu Etiketi', code: 'yumurta-kabugu-sticker' },
  'ozel-kagit': { name: 'Özel Kağıt Etiket', code: 'ozel-kagit' },
  'fantezi-kagidi': { name: 'Fantezi Kağıdı Etiketi', code: 'Fantezi-kagidi' },
  '170grkuse': { name: '170gr Parlak Kuşe', code: '170grkuse' },
  'hologram-metalize': { name: 'Hologram Metalize', code: 'hologram-metalize' },
};

const MATERIAL_GROUPS = [
  {
    title: 'Etiket Türleri',
    rows: [
      { id: 'kuse', title: 'Kuşe Etiket', description: 'En yaygın ve uygun fiyatlı' },
      { id: 'opak', title: 'Opak Etiket', description: 'Suya dayanıklı' },
      { id: 'seffaf', title: 'Şeffaf Etiket', description: 'Şeffaf zemin, suya dayanıklı' },
      { id: 'kraft', title: 'Kraft Etiket', description: 'Kraft karton görünümlü' },
      { id: 'karton', title: '350gr Mat Kuşe Etiket', description: 'Kalın, karton benzeri' },
      { id: 'metalize', title: 'Metalize Etiket', description: 'Altın/Gümüş premium' },
      { id: 'hologram', title: 'Dijital Yaldızlı Etiket', description: 'Yaldızlı premium baskı' },
    ]
  }
];

const MATERIAL_INDEX = MATERIAL_GROUPS.flatMap(g => g.rows.map(r => r.id));

module.exports = {
  STATES,
  MATERIALS,
  MATERIAL_GROUPS,
  MATERIAL_INDEX,
};
