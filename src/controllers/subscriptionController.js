const SubscriptionService = require('../services/subscriptionService');
const ecartpayService = require('../services/ecartpayService');

class SubscriptionController {
    constructor() {
        this.subscriptionService = new SubscriptionService();
    }

    // Get available plans
    async getPlans(req, res) {
        try {
            const plans = [
                {
                    id: 'basico',
                    name: 'Plan Básico',
                    price: 0,
                    currency: 'MXN',
                    period: 'monthly',
                    features: [
                        "1 campaña activa x mes",
                        "Estadísticas básicas",
                        "Soporte por email"
                    ],
                    limits: {
                        campaigns_per_month: 1,
                        customers_per_campaign: 100,
                        segments_total: 3,
                        advanced_analytics: false,
                        priority_support: false
                    },
                    free: true
                },
                {
                    id: 'premium',
                    name: 'Plan Premium',
                    price: 399,
                    currency: 'MXN',
                    period: 'monthly',
                    features: [
                        "5 campañas x mes",
                        "Estadísticas avanzadas",
                        "Segmentación de clientes",
                        "Soporte prioritario"
                    ],
                    limits: {
                        campaigns_per_month: 5,
                        customers_per_campaign: 500,
                        segments_total: 10,
                        advanced_analytics: true,
                        priority_support: true
                    },
                    popular: true
                },
                {
                    id: 'ultra',
                    name: 'Plan Ultra',
                    price: 599,
                    currency: 'MXN',
                    period: 'monthly',
                    features: [
                        "Hasta 10 campañas x mes",
                        "Estadísticas avanzadas",
                        "Segmentación avanzada",
                        "Soporte 24/7"
                    ],
                    limits: {
                        campaigns_per_month: 10,
                        customers_per_campaign: -1,
                        segments_total: -1,
                        advanced_analytics: true,
                        priority_support: true
                    }
                }
            ];

            res.json({
                success: true,
                data: plans
            });
        } catch (error) {
            console.error('Error getting plans:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener los planes'
            });
        }
    }

    // Get current subscription for restaurant
    async getCurrentSubscription(req, res) {
        try {
            const { restaurantId } = req.params;
            console.log({restaurantId});
            
            const subscriptionService = new SubscriptionService();

            const subscription = await subscriptionService.getCurrentSubscription(restaurantId);

            if (!subscription) {
                return res.json({
                    success: true,
                    data: null,
                    message: 'No hay suscripción activa'
                });
            }

            res.json({
                success: true,
                data: subscription
            });
        } catch (error) {
            console.error('Error getting current subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener la suscripción actual'
            });
        }
    }

    // Get current subscription for authenticated user's restaurant
    async getCurrentUserSubscription(req, res) {
        try {
            const clerkUserId = req.auth?.userId;

            if (!clerkUserId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
            }

            // Get restaurant ID from user (reuse the same logic)
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            );

            const { data: user, error: userError } = await supabase
                .from('user_admin_portal')
                .select('id')
                .eq('clerk_user_id', clerkUserId)
                .single();

            if (userError || !user) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado en el sistema'
                });
            }

            const { data: restaurant, error: restaurantError } = await supabase
                .from('restaurants')
                .select('id')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .single();

            if (restaurantError || !restaurant) {
                return res.status(404).json({
                    success: false,
                    error: 'Restaurante no encontrado'
                });
            }

            const subscriptionService = new SubscriptionService();
            const subscription = await subscriptionService.getCurrentSubscription(restaurant.id);

            if (!subscription) {
                return res.json({
                    success: true,
                    data: null,
                    message: 'No hay suscripción activa'
                });
            }

            res.json({
                success: true,
                data: subscription
            });
        } catch (error) {
            console.error('Error getting user subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener la suscripción actual'
            });
        }
    }

    // Create new subscription
    async createSubscription(req, res) {
        try {
            const { plan_type, auto_renew, payment_data } = req.body;
            const clerkUserId = req.auth?.userId;

            if (!clerkUserId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
            }

            // Get restaurant ID from user
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            );

            // Get user from Clerk ID
            const { data: user, error: userError } = await supabase
                .from('user_admin_portal')
                .select('id, email, first_name, last_name, phone')
                .eq('clerk_user_id', clerkUserId)
                .single();

            if (userError || !user) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado en el sistema'
                });
            }

            // Get restaurant from user
            const { data: restaurant, error: restaurantError } = await supabase
                .from('restaurants')
                .select('id')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .single();

            if (restaurantError || !restaurant) {
                return res.status(404).json({
                    success: false,
                    error: 'Restaurante no encontrado'
                });
            }

            const restaurantId = restaurant.id;
            const planType = plan_type;

            // Validate plan type
            const validPlans = ['basico', 'premium', 'ultra'];
            if (!validPlans.includes(planType)) {
                return res.status(400).json({
                    success: false,
                    error: 'Tipo de plan inválido'
                });
            }

            const subscriptionService = new SubscriptionService();

            // Check if restaurant already has active subscription
            const hasActive = await subscriptionService.hasActiveSubscription(restaurantId);
            if (hasActive) {
                return res.status(400).json({
                    success: false,
                    error: 'Ya existe una suscripción activa para este restaurante'
                });
            }


            // Plan pricing - based on your specifications (MXN)
            const planPrices = {
                basico: 0,    // Free plan
                premium: 399, // 399 MXN as specified
                ultra: 599    // 599 MXN as specified
            };

            const amount = planPrices[planType];

            // Handle free plan (básico) - no payment processing needed
            if (planType === 'basico' || amount === 0) {
                const subscriptionData = {
                    restaurant_id: restaurantId,
                    plan_type: planType,
                    status: 'active',
                    start_date: new Date().toISOString(),
                    price_paid: amount,
                    currency: 'MXN'
                };

                const subscription = await subscriptionService.createSubscription(subscriptionData);

                return res.json({
                    success: true,
                    data: {
                        subscription: subscription,
                        message: 'Plan básico activado exitosamente'
                    }
                });
            }

            // For paid plans, process payment through EcartPay
            let ecartpayCustomerId;
            try {
                // Simple pattern: Check if customer exists by Clerk user_id, create if not
                // This follows the same successful pattern used in paymentService.js

                console.log('🔍 Checking if customer already exists in eCartpay for Clerk user:', clerkUserId);
                const existingCustomer = await ecartpayService.findCustomerByUserId(clerkUserId);
                console.log({existingCustomer});
                

                if (existingCustomer.success) {
                    // Customer exists, reuse it
                    ecartpayCustomerId = existingCustomer.customer.id;
                    console.log('✅ Found existing eCartpay customer:', ecartpayCustomerId);
                } else {
                    // Create new customer using ONLY Clerk data (consistent and clean)
                    console.log('👤 Creating new EcartPay customer for Clerk user:', clerkUserId);
                    console.log({user});
                    
                    console.log('🔍 Clerk user data available:', {
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        full_name: user.full_name,
                        username: user.username,
                        phone: user.phone
                    });

                    const customerData = {
                        name: user.full_name ||
                              `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
                              user.username ||
                              'Admin Usuario',
                        email: user.email,                    // Use Clerk email for customer
                        phone: user.phone || '1000000000',    // Use Clerk phone or safe placeholder
                        userId: clerkUserId                    // Clerk unique ID
                    };

                    console.log('👤 Creating customer with Clerk data:', {
                        name: customerData.name,
                        email: customerData.email,
                        userId: customerData.userId,
                        hasPhone: !!customerData.phone
                    });

                    const customerResult = await ecartpayService.createCustomer(customerData);

                    if (!customerResult.success) {
                        console.error('❌ Failed to create EcartPay customer:', customerResult.error);
                        throw new Error(`Customer creation failed: ${customerResult.error?.message || 'Unknown error'}`);
                    }

                    ecartpayCustomerId = customerResult.customer.id;
                    console.log('✅ Successfully created new EcartPay customer:', ecartpayCustomerId);
                }
            } catch (error) {
                console.error('Error with EcartPay customer process:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Error al procesar cliente en sistema de pagos'
                });
            }

            // Process payment using customer (created with Clerk data) + payment data from modal
            // IMPORTANT: Payment data from modal is kept INTACT and not modified
            let paymentResult;
            try {
                console.log('💰 Processing payment for customer:', ecartpayCustomerId);

                const paymentPayload = {
                    amount: amount,
                    currency: 'MXN',
                    customer_id: ecartpayCustomerId,
                    description: `Suscripción ${planType}`,
                    metadata: {
                        restaurant_id: restaurantId,
                        plan_type: planType,
                        subscription_type: 'monthly'
                    }
                };

                // Use EXACT payment data from modal (user's input kept intact)
                if (payment_data) {
                    paymentPayload.card_data = {
                        number: payment_data.cardNumber,      // Exact card number from modal
                        exp_month: payment_data.expDate.split('/')[0],
                        exp_year: '20' + payment_data.expDate.split('/')[1],
                        cvc: payment_data.cvv,               // Exact CVV from modal
                        name: payment_data.fullName          // Exact name from modal
                    };
                    console.log('💳 Using EXACT payment data from modal:', {
                        cardEnding: payment_data.cardNumber.slice(-4),
                        name: payment_data.fullName
                    });
                }

                paymentResult = await ecartpayService.createPayment({
                    customerId: ecartpayCustomerId,
                    amount: paymentPayload.amount,
                    currency: paymentPayload.currency,
                    description: paymentPayload.description,
                    quantity: 1
                });
            } catch (error) {
                console.error('Error processing payment:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Error al procesar el pago'
                });
            }

            // Create subscription record
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1);

            const subscriptionData = {
                restaurant_id: restaurantId,
                plan_type: planType,
                status: 'active',
                ecartpay_customer_id: ecartpayCustomerId,
                start_date: new Date().toISOString(),
                end_date: endDate.toISOString(),
                price_paid: amount,
                currency: 'MXN'
            };

            const subscription = await subscriptionService.createSubscription(subscriptionData);

            // Create transaction record
            const transactionData = {
                subscription_id: subscription.id,
                ecartpay_payment_id: paymentResult.id,
                transaction_type: 'payment',
                amount: amount,
                currency: 'MXN',
                status: paymentResult.status || 'pending'
            };

            await subscriptionService.createTransaction(transactionData);

            res.json({
                success: true,
                data: {
                    subscription: subscription,
                    payment: paymentResult
                }
            });
        } catch (error) {
            console.error('Error creating subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Error al crear la suscripción'
            });
        }
    }

    // Cancel subscription
    async cancelSubscription(req, res) {
        try {
            const { subscriptionId } = req.params;
            const subscriptionService = new SubscriptionService();

            const result = await subscriptionService.cancelSubscription(subscriptionId);

            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: 'Suscripción no encontrada'
                });
            }

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error cancelling subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Error al cancelar la suscripción'
            });
        }
    }

    // Get feature usage stats
    async getFeatureUsage(req, res) {
        try {
            const { restaurantId, feature } = req.params;

            if (!restaurantId || !feature) {
                return res.status(400).json({
                    success: false,
                    error: 'Restaurant ID y feature name son requeridos'
                });
            }

            const subscriptionService = new SubscriptionService();
            const usage = await subscriptionService.getFeatureUsage(parseInt(restaurantId), feature);

            res.json({
                success: true,
                data: usage
            });

        } catch (error) {
            console.error('Error getting feature usage:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener uso de funcionalidad'
            });
        }
    }

    // Check feature access
    async checkFeatureAccess(req, res) {
        try {
            const { restaurantId, feature } = req.params;
            const subscriptionService = new SubscriptionService();

            const hasAccess = await subscriptionService.checkFeatureAccess(restaurantId, feature);

            res.json({
                success: true,
                data: {
                    hasAccess: hasAccess,
                    feature: feature
                }
            });
        } catch (error) {
            console.error('Error checking feature access:', error);
            res.status(500).json({
                success: false,
                error: 'Error al verificar acceso a funcionalidad'
            });
        }
    }

    // Webhook handler for subscription payments
    async handleSubscriptionWebhook(req, res) {
        try {
            const { event_type, data } = req.body;

            console.log('Subscription webhook received:', event_type, data);

            switch (event_type) {
                case 'payment.success':
                    await this.handlePaymentSuccess(data);
                    break;
                case 'payment.failed':
                    await this.handlePaymentFailed(data);
                    break;
                case 'subscription.cancelled':
                    await this.handleSubscriptionCancelled(data);
                    break;
                default:
                    console.log('Unhandled webhook event:', event_type);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error handling subscription webhook:', error);
            res.status(500).json({
                success: false,
                error: 'Error processing webhook'
            });
        }
    }

    // Handle payment success
    async handlePaymentSuccess(data) {
        const { payment_id, metadata } = data;

        if (!metadata || !metadata.restaurant_id) {
            console.error('Missing metadata in payment success webhook');
            return;
        }

        try {
            const subscriptionService = new SubscriptionService();
            await subscriptionService.updateTransactionStatus(payment_id, 'completed');

            console.log('Payment success processed for restaurant:', metadata.restaurant_id);
        } catch (error) {
            console.error('Error handling payment success:', error);
        }
    }

    // Handle payment failed
    async handlePaymentFailed(data) {
        const { payment_id } = data;

        try {
            const subscriptionService = new SubscriptionService();
            await subscriptionService.updateTransactionStatus(payment_id, 'failed');

            console.log('Payment failure processed for payment:', payment_id);
        } catch (error) {
            console.error('Error handling payment failure:', error);
        }
    }

    // Change/upgrade plan for existing subscription
    async changePlan(req, res) {
        try {
            // Add supabase import
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            );

            const { plan_type, payment_data } = req.body;
            const user = req.user;
            const clerkUserId = user.id;

            console.log('🔄 Starting plan change process for user:', clerkUserId, 'to plan:', plan_type);

            // Get user from admin portal
            const { data: adminUser, error: userError } = await supabase
                .from('user_admin_portal')
                .select('id')
                .eq('clerk_user_id', clerkUserId)
                .single();

            if (userError || !adminUser) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado en el sistema'
                });
            }

            // Get restaurant from user
            const { data: restaurant, error: restaurantError } = await supabase
                .from('restaurants')
                .select('id')
                .eq('user_id', adminUser.id)
                .eq('is_active', true)
                .single();

            if (restaurantError || !restaurant) {
                return res.status(404).json({
                    success: false,
                    error: 'Restaurante no encontrado'
                });
            }

            const restaurantId = restaurant.id;
            console.log('🏠 Restaurant ID:', restaurantId);

            // Validate plan type
            if (!['basico', 'premium', 'ultra'].includes(plan_type)) {
                return res.status(400).json({
                    success: false,
                    error: 'Plan type not valid'
                });
            }

            const subscriptionService = new SubscriptionService();

            // Get current active subscription
            const currentSubscription = await subscriptionService.getCurrentSubscription(restaurantId);

            if (!currentSubscription) {
                return res.status(404).json({
                    success: false,
                    error: 'No active subscription found to change'
                });
            }

            console.log('📋 Current subscription:', {
                id: currentSubscription.id,
                currentPlan: currentSubscription.plan_type,
                newPlan: plan_type
            });

            // Check if it's the same plan
            if (currentSubscription.plan_type === plan_type) {
                return res.status(400).json({
                    success: false,
                    error: 'Ya tienes activo este plan'
                });
            }

            // Plan hierarchy for validation
            const planHierarchy = {
                basico: 0,
                premium: 1,
                ultra: 2
            };

            const planPrices = {
                basico: 0,    // Free plan
                premium: 399, // 399 MXN
                ultra: 599    // 599 MXN
            };

            const currentPlanLevel = planHierarchy[currentSubscription.plan_type];
            const newPlanLevel = planHierarchy[plan_type];

            console.log('🔢 Plan level comparison:', {
                currentPlan: currentSubscription.plan_type,
                currentLevel: currentPlanLevel,
                newPlan: plan_type,
                newLevel: newPlanLevel
            });

            // BUSINESS RULE: Only allow upgrades, no immediate downgrades
            if (newPlanLevel < currentPlanLevel) {
                return res.status(400).json({
                    success: false,
                    error: 'El cambio a un plan inferior se realizara al finalizar tu período actual de suscripción.'
                });
            }

            // UPGRADE LOGIC: Allow immediate upgrade with payment
            const newPlanPrice = planPrices[plan_type];

            console.log('⬆️ Processing upgrade from', currentSubscription.plan_type, 'to', plan_type);

            // For upgrades to paid plans, require payment data
            if (newPlanPrice > 0 && !payment_data) {
                return res.status(400).json({
                    success: false,
                    error: 'Payment data required for paid plan upgrade'
                });
            }

            let paymentResult = null;

            // Process payment if upgrading to paid plan
            if (newPlanPrice > 0) {
                console.log('💰 Processing payment for upgrade to paid plan');

                // Find or create EcartPay customer (using existing logic)
                const ecartpayService = require('../services/ecartpayService');
                let ecartpayCustomerId;

                console.log('🔍 Checking if customer already exists in eCartpay for Clerk user:', clerkUserId);
                const existingCustomer = await ecartpayService.findCustomerByUserId(clerkUserId);

                if (existingCustomer.success) {
                    ecartpayCustomerId = existingCustomer.customer.id;
                    console.log('✅ Found existing eCartpay customer:', ecartpayCustomerId);
                } else {
                    console.log('👤 Creating new EcartPay customer for plan upgrade');

                    const customerData = {
                        name: user.full_name ||
                              `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
                              user.username ||
                              'Admin Usuario',
                        email: user.email,
                        phone: user.phone || '1000000000',
                        userId: clerkUserId
                    };

                    const customerResult = await ecartpayService.createCustomer(customerData);

                    if (!customerResult.success) {
                        console.error('❌ Failed to create EcartPay customer:', customerResult.error);
                        throw new Error(`Customer creation failed: ${customerResult.error?.message || 'Unknown error'}`);
                    }

                    ecartpayCustomerId = customerResult.customer.id;
                    console.log('✅ Successfully created new EcartPay customer:', ecartpayCustomerId);
                }

                // Process payment using exact modal data
                paymentResult = await ecartpayService.createPayment({
                    customerId: ecartpayCustomerId,
                    amount: newPlanPrice,
                    currency: 'MXN',
                    description: `Upgrade a plan ${plan_type}`,
                    quantity: 1
                });

                if (!paymentResult.success) {
                    throw new Error('Payment processing failed');
                }

                console.log('✅ Payment processed successfully for upgrade');
            }

            // Update subscription plan immediately (for upgrades)
            console.log('📝 Updating subscription plan to:', plan_type);

            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1);

            const updatedSubscription = await subscriptionService.updateSubscriptionPlan(
                currentSubscription.id,
                plan_type,
                newPlanPrice,
                endDate.toISOString()
            );

            // Create transaction record
            const transactionData = {
                subscription_id: currentSubscription.id,
                transaction_type: 'payment',
                amount: newPlanPrice,
                currency: 'MXN',
                status: paymentResult ? (paymentResult.status || 'pending') : 'completed'
            };

            if (paymentResult) {
                transactionData.ecartpay_payment_id = paymentResult.id;
            }

            await subscriptionService.createTransaction(transactionData);

            res.json({
                success: true,
                data: {
                    subscription: updatedSubscription,
                    payment: paymentResult,
                    message: `Plan actualizado exitosamente a ${plan_type}`
                }
            });

        } catch (error) {
            console.error('Error changing subscription plan:', error);
            res.status(500).json({
                success: false,
                error: 'Error al cambiar el plan de suscripción'
            });
        }
    }
}

// Create instance and export methods for static access
const subscriptionController = new SubscriptionController();

module.exports = {
    getPlans: subscriptionController.getPlans.bind(subscriptionController),
    getCurrentSubscription: subscriptionController.getCurrentSubscription.bind(subscriptionController),
    getCurrentUserSubscription: subscriptionController.getCurrentUserSubscription.bind(subscriptionController),
    createSubscription: subscriptionController.createSubscription.bind(subscriptionController),
    changePlan: subscriptionController.changePlan.bind(subscriptionController),
    cancelSubscription: subscriptionController.cancelSubscription.bind(subscriptionController),
    getFeatureUsage: subscriptionController.getFeatureUsage.bind(subscriptionController),
    checkFeatureAccess: subscriptionController.checkFeatureAccess.bind(subscriptionController),
    handleSubscriptionWebhook: subscriptionController.handleSubscriptionWebhook.bind(subscriptionController)
};