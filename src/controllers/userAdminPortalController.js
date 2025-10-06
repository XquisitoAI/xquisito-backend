const userAdminPortalService = require('../services/userAdminPortalService');

class UserAdminPortalController {
  // ===============================================
  // ENDPOINTS DE AUTENTICACIÓN Y USUARIOS
  // ===============================================

  /**
   * Inicializar o sincronizar usuario desde Clerk
   * POST /api/admin-portal/auth/sync
   */
  async syncUserFromClerk(req, res) {
    try {
      // Usar datos del usuario autenticado del middleware en lugar del body
      const authenticatedUser = req.user;

      if (!authenticatedUser || !authenticatedUser.id) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      // Estructurar datos del usuario autenticado para el servicio
      const clerkUserData = {
        id: authenticatedUser.id,
        email: authenticatedUser.email,
        firstName: authenticatedUser.firstName,
        lastName: authenticatedUser.lastName,
        clerkData: authenticatedUser.clerkData
      };

      console.log('🔍 Using authenticated user data for sync:', {
        id: clerkUserData.id,
        email: clerkUserData.email,
        firstName: clerkUserData.firstName,
        lastName: clerkUserData.lastName
      });

      const result = await userAdminPortalService.initializeUserFromClerk(clerkUserData);

      res.status(200).json({
        success: true,
        message: 'User synchronized successfully',
        data: result
      });
    } catch (error) {
      console.error('❌ Error syncing user from Clerk:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener información del usuario actual con su restaurante
   * GET /api/admin-portal/auth/me
   */
  async getCurrentUser(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const userWithRestaurant = await userAdminPortalService.getUserWithRestaurant(clerkUserId);

      if (!userWithRestaurant) {
        return res.status(404).json({
          success: false,
          message: 'User not found in admin portal'
        });
      }

      res.status(200).json({
        success: true,
        data: userWithRestaurant
      });
    } catch (error) {
      console.error('❌ Error getting current user:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Actualizar información del usuario
   * PUT /api/admin-portal/users/profile
   */
  async updateUserProfile(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const updateData = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const updatedUser = await userAdminPortalService.updateUser(clerkUserId, updateData);

      res.status(200).json({
        success: true,
        message: 'User profile updated successfully',
        data: updatedUser
      });
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ===============================================
  // ENDPOINTS DE RESTAURANTES
  // ===============================================

  /**
   * Obtener información del restaurante del usuario
   * GET /api/admin-portal/restaurant
   */
  async getRestaurant(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found'
        });
      }

      res.status(200).json({
        success: true,
        data: restaurant
      });
    } catch (error) {
      console.error('❌ Error getting restaurant:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Crear restaurante para usuario existente
   * POST /api/admin-portal/restaurant
   */
  async createRestaurant(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const { name, description } = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Restaurant name is required'
        });
      }

      const restaurant = await userAdminPortalService.createRestaurant(clerkUserId, {
        name: name.trim(),
        description: description || 'Descripción de tu restaurante - agrega información sobre tu cocina, especialidades y ambiente'
      });

      res.status(201).json({
        success: true,
        message: 'Restaurant created successfully',
        data: restaurant
      });
    } catch (error) {
      console.error('❌ Error creating restaurant:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Actualizar información del restaurante
   * PUT /api/admin-portal/restaurant
   */
  async updateRestaurant(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const updateData = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const updatedRestaurant = await userAdminPortalService.updateRestaurant(clerkUserId, updateData);

      res.status(200).json({
        success: true,
        message: 'Restaurant updated successfully',
        data: updatedRestaurant
      });
    } catch (error) {
      console.error('❌ Error updating restaurant:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ===============================================
  // ENDPOINTS DE MENÚ
  // ===============================================

  /**
   * Obtener menú completo del restaurante del usuario
   * GET /api/admin-portal/menu
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

      const menu = await userAdminPortalService.getUserCompleteMenu(clerkUserId);

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

  // ===============================================
  // ENDPOINTS DE ESTADÍSTICAS Y DASHBOARD
  // ===============================================

  /**
   * Obtener estadísticas del usuario y su restaurante
   * GET /api/admin-portal/dashboard/stats
   */
  async getDashboardStats(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const stats = await userAdminPortalService.getUserStats(clerkUserId);

      if (!stats) {
        return res.status(404).json({
          success: false,
          message: 'User not found in admin portal'
        });
      }

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ===============================================
  // ENDPOINTS DE CONFIGURACIÓN INICIAL
  // ===============================================

  /**
   * Configurar usuario y restaurante por primera vez
   * POST /api/admin-portal/setup
   */
  async setupUserAndRestaurant(req, res) {
    try {
      const clerkUserId = req.auth?.userId;
      const { user_data, restaurant_data } = req.body;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      // Verificar si el usuario ya existe
      const userExists = await userAdminPortalService.userExists(clerkUserId);

      if (userExists) {
        return res.status(400).json({
          success: false,
          message: 'User already set up'
        });
      }

      // Crear usuario con datos de Clerk y datos adicionales
      const userData = {
        clerk_user_id: clerkUserId,
        ...user_data,
        restaurant_name: restaurant_data?.name || 'Mi Restaurante'
      };

      const result = await userAdminPortalService.createOrUpdateUser(userData);

      // Si hay datos adicionales del restaurante, actualizarlos
      if (restaurant_data && Object.keys(restaurant_data).length > 0) {
        await userAdminPortalService.updateRestaurant(clerkUserId, restaurant_data);
      }

      res.status(201).json({
        success: true,
        message: 'User and restaurant set up successfully',
        data: result
      });
    } catch (error) {
      console.error('❌ Error setting up user and restaurant:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Verificar estado de configuración del usuario
   * GET /api/admin-portal/setup/status
   */
  async getSetupStatus(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const userExists = await userAdminPortalService.userExists(clerkUserId);
      const hasRestaurant = userExists ? await userAdminPortalService.userHasRestaurant(clerkUserId) : false;

      const status = {
        user_exists: userExists,
        has_restaurant: hasRestaurant,
        setup_complete: userExists && hasRestaurant
      };

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('❌ Error getting setup status:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new UserAdminPortalController();