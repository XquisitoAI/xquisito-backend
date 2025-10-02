const express = require("express");
const router = express.Router();
const menuController = require("../controllers/menuController");

// ===============================================
// RUTAS DE SECCIONES DEL MENÚ
// ===============================================

/**
 * @route GET /api/menu/sections
 * @desc Obtener todas las secciones del menú
 * @access Public
 */
router.get("/sections", menuController.getAllSections);

/**
 * @route POST /api/menu/sections
 * @desc Crear nueva sección del menú
 * @access Public
 * @body { name: string, display_order?: number }
 */
router.post("/sections", menuController.createSection);

/**
 * @route PUT /api/menu/sections/:id
 * @desc Actualizar sección del menú
 * @access Public
 * @body { name?: string, is_active?: boolean, display_order?: number }
 */
router.put("/sections/:id", menuController.updateSection);

/**
 * @route DELETE /api/menu/sections/:id
 * @desc Eliminar sección del menú (solo si no tiene platillos)
 * @access Public
 */
router.delete("/sections/:id", menuController.deleteSection);

/**
 * @route PUT /api/menu/sections/reorder
 * @desc Reordenar secciones del menú
 * @access Public
 * @body { sections: [{ id: number, display_order: number }] }
 */
router.put("/sections/reorder", menuController.reorderSections);

// ===============================================
// RUTAS DE PLATILLOS DEL MENÚ
// ===============================================

/**
 * @route GET /api/menu/items
 * @desc Obtener todos los platillos del menú
 * @access Public
 * @query { section_id?: number, is_available?: boolean, active_sections_only?: boolean }
 */
router.get("/items", menuController.getAllItems);

/**
 * @route GET /api/menu/items/:id
 * @desc Obtener platillo por ID
 * @access Public
 */
router.get("/items/:id", menuController.getItemById);

/**
 * @route POST /api/menu/items
 * @desc Crear nuevo platillo
 * @access Public
 * @body {
 *   section_id: number,
 *   name: string,
 *   description?: string,
 *   image_url?: string,
 *   price: number,
 *   discount?: number,
 *   custom_fields?: CustomField[],
 *   display_order?: number
 * }
 */
router.post("/items", menuController.createItem);

/**
 * @route PUT /api/menu/items/:id
 * @desc Actualizar platillo
 * @access Public
 * @body {
 *   section_id?: number,
 *   name?: string,
 *   description?: string,
 *   image_url?: string,
 *   price?: number,
 *   discount?: number,
 *   custom_fields?: CustomField[],
 *   is_available?: boolean,
 *   display_order?: number
 * }
 */
router.put("/items/:id", menuController.updateItem);

/**
 * @route DELETE /api/menu/items/:id
 * @desc Eliminar platillo
 * @access Public
 */
router.delete("/items/:id", menuController.deleteItem);

// ===============================================
// RUTAS ESPECIALES
// ===============================================

/**
 * @route GET /api/menu/complete
 * @desc Obtener menú completo (secciones con sus platillos)
 * @access Public
 */
router.get("/complete", menuController.getCompleteMenu);

/**
 * @route GET /api/menu/stats
 * @desc Obtener estadísticas del menú
 * @access Public
 */
router.get("/stats", menuController.getMenuStats);

// ===============================================
// MIDDLEWARE DE MANEJO DE ERRORES ESPECÍFICO PARA MENÚ
// ===============================================

router.use((error, req, res, next) => {
  console.error("❌ Menu route error:", error);

  // Errores de validación de PostgreSQL
  if (error.code === '23505') { // unique_violation
    return res.status(400).json({
      success: false,
      error: "duplicate_error",
      message: "A record with this data already exists"
    });
  }

  if (error.code === '23503') { // foreign_key_violation
    return res.status(400).json({
      success: false,
      error: "reference_error",
      message: "Referenced record does not exist"
    });
  }

  if (error.code === '23514') { // check_violation
    return res.status(400).json({
      success: false,
      error: "validation_error",
      message: "Data does not meet validation requirements"
    });
  }

  // Error genérico
  res.status(500).json({
    success: false,
    error: "server_error",
    message: "An unexpected error occurred"
  });
});

module.exports = router;