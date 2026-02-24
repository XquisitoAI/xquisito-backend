const { createClient } = require("@supabase/supabase-js");

class SubscriptionService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }

    // Get current subscription for restaurant
    async getCurrentSubscription(restaurantId) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                throw error;
            }

            if (!data) return null;

            // Calculate days remaining
            if (data.end_date) {
                const endDate = new Date(data.end_date);
                const now = new Date();
                const diffTime = endDate - now;
                // Use Math.floor to avoid rounding up partial days
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                data.days_remaining = diffDays > 0 ? diffDays : 0;
            } else {
                data.days_remaining = null;
            }

            return data;
        } catch (error) {
            console.error('Error getting current subscription:', error);
            throw error;
        }
    }

    // Create subscription
    async createSubscription(subscriptionData) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .insert([subscriptionData])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }

    // Check if restaurant has active subscription
    async hasActiveSubscription(restaurantId) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .select('id')
                .eq('restaurant_id', restaurantId)
                .eq('status', 'active')
                .or('end_date.is.null,end_date.gt.now()')
                .limit(1);

            if (error) throw error;
            return data && data.length > 0;
        } catch (error) {
            console.error('Error checking active subscription:', error);
            throw error;
        }
    }

    // Get restaurant info
    async getRestaurantInfo(restaurantId) {
        try {
            const { data, error } = await this.supabase
                .from('restaurants')
                .select(`
                    *,
                    users!restaurants_user_id_fkey(email, phone)
                `)
                .eq('id', restaurantId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting restaurant info:', error);
            throw error;
        }
    }

    // Cancel subscription
    async cancelSubscription(subscriptionId) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', subscriptionId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error cancelling subscription:', error);
            throw error;
        }
    }

    // Create transaction record
    async createTransaction(transactionData) {
        try {
            const { data, error } = await this.supabase
                .from('subscription_transactions')
                .insert([transactionData])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating transaction:', error);
            throw error;
        }
    }

    // Update transaction status
    async updateTransactionStatus(paymentId, status) {
        try {
            const { data, error } = await this.supabase
                .from('subscription_transactions')
                .update({ status: status, updated_at: new Date().toISOString() })
                .eq('ecartpay_payment_id', paymentId)
                .select();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating transaction status:', error);
            throw error;
        }
    }

    // Check feature access using RPC (Remote Procedure Call)
    async checkFeatureAccess(restaurantId, featureName) {
        // For campaigns, use our updated logic directly to avoid RPC inconsistencies
        if (featureName === 'campaigns_per_month') {
            console.log('🎯 Using direct campaign counting method for accuracy');
            return await this.checkFeatureAccessFallback(restaurantId, featureName);
        }

        try {
            const { data, error } = await this.supabase
                .rpc('check_restaurant_feature_access', {
                    p_restaurant_id: restaurantId,
                    p_feature_name: featureName
                });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error checking feature access:', error);
            // Fallback: check manually if RPC function doesn't exist yet
            return await this.checkFeatureAccessFallback(restaurantId, featureName);
        }
    }

    // Fallback method for feature access check
    async checkFeatureAccessFallback(restaurantId, featureName) {
        try {
            console.log(`🔍 Checking feature access for restaurant ${restaurantId}, feature: ${featureName}`);

            // Get current subscription
            const subscription = await this.getCurrentSubscription(restaurantId);

            if (!subscription) {
                console.log(`❌ No subscription found for restaurant ${restaurantId}`);
                return false;
            }

            console.log(`📋 Subscription found:`, {
                id: subscription.id,
                plan_type: subscription.plan_type,
                status: subscription.status,
                restaurant_id: subscription.restaurant_id
            });

            if (subscription.status !== 'active') {
                console.log(`❌ Subscription status is '${subscription.status}', not 'active'`);
                return false;
            }

            // Get plan configuration
            const { data: planConfig, error } = await this.supabase
                .from('plan_configurations')
                .select('feature_limit')
                .eq('plan_type', subscription.plan_type)
                .eq('feature_name', featureName)
                .single();

            if (error) {
                console.log(`❌ Error getting plan config for plan '${subscription.plan_type}', feature '${featureName}':`, error);
                return false;
            }

            console.log(`✅ Plan config found: limit = ${planConfig.feature_limit}`);

            // If feature is disabled (limit = 0)
            if (planConfig.feature_limit === 0) return false;

            // If unlimited (limit = -1)
            if (planConfig.feature_limit === -1) return true;

            // Check current usage based on actual data, not plan_usage table
            let currentUsage = 0;

            if (featureName === 'campaigns_per_month') {
                // Count actual campaigns created this month
                const currentMonth = new Date();
                currentMonth.setDate(1);
                currentMonth.setHours(0, 0, 0, 0);

                const nextMonth = new Date(currentMonth);
                nextMonth.setMonth(nextMonth.getMonth() + 1);

                console.log(`📅 Counting campaigns from ${currentMonth.toISOString()} to ${nextMonth.toISOString()}`);

                const { data: campaigns, error: campaignsError } = await this.supabase
                    .from('campaigns')
                    .select('id, created_at, name')
                    .eq('restaurant_id', restaurantId)
                    .gte('created_at', currentMonth.toISOString())
                    .lt('created_at', nextMonth.toISOString());

                if (campaignsError) {
                    console.error('❌ Error counting campaigns:', campaignsError);
                    return false;
                }

                currentUsage = campaigns ? campaigns.length : 0;
                console.log(`📊 Campaign usage check: ${currentUsage}/${planConfig.feature_limit} (${subscription.plan_type} plan)`);
                if (campaigns && campaigns.length > 0) {
                    console.log(`📋 Campaigns found this month:`, campaigns.map(c => ({ id: c.id, name: c.name, created_at: c.created_at })));
                }
            } else {
                // For other features, fallback to plan_usage table
                const currentMonth = new Date();
                currentMonth.setDate(1);
                currentMonth.setHours(0, 0, 0, 0);

                const nextMonth = new Date(currentMonth);
                nextMonth.setMonth(nextMonth.getMonth() + 1);

                const { data: usage, error: usageError } = await this.supabase
                    .from('plan_usage')
                    .select('usage_count')
                    .eq('subscription_id', subscription.id)
                    .eq('feature_type', featureName)
                    .gte('period_start', currentMonth.toISOString())
                    .lt('period_end', nextMonth.toISOString())
                    .single();

                if (usageError && usageError.code !== 'PGRST116') {
                    console.error('Error checking usage:', usageError);
                    return false;
                }

                currentUsage = usage ? usage.usage_count : 0;
            }

            const hasAccess = currentUsage < planConfig.feature_limit;
            console.log(`🔓 Feature access result: ${hasAccess} (usage: ${currentUsage}, limit: ${planConfig.feature_limit})`);

            return hasAccess;
        } catch (error) {
            console.error('Error in feature access fallback:', error);
            return false;
        }
    }

    // Get feature usage for current period
    async getFeatureUsage(restaurantId, featureName) {
        try {
            const subscription = await this.getCurrentSubscription(restaurantId);
            if (!subscription) {
                return { usage: 0, limit: 0, percentage: 0 };
            }

            // Get plan configuration
            const { data: planConfig, error } = await this.supabase
                .from('plan_configurations')
                .select('feature_limit')
                .eq('plan_type', subscription.plan_type)
                .eq('feature_name', featureName)
                .single();

            if (error) {
                console.error('Error getting plan config:', error);
                return { usage: 0, limit: 0, percentage: 0 };
            }

            const limit = planConfig.feature_limit;
            let currentUsage = 0;

            // Get current usage based on actual data
            if (featureName === 'campaigns_per_month') {
                // Count actual campaigns created this month
                const currentMonth = new Date();
                currentMonth.setDate(1);
                currentMonth.setHours(0, 0, 0, 0);

                const nextMonth = new Date(currentMonth);
                nextMonth.setMonth(nextMonth.getMonth() + 1);

                const { data: campaigns, error: campaignsError } = await this.supabase
                    .from('campaigns')
                    .select('id')
                    .eq('restaurant_id', restaurantId)
                    .gte('created_at', currentMonth.toISOString())
                    .lt('created_at', nextMonth.toISOString());

                currentUsage = campaigns ? campaigns.length : 0;
            } else {
                // For other features, use plan_usage table
                const currentMonth = new Date();
                currentMonth.setDate(1);
                currentMonth.setHours(0, 0, 0, 0);

                const nextMonth = new Date(currentMonth);
                nextMonth.setMonth(nextMonth.getMonth() + 1);

                const { data: usage, error: usageError } = await this.supabase
                    .from('plan_usage')
                    .select('usage_count')
                    .eq('subscription_id', subscription.id)
                    .eq('feature_type', featureName)
                    .gte('period_start', currentMonth.toISOString())
                    .lt('period_end', nextMonth.toISOString())
                    .single();

                currentUsage = usage ? usage.usage_count : 0;
            }

            const percentage = limit > 0 ? Math.round((currentUsage / limit) * 100) : 0;

            return {
                usage: currentUsage,
                limit: limit,
                percentage: percentage,
                unlimited: limit === -1,
                disabled: limit === 0
            };
        } catch (error) {
            console.error('Error getting feature usage:', error);
            return { usage: 0, limit: 0, percentage: 0 };
        }
    }

    // Update subscription plan
    async updateSubscriptionPlan(subscriptionId, newPlanType, newPrice, newEndDate = null, extraFields = {}) {
        try {
            const updateData = {
                plan_type: newPlanType,
                price_paid: newPrice,
                updated_at: new Date().toISOString()
            };

            // Update end date if provided (for new billing cycle)
            if (newEndDate) {
                updateData.end_date = newEndDate;
                updateData.next_billing_date = newEndDate; // Also update next billing date
            }

            // Reset renewal tracking fields on plan change
            updateData.renewal_attempts = 0;
            updateData.renewal_reminder_sent = false;
            updateData.scheduled_plan_change = null;

            // For paid plans, enable auto_renew by default
            if (newPrice > 0) {
                updateData.auto_renew = true;
            }

            // Merge any extra fields (like ecartpay_customer_id)
            Object.assign(updateData, extraFields);

            console.log('📝 Updating subscription plan:', {
                subscriptionId,
                newPlanType,
                newPrice,
                newEndDate
            });

            const { data, error } = await this.supabase
                .from('subscriptions')
                .update(updateData)
                .eq('id', subscriptionId)
                .select()
                .single();

            if (error) {
                console.error('❌ Error updating subscription plan:', error);
                throw error;
            }

            console.log('✅ Subscription plan updated successfully');
            return data;

        } catch (error) {
            console.error('Error updating subscription plan:', error);
            throw error;
        }
    }

    // Toggle auto_renew for a subscription
    async toggleAutoRenew(subscriptionId, autoRenew) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .update({
                    auto_renew: autoRenew,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscriptionId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error toggling auto_renew:', error);
            throw error;
        }
    }

    // Schedule a plan downgrade for end of billing cycle
    async scheduleDowngrade(subscriptionId, targetPlan) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .update({
                    scheduled_plan_change: targetPlan,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscriptionId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error scheduling downgrade:', error);
            throw error;
        }
    }

    // Cancel scheduled downgrade
    async cancelScheduledDowngrade(subscriptionId) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .update({
                    scheduled_plan_change: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscriptionId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error cancelling scheduled downgrade:', error);
            throw error;
        }
    }
}

module.exports = SubscriptionService;