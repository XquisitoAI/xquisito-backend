const express = require('express');
const tableController = require('../controllers/tableController');

const router = express.Router();

// Rutas para mesas
router.get('/tables/:tableNumber', tableController.getTableInfo);
router.get('/tables/:tableNumber/orders', tableController.getTableOrders);
router.post('/tables/:tableNumber/orders', tableController.createUserOrder);
router.get('/tables/:tableNumber/stats', tableController.getTableStats);
router.delete('/tables/:tableNumber/orders', tableController.clearTableOrders);

// Rutas para órdenes
router.put('/orders/:orderId/status', tableController.updateOrderStatus);

module.exports = router;