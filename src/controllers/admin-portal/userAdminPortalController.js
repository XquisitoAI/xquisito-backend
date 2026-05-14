const userAdminPortalService = require('../../services/admin-portal/userAdminPortalService');
const supabase = require('../../config/supabase');
const SubscriptionService = require('../../services/admin-portal/subscriptionService');

class UserAdminPortalController {
  constructor() {
    this.subscriptionService = new SubscriptionService();
  }

  // ===============================================
  // ENDPOINTS DE INVITACIONES
  // ===============================================

  /**
   * Validar si un email está autorizado para registrarse
   * GET /api/admin-portal/validate-email/:email
   */
  async validateEmailInvitation(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          allowed: false,
          message: 'Email parameter is required'
        });
      }

      const { data, error } = await supabase
        .from('pending_invitations')
        .select('*')
        .eq('email', email)
        .eq('status', 'pending')
        .single();

      if (error || !data) {
        console.log('❌ Email not found in invitation whitelist:', email);
        return res.json({
          allowed: false,
          message: 'Email no autorizado para registro'
        });
      }

      res.json({
        allowed: true,
        client_name: data.client_name,
        client_id: data.client_id
      });
    } catch (error) {
      console.error('❌ Error validating email invitation:', error);
      res.status(500).json({
        allowed: false,
        message: 'Error validando acceso'
      });
    }
  }

  /**
   * Marcar invitación como usada después del registro
   * POST /api/admin-portal/complete-registration
   */
  async completeRegistration(req, res) {
    try {
      const { email, user_id } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      await supabase
        .from('pending_invitations')
        .update({
          status: 'registered',
          used_at: new Date().toISOString()
        })
        .eq('email', email)
        .eq('status', 'pending');

      res.json({
        success: true,
        message: 'Registration completed successfully'
      });
    } catch (error) {
      console.error('❌ Error completing registration:', error);
      res.status(500).json({
        success: false,
        message: 'Error completando registro'
      });
    }
  }

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

      // Create basic plan subscription automatically for new restaurant
      try {
        const subscriptionData = {
          restaurant_id: restaurant.id,
          plan_type: 'basico',
          status: 'active',
          start_date: new Date().toISOString(),
          price_paid: 0,
          currency: 'MXN',
          auto_renew: true
        };

        const subscription = await this.subscriptionService.createSubscription(subscriptionData);
        console.log('✅ Basic plan subscription created for new restaurant:', restaurant.id);

        // Include subscription info in response
        restaurant.subscription = subscription;
      } catch (subscriptionError) {
        console.error('⚠️ Warning: Failed to create basic plan subscription:', subscriptionError);
        // Don't fail restaurant creation if subscription creation fails
        restaurant.subscription_warning = 'Basic plan subscription could not be created automatically. Please contact support.';
      }

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

      console.log('🔍 [DEBUG] updateRestaurant received data:', updateData);
      console.log('🔍 [DEBUG] updateData.table_count:', updateData.table_count);

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

  // ===============================================
  // ENDPOINTS DE SERVICIOS
  // ===============================================

  /**
   * Obtener servicios habilitados para el cliente actual
   * GET /api/admin-portal/services/enabled
   */
  async getEnabledServices(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      // Obtener el usuario del admin portal
      const { data: adminUser, error: userError } = await supabase
        .from('user_admin_portal')
        .select('email')
        .eq('clerk_user_id', clerkUserId)
        .single();

      if (userError || !adminUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found in system'
        });
      }

      const userEmail = adminUser.email;

      // Buscar client_id en pending_invitations usando el email
      const { data: userInvitation, error: invitationError } = await supabase
        .from('pending_invitations')
        .select('client_id, status')
        .eq('email', userEmail)
        .eq('status', 'registered')
        .single();

      if (invitationError || !userInvitation) {
        return res.status(404).json({
          success: false,
          message: 'No client association found for this user'
        });
      }

      const clientId = userInvitation.client_id;
      // Obtener servicios del cliente desde la tabla clients
      const { data: client, error } = await supabase
        .from('clients')
        .select('services')
        .eq('id', clientId)
        .single();

      if (error || !client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      const enabledServices = client.services || [];

      res.json({
        success: true,
        data: {
          enabled_services: enabledServices,
          client_id: clientId
        }
      });

    } catch (error) {
      console.error('❌ Error getting enabled services:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo servicios habilitados'
      });
    }
  }

  /**
   * Obtener sucursales del cliente actual
   * GET /api/admin-portal/branches
   */
  async getBranches(req, res) {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      console.log(`🔍 [getBranches] Getting branches for user: ${clerkUserId}`);

      const userQuery = await supabase
        .from('user_admin_portal')
        .select('id, email')
        .eq('clerk_user_id', clerkUserId)
        .single();

      if (userQuery.error || !userQuery.data) {
        console.error('❌ Error getting user:', userQuery.error);
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      const userId = userQuery.data.id;
      console.log(`🔍 [getBranches] Found user ID: ${userId} (${userQuery.data.email})`);

      const restaurantQuery = await supabase
        .from('restaurants')
        .select('id, name, client_id')
        .eq('user_id', userId)
        .single();

      if (restaurantQuery.error || !restaurantQuery.data) {
        console.error('❌ Error getting restaurant for user:', restaurantQuery.error);
        return res.status(404).json({
          success: false,
          message: 'Usuario no tiene restaurante asociado'
        });
      }

      const restaurant = restaurantQuery.data;
      const clientId = restaurant.client_id;
      console.log(`🔍 [getBranches] Found restaurant: ${restaurant.name} (ID: ${restaurant.id})`);
      console.log(`🔍 [getBranches] Found client_id: ${clientId}`);

      const branchesQuery = await supabase
        .from('branches')
        .select(`
          id,
          name,
          address,
          tables,
          opening_hours,
          active,
          created_at,
          updated_at
        `)
        .eq('client_id', clientId)
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (branchesQuery.error) {
        console.error('❌ Error getting branches:', branchesQuery.error);
        return res.status(500).json({
          success: false,
          message: 'Error obteniendo sucursales'
        });
      }

      const branches = branchesQuery.data || [];
      console.log(`✅ [getBranches] Found ${branches.length} branches for client ${clientId}`);

      res.status(200).json({
        success: true,
        data: {
          client_id: clientId,
          branches: branches
        }
      });

    } catch (error) {
      console.error('❌ Error getting branches:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo sucursales'
      });
    }
  }

  /**
   * Actualizar dirección de una sucursal específica
   * PUT /api/admin-portal/branches/:branchId/address
   */
  async updateBranchAddress(req, res) {
    try {
      const { branchId } = req.params;
      const { address } = req.body;
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (!branchId || !address) {
        return res.status(400).json({
          success: false,
          message: 'Branch ID and address are required'
        });
      }

      if (address.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'La dirección debe tener al menos 10 caracteres'
        });
      }

      console.log(`🔄 [updateBranchAddress] Updating branch ${branchId} address for user: ${clerkUserId}`);

      // Obtener usuario
      const userQuery = await supabase
        .from('user_admin_portal')
        .select('id, email')
        .eq('clerk_user_id', clerkUserId)
        .single();

      if (userQuery.error || !userQuery.data) {
        console.error('❌ Error getting user:', userQuery.error);
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      const userId = userQuery.data.id;

      // Primero obtener el client_id del usuario a través de su restaurant
      const restaurantQuery = await supabase
        .from('restaurants')
        .select('client_id')
        .eq('user_id', userId)
        .single();

      if (restaurantQuery.error || !restaurantQuery.data) {
        console.error('❌ Error getting user restaurant:', restaurantQuery.error);
        return res.status(404).json({
          success: false,
          message: 'Usuario no tiene restaurante asociado'
        });
      }

      const userClientId = restaurantQuery.data.client_id;
      console.log(`🔍 [updateBranchAddress] User client_id: ${userClientId}`);

      // Validar que la branch pertenece al mismo client_id del usuario
      const branchQuery = await supabase
        .from('branches')
        .select(`
          id,
          name,
          address,
          client_id
        `)
        .eq('id', branchId)
        .eq('client_id', userClientId)
        .single();

      if (branchQuery.error || !branchQuery.data) {
        console.error('❌ Error validating branch ownership:', branchQuery.error);
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para editar esta sucursal'
        });
      }

      const oldAddress = branchQuery.data.address;
      console.log(`🔍 [updateBranchAddress] Changing address from "${oldAddress}" to "${address}"`);

      // Actualizar dirección
      const updateQuery = await supabase
        .from('branches')
        .update({
          address: address.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', branchId)
        .select(`
          id,
          name,
          address,
          tables,
          active,
          updated_at
        `)
        .single();

      if (updateQuery.error) {
        console.error('❌ Error updating branch address:', updateQuery.error);
        return res.status(500).json({
          success: false,
          message: 'Error actualizando dirección'
        });
      }

      console.log(`✅ [updateBranchAddress] Branch ${branchId} address updated successfully`);

      res.status(200).json({
        success: true,
        data: updateQuery.data,
        message: 'Dirección actualizada correctamente'
      });

    } catch (error) {
      console.error('❌ Error updating branch address:', error);
      res.status(500).json({
        success: false,
        message: 'Error actualizando dirección de sucursal'
      });
    }
  }

  /**
   * Actualizar horarios de apertura de una sucursal específica
   * PUT /api/admin-portal/branches/:branchId/opening-hours
   */
  async updateBranchOpeningHours(req, res) {
    try {
      const { branchId } = req.params;
      const { opening_hours } = req.body;
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      if (!branchId || !opening_hours) {
        return res.status(400).json({
          success: false,
          message: 'Branch ID and opening_hours are required'
        });
      }

      console.log(`🔄 [updateBranchOpeningHours] Updating branch ${branchId} opening hours for user: ${clerkUserId}`);

      // Obtener usuario
      const userQuery = await supabase
        .from('user_admin_portal')
        .select('id, email')
        .eq('clerk_user_id', clerkUserId)
        .single();

      if (userQuery.error || !userQuery.data) {
        console.error('❌ Error getting user:', userQuery.error);
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      const userId = userQuery.data.id;

      // Primero obtener el client_id del usuario a través de su restaurant
      const restaurantQuery = await supabase
        .from('restaurants')
        .select('client_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (restaurantQuery.error || !restaurantQuery.data) {
        console.error('❌ Error getting restaurant:', restaurantQuery.error);
        return res.status(404).json({
          success: false,
          message: 'Usuario no tiene restaurante asociado'
        });
      }

      const userClientId = restaurantQuery.data.client_id;
      console.log(`🔍 [updateBranchOpeningHours] User client_id: ${userClientId}`);

      // Validar que la branch pertenece al mismo client_id del usuario
      const branchQuery = await supabase
        .from('branches')
        .select(`
          id,
          name,
          opening_hours,
          client_id
        `)
        .eq('id', branchId)
        .eq('client_id', userClientId)
        .single();

      if (branchQuery.error || !branchQuery.data) {
        console.error('❌ Error validating branch ownership:', branchQuery.error);
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para editar esta sucursal'
        });
      }

      const oldOpeningHours = branchQuery.data.opening_hours;
      console.log(`🔍 [updateBranchOpeningHours] Updating opening hours for branch: ${branchQuery.data.name}`);

      // Actualizar horarios de apertura
      const updateQuery = await supabase
        .from('branches')
        .update({
          opening_hours: opening_hours,
          updated_at: new Date().toISOString()
        })
        .eq('id', branchId)
        .select(`
          id,
          name,
          address,
          tables,
          opening_hours,
          active,
          updated_at
        `)
        .single();

      if (updateQuery.error) {
        console.error('❌ Error updating opening hours:', updateQuery.error);
        return res.status(500).json({
          success: false,
          message: 'Error actualizando horarios de apertura'
        });
      }

      console.log(`✅ [updateBranchOpeningHours] Branch ${branchId} opening hours updated successfully`);

      res.status(200).json({
        success: true,
        data: updateQuery.data,
        message: 'Horarios de apertura actualizados correctamente'
      });

    } catch (error) {
      console.error('❌ Error updating branch opening hours:', error);
      res.status(500).json({
        success: false,
        message: 'Error actualizando horarios de apertura de sucursal'
      });
    }
  }
}

module.exports = new UserAdminPortalController();