const express = require("express");
const tapPayController = require("../controllers/tapPayController");

const router = express.Router();

// Health check
router.get("/health", tapPayController.healthCheck);

// Obtener órdenes
router.get("/restaurants/:restaurantId/branches/:branchNumber/tables/:tableNumber/order", tapPayController.getActiveOrderByTable);
router.get("/orders/:orderId", tapPayController.getOrderById);
router.get("/orders/:orderId/items", tapPayController.getOrderItems);

// Crear orden (POS)
router.post("/orders", tapPayController.createOrder);

// Procesar pagos
router.post("/orders/:orderId/pay", tapPayController.processPayment);
router.post("/dishes/:dishId/pay", tapPayController.payDishOrder);
router.post("/orders/:orderId/pay-amount", tapPayController.payOrderAmount);

// División de cuenta
router.post("/orders/:orderId/split-bill", tapPayController.initializeSplitBill);
router.post("/orders/:orderId/pay-split", tapPayController.paySplitAmount);
router.get("/orders/:orderId/split-status", tapPayController.getSplitPaymentStatus);
router.get("/orders/:orderId/active-users", tapPayController.getActiveUsers);

// Actualizar estados
router.put("/orders/:orderId/status", tapPayController.updateOrderStatus);
router.put("/dishes/:dishId/status", tapPayController.updateDishStatus);

// Dashboard
router.get("/dashboard/metrics", tapPayController.getDashboardMetrics);

module.exports = router;
