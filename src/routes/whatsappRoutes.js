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
    return res.json({
      success: false,
      message: "No hay QR disponible. El bot puede ya estar conectado.",
      status: whatsappService.getConnectionState(),
    });
  }

  try {
    const qrImage = await QRCode.toDataURL(qr);
    res.json({ success: true, qr: qrImage });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
