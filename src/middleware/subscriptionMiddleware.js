const SubscriptionService = require('../services/subscriptionService');

/**
 * Middleware to check if restaurant has access to a specific feature
 */
const checkFeatureAccess = (featureName, action = 'access') => {
    return async (req, res, next) => {
        try {
            // Extract restaurant ID from different possible sources
            let restaurantId = req.params.restaurantId ||
                              req.body.restaurantId ||
                              req.user?.restaurantId ||
                              req.restaurant?.id;

            // If restaurant ID is not found in usual places, try to get it from user context
            if (!restaurantId && req.user?.id) {
                const subscriptionService = new SubscriptionService();
                const { data, error } = await subscriptionService.supabase
                    .from('restaurants')
                    .select('id')
                    .eq('user_id', req.user.id)
                    .single();

                if (data) {
                    restaurantId = data.id;
                }
            }

            if (!restaurantId) {
                return res.status(400).json({
                    success: false,
                    error: 'Restaurant ID not found',
                    feature: featureName,
                    action: action
                });
            }

            // Check feature access using service
            const subscriptionService = new SubscriptionService();
            const hasAccess = await subscriptionService.checkFeatureAccess(restaurantId, featureName);

            if (!hasAccess) {
                // Get current plan info for better error message
                const subscription = await subscriptionService.getCurrentSubscription(restaurantId);
                const currentPlan = subscription ? subscription.plan_type : 'none';

                return res.status(403).json({
                    success: false,
                    error: 'Feature not available in current plan',
                    feature: featureName,
                    action: action,
                    currentPlan: currentPlan,
                    upgradeRequired: true
                });
            }

            // Store restaurant ID and feature info in request for later use
            req.restaurantId = restaurantId;
            req.checkedFeature = featureName;
            req.featureAction = action;

            next();
        } catch (error) {
            console.error('Error checking feature access:', error);
            res.status(500).json({
                success: false,
                error: 'Error checking feature access',
                feature: featureName
            });
        }
    };
};

/**
 * Middleware to increment feature usage after successful operation
 */
const incrementUsageAfterSuccess = (featureName, increment = 1) => {
    return async (req, res, next) => {
        try {
            const restaurantId = req.restaurantId || req.params.restaurantId || req.body.restaurantId;

            if (!restaurantId) {
                console.warn('Could not increment usage: restaurant ID not found');
                return next();
            }

            // Note: For now, we'll skip usage increment since we don't have the RPC function
            // This would need to be implemented when we have proper usage tracking
            console.log(`Usage increment for ${featureName} on restaurant ${restaurantId} (increment: ${increment})`);

            next();
        } catch (error) {
            console.error('Error incrementing feature usage:', error);
            // Don't fail the request if usage increment fails, just log it
            next();
        }
    };
};

/**
 * Get current subscription info for restaurant
 */
const getSubscriptionInfo = async (req, res, next) => {
    try {
        const restaurantId = req.restaurantId || req.params.restaurantId || req.body.restaurantId;

        if (!restaurantId) {
            return next();
        }

        const subscriptionService = new SubscriptionService();
        const subscription = await subscriptionService.getCurrentSubscription(restaurantId);

        req.subscription = subscription;

        next();
    } catch (error) {
        console.error('Error getting subscription info:', error);
        next();
    }
};

/**
 * Require active subscription
 */
const requireActiveSubscription = (req, res, next) => {
    if (!req.subscription) {
        return res.status(403).json({
            success: false,
            error: 'Active subscription required',
            upgradeRequired: true
        });
    }

    // Check if subscription is expired
    if (req.subscription.end_date && new Date(req.subscription.end_date) < new Date()) {
        return res.status(403).json({
            success: false,
            error: 'Subscription expired',
            expiredDate: req.subscription.end_date,
            upgradeRequired: true
        });
    }

    next();
};

module.exports = {
    checkFeatureAccess,
    incrementUsageAfterSuccess,
    getSubscriptionInfo,
    requireActiveSubscription
};