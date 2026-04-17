"use strict";

const supabase = require("../config/supabase");

// Estado del servicio
let sock = null;
let qrCode = null;
let connectionState = "close"; // 'close' | 'connecting' | 'open'

// Módulos de Baileys (cargados dinámicamente por ser ESM)
let makeWASocket,
  fetchLatestBaileysVersion,
  Browsers,
  BufferJSON,
  initAuthCreds,
  proto,
  DisconnectReason;

async function loadBaileys() {
  if (makeWASocket) return;
  const b = await import("@whiskeysockets/baileys");
  makeWASocket = b.default;
  fetchLatestBaileysVersion = b.fetchLatestBaileysVersion;
  Browsers = b.Browsers;
  BufferJSON = b.BufferJSON;
  initAuthCreds = b.initAuthCreds;
  proto = b.proto;
  DisconnectReason = b.DisconnectReason;
}

// Auth state en Supabase
async function useDatabaseAuthState() {
  const readData = async (key) => {
    const { data } = await supabase
      .from("whatsapp_auth_state")
      .select("value")
      .eq("key", key)
      .single();
    if (!data) return null;
    return JSON.parse(data.value, BufferJSON.reviver);
  };

  const writeData = async (key, value) => {
    await supabase.from("whatsapp_auth_state").upsert(
      {
        key,
        value: JSON.stringify(value, BufferJSON.replacer),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  };

  const removeData = async (key) => {
    await supabase.from("whatsapp_auth_state").delete().eq("key", key);
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (value && type === "app-state-sync-key") {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              result[id] = value;
            }),
          );
          return result;
        },
        set: async (data) => {
          const tasks = [];
          for (const [type, ids] of Object.entries(data)) {
            for (const [id, value] of Object.entries(ids)) {
              const key = `${type}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData("creds", creds),
  };
}

// Conexión
async function connect() {
  try {
    await loadBaileys();

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useDatabaseAuthState();

    sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS("Desktop"),
      printQRInTerminal: false,
    });

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrCode = qr;
        console.log("[WhatsApp] QR generado — escanea en GET /api/whatsapp/qr");
      }

      if (connection === "open") {
        qrCode = null;
        connectionState = "open";
        console.log("[WhatsApp] Conectado");
      }

      if (connection === "close") {
        connectionState = "close";
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        console.log(
          `[WhatsApp] Desconectado (código ${code}). Reconectar: ${shouldReconnect}`,
        );
        if (shouldReconnect) {
          setTimeout(connect, 5000);
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
    connectionState = "connecting";
  } catch (err) {
    console.error("[WhatsApp] Error al conectar:", err.message);
    setTimeout(connect, 10000);
  }
}

// Envío de mensajes
async function sendMessage(phone, text) {
  if (!sock || connectionState !== "open") {
    console.warn(
      "[WhatsApp] Socket no disponible — mensaje no enviado a",
      phone,
    );
    return false;
  }

  // Normalizar: solo dígitos
  // Si tiene más de 10 dígitos ya incluye código de país → se respeta
  // Si tiene 10 o menos → se asume México (+52)
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length > 10 ? digits : `52${digits}`;
  const jid = `${normalized}@s.whatsapp.net`;

  try {
    await sock.sendMessage(jid, { text });
    console.log(`[WhatsApp] Mensaje enviado a ${jid}`);
    return true;
  } catch (err) {
    console.error(`[WhatsApp] Error enviando a ${jid}:`, err.message);
    return false;
  }
}

// Notificación de platillo listo via Twilio SMS
async function notifyDishReady(orderId, dishName) {
  try {
    const { data: order } = await supabase
      .from("pick_and_go_orders")
      .select("customer_phone, customer_name, folio")
      .eq("id", orderId)
      .single();

    if (!order?.customer_phone) return;

    const greeting = order.customer_name
      ? `¡Hola ${order.customer_name}! `
      : "¡Hola! ";
    const folioText = order.folio ? ` (Pedido #${order.folio})` : "";
    const message = `${greeting}Tu platillo ${dishName} esta listo para recoger${folioText}.`;

    const twilio = require("twilio");
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );

    const digits = order.customer_phone.replace(/\D/g, "");
    const phone = digits.length > 10 ? `+${digits}` : `+52${digits}`;

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    console.log(`[SMS] Notificación enviada a ${phone}`);
  } catch (err) {
    console.error("[SMS] Error en notifyDishReady:", err.message);
  }
}

module.exports = {
  connect,
  sendMessage,
  notifyDishReady,
  getQrCode: () => qrCode,
  getConnectionState: () => connectionState,
};
