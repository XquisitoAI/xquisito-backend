const express = require('express');
const router = express.Router();
const SubscriptionController = require('../controllers/subscriptionController');
const { checkFeatureAccess, getSubscriptionInfo, requireActiveSubscription } = require('../middleware/subscriptionMiddleware');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

// Public routes
router.get('/plans', SubscriptionController.getPlans);

// Protected routes - require Clerk Admin Portal authentication
router.use(adminPortalAuth);

// Get current subscription for restaurant
router.get('/restaurant/:restaurantId/current', SubscriptionController.getCurrentSubscription);

// Get current subscription for authenticated user's restaurant
router.get('/current', SubscriptionController.getCurrentUserSubscription);

// Create new subscription
router.post('/create', SubscriptionController.createSubscription);

// Change/upgrade plan for existing subscription
router.post('/change-plan', SubscriptionController.changePlan);

// Cancel subscription
router.put('/cancel/:subscriptionId', SubscriptionController.cancelSubscription);

// Get feature usage stats
router.get('/restaurant/:restaurantId/feature/:feature/usage', SubscriptionController.getFeatureUsage);

// Check feature access
router.get('/restaurant/:restaurantId/feature/:feature/access', SubscriptionController.checkFeatureAccess);

// Provision missing subscriptions (admin endpoint to fix existing restaurants)
router.post('/provision-missing', SubscriptionController.provisionMissingSubscriptions);

// Webhook endpoint (no authentication required)
router.post('/webhook', (req, res, next) => {
    // Remove authentication for webhook endpoint
    req.skipAuth = true;
    next();
}, SubscriptionController.handleSubscriptionWebhook);

module.exports = router;