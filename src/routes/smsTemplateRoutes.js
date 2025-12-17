const express = require('express');
const smsTemplateController = require('../controllers/smsTemplateController');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

const router = express.Router();

// ===============================================
// RUTAS PARA SMS TEMPLATES
// ===============================================

// GET /api/sms-templates - Obtener todos los templates del restaurante del usuario autenticado
router.get('/', adminPortalAuth, smsTemplateController.getTemplatesByRestaurant);

// GET /api/sms-templates/:id - Obtener template por ID
router.get('/:id', adminPortalAuth, smsTemplateController.getTemplateById);

// POST /api/sms-templates - Crear nuevo template
router.post('/', adminPortalAuth, smsTemplateController.createTemplate);

// PUT /api/sms-templates/:id - Actualizar template
router.put('/:id', adminPortalAuth, smsTemplateController.updateTemplate);

// DELETE /api/sms-templates/:id - Eliminar template
router.delete('/:id', adminPortalAuth, smsTemplateController.deleteTemplate);

module.exports = router;
