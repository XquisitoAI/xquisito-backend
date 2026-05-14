/**
 * Servicio de Renovacion Automatica de Suscripciones
 *
 * Este servicio maneja:
 * - Deteccion de suscripciones proximas a vencer
 * - Cobro automatico usando tarjetas guardadas en EcartPay
 * - Degradacion inmediata a plan basico si falla el cobro (sin reintentos)
 * - Downgrades programados
 * - Envio de recordatorios
 */

const { createClient } = require("@supabase/supabase-js");
const ecartpayService = require("../shared/ecartpayService");
const SubscriptionService = require("../admin-portal/subscriptionService");

class RenewalService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.subscriptionService = new SubscriptionService();

        // Precios de los planes (MXN)
        this.planPrices = {
            basico: 0,
            premium: 399,
            ultra: 599
        };

        // Maximo de intentos de cobro antes de degradar (1 = degradar inmediatamente si falla)
        this.maxRenewalAttempts = 1;

        // ⚠️ FLAG DE PRUEBA: Cambiar a true para simular fallo de pago
        // IMPORTANTE: Cambiar a false despues de probar
        this.SIMULATE_PAYMENT_FAILURE = process.env.SIMULATE_PAYMENT_FAILURE === 'true';
    }

    /**
     * Proceso principal: Ejecuta todas las renovaciones pendientes
     * Llamado por el cron job diariamente
     */
    async processAllRenewals() {
        console.log('🔄 ========================================');
        console.log('🔄 Iniciando proceso de renovacion automatica');
        console.log('🔄 Fecha:', new Date().toISOString());
        console.log('🔄 ========================================');

        try {
            // 1. Procesar recordatorios (3 dias antes)
            await this.sendRenewalReminders();

            // 2. Procesar downgrades programados
            await this.processScheduledDowngrades();

            // 3. Procesar renovaciones (suscripciones que vencen hoy o ya vencieron)
            await this.processRenewals();

            // Nota: No hay reintentos - si falla el primer cobro, se degrada inmediatamente

            console.log('✅ ========================================');
            console.log('✅ Proceso de renovacion completado');
            console.log('✅ ========================================');

        } catch (error) {
            console.error('❌ Error en proceso de renovacion:', error);
            throw error;
        }
    }

    /**
     * Obtiene suscripciones que necesitan renovacion
     * (vencen hoy o ya vencieron, con auto_renew=true)
     */
    async getSubscriptionsDueForRenewal() {
        try {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(23, 59, 59, 999);

            const { data, error } = await this.supabase
                .from('subscriptions')
                .select(`
                    *,
                    restaurants (
                        id,
                        name,
                        user_id,
                        user_admin_portal:user_id (
                            id,
                            email,
                            first_name,
                            last_name,
                            clerk_user_id
                        )
                    )
                `)
                .eq('status', 'active')
                .eq('auto_renew', true)
                .neq('plan_type', 'basico') // No renovar plan gratuito
                .lte('end_date', tomorrow.toISOString())
                .is('scheduled_plan_change', null) // Sin downgrade programado
                .lt('renewal_attempts', this.maxRenewalAttempts);

            if (error) throw error;

            console.log(`📋 Encontradas ${data?.length || 0} suscripciones para renovar`);
            return data || [];

        } catch (error) {
            console.error('❌ Error obteniendo suscripciones para renovar:', error);
            throw error;
        }
    }

    /**
     * Procesa las renovaciones pendientes
     */
    async processRenewals() {
        console.log('\n📌 Procesando renovaciones...');

        const subscriptions = await this.getSubscriptionsDueForRenewal();

        for (const subscription of subscriptions) {
            try {
                console.log(`\n🔄 Procesando suscripcion ID: ${subscription.id}`);
                console.log(`   Restaurant: ${subscription.restaurants?.name}`);
                console.log(`   Plan: ${subscription.plan_type}`);
                console.log(`   Vence: ${subscription.end_date}`);

                await this.processRenewal(subscription);

            } catch (error) {
                console.error(`❌ Error procesando suscripcion ${subscription.id}:`, error);
                // Continuar con las siguientes
            }
        }
    }

    /**
     * Procesa la renovacion de una suscripcion individual
     */
    async processRenewal(subscription) {
        const customerId = subscription.ecartpay_customer_id;

        if (!customerId) {
            console.log(`⚠️ Suscripcion ${subscription.id} no tiene ecartpay_customer_id`);
            await this.handleMissingPaymentMethod(subscription);
            return;
        }

        // ⚠️ MODO PRUEBA: Simular fallo de pago
        if (this.SIMULATE_PAYMENT_FAILURE) {
            console.log(`🧪 [MODO PRUEBA] Simulando fallo de pago para suscripcion ${subscription.id}`);
            await this.handleFailedRenewal(subscription, 'SIMULATED_PAYMENT_FAILURE - Prueba de degradacion');
            return;
        }

        try {
            // 1. Obtener tarjeta del customer
            const cardResult = await ecartpayService.getCustomerDefaultCard(customerId);

            if (!cardResult.success) {
                console.log(`⚠️ No se encontro tarjeta para customer ${customerId}`);
                await this.handleFailedRenewal(subscription, 'No payment method found');
                return;
            }

            const card = cardResult.card;
            console.log(`💳 Tarjeta encontrada: ****${card.last_four || card.number?.slice(-4)}`);

            // 2. Generar token para cobro
            const tokenResult = await ecartpayService.generateCardToken(
                customerId,
                card.id,
                card.name || card.cardholder_name
            );

            if (!tokenResult.success) {
                console.log(`⚠️ Error generando token para tarjeta ${card.id}`);
                await this.handleFailedRenewal(subscription, 'Token generation failed');
                return;
            }

            // 3. Procesar cobro
            const amount = this.planPrices[subscription.plan_type];
            const orderResult = await ecartpayService.createOrderWithToken({
                customerId: customerId,
                token: tokenResult.token,
                amount: amount,
                currency: 'MXN',
                description: `Renovacion suscripcion ${subscription.plan_type} - ${subscription.restaurants?.name}`,
                items: [{
                    name: `Suscripcion Plan ${subscription.plan_type}`,
                    quantity: 1,
                    price: amount
                }]
            });

            if (!orderResult.success) {
                console.log(`⚠️ Error procesando cobro para suscripcion ${subscription.id}`);
                await this.handleFailedRenewal(subscription, orderResult.error?.message || 'Payment failed');
                return;
            }

            // 4. Renovacion exitosa
            await this.handleSuccessfulRenewal(subscription, orderResult.order, amount);

        } catch (error) {
            console.error(`❌ Error en proceso de renovacion:`, error);
            await this.handleFailedRenewal(subscription, error.message);
        }
    }

    /**
     * Maneja una renovacion exitosa
     */
    async handleSuccessfulRenewal(subscription, paymentResult, amount) {
        console.log(`✅ Cobro exitoso para suscripcion ${subscription.id}`);

        // Calcular nueva fecha de vencimiento (+30 dias desde hoy)
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + 30);

        try {
            // 1. Actualizar suscripcion
            const { error: updateError } = await this.supabase
                .from('subscriptions')
                .update({
                    end_date: newEndDate.toISOString(),
                    next_billing_date: newEndDate.toISOString(),
                    renewal_attempts: 0,
                    last_renewal_attempt: new Date().toISOString(),
                    renewal_reminder_sent: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscription.id);

            if (updateError) throw updateError;

            // 2. Crear registro de transaccion
            await this.subscriptionService.createTransaction({
                subscription_id: subscription.id,
                ecartpay_payment_id: paymentResult.id,
                transaction_type: 'renewal',
                amount: amount,
                currency: 'MXN',
                status: 'completed'
            });

            console.log(`📅 Nueva fecha de vencimiento: ${newEndDate.toISOString()}`);

            // 3. Enviar notificacion de renovacion exitosa
            await this.sendRenewalSuccessNotification(subscription, newEndDate);

        } catch (error) {
            console.error('❌ Error actualizando suscripcion despues de cobro exitoso:', error);
            throw error;
        }
    }

    /**
     * Maneja un intento de renovacion fallido
     */
    async handleFailedRenewal(subscription, errorMessage) {
        console.log(`⚠️ Cobro fallido para suscripcion ${subscription.id}: ${errorMessage}`);

        const newAttemptCount = (subscription.renewal_attempts || 0) + 1;

        try {
            // 1. Actualizar contador de intentos
            await this.supabase
                .from('subscriptions')
                .update({
                    renewal_attempts: newAttemptCount,
                    last_renewal_attempt: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscription.id);

            // 2. Crear registro de transaccion fallida
            await this.subscriptionService.createTransaction({
                subscription_id: subscription.id,
                transaction_type: 'renewal_failed',
                amount: this.planPrices[subscription.plan_type],
                currency: 'MXN',
                status: 'failed'
            });

            console.log(`📊 Intento fallido - degradando inmediatamente a plan basico`);

            // Degradar inmediatamente a plan basico (sin reintentos)
            await this.degradeToBasicPlan(subscription);

        } catch (error) {
            console.error('❌ Error manejando renovacion fallida:', error);
            throw error;
        }
    }

    /**
     * Maneja suscripciones sin metodo de pago configurado
     */
    async handleMissingPaymentMethod(subscription) {
        console.log(`⚠️ Suscripcion ${subscription.id} no tiene metodo de pago`);

        // Incrementar contador y potencialmente degradar
        await this.handleFailedRenewal(subscription, 'No EcartPay customer ID');
    }

    /**
     * Degrada una suscripcion al plan basico
     */
    async degradeToBasicPlan(subscription) {
        console.log(`⬇️ Degradando suscripcion ${subscription.id} a plan basico`);

        try {
            const { error } = await this.supabase
                .from('subscriptions')
                .update({
                    plan_type: 'basico',
                    price_paid: 0,
                    auto_renew: false,
                    renewal_attempts: 0,
                    scheduled_plan_change: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscription.id);

            if (error) throw error;

            // Crear registro de transaccion de downgrade
            await this.subscriptionService.createTransaction({
                subscription_id: subscription.id,
                transaction_type: 'downgrade',
                amount: 0,
                currency: 'MXN',
                status: 'completed'
            });

            console.log(`✅ Suscripcion degradada a plan basico`);

            // Pausar campañas excedentes (plan basico solo permite 1 campaña activa)
            const restaurantId = subscription.restaurant_id || subscription.restaurants?.id;
            if (restaurantId) {
                await this.pauseExcessCampaigns(restaurantId);
            }

            // Enviar notificacion de degradacion
            await this.sendDegradationNotification(subscription);

        } catch (error) {
            console.error('❌ Error degradando suscripcion:', error);
            throw error;
        }
    }

    /**
     * Pausa campañas excedentes cuando el usuario baja a plan basico
     * Plan basico solo permite 1 campaña activa, se deja la más reciente
     */
    async pauseExcessCampaigns(restaurantId) {
        console.log(`📋 Verificando campañas activas para restaurant ${restaurantId}...`);

        try {
            // Obtener campañas activas (running o scheduled) ordenadas por fecha de creación
            const { data: activeCampaigns, error } = await this.supabase
                .from('campaigns')
                .select('id, name, status, created_at')
                .eq('restaurant_id', restaurantId)
                .in('status', ['running', 'scheduled'])
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!activeCampaigns || activeCampaigns.length <= 1) {
                console.log(`   ✅ ${activeCampaigns?.length || 0} campaña(s) activa(s) - dentro del límite`);
                return;
            }

            // Pausar todas excepto la más reciente (índice 0)
            const campaignsToPause = activeCampaigns.slice(1);
            console.log(`   ⚠️ ${activeCampaigns.length} campañas activas, pausando ${campaignsToPause.length} excedentes...`);

            for (const campaign of campaignsToPause) {
                const { error: pauseError } = await this.supabase
                    .from('campaigns')
                    .update({
                        status: 'paused',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', campaign.id);

                if (pauseError) {
                    console.error(`   ❌ Error pausando campaña ${campaign.id}:`, pauseError);
                } else {
                    console.log(`   ⏸️ Campaña pausada: "${campaign.name}" (${campaign.id})`);
                }
            }

            console.log(`   ✅ Campañas excedentes pausadas. Solo queda activa: "${activeCampaigns[0].name}"`);

        } catch (error) {
            console.error('❌ Error pausando campañas excedentes:', error);
            // No lanzar error para no interrumpir el proceso de degradación
        }
    }

    /**
     * Procesa downgrades programados (cuando usuario solicito bajar de plan)
     * Si el nuevo plan es de pago, se intenta cobrar antes de aplicar el cambio
     */
    async processScheduledDowngrades() {
        console.log('\n📌 Procesando downgrades programados...');

        try {
            const now = new Date();

            // Buscar suscripciones con downgrade programado que ya vencieron
            const { data: subscriptions, error } = await this.supabase
                .from('subscriptions')
                .select(`
                    *,
                    restaurants (
                        id,
                        name
                    )
                `)
                .eq('status', 'active')
                .not('scheduled_plan_change', 'is', null)
                .lte('end_date', now.toISOString());

            if (error) throw error;

            console.log(`📋 Encontrados ${subscriptions?.length || 0} downgrades programados`);

            for (const subscription of subscriptions || []) {
                try {
                    const targetPlan = subscription.scheduled_plan_change;
                    const newPrice = this.planPrices[targetPlan];

                    console.log(`\n⬇️ Aplicando cambio de plan: ${subscription.plan_type} → ${targetPlan}`);
                    console.log(`   Precio nuevo plan: $${newPrice} MXN`);

                    // Si el nuevo plan es de pago, intentar cobrar
                    if (newPrice > 0) {
                        const paymentSuccess = await this.processScheduledPlanPayment(subscription, targetPlan, newPrice);

                        if (!paymentSuccess) {
                            // Si falla el cobro, degradar a plan basico
                            console.log(`⚠️ Cobro fallido para cambio a ${targetPlan}, degradando a basico`);
                            await this.degradeToBasicPlan(subscription);
                            await this.pauseExcessCampaigns(subscription.restaurant_id);
                            continue;
                        }
                    }

                    // Aplicar el cambio de plan
                    const newEndDate = new Date();
                    newEndDate.setDate(newEndDate.getDate() + 30);

                    await this.supabase
                        .from('subscriptions')
                        .update({
                            plan_type: targetPlan,
                            price_paid: newPrice,
                            scheduled_plan_change: null,
                            auto_renew: targetPlan !== 'basico',
                            renewal_attempts: 0,
                            end_date: newPrice > 0 ? newEndDate.toISOString() : null,
                            next_billing_date: newPrice > 0 ? newEndDate.toISOString() : null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', subscription.id);

                    console.log(`✅ Cambio de plan completado para suscripcion ${subscription.id}`);

                    // Si bajó a plan basico, pausar campañas excedentes
                    if (targetPlan === 'basico') {
                        await this.pauseExcessCampaigns(subscription.restaurant_id);
                    }

                } catch (err) {
                    console.error(`❌ Error procesando downgrade ${subscription.id}:`, err);
                }
            }

        } catch (error) {
            console.error('❌ Error procesando downgrades programados:', error);
            throw error;
        }
    }

    /**
     * Procesa el pago para un cambio de plan programado
     */
    async processScheduledPlanPayment(subscription, targetPlan, amount) {
        const customerId = subscription.ecartpay_customer_id;

        if (!customerId) {
            console.log(`⚠️ Suscripcion ${subscription.id} no tiene ecartpay_customer_id`);
            return false;
        }

        try {
            // 1. Obtener tarjeta del customer
            const cardResult = await ecartpayService.getCustomerDefaultCard(customerId);

            if (!cardResult.success) {
                console.log(`⚠️ No se encontro tarjeta para customer ${customerId}`);
                return false;
            }

            const card = cardResult.card;
            console.log(`💳 Tarjeta encontrada: ****${card.last_four || card.number?.slice(-4) || '****'}`);

            // 2. Generar token para cobro
            const tokenResult = await ecartpayService.generateCardToken(
                customerId,
                card.id,
                card.name || card.cardholder_name
            );

            if (!tokenResult.success) {
                console.log(`⚠️ Error generando token para tarjeta ${card.id}`);
                return false;
            }

            // 3. Procesar cobro
            const orderResult = await ecartpayService.createOrderWithToken({
                customerId: customerId,
                token: tokenResult.token,
                amount: amount,
                currency: 'MXN',
                description: `Cambio a plan ${targetPlan} - ${subscription.restaurants?.name}`,
                items: [{
                    name: `Suscripcion Plan ${targetPlan}`,
                    quantity: 1,
                    price: amount
                }]
            });

            if (!orderResult.success) {
                console.log(`⚠️ Error procesando cobro para cambio de plan`);
                return false;
            }

            console.log(`✅ Cobro exitoso para cambio a plan ${targetPlan}: ${orderResult.order?.id}`);

            // Registrar transacción
            await this.subscriptionService.createTransaction({
                subscription_id: subscription.id,
                ecartpay_payment_id: orderResult.order?.id,
                transaction_type: 'payment',
                amount: amount,
                currency: 'MXN',
                status: 'completed'
            });

            return true;

        } catch (error) {
            console.error(`❌ Error en proceso de pago para cambio de plan:`, error);
            return false;
        }
    }

    /**
     * Envia recordatorios de renovacion (3 dias antes)
     */
    async sendRenewalReminders() {
        console.log('\n📌 Enviando recordatorios de renovacion...');

        try {
            const threeDaysFromNow = new Date();
            threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

            const fourDaysFromNow = new Date();
            fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4);

            // Buscar suscripciones que vencen en 3 dias y no han recibido recordatorio
            const { data: subscriptions, error } = await this.supabase
                .from('subscriptions')
                .select(`
                    *,
                    restaurants (
                        id,
                        name,
                        user_id,
                        user_admin_portal:user_id (
                            email,
                            first_name
                        )
                    )
                `)
                .eq('status', 'active')
                .eq('auto_renew', true)
                .eq('renewal_reminder_sent', false)
                .neq('plan_type', 'basico')
                .gte('end_date', threeDaysFromNow.toISOString())
                .lt('end_date', fourDaysFromNow.toISOString());

            if (error) throw error;

            console.log(`📋 Encontradas ${subscriptions?.length || 0} suscripciones para recordatorio`);

            for (const subscription of subscriptions || []) {
                try {
                    // Marcar como enviado (aunque no enviemos el email aun)
                    await this.supabase
                        .from('subscriptions')
                        .update({ renewal_reminder_sent: true })
                        .eq('id', subscription.id);

                    console.log(`📧 Recordatorio marcado para suscripcion ${subscription.id}`);

                    // TODO: Implementar envio de email real
                    // await this.sendReminderEmail(subscription);

                } catch (err) {
                    console.error(`❌ Error enviando recordatorio ${subscription.id}:`, err);
                }
            }

        } catch (error) {
            console.error('❌ Error enviando recordatorios:', error);
            throw error;
        }
    }

    /**
     * Programa un downgrade para el fin del ciclo actual
     */
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

            console.log(`📅 Downgrade programado: → ${targetPlan} al finalizar ciclo`);
            return data;

        } catch (error) {
            console.error('❌ Error programando downgrade:', error);
            throw error;
        }
    }

    /**
     * Cancela un downgrade programado
     */
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

            console.log(`✅ Downgrade programado cancelado`);
            return data;

        } catch (error) {
            console.error('❌ Error cancelando downgrade programado:', error);
            throw error;
        }
    }

    // ========================================
    // NOTIFICACIONES (TODO: Implementar emails)
    // ========================================

    async sendRenewalSuccessNotification(subscription, newEndDate) {
        console.log(`📧 [TODO] Enviar email de renovacion exitosa a suscripcion ${subscription.id}`);
        // TODO: Implementar envio de email
    }

    async sendPaymentFailedNotification(subscription, attemptNumber) {
        console.log(`📧 [TODO] Enviar email de pago fallido (intento ${attemptNumber}) a suscripcion ${subscription.id}`);
        // TODO: Implementar envio de email
    }

    async sendDegradationNotification(subscription) {
        console.log(`📧 [TODO] Enviar email de degradacion a plan basico a suscripcion ${subscription.id}`);
        // TODO: Implementar envio de email
    }
}

module.exports = RenewalService;
