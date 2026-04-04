<?php
/**
 * Plugin Name: WhatsApp Bot - Order to Cart
 * Description: WhatsApp bot siparişlerini sepete ekleyip checkout'a yönlendirir. POS Entegratör uyumluluğu.
 * Version: 1.1
 * Author: 1Etiket
 */

if (!defined('ABSPATH')) exit;

// ============ 1) SIPARIŞ → SEPETE EKLE ============

add_action('template_redirect', 'bot_order_to_cart_handler');

function bot_order_to_cart_handler() {
    if (!isset($_GET['bot_order']) || !isset($_GET['key'])) {
        return;
    }

    $order_id = absint($_GET['bot_order']);
    $order_key = sanitize_text_field($_GET['key']);

    if (!$order_id || !$order_key) {
        wp_die('Geçersiz sipariş bilgisi.', 'Hata', array('response' => 400));
    }

    $order = wc_get_order($order_id);
    if (!$order) {
        wp_die('Sipariş bulunamadı.', 'Hata', array('response' => 404));
    }

    if ($order->get_order_key() !== $order_key) {
        wp_die('Geçersiz sipariş anahtarı.', 'Hata', array('response' => 403));
    }

    $status = $order->get_status();
    if (!in_array($status, array('pending', 'on-hold', 'failed'))) {
        wp_redirect($order->get_view_order_url());
        exit;
    }

    // WC session ve cart başlat
    if (!WC()->session->has_session()) {
        WC()->session->set_customer_session_cookie(true);
    }

    // Sepeti temizle
    WC()->cart->empty_cart();

    // Sipariş ürünlerini AYRI AYRI sepete ekle
    $item_index = 0;
    foreach ($order->get_items() as $item_id => $item) {
        $product_id = $item->get_product_id();
        $product = wc_get_product($product_id);
        if (!$product) continue;

        $line_total = floatval($item->get_subtotal()); // KDV hariç fiyat
        $item_name = $item->get_name();

        // Her item'a benzersiz data vererek WC'nin birleştirmesini engelle
        $cart_item_data = array(
            'bot_order_id'    => $order_id,
            'bot_item_id'     => $item_id,
            'bot_item_index'  => $item_index,
            'bot_item_name'   => $item_name,
            'bot_custom_price' => $line_total, // quantity her zaman 1, total = birim fiyat
        );

        // Quantity 1 olarak ekle — fiyat zaten toplam fiyat
        WC()->cart->add_to_cart($product_id, 1, 0, array(), $cart_item_data);
        $item_index++;
    }

    if ($item_index === 0) {
        wp_die('Sipariş ürünleri sepete eklenemedi.', 'Hata', array('response' => 500));
    }

    // Müşteri bilgilerini session'a kaydet
    $billing = $order->get_address('billing');
    if (!empty($billing['email'])) {
        WC()->customer->set_billing_email($billing['email']);
    }
    if (!empty($billing['phone'])) {
        WC()->customer->set_billing_phone($billing['phone']);
    }
    if (!empty($billing['first_name'])) {
        WC()->customer->set_billing_first_name($billing['first_name']);
    }
    if (!empty($billing['last_name'])) {
        WC()->customer->set_billing_last_name($billing['last_name']);
    }

    // Orijinal siparişi session'a kaydet
    WC()->session->set('bot_pending_order_id', $order_id);

    wp_redirect(wc_get_checkout_url());
    exit;
}

// ============ 2) ÖZEL FİYAT UYGULA ============

add_action('woocommerce_before_calculate_totals', 'bot_apply_custom_prices', 99);

function bot_apply_custom_prices($cart) {
    if (is_admin() && !defined('DOING_AJAX')) return;
    if (did_action('woocommerce_before_calculate_totals') >= 2) return;

    foreach ($cart->get_cart() as $cart_item) {
        if (isset($cart_item['bot_custom_price'])) {
            $cart_item['data']->set_price($cart_item['bot_custom_price']);
        }
    }
}

// ============ 3) ÜRÜN ADINI ORIJINAL SİPARİŞ ADIYLA DEĞİŞTİR ============

add_filter('woocommerce_cart_item_name', 'bot_custom_cart_item_name', 10, 3);

function bot_custom_cart_item_name($name, $cart_item, $cart_item_key) {
    if (isset($cart_item['bot_item_name'])) {
        return esc_html($cart_item['bot_item_name']);
    }
    return $name;
}

// Checkout sayfasındaki sipariş özetinde de aynı ismi göster
add_filter('woocommerce_checkout_cart_item_quantity', 'bot_hide_quantity_in_checkout', 10, 3);

function bot_hide_quantity_in_checkout($quantity_html, $cart_item, $cart_item_key) {
    if (isset($cart_item['bot_item_name'])) {
        return ''; // "× 1" yazısını gizle — zaten adet bilgisi ürün adında var
    }
    return $quantity_html;
}

// ============ 4) SEPETTE ÜRÜN BİRLEŞTİRMEYİ ENGELLE ============

add_filter('woocommerce_add_cart_item_data', 'bot_force_unique_cart_items', 10, 3);

function bot_force_unique_cart_items($cart_item_data, $product_id, $variation_id) {
    if (isset($cart_item_data['bot_item_index'])) {
        // Benzersiz key oluştur — WC cart_item_key hesaplarken bunu kullanır
        $cart_item_data['unique_key'] = md5(microtime() . rand() . $cart_item_data['bot_item_index']);
    }
    return $cart_item_data;
}

// ============ 5) CHECKOUT SONRASI — ORİJİNAL SİPARİŞİ İPTAL ET ============

add_action('woocommerce_thankyou', 'bot_cancel_original_order', 10, 1);

function bot_cancel_original_order($new_order_id) {
    $bot_order_id = WC()->session ? WC()->session->get('bot_pending_order_id') : null;
    if (!$bot_order_id) return;

    $bot_order = wc_get_order($bot_order_id);
    $new_order = wc_get_order($new_order_id);
    if (!$bot_order || !$new_order) return;

    if ($bot_order_id != $new_order_id) {
        // Bot siparişinin meta verilerini yeni siparişe aktar
        $meta_keys = array('order_source', 'print_file_status', 'admin_bot_order', 'admin_note', 'cart_item_count');
        foreach ($meta_keys as $key) {
            $value = $bot_order->get_meta($key);
            if ($value) {
                $new_order->update_meta_data($key, $value);
            }
        }

        // Müşteri bilgilerini de aktar (bot siparişindeki billing bilgileri)
        $bot_billing = $bot_order->get_address('billing');
        if (!empty($bot_billing['phone']) && empty($new_order->get_billing_phone())) {
            $new_order->set_billing_phone($bot_billing['phone']);
        }

        $new_order->add_order_note('WhatsApp bot siparişi #' . $bot_order->get_order_number() . ' üzerinden ödeme alındı.');
        $new_order->save();

        // Bot siparişini iptal et
        $bot_order->update_status('cancelled', 'Müşteri yeni sipariş ile ödeme yaptı. Yeni sipariş: #' . $new_order->get_order_number());
    }

    WC()->session->set('bot_pending_order_id', null);
}

// ============ 6) ÜCRETSİZ KARGO ============

add_filter('woocommerce_package_rates', 'bot_free_shipping_for_bot_orders', 100, 2);

function bot_free_shipping_for_bot_orders($rates, $package) {
    $has_bot_item = false;
    foreach (WC()->cart->get_cart() as $cart_item) {
        if (isset($cart_item['bot_order_id'])) {
            $has_bot_item = true;
            break;
        }
    }

    if ($has_bot_item) {
        foreach ($rates as $rate_key => $rate) {
            if ($rate->method_id !== 'free_shipping') {
                $rates[$rate_key]->cost = 0;
                $rates[$rate_key]->label = 'Ücretsiz Kargo';
            }
        }
    }

    return $rates;
}

// ============ 7) PLACEHOLDER ÜRÜNÜ SATIN ALINABİLİR YAP ============

add_filter('woocommerce_is_purchasable', 'bot_make_placeholder_purchasable', 10, 2);

function bot_make_placeholder_purchasable($purchasable, $product) {
    // SKU kontrolü — sadece bot placeholder ürünü için
    if ($product->get_sku() === 'whatsapp-etiket-siparis') {
        return true;
    }
    return $purchasable;
}

// Fiyatı 0 olan ürünleri de satın alınabilir yap (bot custom price atayacak)
add_filter('woocommerce_product_get_price', 'bot_placeholder_price', 10, 2);

function bot_placeholder_price($price, $product) {
    if ($product->get_sku() === 'whatsapp-etiket-siparis' && empty($price)) {
        return '0.01'; // WC'nin "fiyatsız" engelini aşmak için minimal fiyat
    }
    return $price;
}

// ============ 8) SEPETTEKİ MİKTAR DEĞİŞTİRMEYİ ENGELLE ============

add_filter('woocommerce_cart_item_quantity', 'bot_disable_quantity_change', 10, 3);

function bot_disable_quantity_change($product_quantity, $cart_item_key, $cart_item) {
    if (isset($cart_item['bot_order_id'])) {
        return $cart_item['data']->get_price() > 0 ? 1 : $product_quantity;
    }
    return $product_quantity;
}

// Sepette ürün silmeyi de engelle (bot siparişlerinde)
add_filter('woocommerce_cart_item_remove_link', 'bot_disable_remove_link', 10, 2);

function bot_disable_remove_link($link, $cart_item_key) {
    $cart_item = WC()->cart->get_cart_item($cart_item_key);
    if (isset($cart_item['bot_order_id'])) {
        return ''; // Silme butonunu gizle
    }
    return $link;
}
