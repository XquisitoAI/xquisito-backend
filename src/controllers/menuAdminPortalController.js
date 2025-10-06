const menuAdminPortalService = require('../services/menuAdminPortalService');

class MenuAdminPortalController {
  // ===============================================
  // CONTROLADORES DE SECCIONES
  // ===============================================

  /**
   * Obtener todas las secciones del restaurante del usuario
   * GET /api/admin-portal/menu/sections
   */
  async getAllSections(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const sections = await menuAdminPortalService.getAllSections(clerkUserId);

      res.status(200).json({
        success: true,
        data: sections
      });
    } catch (error) {
      console.error('❌ Error getting sections:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Crear nueva sección
   * POST /api/admin-portal/menu/sections
   */
  async createSection(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const sectionData = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const section = await menuAdminPortalService.createSection(clerkUserId, sectionData);

      res.status(201).json({
        success: true,
        message: 'Section created successfully',
        data: section
      });
    } catch (error) {
      console.error('❌ Error creating section:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Actualizar sección
   * PUT /api/admin-portal/menu/sections/:id
   */
  async updateSection(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const sectionId = parseInt(req.params.id);
      const updateData = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (isNaN(sectionId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid section ID'
        });
      }

      const section = await menuAdminPortalService.updateSection(clerkUserId, sectionId, updateData);

      res.status(200).json({
        success: true,
        message: 'Section updated successfully',
        data: section
      });
    } catch (error) {
      console.error('❌ Error updating section:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Eliminar sección
   * DELETE /api/admin-portal/menu/sections/:id
   */
  async deleteSection(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const sectionId = parseInt(req.params.id);

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (isNaN(sectionId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid section ID'
        });
      }

      await menuAdminPortalService.deleteSection(clerkUserId, sectionId);

      res.status(200).json({
        success: true,
        message: 'Section deleted successfully',
        data: true
      });
    } catch (error) {
      console.error('❌ Error deleting section:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ===============================================
  // CONTROLADORES DE ITEMS
  // ===============================================

  /**
   * Obtener todos los items del restaurante del usuario
   * GET /api/admin-portal/menu/items
   */
  async getAllItems(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const filters = {};

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      // Extraer filtros de query parameters
      if (req.query.section_id) {
        filters.section_id = parseInt(req.query.section_id);
      }

      if (req.query.is_available !== undefined) {
        filters.is_available = req.query.is_available === 'true';
      }

      const items = await menuAdminPortalService.getAllItems(clerkUserId, filters);

      res.status(200).json({
        success: true,
        data: items
      });
    } catch (error) {
      console.error('❌ Error getting items:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener item por ID
   * GET /api/admin-portal/menu/items/:id
   */
  async getItemById(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const itemId = parseInt(req.params.id);

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (isNaN(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item ID'
        });
      }

      const item = await menuAdminPortalService.getItemById(clerkUserId, itemId);

      res.status(200).json({
        success: true,
        data: item
      });
    } catch (error) {
      console.error('❌ Error getting item:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Crear nuevo item
   * POST /api/admin-portal/menu/items
   */
  async createItem(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const itemData = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const item = await menuAdminPortalService.createItem(clerkUserId, itemData);

      res.status(201).json({
        success: true,
        message: 'Item created successfully',
        data: item
      });
    } catch (error) {
      console.error('❌ Error creating item:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Actualizar item
   * PUT /api/admin-portal/menu/items/:id
   */
  async updateItem(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const itemId = parseInt(req.params.id);
      const updateData = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (isNaN(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item ID'
        });
      }

      const item = await menuAdminPortalService.updateItem(clerkUserId, itemId, updateData);

      res.status(200).json({
        success: true,
        message: 'Item updated successfully',
        data: item
      });
    } catch (error) {
      console.error('❌ Error updating item:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Eliminar item
   * DELETE /api/admin-portal/menu/items/:id
   */
  async deleteItem(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const itemId = parseInt(req.params.id);

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (isNaN(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item ID'
        });
      }

      await menuAdminPortalService.deleteItem(clerkUserId, itemId);

      res.status(200).json({
        success: true,
        message: 'Item deleted successfully',
        data: true
      });
    } catch (error) {
      console.error('❌ Error deleting item:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ===============================================
  // CONTROLADORES DE MENÚ COMPLETO
  // ===============================================

  /**
   * Obtener menú completo (secciones con items)
   * GET /api/admin-portal/menu/complete
   */
  async getCompleteMenu(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const menu = await menuAdminPortalService.getCompleteMenu(clerkUserId);

      res.status(200).json({
        success: true,
        data: menu
      });
    } catch (error) {
      console.error('❌ Error getting complete menu:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new MenuAdminPortalController();