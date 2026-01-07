const express = require('express');
const qrCodeController = require('../controllers/qrCodeController');

const router = express.Router();

// ===============================================
// RUTA PÚBLICA PARA RESOLVER CÓDIGOS QR
// ===============================================

// GET /api/qr/:code - Resolver código QR y obtener URL de redirección
// Esta ruta es pública (sin autenticación) para que cualquier persona pueda escanear QR
router.get('/:code', qrCodeController.resolveQRCode);

module.exports = router;
