function parseSize(text) {
  if (!text) return null;
  let cleaned = text.trim().toLowerCase();

  // Birimi tespit et (orijinal metin üzerinden)
  const hasCmExplicit = /cm/i.test(cleaned) || /santimetre/i.test(cleaned);
  const hasMmExplicit = /mm/i.test(cleaned) || /milimetre/i.test(cleaned);

  // Temizle: birim, gereksiz kelime, noktalama
  cleaned = cleaned
    .replace(/milimetre/gi, '').replace(/santimetre/gi, '')
    .replace(/mm/g, '').replace(/cm/g, '')
    .replace(/boyut[u]?\s*/gi, '').replace(/ölçü[sü]?\s*/gi, '')
    .replace(/genişlik\s*/gi, '').replace(/yükseklik\s*/gi, '')
    .replace(/\ben[i]?\s+/g, '').replace(/\bboy[u]?\s+/g, '')
    .replace(/\beni\s*/g, '').replace(/\bboyu\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Desteklenen formatlar:
  // 50x50, 50×50, 50*50, 50-50, 50 50, 50X50, 50/50
  // 50ye50, 50 ye 50, 50a50, 50e50
  let match = cleaned.match(/(\d+(?:[.,]\d+)?)\s*[x×*\-/\s]\s*(\d+(?:[.,]\d+)?)/i);

  // "ye/ya/e/a" ayırıcı: 50ye50, 50 ye 50
  if (!match) {
    match = cleaned.match(/(\d+(?:[.,]\d+)?)\s*(?:ye|ya|e|a)\s*(\d+(?:[.,]\d+)?)/i);
  }

  // Sadece virgülle ayrılmış: "50,50" — ama "50,5" ondalık olabilir
  if (!match) {
    const commaMatch = cleaned.match(/^(\d+),(\d+)$/);
    if (commaMatch && commaMatch[1].length >= 2 && commaMatch[2].length >= 2) {
      match = commaMatch;
    }
  }

  // Tek boyut → kare varsayımı
  if (!match) {
    const singleMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*$/);
    if (singleMatch) {
      const raw = parseFloat(singleMatch[1].replace(',', '.'));
      if (raw > 0) {
        let dim;
        let wasCm = false;

        if (hasCmExplicit) {
          dim = Math.round(raw * 10);
          wasCm = true;
        } else if (hasMmExplicit) {
          dim = Math.round(raw);
        } else if (raw < 10) {
          dim = Math.round(raw * 10);
          wasCm = true;
        } else {
          dim = Math.round(raw);
        }

        if (dim >= 10 && dim <= 460) {
          return { width: dim, height: dim, singleDimension: true, convertedFromCm: wasCm };
        }
      }
    }
  }

  if (!match) return null;

  let width = parseFloat(match[1].replace(',', '.'));
  let height = parseFloat(match[2].replace(',', '.'));

  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return null;

  // Birim tespiti
  if (hasCmExplicit && !hasMmExplicit) {
    const w = Math.round(width * 10);
    const h = Math.round(height * 10);
    if (w < 10 || w > 460 || h < 10 || h > 460) {
      return { error: true, message: `Dönüştürülen ölçü (${w}x${h} mm) geçersiz. Minimum 10mm, maksimum 460mm olmalıdır.` };
    }
    return { width: w, height: h, convertedFromCm: true };
  }

  if (hasMmExplicit) {
    const w = Math.round(width);
    const h = Math.round(height);
    if (w < 10 || w > 460 || h < 10 || h > 460) {
      return { error: true, message: `Ölçü geçersiz (${w}x${h} mm). Minimum 10mm, maksimum 460mm aralığında olmalıdır.` };
    }
    return { width: w, height: h };
  }

  // Birim belirtilmemiş — otomatik tahmin
  const likelyCm = width <= 46 && height <= 46;
  const definitelyCm = (width < 10 && height < 10);

  if (definitelyCm) {
    const w = Math.round(width * 10);
    const h = Math.round(height * 10);
    if (w < 10 || w > 460 || h < 10 || h > 460) {
      return { error: true, message: `Dönüştürülen ölçü (${w}x${h} mm) geçersiz. Minimum 10mm, maksimum 460mm olmalıdır.` };
    }
    return { width: w, height: h, convertedFromCm: true };
  }

  if (likelyCm && (width < 10 || height < 10)) {
    const w = Math.round(width * 10);
    const h = Math.round(height * 10);
    if (w < 10 || w > 460 || h < 10 || h > 460) {
      return { error: true, message: `Dönüştürülen ölçü (${w}x${h} mm) geçersiz. Minimum 10mm, maksimum 460mm olmalıdır.` };
    }
    return { width: w, height: h, maybeCm: true };
  }

  // Normal mm değerleri
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 10 || w > 460 || h < 10 || h > 460) {
    return { error: true, message: `Ölçü geçersiz (${w}x${h} mm). Minimum 10mm, maksimum 460mm aralığında olmalıdır.` };
  }

  return { width: w, height: h };
}

module.exports = { parseSize };
