const supabase = require("../config/supabase");

class UserAdminPortalService {
  // ===============================================
  // OPERACIONES DE USUARIOS ADMIN PORTAL
  // ===============================================

  /**
   * Inicializar usuario desde Clerk (método SEGURO sin service key)
   */
  async initializeUserFromClerk(clerkUserData) {
    try {
      // Los datos ahora vienen del middleware autenticado, son más limpios
      console.log('🔍 Processing authenticated user data:', {
        id: clerkUserData.id,
        email: clerkUserData.email,
        firstName: clerkUserData.firstName,
        lastName: clerkUserData.lastName
      });

      // Verificar que tenemos los datos esenciales
      if (!clerkUserData.email) {
        console.error('❌ No email in authenticated user data');
        throw new Error('No email found in authenticated user data');
      }

      const userData = {
        clerk_user_id: clerkUserData.id,
        email: clerkUserData.email,
        first_name: clerkUserData.firstName,
        last_name: clerkUserData.lastName,
        phone: null // No enviamos phone por ahora
      };

      console.log('🔍 Initializing user ONLY from Clerk (no restaurant):', userData);

      // Usar función SQL segura que SOLO crea usuario (SIN restaurante)
      const { data, error } = await supabase.rpc('secure_register_user_only_from_clerk', {
        p_clerk_user_id: userData.clerk_user_id,
        p_email: userData.email,
        p_first_name: userData.first_name,
        p_last_name: userData.last_name
      });

      if (error) throw error;

      console.log('✅ User initialized from Clerk SECURELY (without restaurant):', data);
      return data;
    } catch (error) {
      console.error('❌ Error initializing user from Clerk:', error);
      throw new Error(`Error initializing user: ${error.message}`);
    }
  }

  /**
   * Crear restaurante para usuario existente
   */
  async createRestaurant(clerkUserId, restaurantData) {
    try {
      const { name, description } = restaurantData;

      console.log('🔍 Creating restaurant for user:', clerkUserId, { name, description });

      const { data, error } = await supabase.rpc('create_user_restaurant', {
        p_clerk_user_id: clerkUserId,
        p_restaurant_name: name,
        p_description: description || 'Descripción de tu restaurante - agrega información sobre tu cocina, especialidades y ambiente'
      });

      if (error) throw error;

      console.log('✅ Restaurant created successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ Error creating restaurant:', error);
      throw new Error(`Error creating restaurant: ${error.message}`);
    }
  }

  /**
   * Crear o actualizar usuario con restaurante por defecto
   */
  async createOrUpdateUser(userData) {
    try {
      const {
        clerk_user_id,
        email,
        first_name = null,
        last_name = null,
        phone = null,
        restaurant_name = 'Mi Restaurante'
      } = userData;

      console.log('🔍 Creating/updating admin portal user:', { clerk_user_id, email, first_name, last_name });

      // Usar la función SQL para crear usuario con restaurante
      const { data, error } = await supabase.rpc('create_user_with_default_restaurant', {
        p_clerk_user_id: clerk_user_id,
        p_email: email,
        p_first_name: first_name,
        p_last_name: last_name,
        p_restaurant_name: restaurant_name
      });

      if (error) throw error;

      console.log('✅ Admin portal user and restaurant created/updated:', data);
      return data;
    } catch (error) {
      console.error('❌ Error creating/updating admin portal user:', error);
      throw new Error(`Error creating/updating user: ${error.message}`);
    }
  }

  /**
   * Obtener usuario con su restaurante por Clerk ID
   */
  async getUserWithRestaurant(clerkUserId) {
    try {
      console.log('🔍 Getting admin portal user with restaurant:', clerkUserId);

      // Usar la función SQL para obtener usuario y restaurante
      const { data, error } = await supabase.rpc('get_user_with_restaurant', {
        p_clerk_user_id: clerkUserId
      });

      if (error) throw error;

      if (!data) {
        console.log('⚠️ Admin portal user not found:', clerkUserId);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Error getting admin portal user with restaurant:', error);
      throw new Error(`Error getting user: ${error.message}`);
    }
  }

  /**
   * Obtener solo información del usuario admin portal
   */
  async getUserByClerkId(clerkUserId) {
    try {
      const { data, error } = await supabase
        .from('user_admin_portal')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error;
      }

      return data;
    } catch (error) {
      throw new Error(`Error getting admin portal user by Clerk ID: ${error.message}`);
    }
  }

  /**
   * Actualizar información del usuario admin portal
   */
  async updateUser(clerkUserId, updateData) {
    try {
      const { first_name, last_name, phone } = updateData;

      const updateFields = {};
      if (first_name !== undefined) updateFields.first_name = first_name;
      if (last_name !== undefined) updateFields.last_name = last_name;
      if (phone !== undefined) updateFields.phone = phone;

      updateFields.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('user_admin_portal')
        .update(updateFields)
        .eq('clerk_user_id', clerkUserId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Admin portal user updated:', data);
      return data;
    } catch (error) {
      console.error('❌ Error updating admin portal user:', error);
      throw new Error(`Error updating user: ${error.message}`);
    }
  }

  // ===============================================
  // OPERACIONES DE RESTAURANTES
  // ===============================================

  /**
   * Obtener restaurante del usuario admin portal
   */
  async getUserRestaurant(clerkUserId) {
    try {
      // Primero obtener el user_id
      const user = await this.getUserByClerkId(clerkUserId);
      if (!user) {
        throw new Error('Admin portal user not found');
      }

      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      throw new Error(`Error getting user restaurant: ${error.message}`);
    }
  }

  /**
   * Actualizar información del restaurante
   */
  async updateRestaurant(clerkUserId, updateData) {
    try {
      console.log('🔄 [updateRestaurant] Starting update for user:', clerkUserId, 'with data:', updateData);
      // Primero verificar si el usuario tiene restaurante
      const restaurant = await this.getUserRestaurant(clerkUserId);

      if (!restaurant) {
        // Usuario no tiene restaurante, crear uno nuevo usando la función segura
        console.log('ℹ️ User has no restaurant, creating new one');

        const { data, error } = await supabase.rpc('create_user_restaurant', {
          p_clerk_user_id: clerkUserId,
          p_restaurant_name: updateData.name || 'Mi Restaurante',
          p_description: updateData.description || 'Descripción de tu restaurante - agrega información sobre tu cocina, especialidades y ambiente'
        });

        if (error) throw error;

        console.log('✅ Restaurant created:', data.restaurant);
        return data.restaurant;
      }

      // El usuario ya tiene restaurante, actualizarlo
      const user = await this.getUserByClerkId(clerkUserId);
      if (!user) {
        throw new Error('Admin portal user not found');
      }

      const {
        name,
        description,
        logo_url,
        banner_url,
        address,
        phone,
        email,
        opening_hours,
        order_notifications,
        email_notifications,
        sms_notifications,
        table_count
      } = updateData;

      const updateFields = {};
      if (name !== undefined) updateFields.name = name;
      if (description !== undefined) updateFields.description = description;
      if (logo_url !== undefined) updateFields.logo_url = logo_url;
      if (banner_url !== undefined) updateFields.banner_url = banner_url;
      if (address !== undefined) updateFields.address = address;
      if (phone !== undefined) updateFields.phone = phone;
      if (email !== undefined) updateFields.email = email;
      if (opening_hours !== undefined) {
        // Validar estructura de opening_hours
        this.validateOpeningHours(opening_hours);
        updateFields.opening_hours = opening_hours;
      }

      // Manejar configuraciones de notificaciones
      if (order_notifications !== undefined) {
        console.log('🔔 Setting order_notifications to:', order_notifications);
        updateFields.order_notifications = order_notifications;
      }
      if (email_notifications !== undefined) {
        console.log('📧 Setting email_notifications to:', email_notifications);
        updateFields.email_notifications = email_notifications;
      }
      if (sms_notifications !== undefined) {
        console.log('📱 Setting sms_notifications to:', sms_notifications);
        updateFields.sms_notifications = sms_notifications;
      }

      // Manejar table_count
      if (table_count !== undefined) {
        console.log('🏛️ Setting table_count to:', table_count);
        // Validar que table_count sea un número válido
        if (typeof table_count === 'number' && table_count >= 0 && table_count <= 100) {
          updateFields.table_count = table_count;
        } else if (typeof table_count === 'string' && !isNaN(table_count)) {
          const parsedTableCount = parseInt(table_count, 10);
          if (parsedTableCount >= 0 && parsedTableCount <= 100) {
            updateFields.table_count = parsedTableCount;
          } else {
            throw new Error('table_count debe estar entre 0 y 100');
          }
        } else {
          throw new Error('table_count debe ser un número válido entre 0 y 100');
        }
      }

      // Aplicar lógica de dependencias en el backend
      if (order_notifications === false) {
        console.log('⚠️ order_notifications is false, disabling email and sms');
        updateFields.email_notifications = false;
        updateFields.sms_notifications = false;
      }

      console.log('📊 Final updateFields:', updateFields);

      updateFields.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('restaurants')
        .update(updateFields)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Restaurant updated:', data);
      return data;
    } catch (error) {
      console.error('❌ Error updating restaurant:', error);
      throw new Error(`Error updating restaurant: ${error.message}`);
    }
  }

  /**
   * Obtener menú completo del usuario admin portal
   */
  async getUserCompleteMenu(clerkUserId) {
    try {
      console.log('🔍 Getting complete menu for admin portal user:', clerkUserId);

      const { data, error } = await supabase.rpc('get_user_complete_menu', {
        p_clerk_user_id: clerkUserId
      });

      if (error) throw error;

      console.log('✅ Complete menu retrieved:', data?.length || 0, 'sections');
      return data || [];
    } catch (error) {
      console.error('❌ Error getting complete menu:', error);
      throw new Error(`Error getting complete menu: ${error.message}`);
    }
  }


  // ===============================================
  // FUNCIONES DE VERIFICACIÓN Y VALIDACIÓN
  // ===============================================

  /**
   * Verificar si un usuario existe en el admin portal
   */
  async userExists(clerkUserId) {
    try {
      const user = await this.getUserByClerkId(clerkUserId);
      return !!user;
    } catch (error) {
      console.error('❌ Error checking if user exists:', error);
      return false;
    }
  }

  /**
   * Verificar si un usuario tiene restaurante configurado
   */
  async userHasRestaurant(clerkUserId) {
    try {
      const restaurant = await this.getUserRestaurant(clerkUserId);
      return !!restaurant;
    } catch (error) {
      console.error('❌ Error checking if user has restaurant:', error);
      return false;
    }
  }

  /**
   * Obtener estadísticas del usuario y su restaurante
   */
  async getUserStats(clerkUserId) {
    try {
      const userWithRestaurant = await this.getUserWithRestaurant(clerkUserId);

      if (!userWithRestaurant) {
        return null;
      }

      const { user, restaurant } = userWithRestaurant;

      // Obtener estadísticas del menú
      const menu = await this.getUserCompleteMenu(clerkUserId);

      const stats = {
        user: {
          id: user.id,
          email: user.email,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          created_at: user.created_at
        },
        restaurant: {
          id: restaurant?.id,
          name: restaurant?.name,
          has_logo: !!restaurant?.logo_url,
          has_banner: !!restaurant?.banner_url,
          has_description: !!restaurant?.description,
          created_at: restaurant?.created_at
        },
        menu: {
          total_sections: menu?.length || 0,
          total_items: menu?.reduce((acc, section) => acc + (section.items?.length || 0), 0) || 0,
          active_sections: menu?.filter(section => section.is_active)?.length || 0
        }
      };

      return stats;
    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      throw new Error(`Error getting user stats: ${error.message}`);
    }
  }

  /**
   * Validar estructura de opening_hours
   */
  validateOpeningHours(openingHours) {
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    if (!openingHours || typeof openingHours !== 'object') {
      throw new Error('opening_hours debe ser un objeto válido');
    }

    for (const day of validDays) {
      if (!openingHours[day]) {
        throw new Error(`Falta configuración para ${day}`);
      }

      const dayConfig = openingHours[day];

      // Validar campos requeridos
      if (typeof dayConfig.is_closed !== 'boolean') {
        throw new Error(`${day}: is_closed debe ser boolean`);
      }

      // Si no está cerrado, validar horarios
      if (!dayConfig.is_closed) {
        if (!dayConfig.open_time || !dayConfig.close_time) {
          throw new Error(`${day}: open_time y close_time son requeridos cuando no está cerrado`);
        }

        // Validar formato de tiempo (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(dayConfig.open_time)) {
          throw new Error(`${day}: open_time debe tener formato HH:MM`);
        }
        if (!timeRegex.test(dayConfig.close_time)) {
          throw new Error(`${day}: close_time debe tener formato HH:MM`);
        }

        // Validar que hora de apertura sea menor que hora de cierre
        const open = new Date(`2000-01-01T${dayConfig.open_time}:00`);
        const close = new Date(`2000-01-01T${dayConfig.close_time}:00`);

        if (open >= close) {
          throw new Error(`${day}: La hora de apertura debe ser menor que la hora de cierre`);
        }

        // Validar duración mínima (1 hora)
        const diffHours = (close.getTime() - open.getTime()) / (1000 * 60 * 60);
        if (diffHours < 1) {
          throw new Error(`${day}: El restaurante debe estar abierto al menos 1 hora`);
        }
      }
    }

    console.log('✅ opening_hours validado correctamente');
  }
}

module.exports = new UserAdminPortalService();