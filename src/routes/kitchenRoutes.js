const express = require("express");
const router = express.Router();
const kitchenController = require("../controllers/kitchenController");
const { adminPortalAuth } = require("../middleware/clerkAdminPortalAuth");

// Órdenes activas para la pantalla de cocina
router.get("/orders", adminPortalAuth, (req, res) =>
  kitchenController.getActiveOrders(req, res)
);

// Registrar token FCM del dispositivo
router.post("/fcm-token", adminPortalAuth, (req, res) =>
  kitchenController.saveFcmToken(req, res)
);

module.exports = router;
