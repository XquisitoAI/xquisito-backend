const express = require('express');
const tapOrderController = require('../controllers/tapOrderController');
const tapDishOrderController = require('../controllers/tapDishOrderController');

const router = express.Router();

// ===============================================
// RUTAS PARA TAP ORDER AND PAY
// Arquitectura: dish_order + tables + tap_orders_and_pay
// ===============================================

// Verificar si existe orden activa en una mesa (NO auto-crear)
router.get('/tap-orders/restaurant/:restaurantId/table/:tableNumber', tapOrderController.getOrderByTable);

// Crear orden con primer platillo (endpoint principal para iniciar)
router.post('/tap-orders/restaurant/:restaurantId/table/:tableNumber/dishes', tapDishOrderController.createOrderWithFirstDish);

// Obtener tap order por ID con resumen completo
router.get('/tap-orders/:id', tapOrderController.getTapOrderById);

// Actualizar información del cliente
router.patch('/tap-orders/:id/customer', tapOrderController.updateCustomerInfo);

// Actualizar estado de la orden
router.patch('/tap-orders/:id/status', tapOrderController.updateOrderStatus);

// Actualizar estado de pago
router.patch('/tap-orders/:id/payment-status', tapOrderController.updatePaymentStatus);

// Recalcular total de la orden
router.post('/tap-orders/:id/calculate-total', tapOrderController.calculateTotal);

// Obtener historial de órdenes de una mesa
router.get('/tap-orders/table/:tableId/history', tapOrderController.getTableOrderHistory);

// Abandonar orden
router.delete('/tap-orders/:id', tapOrderController.abandonOrder);

// ===============================================
// RUTAS PARA DISH ORDERS EN TAP ORDER AND PAY
// ===============================================

// Agregar platillo adicional a orden existente
router.post('/tap-orders/:tapOrderId/dishes', tapDishOrderController.createDishOrder);

// Crear múltiples dish orders (carrito)
router.post('/tap-orders/:tapOrderId/dishes/bulk', tapDishOrderController.createMultipleDishOrders);

// Obtener todos los dish orders de un tap order
router.get('/tap-orders/:tapOrderId/dishes', tapDishOrderController.getDishOrders);

// Obtener resumen de dish orders
router.get('/tap-orders/:tapOrderId/summary', tapDishOrderController.getDishOrdersSummary);

// Actualizar dish order
router.patch('/dish-orders/:dishOrderId', tapDishOrderController.updateDishOrder);

// Actualizar cantidad específica
router.patch('/dish-orders/:dishOrderId/quantity', tapDishOrderController.updateQuantity);

// Actualizar estado de preparación
router.patch('/dish-orders/:dishOrderId/status', tapDishOrderController.updateStatus);

// Marcar como pagado
router.post('/dish-orders/:dishOrderId/mark-paid', tapDishOrderController.markAsPaid);

// Eliminar dish order
router.delete('/dish-orders/:dishOrderId', tapDishOrderController.deleteDishOrder);

module.exports = router;