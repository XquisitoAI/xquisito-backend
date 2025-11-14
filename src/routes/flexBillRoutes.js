const express = require('express');
const router = express.Router();
const flexBillController = require('../controllers/flexBillController');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

/**
 * @route GET /api/flex-bill/health
 * @desc Health check endpoint para FlexBill
 * @access Public
 */
router.get('/health', flexBillController.healthCheck);

/**
 * @route GET /api/flex-bill/debug/user-info
 * @desc Debug endpoint para verificar información del usuario
 * @access Private (requires authentication)
 */
router.get('/debug/user-info', adminPortalAuth, flexBillController.debugUserInfo);

/**
 * @route GET /api/flex-bill/dashboard/metrics
 * @desc Obtiene métricas del dashboard FlexBill
 * @access Private (requires authentication)
 * @query {number} restaurant_id - ID del restaurante (requerido)
 * @query {string} time_range - Rango de tiempo (daily, weekly, monthly) - default: daily
 * @query {string} start_date - Fecha de inicio (ISO string) - opcional
 * @query {string} end_date - Fecha de fin (ISO string) - opcional
 * @example /api/flex-bill/dashboard/metrics?restaurant_id=1&time_range=daily
 */
router.get('/dashboard/metrics', adminPortalAuth, flexBillController.getFlexBillMetrics);

/**
 * @route GET /api/flex-bill/dashboard/charts
 * @desc Obtiene datos de gráficos para FlexBill
 * @access Private (requires authentication)
 * @query {number} restaurant_id - ID del restaurante (requerido)
 * @query {string} time_range - Rango de tiempo (daily, weekly, monthly) - default: daily
 * @example /api/flex-bill/dashboard/charts?restaurant_id=1&time_range=weekly
 */
router.get('/dashboard/charts', adminPortalAuth, flexBillController.getFlexBillChartData);

/**
 * @route GET /api/flex-bill/dashboard/payment-analytics
 * @desc Obtiene análisis de pagos para FlexBill
 * @access Private (requires authentication)
 * @query {number} restaurant_id - ID del restaurante (requerido)
 * @example /api/flex-bill/dashboard/payment-analytics?restaurant_id=1
 */
router.get('/dashboard/payment-analytics', adminPortalAuth, flexBillController.getPaymentAnalytics);

/**
 * @route GET /api/flex-bill/dashboard/table-usage
 * @desc Obtiene uso de mesas para FlexBill
 * @access Private (requires authentication)
 * @query {number} restaurant_id - ID del restaurante (requerido)
 * @example /api/flex-bill/dashboard/table-usage?restaurant_id=1
 */
router.get('/dashboard/table-usage', adminPortalAuth, flexBillController.getTableUsage);

/**
 * @route GET /api/flex-bill/dashboard/complete
 * @desc Obtiene todos los datos del dashboard FlexBill en una sola llamada
 * @access Private (requires authentication)
 * @query {number} restaurant_id - ID del restaurante (requerido)
 * @query {string} time_range - Rango de tiempo (daily, weekly, monthly) - default: daily
 * @query {string} start_date - Fecha de inicio (ISO string) - opcional
 * @query {string} end_date - Fecha de fin (ISO string) - opcional
 * @example /api/flex-bill/dashboard/complete?restaurant_id=1&time_range=monthly
 */
router.get('/dashboard/complete', adminPortalAuth, flexBillController.getCompleteDashboardData);

module.exports = router;