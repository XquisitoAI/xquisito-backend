const express = require('express');
const qrCodeController = require('../controllers/qrCodeController');
const { mainPortalAuth } = require('../middleware/clerkMainPortalAuth');

const router = express.Router();

// ===============================================
// RUTAS PARA GESTIÓN DE QR CODES (Main Portal)
// ===============================================

// GET /api/main-portal/qr-codes - Obtener todos los códigos QR (con filtros opcionales)
// Query params: ?client_id, ?restaurant_id, ?branch_id, ?service, ?is_active
router.get('/qr-codes', mainPortalAuth, qrCodeController.getAllQRCodes);

// GET /api/main-portal/qr-codes/:id - Obtener código QR por ID
router.get('/qr-codes/:id', mainPortalAuth, qrCodeController.getQRCodeById);

// POST /api/main-portal/qr-codes - Crear nuevo código QR
router.post('/qr-codes', mainPortalAuth, qrCodeController.createQRCode);

// POST /api/main-portal/qr-codes/batch - Crear múltiples códigos QR de una vez
router.post('/qr-codes/batch', mainPortalAuth, qrCodeController.createBatchQRCodes);

// PUT /api/main-portal/qr-codes/:id - Actualizar código QR (cambiar servicio, mesa, etc.)
router.put('/qr-codes/:id', mainPortalAuth, qrCodeController.updateQRCode);

// PATCH /api/main-portal/qr-codes/:id/toggle - Activar/Desactivar código QR
router.patch('/qr-codes/:id/toggle', mainPortalAuth, qrCodeController.toggleQRCodeStatus);

// DELETE /api/main-portal/qr-codes/:id - Eliminar código QR
router.delete('/qr-codes/:id', mainPortalAuth, qrCodeController.deleteQRCode);

module.exports = router;
