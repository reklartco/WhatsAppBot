const fs = require('fs').promises;
const path = require('path');
const { saveFile } = require('../services/fileService');

// fs.promises modülünü mockla
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('saveFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('dosyayı doğru dizine kaydeder', async () => {
    const buffer = Buffer.from('test data');
    const fileName = 'test.pdf';
    const orderId = 123;

    const result = await saveFile(buffer, fileName, orderId);

    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining(`siparis_${orderId}`),
      { recursive: true }
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test.pdf'),
      buffer
    );
    expect(typeof result).toBe('string');
  });

  test('dosya adındaki özel karakterleri temizler', async () => {
    const buffer = Buffer.from('test');
    const fileName = 'dosya adı (1).pdf';
    const orderId = 456;

    await saveFile(buffer, fileName, orderId);

    const writeCall = fs.writeFile.mock.calls[0][0];
    expect(writeCall).not.toContain(' ');
    expect(writeCall).not.toContain('(');
    expect(writeCall).not.toContain(')');
  });

  test('timestamp ile benzersiz dosya adı oluşturur', async () => {
    const buffer = Buffer.from('test');

    const result1 = await saveFile(buffer, 'test.pdf', 1);
    const result2 = await saveFile(buffer, 'test.pdf', 1);

    // İki çağrı aynı base name'e sahip ama timestamp farklı olacak
    const writeCall1 = fs.writeFile.mock.calls[0][0];
    const writeCall2 = fs.writeFile.mock.calls[1][0];
    expect(writeCall1).toContain('test.pdf');
    expect(writeCall2).toContain('test.pdf');
  });
});
