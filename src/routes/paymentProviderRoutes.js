const express = require("express");
const paymentProviderController = require("../controllers/paymentProviderController");

const router = express.Router();

// Lista todos los proveedores disponibles (público)
router.get("/", paymentProviderController.getProviders);

// Resuelve el proveedor activo por restaurant_id (integer) — usado por xquisito-flexbill
router.get(
  "/resolve/:restaurantId",
  paymentProviderController.resolveByRestaurantId,
);

// Proveedor activo de un restaurante por client UUID
router.get("/client/:clientId", paymentProviderController.getClientProvider);

// Guardar/cambiar el proveedor de un restaurante (requiere auth desde admin-portal)
router.put("/client/:clientId", paymentProviderController.setClientProvider);

module.exports = router;
