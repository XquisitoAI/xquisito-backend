const pickAndGoService = require('../services/pickAndGoService');

/**
 * Controlador para gestionar endpoints de Pick & Go
 * Maneja todas las operaciones relacionadas con pedidos para llevar
 */
class PickAndGoController {

    /**
     * Crear nueva orden Pick & Go
     * POST /api/pick-and-go/orders
     */
    async createOrder(req, res) {
        try {
            const {
                clerk_user_id,
                customer_name,
                customer_phone,
                customer_email,
                session_data,
                prep_metadata
            } = req.body;

            // Validaciones básicas
            if (!clerk_user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'clerk_user_id is required'
                });
            }

            if (!customer_name && !customer_email) {
                return res.status(400).json({
                    success: false,
                    error: 'customer_name or customer_email is required'
                });
            }

            const orderData = {
                clerk_user_id,
                customer_name,
                customer_phone,
                customer_email,
                total_amount: 0, // Se actualizará cuando se agreguen items
                session_data: session_data || {},
                prep_metadata: prep_metadata || {}
            };

            const result = await pickAndGoService.createOrder(orderData);

            if (!result.success) {
                return res.status(500).json(result);
            }

            res.status(201).json(result);

        } catch (error) {
            console.error('💥 Error in createOrder controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Obtener orden por ID
     * GET /api/pick-and-go/orders/:orderId
     */
    async getOrder(req, res) {
        try {
            const { orderId } = req.params;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            const result = await pickAndGoService.getOrderById(orderId);

            if (!result.success) {
                return res.status(404).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('💥 Error in getOrder controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Obtener órdenes del usuario
     * GET /api/pick-and-go/user/:userId/orders
     */
    async getUserOrders(req, res) {
        try {
            const { userId } = req.params;
            const { order_status, payment_status, limit } = req.query;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }

            const filters = {
                order_status,
                payment_status,
                limit: limit ? parseInt(limit) : null
            };

            const result = await pickAndGoService.getUserOrders(userId, filters);

            if (!result.success) {
                return res.status(500).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('💥 Error in getUserOrders controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Agregar item a la orden
     * POST /api/pick-and-go/orders/:orderId/items
     */
    async addItemToOrder(req, res) {
        try {
            const { orderId } = req.params;
            const {
                item,
                quantity,
                price,
                images,
                custom_fields,
                extra_price
            } = req.body;

            // Validaciones básicas
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            if (!item || !price) {
                return res.status(400).json({
                    success: false,
                    error: 'item and price are required'
                });
            }

            if (quantity && quantity < 1) {
                return res.status(400).json({
                    success: false,
                    error: 'quantity must be at least 1'
                });
            }

            const itemData = {
                item,
                quantity: quantity || 1,
                price: parseFloat(price),
                images: images || [],
                custom_fields: custom_fields || {},
                extra_price: parseFloat(extra_price) || 0
            };

            const result = await pickAndGoService.addItemToOrder(orderId, itemData);

            if (!result.success) {
                return res.status(500).json(result);
            }

            res.status(201).json(result);

        } catch (error) {
            console.error('💥 Error in addItemToOrder controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Actualizar estado de la orden
     * PUT /api/pick-and-go/orders/:orderId/status
     */
    async updateOrderStatus(req, res) {
        try {
            const { orderId } = req.params;
            const { order_status, prep_metadata } = req.body;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            if (!order_status) {
                return res.status(400).json({
                    success: false,
                    error: 'order_status is required'
                });
            }

            // Validar estados permitidos
            const validStatuses = ['active', 'confirmed', 'preparing', 'completed', 'abandoned'];
            if (!validStatuses.includes(order_status)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid order_status. Must be one of: ${validStatuses.join(', ')}`
                });
            }

            const additionalData = {};
            if (prep_metadata) {
                additionalData.prep_metadata = prep_metadata;
            }

            const result = await pickAndGoService.updateOrderStatus(orderId, order_status, additionalData);

            if (!result.success) {
                return res.status(500).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('💥 Error in updateOrderStatus controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Actualizar estado de pago
     * PUT /api/pick-and-go/orders/:orderId/payment-status
     */
    async updatePaymentStatus(req, res) {
        try {
            const { orderId } = req.params;
            const { payment_status } = req.body;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            if (!payment_status) {
                return res.status(400).json({
                    success: false,
                    error: 'payment_status is required'
                });
            }

            // Validar estados de pago permitidos
            const validPaymentStatuses = ['pending', 'paid'];
            if (!validPaymentStatuses.includes(payment_status)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid payment_status. Must be one of: ${validPaymentStatuses.join(', ')}`
                });
            }

            const result = await pickAndGoService.updatePaymentStatus(orderId, payment_status);

            if (!result.success) {
                return res.status(500).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('💥 Error in updatePaymentStatus controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Obtener órdenes del restaurante
     * GET /api/pick-and-go/restaurant/:restaurantId/orders
     */
    async getRestaurantOrders(req, res) {
        try {
            const { restaurantId } = req.params;
            const { order_status, date_from, date_to } = req.query;

            if (!restaurantId) {
                return res.status(400).json({
                    success: false,
                    error: 'restaurantId is required'
                });
            }

            const filters = {
                order_status,
                date_from,
                date_to
            };

            const result = await pickAndGoService.getRestaurantOrders(parseInt(restaurantId), filters);

            if (!result.success) {
                return res.status(500).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('💥 Error in getRestaurantOrders controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Calcular tiempo estimado de preparación
     * POST /api/pick-and-go/estimate-prep-time
     */
    async estimatePrepTime(req, res) {
        try {
            const { items, restaurant_id } = req.body;

            if (!items || !Array.isArray(items)) {
                return res.status(400).json({
                    success: false,
                    error: 'items array is required'
                });
            }

            if (items.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'items array cannot be empty'
                });
            }

            const result = await pickAndGoService.calculateEstimatedPrepTime(items, restaurant_id);

            if (!result.success) {
                return res.status(500).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('💥 Error in estimatePrepTime controller:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = new PickAndGoController();