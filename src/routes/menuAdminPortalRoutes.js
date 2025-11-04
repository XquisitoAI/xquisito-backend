const express = require('express');
const router = express.Router();
const menuAdminPortalController = require('../controllers/menuAdminPortalController');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

// ===============================================
// RUTAS DE SECCIONES DEL MENÚ
// ===============================================

// Obtener todas las secciones del restaurante del usuario
router.get('/sections', adminPortalAuth, menuAdminPortalController.getAllSections);

// Crear nueva sección
router.post('/sections', adminPortalAuth, menuAdminPortalController.createSection);

// Reordenar secciones
router.put('/sections/reorder', adminPortalAuth, menuAdminPortalController.reorderSections);

// Actualizar sección
router.put('/sections/:id', adminPortalAuth, menuAdminPortalController.updateSection);

// Eliminar sección
router.delete('/sections/:id', adminPortalAuth, menuAdminPortalController.deleteSection);

// ===============================================
// RUTAS DE ITEMS DEL MENÚ
// ===============================================

// Obtener todos los items del restaurante del usuario
router.get('/items', adminPortalAuth, menuAdminPortalController.getAllItems);

// Obtener item por ID
router.get('/items/:id', adminPortalAuth, menuAdminPortalController.getItemById);

// Crear nuevo item
router.post('/items', adminPortalAuth, menuAdminPortalController.createItem);

// Actualizar item
router.put('/items/:id', adminPortalAuth, menuAdminPortalController.updateItem);

// Eliminar item
router.delete('/items/:id', adminPortalAuth, menuAdminPortalController.deleteItem);

// ===============================================
// RUTAS DE MENÚ COMPLETO
// ===============================================

// Obtener menú completo (secciones con items)
router.get('/complete', adminPortalAuth, menuAdminPortalController.getCompleteMenu);

module.exports = router;