"use strict";

const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const whatsappService = require("../services/whatsappService");

// Estado de la conexión de WhatsApp
router.get("/status", (req, res) => {
  res.json({ status: whatsappService.getConnectionState() });
});

/**
 * Devuelve el QR como imagen base64 para escanear con el celular del restaurante.
 * Solo disponible cuando el bot NO está conectado.
 */
router.get("/qr", async (req, res) => {
  const qr = whatsappService.getQrCode();

  if (!qr) {
    const status = whatsappService.getConnectionState();
    return res.send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a8b9b;color:white">
          <h2>${status === "open" ? "✅ WhatsApp ya está conectado" : "⏳ Generando QR... espera"}</h2>
          <p>Estado: <strong>${status}</strong></p>
          <script>setTimeout(() => location.reload(), 3000)</script>
        </body>
      </html>
    `);
  }

  try {
    const qrImage = await QRCode.toDataURL(qr);
    res.send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a8b9b;color:white">
          <h2>Escanea con WhatsApp</h2>
          <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
          <img src="${qrImage}" style="border-radius:12px;background:white;padding:16px" />
          <p style="opacity:0.7;font-size:14px">Se actualiza automáticamente cada 45 segundos</p>
          <script>setTimeout(() => location.reload(), 5000)</script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Error generando QR: " + err.message);
  }
});

module.exports = router;
