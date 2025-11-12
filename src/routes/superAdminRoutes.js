const express = require("express");
const router = express.Router();
const superAdminController = require("../controllers/superAdminController");
const { mainPortalAuth } = require("../middleware/clerkMainPortalAuth");

// Ruta de estadísticas del super admin
router.get("/stats", mainPortalAuth, superAdminController.getSuperAdminStats);

// Ruta para obtener todos los restaurantes
router.get(
  "/restaurants",
  mainPortalAuth,
  superAdminController.getAllRestaurants
);

// Rutas para datos temporales (timeline) - para gráficas de líneas
router.get(
  "/timeline/volume",
  mainPortalAuth,
  superAdminController.getVolumeTimeline
);

router.get(
  "/timeline/orders",
  mainPortalAuth,
  superAdminController.getOrdersTimeline
);

router.get(
  "/timeline/transactions",
  mainPortalAuth,
  superAdminController.getTransactionsTimeline
);

module.exports = router;
