const express = require("express");
const printerController = require("../controllers/printerController");

const router = express.Router();

// Listar impresoras de una sucursal
router.get("/branch/:branchId/printers", printerController.getPrinters);

// Escanear red y actualizar impresoras detectadas
router.post("/branch/:branchId/printers/scan", printerController.scanPrinters);

// Detectar impresoras USB conectadas al agente
router.post("/branch/:branchId/printers/scan-usb", printerController.scanUsbPrinters);

// Actualizar nombre/rol/estado de una impresora
router.put(
  "/branch/:branchId/printers/:printerId",
  printerController.updatePrinter,
);

// Imprimir ticket de prueba
router.post(
  "/branch/:branchId/printers/:printerId/test",
  printerController.testPrinter,
);

// Eliminar impresora
router.delete(
  "/branch/:branchId/printers/:printerId",
  printerController.deletePrinter,
);

module.exports = router;
