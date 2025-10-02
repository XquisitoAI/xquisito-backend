const menuService = require("../services/menuService");

// ===============================================
// CONTROLADORES DE SECCIONES
// ===============================================

/**
 * Obtener todas las secciones del menú
 */
const getAllSections = async (req, res) => {
  try {
    console.log("🔍 Getting all menu sections");

    const sections = await menuService.getAllSections();

    console.log(`✅ Found ${sections.length} menu sections`);
    res.json({
      success: true,
      data: sections
    });
  } catch (error) {
    console.error("❌ Error getting menu sections:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Crear nueva sección
 */
const createSection = async (req, res) => {
  try {
    const { name, display_order } = req.body;

    console.log("🔍 Creating new menu section:", { name, display_order });

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Section name is required"
      });
    }

    const section = await menuService.createSection({
      name: name.trim(),
      display_order
    });

    console.log("✅ Menu section created successfully:", section.id);
    res.status(201).json({
      success: true,
      data: section
    });
  } catch (error) {
    console.error("❌ Error creating menu section:", error.message);

    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return res.status(400).json({
        success: false,
        error: "duplicate_error",
        message: "A section with this name already exists"
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Actualizar sección
 */
const updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log("🔍 Updating menu section:", id, updateData);

    const section = await menuService.updateSection(parseInt(id), updateData);

    console.log("✅ Menu section updated successfully");
    res.json({
      success: true,
      data: section
    });
  } catch (error) {
    console.error("❌ Error updating menu section:", error.message);

    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return res.status(400).json({
        success: false,
        error: "duplicate_error",
        message: "A section with this name already exists"
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Eliminar sección
 */
const deleteSection = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Deleting menu section:", id);

    await menuService.deleteSection(parseInt(id));

    console.log("✅ Menu section deleted successfully");
    res.json({
      success: true,
      message: "Section deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting menu section:", error.message);

    if (error.message.includes("existing menu items")) {
      return res.status(400).json({
        success: false,
        error: "constraint_error",
        message: "Cannot delete section that contains menu items"
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Reordenar secciones
 */
const reorderSections = async (req, res) => {
  try {
    const { sections } = req.body;

    console.log("🔍 Reordering menu sections:", sections);

    if (!Array.isArray(sections)) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Sections must be an array"
      });
    }

    await menuService.reorderSections(sections);

    console.log("✅ Menu sections reordered successfully");
    res.json({
      success: true,
      message: "Sections reordered successfully"
    });
  } catch (error) {
    console.error("❌ Error reordering menu sections:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

// ===============================================
// CONTROLADORES DE PLATILLOS
// ===============================================

/**
 * Obtener todos los platillos
 */
const getAllItems = async (req, res) => {
  try {
    const { section_id, is_available, active_sections_only } = req.query;

    console.log("🔍 Getting menu items with filters:", req.query);

    const filters = {};
    if (section_id) filters.section_id = parseInt(section_id);
    if (is_available !== undefined) filters.is_available = is_available === 'true';
    if (active_sections_only !== undefined) filters.active_sections_only = active_sections_only !== 'false';

    const items = await menuService.getAllItems(filters);

    console.log(`✅ Found ${items.length} menu items`);
    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error("❌ Error getting menu items:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Obtener platillo por ID
 */
const getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Getting menu item by ID:", id);

    const item = await menuService.getItemById(parseInt(id));

    console.log("✅ Menu item found");
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error("❌ Error getting menu item:", error.message);
    res.status(404).json({
      success: false,
      error: "not_found",
      message: "Menu item not found"
    });
  }
};

/**
 * Crear nuevo platillo
 */
const createItem = async (req, res) => {
  try {
    const itemData = req.body;

    console.log("🔍 Creating new menu item:", {
      name: itemData.name,
      section_id: itemData.section_id,
      price: itemData.price
    });

    // Validaciones básicas
    if (!itemData.name || !itemData.section_id || itemData.price === undefined) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Name, section_id, and price are required"
      });
    }

    const item = await menuService.createItem(itemData);

    console.log("✅ Menu item created successfully:", item.id);
    res.status(201).json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error("❌ Error creating menu item:", error.message);

    if (error.message.includes("section not found")) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Invalid section ID"
      });
    }

    if (error.message.includes("inactive section")) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Cannot add items to inactive section"
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Actualizar platillo
 */
const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log("🔍 Updating menu item:", id, updateData);

    const item = await menuService.updateItem(parseInt(id), updateData);

    console.log("✅ Menu item updated successfully");
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error("❌ Error updating menu item:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Eliminar platillo
 */
const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Deleting menu item:", id);

    await menuService.deleteItem(parseInt(id));

    console.log("✅ Menu item deleted successfully");
    res.json({
      success: true,
      message: "Item deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting menu item:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

// ===============================================
// CONTROLADORES ESPECIALES
// ===============================================

/**
 * Obtener menú completo
 */
const getCompleteMenu = async (req, res) => {
  try {
    console.log("🔍 Getting complete menu");

    const menu = await menuService.getCompleteMenu();

    console.log("✅ Complete menu retrieved successfully");
    res.json({
      success: true,
      data: menu
    });
  } catch (error) {
    console.error("❌ Error getting complete menu:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

/**
 * Obtener estadísticas del menú
 */
const getMenuStats = async (req, res) => {
  try {
    console.log("🔍 Getting menu statistics");

    const stats = await menuService.getMenuStats();

    console.log("✅ Menu statistics retrieved successfully");
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("❌ Error getting menu statistics:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message
    });
  }
};

module.exports = {
  // Secciones
  getAllSections,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,

  // Platillos
  getAllItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,

  // Especiales
  getCompleteMenu,
  getMenuStats
};