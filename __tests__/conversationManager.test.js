const {
  extractMessageContent,
  parseSize,
  STATES,
  MATERIALS
} = require('../services/conversationManager');

describe('extractMessageContent', () => {
  test('metin mesajını doğru parse eder', () => {
    const message = {
      type: 'text',
      text: { body: 'Merhaba' }
    };

    const result = extractMessageContent(message);
    expect(result).toEqual({ text: 'Merhaba', type: 'text' });
  });

  test('buton yanıtını doğru parse eder', () => {
    const message = {
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: { id: 'new_order', title: 'Sipariş Ver' }
      }
    };

    const result = extractMessageContent(message);
    expect(result).toEqual({
      buttonId: 'new_order',
      text: 'Sipariş Ver',
      type: 'button'
    });
  });

  test('liste yanıtını doğru parse eder', () => {
    const message = {
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: { id: 'kuse', title: 'Kuşe Etiket' }
      }
    };

    const result = extractMessageContent(message);
    expect(result).toEqual({
      listId: 'kuse',
      text: 'Kuşe Etiket',
      type: 'list'
    });
  });

  test('doküman mesajını doğru parse eder', () => {
    const message = {
      type: 'document',
      document: { id: 'doc123', filename: 'test.pdf' }
    };

    const result = extractMessageContent(message);
    expect(result.type).toBe('document');
    expect(result.document).toEqual({ id: 'doc123', filename: 'test.pdf' });
  });

  test('image mesajını doğru parse eder', () => {
    const message = {
      type: 'image',
      image: { id: 'img123', mime_type: 'image/jpeg' }
    };

    const result = extractMessageContent(message);
    expect(result.type).toBe('image');
    expect(result.image).toEqual({ id: 'img123', mime_type: 'image/jpeg' });
  });

  test('bilinmeyen mesaj tipi için varsayılan döner', () => {
    const message = { type: 'location' };

    const result = extractMessageContent(message);
    expect(result).toEqual({ text: '', type: 'location' });
  });

  test('interactive ama button/list olmayan mesajı parse eder', () => {
    const message = {
      type: 'interactive',
      interactive: { type: 'unknown_type' }
    };

    const result = extractMessageContent(message);
    expect(result).toEqual({ text: '', type: 'interactive' });
  });
});

describe('parseSize', () => {
  test('standart formattaki boyutları parse eder', () => {
    expect(parseSize('50x50')).toEqual({ width: 50, height: 50 });
    expect(parseSize('100x50')).toEqual({ width: 100, height: 50 });
    expect(parseSize('75x30')).toEqual({ width: 75, height: 30 });
  });

  test('farklı ayraçlarla boyutları parse eder', () => {
    expect(parseSize('50*50')).toEqual({ width: 50, height: 50 });
    expect(parseSize('50×50')).toEqual({ width: 50, height: 50 });
    expect(parseSize('50 x 50')).toEqual({ width: 50, height: 50 });
    expect(parseSize('50 X 50')).toEqual({ width: 50, height: 50 });
  });

  test('geçersiz giriş için null döner', () => {
    expect(parseSize(null)).toBeNull();
    expect(parseSize('')).toBeNull();
    expect(parseSize(undefined)).toBeNull();
    expect(parseSize('sadece metin')).toBeNull();
    expect(parseSize('abc')).toBeNull();
  });
});

describe('STATES', () => {
  test('tüm beklenen durumlar tanımlı', () => {
    expect(STATES.IDLE).toBe('IDLE');
    expect(STATES.MAIN_MENU).toBe('MAIN_MENU');
    expect(STATES.SELECT_MATERIAL).toBe('SELECT_MATERIAL');
    expect(STATES.SELECT_SIZE).toBe('SELECT_SIZE');
    expect(STATES.ENTER_CUSTOM_SIZE).toBe('ENTER_CUSTOM_SIZE');
    expect(STATES.SELECT_QUANTITY).toBe('SELECT_QUANTITY');
    expect(STATES.ENTER_CUSTOM_QTY).toBe('ENTER_CUSTOM_QTY');
    expect(STATES.SELECT_LAMINATION).toBe('SELECT_LAMINATION');
    expect(STATES.SHOW_PRICE).toBe('SHOW_PRICE');
    expect(STATES.ENTER_EMAIL).toBe('ENTER_EMAIL');
    expect(STATES.ENTER_ADDRESS).toBe('ENTER_ADDRESS');
    expect(STATES.ENTER_COMPANY).toBe('ENTER_COMPANY');
    expect(STATES.CONFIRM_ORDER).toBe('CONFIRM_ORDER');
    expect(STATES.AWAITING_FILE).toBe('AWAITING_FILE');
    expect(STATES.ORDER_TRACKING).toBe('ORDER_TRACKING');
  });
});

describe('MATERIALS', () => {
  test('tüm malzemeler tanımlı ve geçerli yapıda', () => {
    const materialKeys = ['kuse', 'kraft', 'seffaf_pp', 'beyaz_pp', 'vellum', 'silver', 'gold', 'hologram'];

    materialKeys.forEach(key => {
      expect(MATERIALS[key]).toBeDefined();
      expect(MATERIALS[key]).toHaveProperty('name');
      expect(MATERIALS[key]).toHaveProperty('code');
      expect(MATERIALS[key]).toHaveProperty('priceMultiplier');
      expect(typeof MATERIALS[key].name).toBe('string');
      expect(typeof MATERIALS[key].code).toBe('string');
      expect(typeof MATERIALS[key].priceMultiplier).toBe('number');
      expect(MATERIALS[key].priceMultiplier).toBeGreaterThan(0);
    });
  });
});
