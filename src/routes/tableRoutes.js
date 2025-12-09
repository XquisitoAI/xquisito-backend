const express = require("express");
const tableController = require("../controllers/tableControllerNew");

const router = express.Router();

// ===============================================
// RUTAS COMENTADAS - IMPLEMENTACIÓN ANTERIOR
// ===============================================

// // Rutas para mesas
// router.get('/tables/:tableNumber', tableController.getTableInfo);
// router.get('/tables/:tableNumber/orders', tableController.getTableOrders);
// router.get('/tables/:tableNumber/paid-orders', tableController.getPaidTableOrders);
// router.get('/tables/:tableNumber/status', tableController.getTableStatus);
// router.post('/tables/:tableNumber/orders', tableController.createUserOrder);
// router.post('/tables/:tableNumber/orders/mark-paid', tableController.markOrdersAsPaid);
// router.get('/tables/:tableNumber/stats', tableController.getTableStats);
// router.delete('/tables/:tableNumber/orders', tableController.clearTableOrders);

// // Rutas para órdenes
// router.put('/tables/:tableNumber/orders/:orderId/status', tableController.updateOrderStatus);

// // Rutas para pagos parciales
// router.post('/tables/:tableNumber/orders/:orderId/payments', tableController.addPartialPayment);
// router.get('/tables/:tableNumber/orders/:orderId/payment-history', tableController.getPaymentHistory);

// ===============================================
// NUEVAS RUTAS CON STORED PROCEDURES
// ===============================================

// Rutas para mesas (ahora incluyen restaurantId y branchNumber)
router.get("/restaurants/:restaurantId/tables", tableController.getAllTables);
router.get("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/summary", tableController.getTableSummary);
router.get("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/orders", tableController.getTableOrders);
router.get("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/availability", tableController.checkTableAvailability);

// Rutas para crear órdenes
router.post("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/dishes", tableController.createDishOrder);

// Rutas para pagos
router.post("/dishes/:dishId/pay", tableController.payDishOrder);
router.post("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/pay", tableController.payTableAmount);

// Rutas para división de cuenta (split bill)
router.post("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/split-bill", tableController.initializeSplitBill);
router.post("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/pay-split", tableController.paySplitAmount);
router.get("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/split-status", tableController.getSplitPaymentStatus);
router.get("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/active-users", tableController.getActiveUsers);

// Rutas para cocina
router.put("/dishes/:dishId/status", tableController.updateDishStatus);

// Ruta para vincular órdenes de invitado con userId
router.put("/orders/link-user", tableController.linkGuestOrdersToUser);

module.exports = router;
