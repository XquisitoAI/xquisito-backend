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
 * @desc Get active orders for a restaurant
 * @access Private
 * @param {number} restaurant_id - Restaurant ID
 */
router.get('/dashboard/active-orders/:restaurant_id', adminPortalAuth, analyticsController.getActiveOrders);

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

module.exports = router;