const { normalizeTurkish } = require('../../utils/validator');

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatTRPrice(num) {
  const fixed = Number(num).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted},${decPart}`;
}

function pushCurrentItemToCart(conv) {
  if (!conv.data.cart) conv.data.cart = [];
  const vc = conv.data.varietyCount || 1;
  const totalQty = vc > 1 ? conv.data.quantity * vc : conv.data.quantity;
  conv.data.cart.push({
    material: conv.data.material,
    width: conv.data.width,
    height: conv.data.height,
    quantity: totalQty,
    perDesignQty: conv.data.quantity,
    varietyCount: vc,
    price: conv.data.price
  });
}

function clearProductData(conv) {
  delete conv.data.material;
  delete conv.data.width;
  delete conv.data.height;
  delete conv.data.quantity;
  delete conv.data.varietyCount;
  delete conv.data.price;
}

function extractMessageContent(message) {
  switch (message.type) {
    case 'text':
      return { text: message.text.body, type: 'text' };
    case 'interactive':
      if (message.interactive.type === 'button_reply') {
        return {
          buttonId: message.interactive.button_reply.id,
          text: message.interactive.button_reply.title,
          type: 'button'
        };
      }
      if (message.interactive.type === 'list_reply') {
        return {
          listId: message.interactive.list_reply.id,
          text: message.interactive.list_reply.title,
          type: 'list'
        };
      }
      return { text: '', type: 'interactive' };
    case 'document':
      return { text: '', type: 'document', document: message.document };
    case 'image':
      return { text: '', type: 'image', image: message.image };
    default:
      return { text: '', type: message.type };
  }
}

// Bekleme / erteleme mesajı algılama
function isWaitMessage(text) {
  const norm = normalizeTurkish(text.toLowerCase());
  const waitPatterns = [
    'bekle', 'beklet', 'bekleteceg', 'bekleyin', 'bekliyorum',
    'bir dakika', 'bi dakika', 'bi dk', 'bir dk', '1 dk', '1dk',
    'bir saniye', 'bi saniye', 'bir sn', '1 sn',
    'birazdan', 'az sonra', 'hemen yazacag', 'hemen verec',
    'simdi yazacag', 'simdi verec', 'simdi soylec',
    'yazacagim', 'verecegim', 'soyleyecegim', 'gondereceg',
    'biraz bekle', 'lutfen bekle', 'su an',
    'hazirlaniyorum', 'bakiyorum', 'kontrol ediyorum',
    'bir sure', 'bi sure', 'sonra yazar', 'sonra veri',
    'daha sonra', 'biraz sonra'
  ];
  return waitPatterns.some(p => norm.includes(p));
}

module.exports = {
  formatNumber,
  formatTRPrice,
  pushCurrentItemToCart,
  clearProductData,
  extractMessageContent,
  isWaitMessage,
};
