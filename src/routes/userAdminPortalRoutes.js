const express = require('express');
const userAdminPortalController = require('../controllers/userAdminPortalController');
const { adminPortalAuth, optionalAdminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

const router = express.Router();

// ===============================================
// RUTAS DE INVITACIONES (PÚBLICAS)
// ===============================================

/**
 * @route   GET /api/admin-portal/validate-email/:email
 * @desc    Validar si un email está autorizado para registrarse
 * @access  Public
 */
router.get('/validate-email/:email', userAdminPortalController.validateEmailInvitation);

/**
 * @route   POST /api/admin-portal/complete-registration
 * @desc    Marcar invitación como usada después del registro
 * @access  Public
 */
router.post('/complete-registration', userAdminPortalController.completeRegistration);

// ===============================================
// RUTAS DE AUTENTICACIÓN Y USUARIOS
// ===============================================

/**
 * @route   POST /api/admin-portal/auth/sync
 * @desc    Sincronizar usuario desde Clerk (webhook o primer login)
 * @access  Public (pero debe incluir datos válidos de Clerk)
 */
router.post('/auth/sync', adminPortalAuth, userAdminPortalController.syncUserFromClerk);

/**
 * @route   GET /api/admin-portal/auth/me
 * @desc    Obtener información del usuario actual con su restaurante
 * @access  Private (requiere autenticación Clerk)
 */
router.get('/auth/me', adminPortalAuth, userAdminPortalController.getCurrentUser);

/**
 * @route   PUT /api/admin-portal/users/profile
 * @desc    Actualizar información del perfil del usuario
 * @access  Private
 */
// ===============================================
// MIDDLEWARE: Todas las rutas siguientes requieren autenticación
// ===============================================
router.use(adminPortalAuth);

router.put('/users/profile', userAdminPortalController.updateUserProfile);

// ===============================================
// RUTAS DE RESTAURANTES
// ===============================================

/**
 * @route   GET /api/admin-portal/restaurant
 * @desc    Obtener información del restaurante del usuario
 * @access  Private
 */
router.get('/restaurant', userAdminPortalController.getRestaurant);

/**
 * @route   POST /api/admin-portal/restaurant
 * @desc    Crear restaurante para usuario existente
 * @access  Private
 */
router.post('/restaurant', userAdminPortalController.createRestaurant);

/**
 * @route   PUT /api/admin-portal/restaurant
 * @desc    Actualizar información del restaurante
 * @access  Private
 */
router.put('/restaurant', userAdminPortalController.updateRestaurant);

// ===============================================
// RUTAS DE MENÚ
// ===============================================

/**
 * @route   GET /api/admin-portal/menu
 * @desc    Obtener menú completo del restaurante del usuario
 * @access  Private
 */
router.get('/menu', userAdminPortalController.getCompleteMenu);

// ===============================================
// RUTAS DE DASHBOARD Y ESTADÍSTICAS
// ===============================================

/**
 * @route   GET /api/admin-portal/dashboard/stats
 * @desc    Obtener estadísticas del usuario y su restaurante
 * @access  Private
 */
router.get('/dashboard/stats', userAdminPortalController.getDashboardStats);

// ===============================================
// RUTAS DE CONFIGURACIÓN INICIAL
// ===============================================

/**
 * @route   POST /api/admin-portal/setup
 * @desc    Configurar usuario y restaurante por primera vez
 * @access  Private
 */
router.post('/setup', userAdminPortalController.setupUserAndRestaurant);

/**
 * @route   GET /api/admin-portal/setup/status
 * @desc    Verificar estado de configuración del usuario
 * @access  Private
 */
router.get('/setup/status', userAdminPortalController.getSetupStatus);

// ===============================================
// RUTAS DE SERVICIOS
// ===============================================

/**
 * @route   GET /api/admin-portal/services/enabled
 * @desc    Obtener servicios habilitados para el cliente actual
 * @access  Private
 */
router.get('/services/enabled', userAdminPortalController.getEnabledServices);

module.exports = router;