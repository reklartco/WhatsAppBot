const { sendTextMessage, sendCTAButton } = require('../../whatsappService');
const { createCustomer, createOrderMultiItem } = require('../../woocommerceService');
const { STATES } = require('../states');
const { formatTRPrice } = require('../helpers');
const logger = require('../../../utils/logger');
const customerService = require('../../customerService');
const statsService = require('../../statsService');

async function handleOrderConfirm(from, conv, msgContent, { deleteConvState, showEditFieldMenu }) {
  const selection = msgContent.buttonId || msgContent.text?.toLowerCase();

  // 3 — İptal Et
  if (selection === 'final_cancel' || selection?.includes('iptal')) {
    deleteConvState(from);
    conv._deleted = true;
    await sendTextMessage(from, 'Sipariş iptal edildi. Tekrar bekleriz!');
    return;
  }

  // 2 — Düzenle → alan seçim menüsü göster
  if (selection === 'final_edit' || selection === '2' || selection?.includes('düzenle') || selection?.includes('değiştir')) {
    await showEditFieldMenu(from, conv);
    return;
  }

  // 1 — Oluştur
  if (selection !== 'final_confirm' && !selection?.includes('oluştur') && !selection?.includes('evet')) {
    await sendTextMessage(from, 'Lütfen seçim yapın:\n\n1. Oluştur\n2. Düzenle\n3. İptal Et');
    return;
  }

  await sendTextMessage(from, 'Siparişiniz oluşturuluyor...');

  try {
    const customerData = {
      email: conv.data.email,
      phone: conv.data.phone || from,
      customerType: conv.data.customerType,
      billingAddress: conv.data.billingAddress,
      shippingAddress: conv.data.shippingAddress,
      first_name: conv.data.firstName,
      last_name: conv.data.lastName || '',
    };

    if (conv.data.customerType === 'bireysel') {
      customerData.tcNo = conv.data.tcNo;
    } else {
      customerData.company = conv.data.companyTitle;
      customerData.taxNo = conv.data.taxNo;
      customerData.taxOffice = conv.data.taxOffice;
    }

    const customer = await createCustomer(customerData);
    conv.data.customerId = customer.id;
    const isNewCustomer = !conv.data.existingWcCustomerId;

    const order = await createOrderMultiItem({
      customerId: customer.id,
      cart: conv.data.cart || [],
      combinedTotals: conv.data.combinedTotals,
      customerData: customerData
    });

    conv.data.orderId = order.id;
    conv.data.orderNumber = order.number;
    conv.data.paymentUrl = order.payment_url;

    statsService.recordOrderStat();
    statsService.recordOrderRevenue(conv.data.combinedTotals?.grandTotal || 0);
    try {
      await customerService.syncCustomerFromWC(from);
    } catch (e) { logger.error('Post-order WC sync hatası:', e.message); }

    let confirmText = `*SİPARİŞİNİZ OLUŞTURULDU!* ✅\n\n`;
    confirmText += `Sipariş No: #${order.number}\n`;
    confirmText += `Hesap: ${conv.data.email}\n`;

    if (isNewCustomer) {
      confirmText += `Şifreniz: 123456\n\n`;
      confirmText += `⚠️ Lütfen giriş yaparak şifrenizi yenileyin.\n\n`;
      confirmText += `Giriş: https://1etiket.com.tr/hesabim/\n`;
      confirmText += `Şifre Yenileme: https://1etiket.com.tr/hesabim/edit-account/`;
    } else {
      confirmText += `\nMevcut hesabınıza sipariş oluşturuldu.`;
    }

    await sendTextMessage(from, confirmText);

    const totalText = formatTRPrice(conv.data.combinedTotals?.grandTotal || 0);
    await sendCTAButton(from,
      `Ödemenizi aşağıdaki linkten yapabilirsiniz:\n\n` +
      `Havale/EFT veya Kredi Kartı ile ödeyebilirsiniz.\n` +
      `Toplam: ${totalText} TL`,
      'Ödeme Yap',
      order.payment_url
    );

    conv.state = STATES.AWAITING_PAYMENT;

  } catch (error) {
    logger.error('Sipariş oluşturma hatası:', error);
    await sendTextMessage(from,
      'Sipariş oluşturulurken bir hata oluştu. Lütfen tekrar deneyin veya "iptal" yazarak yeniden başlayın.\n\nMüşteri temsilcimize bağlanmak için *0* yazın.'
    );
  }
}

module.exports = { handleOrderConfirm };
