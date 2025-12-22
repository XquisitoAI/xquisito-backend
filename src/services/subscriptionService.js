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
            // Get current subscription
            const subscription = await this.getCurrentSubscription(restaurantId);
            if (!subscription || subscription.status !== 'active') {
                return false;
            }

            // Get plan configuration
            const { data: planConfig, error } = await this.supabase
                .from('plan_configurations')
                .select('feature_limit')
                .eq('plan_type', subscription.plan_type)
                .eq('feature_name', featureName)
                .single();

            if (error) return false;

            // If feature is disabled (limit = 0)
            if (planConfig.feature_limit === 0) return false;

            // If unlimited (limit = -1)
            if (planConfig.feature_limit === -1) return true;

            // Check current usage for limited features
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

            const currentUsage = usage ? usage.usage_count : 0;
            return currentUsage < planConfig.feature_limit;
        } catch (error) {
            console.error('Error in feature access fallback:', error);
            return false;
        }
    }

    // Update subscription plan
    async updateSubscriptionPlan(subscriptionId, newPlanType, newPrice, newEndDate = null) {
        try {
            const updateData = {
                plan_type: newPlanType,
                price_paid: newPrice,
                updated_at: new Date().toISOString()
            };

            // Update end date if provided (for new billing cycle)
            if (newEndDate) {
                updateData.end_date = newEndDate;
            }

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
}

module.exports = SubscriptionService;