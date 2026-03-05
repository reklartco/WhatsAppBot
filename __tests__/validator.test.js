const { validateEmail, validateSize, validatePhone } = require('../utils/validator');

describe('validateEmail', () => {
  test('geçerli e-posta adreslerini kabul eder', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user@firma.com.tr')).toBe(true);
    expect(validateEmail('info+tag@domain.co')).toBe(true);
  });

  test('geçersiz e-posta adreslerini reddeder', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail(null)).toBe(false);
    expect(validateEmail(undefined)).toBe(false);
    expect(validateEmail('invalidemail')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('user @domain.com')).toBe(false);
  });
});

describe('validateSize', () => {
  test('geçerli boyutları kabul eder', () => {
    expect(validateSize(50, 50)).toBe(true);
    expect(validateSize(10, 10)).toBe(true);
    expect(validateSize(500, 500)).toBe(true);
    expect(validateSize(100, 50)).toBe(true);
  });

  test('sınır dışı boyutları reddeder', () => {
    expect(validateSize(9, 50)).toBe(false);
    expect(validateSize(50, 9)).toBe(false);
    expect(validateSize(501, 50)).toBe(false);
    expect(validateSize(50, 501)).toBe(false);
    expect(validateSize(0, 0)).toBe(false);
    expect(validateSize(-1, 50)).toBe(false);
  });
});

describe('validatePhone', () => {
  test('geçerli Türkiye telefon numaralarını kabul eder', () => {
    expect(validatePhone('905551234567')).toBe(true);
    expect(validatePhone('905001234567')).toBe(true);
    expect(validatePhone('905999999999')).toBe(true);
  });

  test('geçersiz telefon numaralarını reddeder', () => {
    expect(validatePhone('')).toBe(false);
    expect(validatePhone('1234567890')).toBe(false);
    expect(validatePhone('905')).toBe(false);
    expect(validatePhone('901234567890')).toBe(false);  // 90 ile başlıyor ama 5 yok
    expect(validatePhone('+905551234567')).toBe(false); // + işareti
    expect(validatePhone('05551234567')).toBe(false);   // 90 prefiksi yok
  });
});
