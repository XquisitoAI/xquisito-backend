const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaignsController');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

/**
 * @route GET /api/campaigns
 * @desc Obtener todas las campañas de un restaurante
 * @access Private (Admin Portal)
 * @query {number} restaurant_id - ID del restaurante
 * @returns {Array} Lista de campañas con información de segmentos y templates
 * @example GET /api/campaigns?restaurant_id=3
 */
router.get('/', adminPortalAuth, campaignsController.getCampaigns);

/**
 * @route GET /api/campaigns/analytics
 * @desc Obtener analytics de campañas de un restaurante
 * @access Private (Admin Portal)
 * @query {number} restaurant_id - ID del restaurante
 * @returns {Object} Analytics agregados de todas las campañas
 * @example GET /api/campaigns/analytics?restaurant_id=3
 */
router.get('/analytics', adminPortalAuth, campaignsController.getCampaignAnalytics);

/**
 * @route GET /api/campaigns/:id
 * @desc Obtener una campaña específica por ID
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @query {number} restaurant_id - ID del restaurante (para validación)
 * @returns {Object} Campaña con templates, estadísticas y información del segmento
 * @example GET /api/campaigns/uuid-123?restaurant_id=3
 */
router.get('/:id', adminPortalAuth, campaignsController.getCampaignById);

/**
 * @route POST /api/campaigns
 * @desc Crear una nueva campaña
 * @access Private (Admin Portal)
 * @body {Object} campaignData - Datos de la campaña
 * @body {number} campaignData.restaurant_id - ID del restaurante
 * @body {string} campaignData.name - Nombre de la campaña
 * @body {string} campaignData.description - Descripción opcional
 * @body {string} campaignData.segment_id - UUID del segmento objetivo
 * @body {string} campaignData.reward_type - Tipo de recompensa (discount_percentage, discount_fixed, free_item, points, buy_one_get_one)
 * @body {number} campaignData.reward_value - Valor de la recompensa
 * @body {string} campaignData.reward_code - Código promocional opcional
 * @body {string} campaignData.reward_description - Descripción de la recompensa
 * @body {number} campaignData.points_required - Puntos requeridos (opcional)
 * @body {number} campaignData.points_awarded - Puntos otorgados (opcional)
 * @body {string} campaignData.start_date - Fecha de inicio (ISO string)
 * @body {string} campaignData.end_date - Fecha de fin (ISO string)
 * @body {Array<string>} campaignData.delivery_methods - Métodos de entrega ['email', 'sms', 'whatsapp', 'push']
 * @body {boolean} campaignData.auto_send - Envío automático (opcional)
 * @body {boolean} campaignData.send_immediately - Envío inmediato (opcional)
 * @body {number} campaignData.budget_limit - Límite de presupuesto (opcional)
 * @returns {Object} Campaña creada
 */
router.post('/', adminPortalAuth, campaignsController.createCampaign);

/**
 * @route PUT /api/campaigns/:id
 * @desc Actualizar una campaña existente
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @query {number} restaurant_id - ID del restaurante (para validación)
 * @body {Object} updateData - Datos a actualizar (mismos campos que POST, todos opcionales)
 * @returns {Object} Campaña actualizada
 * @note No se permite editar campañas que ya han sido enviadas (status: running, completed)
 */
router.put('/:id', adminPortalAuth, campaignsController.updateCampaign);

/**
 * @route DELETE /api/campaigns/:id
 * @desc Eliminar una campaña
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @query {number} restaurant_id - ID del restaurante (para validación)
 * @returns {Object} Confirmación de eliminación
 * @note No se permite eliminar campañas que están en ejecución (status: running)
 */
router.delete('/:id', adminPortalAuth, campaignsController.deleteCampaign);

/**
 * @route POST /api/campaigns/:id/templates
 * @desc Asociar templates a una campaña
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @body {Array} templates - Array de templates a asociar
 * @body {string} templates[].template_id - UUID del template
 * @body {string} templates[].template_type - Tipo de template (sms, email, whatsapp, push)
 * @body {boolean} templates[].is_primary - Si es el template principal para ese tipo (opcional)
 * @body {Object} templates[].custom_variables - Variables personalizadas (opcional)
 * @body {number} restaurant_id - ID del restaurante (para validación)
 * @returns {Array} Templates asociados
 * @example
 * POST /api/campaigns/uuid-123/templates
 * {
 *   "restaurant_id": 3,
 *   "templates": [
 *     {
 *       "template_id": "uuid-email-template",
 *       "template_type": "email",
 *       "is_primary": true
 *     },
 *     {
 *       "template_id": "uuid-sms-template",
 *       "template_type": "sms",
 *       "is_primary": true
 *     }
 *   ]
 * }
 */
router.post('/:id/templates', adminPortalAuth, campaignsController.associateTemplates);

/**
 * @route GET /api/campaigns/:id/templates
 * @desc Obtener templates asociados a una campaña
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @returns {Array} Templates asociados con datos completos
 */
router.get('/:id/templates', adminPortalAuth, campaignsController.getCampaignTemplates);

/**
 * @route PATCH /api/campaigns/:id/status
 * @desc Cambiar el estado de una campaña
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @body {string} status - Nuevo estado (draft, scheduled, running, paused, completed, cancelled)
 * @body {number} restaurant_id - ID del restaurante (para validación)
 * @returns {Object} Campaña con estado actualizado
 * @example
 * PATCH /api/campaigns/uuid-123/status
 * {
 *   "status": "running",
 *   "restaurant_id": 3
 * }
 */
router.patch('/:id/status', adminPortalAuth, campaignsController.updateCampaignStatus);

/**
 * @route GET /api/campaigns/:id/stats
 * @desc Obtener estadísticas detalladas de envíos de una campaña
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @query {number} restaurant_id - ID del restaurante (para validación)
 * @returns {Object} Estadísticas de envíos por estado y método de entrega
 * @example GET /api/campaigns/uuid-123/stats?restaurant_id=3
 * @response
 * {
 *   "success": true,
 *   "data": {
 *     "total": 1000,
 *     "by_status": {
 *       "sent": 950,
 *       "delivered": 900,
 *       "opened": 350,
 *       "clicked": 120,
 *       "redeemed": 45,
 *       "failed": 50
 *     },
 *     "by_delivery_method": {
 *       "email": 600,
 *       "sms": 400
 *     }
 *   }
 * }
 */
router.get('/:id/stats', adminPortalAuth, campaignsController.getCampaignStats);

// =====================================================
// ENDPOINTS FUTUROS PARA FUNCIONALIDADES AVANZADAS
// =====================================================

/**
 * @route POST /api/campaigns/:id/send
 * @desc Enviar una campaña (funcionalidad futura)
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @body {number} restaurant_id - ID del restaurante (para validación)
 * @body {boolean} test_mode - Si es envío de prueba (opcional)
 * @body {Array<string>} test_recipients - Destinatarios de prueba (opcional)
 * @returns {Object} Confirmación de envío iniciado
 * @todo Implementar lógica de envío de mensajes
 */
// router.post('/:id/send', adminPortalAuth, campaignsController.sendCampaign);

/**
 * @route GET /api/campaigns/:id/sends
 * @desc Obtener historial detallado de envíos de una campaña (funcionalidad futura)
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña
 * @query {number} restaurant_id - ID del restaurante
 * @query {number} page - Página para paginación (opcional)
 * @query {number} limit - Límite de resultados por página (opcional)
 * @query {string} status - Filtrar por estado (opcional)
 * @query {string} delivery_method - Filtrar por método de entrega (opcional)
 * @returns {Object} Historial paginado de envíos
 * @todo Implementar paginación y filtros avanzados
 */
// router.get('/:id/sends', adminPortalAuth, campaignsController.getCampaignSends);

/**
 * @route POST /api/campaigns/:id/duplicate
 * @desc Duplicar una campaña existente (funcionalidad futura)
 * @access Private (Admin Portal)
 * @param {string} id - UUID de la campaña a duplicar
 * @body {string} new_name - Nombre de la nueva campaña
 * @body {number} restaurant_id - ID del restaurante (para validación)
 * @returns {Object} Nueva campaña duplicada
 * @todo Implementar lógica de duplicación
 */
// router.post('/:id/duplicate', adminPortalAuth, campaignsController.duplicateCampaign);

module.exports = router;