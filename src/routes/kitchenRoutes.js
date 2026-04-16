const express = require("express");
const router = express.Router();
const kitchenController = require("../controllers/kitchenController");
const { adminPortalAuth } = require("../middleware/clerkAdminPortalAuth");

// Órdenes activas para la pantalla de cocina
router.get("/orders", adminPortalAuth, (req, res) =>
  kitchenController.getActiveOrders(req, res),
);

// Registrar token FCM del dispositivo
router.post("/fcm-token", adminPortalAuth, (req, res) =>
  kitchenController.saveFcmToken(req, res),
);

// Eliminar token FCM al cerrar sesión
router.delete("/fcm-token", adminPortalAuth, (req, res) =>
  kitchenController.deleteFcmToken(req, res),
);

// Sucursales del restaurante
router.get("/branches", adminPortalAuth, (req, res) =>
  kitchenController.getBranches(req, res),
);

// Sincronizar impresoras encontradas en scan local
router.post("/printers/sync", adminPortalAuth, (req, res) =>
  kitchenController.syncPrinters(req, res),
);

// Actualizar nombre/rol de una impresora
router.put("/printers/:printerId", adminPortalAuth, (req, res) =>
  kitchenController.updatePrinter(req, res),
);

module.exports = router;
