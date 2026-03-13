const express = require("express");
const posController = require("../controllers/posController");

const router = express.Router();

// Listar proveedores POS disponibles
router.get("/providers", posController.getProviders);

// Obtener integración POS de una sucursal
router.get("/branch/:branchId/integration", posController.getIntegrationByBranch);

// Obtener tenders disponibles para una sucursal
router.get("/branch/:branchId/tenders", posController.getTendersByBranch);

// Historial de sincronización de una sucursal
router.get("/branch/:branchId/sync-history", posController.getSyncHistory);

// Lista de menús disponibles
router.get("/branch/:branchId/menus", posController.getMenuList);

// Obtener menú completo por ID
router.get("/branch/:branchId/menus/:menuId", posController.getMenu);

// Test de conexión POS
router.post("/branch/:branchId/test-connection", posController.testConnection);

module.exports = router;
