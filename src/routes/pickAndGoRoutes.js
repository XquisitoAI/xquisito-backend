const express = require('express');
const router = express.Router();
const pickAndGoController = require('../controllers/pickAndGoController');

/**
 * Rutas para el servicio Pick & Go
 * Base URL: /api/pick-and-go
 *
 * Endpoints disponibles:
 * - POST   /orders                           - Crear nueva orden
 * - GET    /orders/:orderId                  - Obtener orden por ID
 * - PUT    /orders/:orderId/status           - Actualizar estado de orden
 * - PUT    /orders/:orderId/payment-status   - Actualizar estado de pago
 * - POST   /orders/:orderId/items            - Agregar item a la orden
 * - GET    /user/:userId/orders              - Obtener órdenes del usuario
 * - GET    /restaurant/:restaurantId/orders  - Obtener órdenes del restaurante
 * - POST   /estimate-prep-time               - Calcular tiempo estimado de preparación
 */

// ===================================
// GESTIÓN DE ÓRDENES
// ===================================

/**
 * Crear nueva orden Pick & Go
 * POST /api/pick-and-go/orders
 *
 * Body:
 * {
 *   "clerk_user_id": "user_123",
 *   "customer_name": "Juan Pérez",
 *   "customer_phone": "5551234567",
 *   "customer_email": "juan@email.com",
 *   "session_data": {},
 *   "prep_metadata": {}
 * }
 */
router.post('/orders', pickAndGoController.createOrder);

/**
 * Obtener orden por ID con todos sus detalles
 * GET /api/pick-and-go/orders/:orderId
 *
 * Respuesta incluye: orden, items, pagos
 */
router.get('/orders/:orderId', pickAndGoController.getOrder);

/**
 * Actualizar estado de la orden
 * PUT /api/pick-and-go/orders/:orderId/status
 *
 * Body:
 * {
 *   "order_status": "confirmed|preparing|completed|abandoned",
 *   "prep_metadata": {} // opcional
 * }
 */
router.put('/orders/:orderId/status', pickAndGoController.updateOrderStatus);

/**
 * Actualizar estado de pago
 * PUT /api/pick-and-go/orders/:orderId/payment-status
 *
 * Body:
 * {
 *   "payment_status": "pending|paid"
 * }
 */
router.put('/orders/:orderId/payment-status', pickAndGoController.updatePaymentStatus);

// ===================================
// GESTIÓN DE ITEMS
// ===================================

/**
 * Agregar item a una orden existente
 * POST /api/pick-and-go/orders/:orderId/items
 *
 * Body:
 * {
 *   "item": "Hamburguesa Clásica",
 *   "quantity": 2,
 *   "price": 150.00,
 *   "images": ["url1.jpg", "url2.jpg"],
 *   "custom_fields": {"size": "grande", "extras": ["queso", "bacon"]},
 *   "extra_price": 25.00
 * }
 */
router.post('/orders/:orderId/items', pickAndGoController.addItemToOrder);

// ===================================
// CONSULTAS POR USUARIO
// ===================================

/**
 * Obtener órdenes del usuario
 * GET /api/pick-and-go/user/:userId/orders
 *
 * Query params opcionales:
 * - order_status: active|confirmed|preparing|completed|abandoned
 * - payment_status: pending|paid
 * - limit: número de órdenes a retornar
 *
 * Ejemplo: /api/pick-and-go/user/user_123/orders?order_status=active&limit=10
 */
router.get('/user/:userId/orders', pickAndGoController.getUserOrders);

// ===================================
// CONSULTAS POR RESTAURANTE
// ===================================

/**
 * Obtener órdenes del restaurante (para dashboard administrativo)
 * GET /api/pick-and-go/restaurant/:restaurantId/orders
 *
 * Query params opcionales:
 * - order_status: active|confirmed|preparing|completed|abandoned
 * - date_from: fecha de inicio (ISO string)
 * - date_to: fecha de fin (ISO string)
 *
 * Ejemplo: /api/pick-and-go/restaurant/3/orders?order_status=preparing&date_from=2025-11-18
 */
router.get('/restaurant/:restaurantId/orders', pickAndGoController.getRestaurantOrders);

// ===================================
// UTILIDADES
// ===================================

/**
 * Calcular tiempo estimado de preparación
 * POST /api/pick-and-go/estimate-prep-time
 *
 * Body:
 * {
 *   "items": [
 *     {"item": "Hamburguesa", "quantity": 2},
 *     {"item": "Papas fritas", "quantity": 1}
 *   ],
 *   "restaurant_id": 3 // opcional
 * }
 *
 * Respuesta:
 * {
 *   "success": true,
 *   "data": {
 *     "estimated_minutes": 25
 *   }
 * }
 */
router.post('/estimate-prep-time', pickAndGoController.estimatePrepTime);

// ===================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ===================================

// Middleware para capturar rutas no encontradas en este router
// Comentado temporalmente por problemas con path-to-regexp
// router.use('*', (req, res) => {
//     res.status(404).json({
//         success: false,
//         error: `Pick & Go endpoint not found: ${req.method} ${req.originalUrl}`
//     });
// });

module.exports = router;