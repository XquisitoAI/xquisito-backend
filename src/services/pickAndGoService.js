const supabase = require('../config/supabase');

/**
 * Servicio para gestionar pedidos Pick & Go
 * Maneja órdenes, items y estados específicos del servicio de comida para llevar
 */
class PickAndGoService {

    /**
     * Crear una nueva orden Pick & Go
     * @param {Object} orderData - Datos de la orden
     * @param {string} orderData.clerk_user_id - ID del usuario en Clerk
     * @param {string} orderData.customer_name - Nombre del cliente
     * @param {string} orderData.customer_phone - Teléfono del cliente
     * @param {string} orderData.customer_email - Email del cliente
     * @param {number} orderData.total_amount - Monto total
     * @param {Object} orderData.session_data - Datos de sesión
     * @param {Object} orderData.prep_metadata - Metadatos de preparación
     * @returns {Promise<Object>} Orden creada
     */
    async createOrder(orderData) {
        try {
            console.log('🆕 Creating new Pick & Go order:', orderData);

            const { data, error } = await supabase
                .from('pick_and_go_orders')
                .insert([{
                    clerk_user_id: orderData.clerk_user_id,
                    customer_name: orderData.customer_name,
                    customer_phone: orderData.customer_phone,
                    customer_email: orderData.customer_email,
                    total_amount: orderData.total_amount || 0,
                    payment_status: 'pending',
                    order_status: 'active',
                    session_data: orderData.session_data || {},
                    prep_metadata: orderData.prep_metadata || {}
                }])
                .select()
                .single();

            if (error) {
                console.error('❌ Error creating Pick & Go order:', error);
                throw error;
            }

            console.log('✅ Pick & Go order created successfully:', data.id);
            return { success: true, data };

        } catch (error) {
            console.error('💥 Error in createOrder:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener orden por ID
     * @param {string} orderId - ID de la orden
     * @returns {Promise<Object>} Orden con items y pagos
     */
    async getOrderById(orderId) {
        try {
            console.log('🔍 Getting Pick & Go order:', orderId);

            // Obtener orden principal
            const { data: order, error: orderError } = await supabase
                .from('pick_and_go_orders')
                .select('*')
                .eq('id', orderId)
                .single();

            if (orderError) {
                console.error('❌ Error getting order:', orderError);
                throw orderError;
            }

            // Obtener items de la orden
            const { data: items, error: itemsError } = await supabase
                .from('dish_order')
                .select('*')
                .eq('pick_and_go_order_id', orderId);

            if (itemsError) {
                console.error('❌ Error getting order items:', itemsError);
                throw itemsError;
            }

            // Obtener transacciones de pago
            const { data: payments, error: paymentsError } = await supabase
                .from('payment_transactions')
                .select('*')
                .eq('id_pick_and_go_order', orderId);

            if (paymentsError) {
                console.error('❌ Error getting payments:', paymentsError);
                throw paymentsError;
            }

            const result = {
                ...order,
                items: items || [],
                payments: payments || []
            };

            console.log('✅ Order retrieved successfully with', items?.length || 0, 'items and', payments?.length || 0, 'payments');
            return { success: true, data: result };

        } catch (error) {
            console.error('💥 Error in getOrderById:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener órdenes por usuario
     * @param {string} clerkUserId - ID del usuario en Clerk
     * @param {Object} filters - Filtros opcionales
     * @returns {Promise<Object>} Lista de órdenes del usuario
     */
    async getUserOrders(clerkUserId, filters = {}) {
        try {
            console.log('👤 Getting user orders for:', clerkUserId);

            let query = supabase
                .from('pick_and_go_orders')
                .select('*')
                .eq('clerk_user_id', clerkUserId)
                .order('created_at', { ascending: false });

            // Aplicar filtros
            if (filters.order_status) {
                query = query.eq('order_status', filters.order_status);
            }

            if (filters.payment_status) {
                query = query.eq('payment_status', filters.payment_status);
            }

            if (filters.limit) {
                query = query.limit(filters.limit);
            }

            const { data, error } = await query;

            if (error) {
                console.error('❌ Error getting user orders:', error);
                throw error;
            }

            console.log('✅ Retrieved', data?.length || 0, 'orders for user');
            return { success: true, data: data || [] };

        } catch (error) {
            console.error('💥 Error in getUserOrders:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Agregar item a la orden
     * @param {string} orderId - ID de la orden
     * @param {Object} itemData - Datos del item
     * @returns {Promise<Object>} Item creado
     */
    async addItemToOrder(orderId, itemData) {
        try {
            console.log('🍽️ Adding item to Pick & Go order:', orderId, itemData);

            const { data, error } = await supabase
                .from('dish_order')
                .insert([{
                    pick_and_go_order_id: orderId,
                    item: itemData.item,
                    quantity: itemData.quantity || 1,
                    price: itemData.price,
                    status: 'pending',
                    payment_status: 'not_paid',
                    images: itemData.images || [],
                    custom_fields: itemData.custom_fields || {},
                    extra_price: itemData.extra_price || 0
                }])
                .select()
                .single();

            if (error) {
                console.error('❌ Error adding item to order:', error);
                throw error;
            }

            console.log('✅ Item added successfully to order');
            return { success: true, data };

        } catch (error) {
            console.error('💥 Error in addItemToOrder:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Actualizar estado de la orden
     * @param {string} orderId - ID de la orden
     * @param {string} orderStatus - Nuevo estado de la orden
     * @param {Object} additionalData - Datos adicionales a actualizar
     * @returns {Promise<Object>} Orden actualizada
     */
    async updateOrderStatus(orderId, orderStatus, additionalData = {}) {
        try {
            console.log('🔄 Updating order status:', orderId, 'to', orderStatus);

            const updateData = {
                order_status: orderStatus,
                updated_at: new Date().toISOString(),
                ...additionalData
            };

            const { data, error } = await supabase
                .from('pick_and_go_orders')
                .update(updateData)
                .eq('id', orderId)
                .select()
                .single();

            if (error) {
                console.error('❌ Error updating order status:', error);
                throw error;
            }

            console.log('✅ Order status updated successfully');
            return { success: true, data };

        } catch (error) {
            console.error('💥 Error in updateOrderStatus:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Actualizar estado de pago
     * @param {string} orderId - ID de la orden
     * @param {string} paymentStatus - Nuevo estado de pago
     * @returns {Promise<Object>} Orden actualizada
     */
    async updatePaymentStatus(orderId, paymentStatus) {
        try {
            console.log('💳 Updating payment status:', orderId, 'to', paymentStatus);

            const { data, error } = await supabase
                .from('pick_and_go_orders')
                .update({
                    payment_status: paymentStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId)
                .select()
                .single();

            if (error) {
                console.error('❌ Error updating payment status:', error);
                throw error;
            }

            console.log('✅ Payment status updated successfully');
            return { success: true, data };

        } catch (error) {
            console.error('💥 Error in updatePaymentStatus:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtener órdenes por restaurante (para el dashboard del restaurante)
     * @param {number} restaurantId - ID del restaurante
     * @param {Object} filters - Filtros opcionales
     * @returns {Promise<Object>} Lista de órdenes del restaurante
     */
    async getRestaurantOrders(restaurantId, filters = {}) {
        try {
            console.log('🏪 Getting restaurant orders for:', restaurantId);

            // Por ahora retornamos todas las órdenes, en el futuro agregamos restaurant_id
            let query = supabase
                .from('pick_and_go_orders')
                .select(`
                    *,
                    dish_order!inner(
                        id, item, quantity, price, status, payment_status
                    )
                `)
                .order('created_at', { ascending: false });

            // Aplicar filtros
            if (filters.order_status) {
                query = query.eq('order_status', filters.order_status);
            }

            if (filters.date_from) {
                query = query.gte('created_at', filters.date_from);
            }

            if (filters.date_to) {
                query = query.lte('created_at', filters.date_to);
            }

            const { data, error } = await query;

            if (error) {
                console.error('❌ Error getting restaurant orders:', error);
                throw error;
            }

            console.log('✅ Retrieved', data?.length || 0, 'restaurant orders');
            return { success: true, data: data || [] };

        } catch (error) {
            console.error('💥 Error in getRestaurantOrders:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Calcular tiempo estimado de preparación
     * @param {Array} items - Items de la orden
     * @param {number} restaurantId - ID del restaurante
     * @returns {Promise<Object>} Tiempo estimado en minutos
     */
    async calculateEstimatedPrepTime(items, restaurantId = null) {
        try {
            console.log('⏰ Calculating prep time for', items.length, 'items');

            // Lógica básica de tiempo de preparación
            // En el futuro se puede consultar una tabla de configuración por restaurante
            let totalMinutes = 0;

            items.forEach(item => {
                // Tiempo base por item (15 minutos por defecto)
                let itemTime = 15;

                // Tiempo adicional por cantidad
                if (item.quantity > 1) {
                    itemTime += (item.quantity - 1) * 3;
                }

                totalMinutes += itemTime;
            });

            // Tiempo mínimo de 10 minutos, máximo de 60
            totalMinutes = Math.max(10, Math.min(totalMinutes, 60));

            console.log('✅ Estimated prep time:', totalMinutes, 'minutes');
            return { success: true, data: { estimated_minutes: totalMinutes } };

        } catch (error) {
            console.error('💥 Error in calculateEstimatedPrepTime:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new PickAndGoService();