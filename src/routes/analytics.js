const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

/**
 * @route GET /api/analytics/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', analyticsController.healthCheck);

/**
 * @route GET /api/analytics/debug/user-info
 * @desc Debug endpoint to check user and restaurant data
 * @access Private (requires authentication)
 */
router.get('/debug/user-info', adminPortalAuth, analyticsController.debugUserInfo);

/**
 * @route GET /api/analytics/restaurants
 * @desc Get restaurants available for authenticated user
 * @access Private (requires authentication)
 */
router.get('/restaurants', adminPortalAuth, analyticsController.getUserRestaurants);

/**
 * @route GET /api/analytics/dashboard/metrics
 * @desc Get dashboard metrics with filters
 * @access Private
 * @query {number} restaurant_id - Restaurant ID filter
 * @query {string} start_date - Start date filter (ISO string)
 * @query {string} end_date - End date filter (ISO string)
 * @query {string} gender - Gender filter (todos, hombre, mujer, otro)
 * @query {string} age_range - Age range filter (todos, 14-17, 18-25, 26-35, 36-45, 46+)
 * @query {string} granularity - Time granularity (hora, dia, mes, ano)
 */
router.get('/dashboard/metrics', adminPortalAuth, analyticsController.getDashboardMetrics);

/**
 * @route GET /api/analytics/dashboard/complete
 * @desc Get complete dashboard data including metrics and additional data
 * @access Private
 * @query {number} restaurant_id - Restaurant ID filter
 * @query {string} start_date - Start date filter (ISO string)
 * @query {string} end_date - End date filter (ISO string)
 * @query {string} gender - Gender filter (todos, hombre, mujer, otro)
 * @query {string} age_range - Age range filter (todos, 14-17, 18-25, 26-35, 36-45, 46+)
 * @query {string} granularity - Time granularity (hora, dia, mes, ano)
 */
router.get('/dashboard/complete', adminPortalAuth, analyticsController.getCompleteDashboardData);

/**
 * @route GET /api/analytics/dashboard/active-orders/:restaurant_id
 * @desc Get active orders for a restaurant (legacy endpoint)
 * @access Private
 * @param {number} restaurant_id - Restaurant ID
 */
router.get('/dashboard/active-orders/:restaurant_id', adminPortalAuth, analyticsController.getActiveOrders);

/**
 * @route GET /api/analytics/dashboard/orders/:restaurant_id
 * @desc Get orders for a restaurant with date filtering
 * @access Private
 * @param {number} restaurant_id - Restaurant ID
 * @query {number} limit - Limit for pagination (default: 5)
 * @query {number} offset - Offset for pagination (default: 0)
 * @query {string} status - Order status filter (todos, not_paid, partial, paid)
 * @query {string} dateFilter - Date filter (hoy, ayer, semana, mes, todos)
 */
router.get('/dashboard/orders/:restaurant_id', adminPortalAuth, analyticsController.getActiveOrders);

/**
 * @route GET /api/analytics/dashboard/top-selling-item
 * @desc Get top selling item with filters
 * @access Private
 * @query {number} restaurant_id - Restaurant ID filter
 * @query {string} start_date - Start date filter (ISO string)
 * @query {string} end_date - End date filter (ISO string)
 */
router.get('/dashboard/top-selling-item', adminPortalAuth, analyticsController.getTopSellingItem);

/**
 * @route GET /api/analytics/dashboard/summary/:restaurant_id
 * @desc Get quick dashboard summary for today
 * @access Private
 * @param {number} restaurant_id - Restaurant ID
 */
router.get('/dashboard/summary/:restaurant_id', adminPortalAuth, analyticsController.getDashboardSummary);

/**
 * @route GET /api/analytics/dashboard/metrics-all-services
 * @desc Get dashboard metrics consolidating ALL services (FlexBill, Pick&Go, Room Service, Tap Order, Tap Pay)
 * @access Private
 * @query {number} restaurant_id - Restaurant ID filter
 * @query {string} branch_id - Branch UUID filter
 * @query {string} start_date - Start date filter (ISO string)
 * @query {string} end_date - End date filter (ISO string)
 * @query {string} granularity - Time granularity (hora, dia, mes, ano)
 * @query {string} service_type - Service type filter (flex-bill, pick-n-go, tap-order-pay, tap-pay, room-service, or null for all)
 */
router.get('/dashboard/metrics-all-services', adminPortalAuth, analyticsController.getDashboardMetricsAllServices);

/**
 * @route GET /api/analytics/dashboard/recent-transactions
 * @desc Get recent payment transactions with pagination
 * @access Private
 * @query {number} restaurant_id - Restaurant ID filter
 * @query {string} branch_id - Branch UUID filter
 * @query {string} service_type - Service type filter
 * @query {string} start_date - Start date filter (ISO string)
 * @query {string} end_date - End date filter (ISO string)
 * @query {number} limit - Limit for pagination (default: 10)
 * @query {number} offset - Offset for pagination (default: 0)
 */
router.get('/dashboard/recent-transactions', adminPortalAuth, analyticsController.getRecentTransactions);

/**
 * @route GET /api/analytics/dashboard/order-items
 * @desc Get items for an order/transaction
 * @access Private
 * @query {string} id - Transaction or order ID (UUID)
 * @query {string} orderStatus - Order status (paid, not_paid, partial, pending)
 * @query {string} serviceType - Service type (flex-bill, tap-pay, etc.)
 */
router.get('/dashboard/order-items', adminPortalAuth, analyticsController.getOrderItems);

module.exports = router;