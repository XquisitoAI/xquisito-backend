const express = require("express");
const roomOrderController = require("../controllers/roomOrderController");
const roomDishOrderController = require("../controllers/roomDishOrderController");

const router = express.Router();

// Verificar si existe orden activa en una habitación (NO auto-crear)
router.get(
  "/room-orders/restaurant/:restaurantId/branch/:branchNumber/room/:roomNumber",
  roomOrderController.getOrderByRoom
);

// Crear orden con primer platillo (endpoint principal para iniciar)
router.post(
  "/room-orders/restaurant/:restaurantId/branch/:branchNumber/room/:roomNumber/dishes",
  roomDishOrderController.createOrderWithFirstDish
);

// Obtener room order por ID con resumen completo
router.get("/room-orders/:id", roomOrderController.getRoomOrderById);

// Actualizar estado de la orden
router.patch("/room-orders/:id/status", roomOrderController.updateOrderStatus);

// Actualizar estado de pago
router.patch(
  "/room-orders/:id/payment-status",
  roomOrderController.updatePaymentStatus
);

// Recalcular total de la orden
router.post(
  "/room-orders/:id/calculate-total",
  roomOrderController.recalculateTotal
);

// ===============================================
// RUTAS PARA DISH ORDERS EN ROOM SERVICE
// ===============================================

// Agregar platillo adicional a orden existente
router.post(
  "/room-orders/:roomOrderId/dishes",
  roomDishOrderController.addDishToOrder
);

// Actualizar estado de preparación (para cocina)
router.patch(
  "/dish-orders/:dishOrderId/status",
  roomDishOrderController.updateDishStatus
);

// Marcar platillo como pagado
router.post(
  "/dish-orders/:dishOrderId/mark-paid",
  roomDishOrderController.markAsPaid
);

module.exports = router;
