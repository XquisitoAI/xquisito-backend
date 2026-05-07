"use strict";

const supabase = require("../config/supabase");

async function notifyDishReady(orderId) {
  try {
    const { data: order } = await supabase
      .from("pick_and_go_orders")
      .select("customer_phone, customer_name, folio, restaurant_id")
      .eq("id", orderId)
      .single();

    if (!order?.customer_phone) return false;

    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("name")
      .eq("id", order.restaurant_id)
      .single();

    console.log(
      "Nombre: " +
        order.customer_name +
        ", Phone: " +
        order.customer_phone +
        " Restaurant: " +
        restaurant?.name,
    );

    const digits = order.customer_phone.replace(/\D/g, "");
    const normalized = digits.startsWith("52") ? digits : `521${digits}`;
    const phone = `+${normalized}`;

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: "pedido_listo",
            language: { code: "es_MX" },
            components: [
              {
                type: "header",
                parameters: [{ type: "text", text: order.folio || "" }],
              },
              {
                type: "body",
                parameters: [
                  { type: "text", text: order.customer_name?.trim() || "cliente" },
                  { type: "text", text: restaurant?.name?.trim() || "el restaurante" },
                ],
              },
            ],
          },
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("[WhatsApp] Error de Meta API:", result.error);
      return false;
    }

    console.log(`[WhatsApp] Notificación enviada a ${phone}`);
    return true;
  } catch (err) {
    console.error("[WhatsApp] Error en notifyDishReady:", err.message);
    return false;
  }
}

module.exports = { notifyDishReady };
