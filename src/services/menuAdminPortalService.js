const supabase = require("../config/supabase");
const userAdminPortalService = require("./userAdminPortalService");

class MenuAdminPortalService {
  // ===============================================
  // OPERACIONES DE SECCIONES CON RESTAURANT_ID
  // ===============================================

  /**
   * Obtener todas las secciones del restaurante del usuario
   */
  async getAllSections(clerkUserId) {
    try {
      // Obtener restaurant_id del usuario
      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);
      if (!restaurant) {
        // Usuario sin restaurante, devolver array vacío en lugar de error
        console.log('ℹ️ User has no restaurant, returning empty sections array');
        return [];
      }

      const { data, error } = await supabase
        .from("menu_sections")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Error getting menu sections: ${error.message}`);
    }
  }

  /**
   * Crear nueva sección para el restaurante del usuario
   */
  async createSection(clerkUserId, sectionData) {
    try {
      // Obtener restaurant_id del usuario
      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);
      if (!restaurant) {
        throw new Error('Restaurant not found for user');
      }

      const { name, display_order = 0 } = sectionData;

      const { data, error } = await supabase
        .from("menu_sections")
        .insert({
          restaurant_id: restaurant.id,
          name,
          display_order,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error creating menu section: ${error.message}`);
    }
  }

  /**
   * Actualizar sección (solo si pertenece al usuario)
   */
  async updateSection(clerkUserId, sectionId, sectionData) {
    try {
      // Verificar que la sección pertenezca al usuario
      const isOwner = await this.verifySectionOwnership(clerkUserId, sectionId);
      if (!isOwner) {
        throw new Error('Section not found or access denied');
      }

      const { name, is_active, display_order } = sectionData;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (display_order !== undefined) updateData.display_order = display_order;

      const { data, error } = await supabase
        .from("menu_sections")
        .update(updateData)
        .eq("id", sectionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error updating menu section: ${error.message}`);
    }
  }

  /**
   * Eliminar sección (solo si pertenece al usuario y no tiene platillos)
   */
  async deleteSection(clerkUserId, sectionId) {
    try {
      // Verificar que la sección pertenezca al usuario
      const isOwner = await this.verifySectionOwnership(clerkUserId, sectionId);
      if (!isOwner) {
        throw new Error('Section not found or access denied');
      }

      // Verificar si la sección tiene platillos
      const { data: items, error: itemsError } = await supabase
        .from("menu_items")
        .select("id")
        .eq("section_id", sectionId)
        .limit(1);

      if (itemsError) throw itemsError;

      if (items && items.length > 0) {
        throw new Error("Cannot delete section with existing menu items");
      }

      const { error } = await supabase
        .from("menu_sections")
        .delete()
        .eq("id", sectionId);

      if (error) throw error;
      return true;
    } catch (error) {
      throw new Error(`Error deleting menu section: ${error.message}`);
    }
  }

  /**
   * Reordenar secciones (solo secciones que pertenezcan al usuario)
   */
  async reorderSections(clerkUserId, sections) {
    try {
      // Obtener restaurant_id del usuario
      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);
      if (!restaurant) {
        throw new Error('Restaurant not found for user');
      }

      // Validar que todas las secciones pertenezcan al usuario
      for (const section of sections) {
        const isOwner = await this.verifySectionOwnership(clerkUserId, section.id);
        if (!isOwner) {
          throw new Error(`Section ${section.id} not found or access denied`);
        }
      }

      // Actualizar display_order de cada sección
      const updatePromises = sections.map(section => {
        return supabase
          .from("menu_sections")
          .update({ display_order: section.display_order })
          .eq("id", section.id)
          .eq("restaurant_id", restaurant.id); // Double check para seguridad
      });

      const results = await Promise.all(updatePromises);

      // Verificar si alguna actualización falló
      for (const result of results) {
        if (result.error) {
          throw result.error;
        }
      }

      return true;
    } catch (error) {
      throw new Error(`Error reordering menu sections: ${error.message}`);
    }
  }

  // ===============================================
  // OPERACIONES DE PLATILLOS CON RESTAURANT_ID
  // ===============================================

  /**
   * Obtener todos los platillos del restaurante del usuario filtrados por sucursal
   */
  async getAllItemsByBranch(clerkUserId, branchId = null) {
    try {
      // Obtener restaurant_id del usuario
      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);
      if (!restaurant) {
        // Usuario sin restaurante, devolver array vacío en lugar de error
        console.log('ℹ️ User has no restaurant, returning empty items array');
        return [];
      }

      if (branchId) {
        // Usar la función SQL que filtra por sucursal
        const { data, error } = await supabase.rpc('get_menu_by_branch', {
          p_restaurant_id: restaurant.id,
          p_branch_id: branchId
        });

        if (error) throw error;

        // Extraer los items de todas las secciones
        const items = [];
        if (data) {
          data.forEach(section => {
            if (section.items) {
              section.items.forEach(item => {
                // CRITICAL FIX: section_id is missing from get_menu_by_branch response
                // Add it manually from the parent section
                if (!item.section_id && section.id) {
                  item.section_id = section.id;
                }

                // Parse custom_fields si existe
                if (item.custom_fields) {
                  try {
                    item.custom_fields = typeof item.custom_fields === 'string'
                      ? JSON.parse(item.custom_fields)
                      : item.custom_fields;
                  } catch (e) {
                    item.custom_fields = [];
                  }
                }
                items.push(item);
              });
            }
          });
        }

        // Obtener availableBranches para cada item
        const itemIds = items.map(item => item.id);
        if (itemIds.length > 0) {
          const { data: branchData, error: branchError } = await supabase
            .from('item_branch_availability')
            .select('item_id, branch_id, is_available')
            .in('item_id', itemIds);

          if (!branchError && branchData) {
            // Crear un mapa de item_id -> availableBranches
            const branchMap = {};
            branchData.forEach(row => {
              if (row.is_available) {
                if (!branchMap[row.item_id]) {
                  branchMap[row.item_id] = [];
                }
                branchMap[row.item_id].push(row.branch_id);
              }
            });

            // Asignar availableBranches a cada item
            items.forEach(item => {
              item.availableBranches = branchMap[item.id] || [];
            });
          }
        }

        return items;
      } else {
        // Si no hay filtro de sucursal, devolver todos los items
        return this.getAllItems(clerkUserId);
      }
    } catch (error) {
      throw new Error(`Error getting menu items by branch: ${error.message}`);
    }
  }

  /**
   * Obtener todos los platillos del restaurante del usuario
   */
  async getAllItems(clerkUserId, filters = {}) {
    try {
      // Obtener restaurant_id del usuario
      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);
      if (!restaurant) {
        // Usuario sin restaurante, devolver array vacío en lugar de error
        console.log('ℹ️ User has no restaurant, returning empty items array');
        return [];
      }

      let query = supabase
        .from("menu_items")
        .select(`
          *,
          menu_sections!inner (
            id,
            name,
            is_active,
            restaurant_id
          ),
          item_branch_availability (
            branch_id,
            is_available
          )
        `)
        .eq("menu_sections.restaurant_id", restaurant.id)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true });

      // Filtros opcionales
      if (filters.section_id) {
        query = query.eq("section_id", filters.section_id);
      }

      if (filters.is_available !== undefined) {
        query = query.eq("is_available", filters.is_available);
      }

      if (filters.active_sections_only !== false) {
        query = query.eq("menu_sections.is_active", true);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Parse custom_fields and extract availableBranches
      const parsedData = (data || []).map(item => {
        // Extraer los IDs de sucursales donde el item está disponible
        const availableBranches = (item.item_branch_availability || [])
          .filter(iba => iba.is_available === true)
          .map(iba => iba.branch_id);

        return {
          ...item,
          custom_fields: this.parseCustomFields(item.custom_fields),
          availableBranches: availableBranches
        };
      });

      return parsedData;
    } catch (error) {
      throw new Error(`Error getting menu items: ${error.message}`);
    }
  }

  /**
   * Obtener platillo por ID (solo si pertenece al usuario)
   */
  async getItemById(clerkUserId, itemId) {
    try {
      // Verificar que el item pertenezca al usuario
      const isOwner = await this.verifyItemOwnership(clerkUserId, itemId);
      if (!isOwner) {
        throw new Error('Item not found or access denied');
      }

      const { data, error } = await supabase
        .from("menu_items")
        .select(`
          *,
          menu_sections (
            id,
            name,
            is_active,
            restaurant_id
          )
        `)
        .eq("id", itemId)
        .single();

      if (error) throw error;

      // Parse custom_fields from JSON string to array
      if (data) {
        data.custom_fields = this.parseCustomFields(data.custom_fields);
      }

      return data;
    } catch (error) {
      throw new Error(`Error getting menu item: ${error.message}`);
    }
  }

  /**
   * Crear nuevo platillo (solo en secciones del usuario)
   */
  async createItem(clerkUserId, itemData) {
    try {
      const { section_id } = itemData;

      // Verificar que la sección pertenezca al usuario
      const isOwner = await this.verifySectionOwnership(clerkUserId, section_id);
      if (!isOwner) {
        throw new Error('Section not found or access denied');
      }

      const {
        name,
        description,
        image_url,
        price,
        base_price,
        discount = 0,
        custom_fields = [],
        display_order = 0,
        availableBranches = [] // Array de branch IDs donde estará disponible
      } = itemData;

      const { data, error } = await supabase
        .from("menu_items")
        .insert({
          section_id,
          name,
          description,
          image_url,
          price,
          base_price,
          discount,
          custom_fields: JSON.stringify(custom_fields),
          display_order,
          is_available: true
        })
        .select(`
          *,
          menu_sections (
            id,
            name,
            is_active,
            restaurant_id
          )
        `)
        .single();

      if (error) throw error;

      // Parse custom_fields from JSON string to array
      if (data) {
        data.custom_fields = this.parseCustomFields(data.custom_fields);
      }

      // Set branch availability if branches are specified
      if (availableBranches && availableBranches.length >= 0) {
        try {
          const restaurantId = data.menu_sections.restaurant_id;

          const { error: branchError } = await supabase.rpc('set_item_branch_availability', {
            p_item_id: data.id,
            p_restaurant_id: restaurantId,
            p_selected_branch_ids: availableBranches
          });

          if (branchError) {
            console.error('Error setting branch availability:', branchError);
          }
        } catch (branchError) {
          console.error('Exception setting branch availability:', branchError);
        }
      }

      return data;
    } catch (error) {
      throw new Error(`Error creating menu item: ${error.message}`);
    }
  }

  /**
   * Actualizar platillo (solo si pertenece al usuario)
   */
  async updateItem(clerkUserId, itemId, itemData) {
    try {
      // Verificar que el item pertenezca al usuario
      const isOwner = await this.verifyItemOwnership(clerkUserId, itemId);
      if (!isOwner) {
        throw new Error('Item not found or access denied');
      }

      const {
        section_id,
        name,
        description,
        image_url,
        price,
        base_price,
        discount,
        custom_fields,
        is_available,
        display_order,
        availableBranches // Array de branch IDs donde estará disponible
      } = itemData;

      const updateData = {};
      if (section_id !== undefined) {
        // Verificar que la nueva sección también pertenezca al usuario
        const isSectionOwner = await this.verifySectionOwnership(clerkUserId, section_id);
        if (!isSectionOwner) {
          throw new Error('Target section not found or access denied');
        }
        updateData.section_id = section_id;
      }
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (image_url !== undefined) updateData.image_url = image_url;
      if (price !== undefined) updateData.price = price;
      if (base_price !== undefined) updateData.base_price = base_price;
      if (discount !== undefined) updateData.discount = discount;
      if (custom_fields !== undefined) updateData.custom_fields = JSON.stringify(custom_fields);
      if (is_available !== undefined) updateData.is_available = is_available;
      if (display_order !== undefined) updateData.display_order = display_order;

      const { data, error } = await supabase
        .from("menu_items")
        .update(updateData)
        .eq("id", itemId)
        .select(`
          *,
          menu_sections (
            id,
            name,
            is_active,
            restaurant_id
          )
        `)
        .single();

      if (error) throw error;

      // Parse custom_fields from JSON string to array
      if (data) {
        data.custom_fields = this.parseCustomFields(data.custom_fields);
      }

      // Set branch availability if branches are specified
      if (availableBranches !== undefined) {
        try {
          const restaurantId = data.menu_sections.restaurant_id;

          // Call the PostgreSQL function to set branch availability
          const { error: branchError } = await supabase.rpc('set_item_branch_availability', {
            p_item_id: data.id,
            p_restaurant_id: restaurantId,
            p_selected_branch_ids: availableBranches
          });

          if (branchError) {
            console.error('Error updating branch availability:', branchError);
            // Don't throw error here to avoid breaking item update
          }
        } catch (branchError) {
          console.error('Error updating branch availability:', branchError);
          // Continue without throwing error
        }
      }

      return data;
    } catch (error) {
      throw new Error(`Error updating menu item: ${error.message}`);
    }
  }

  /**
   * Eliminar platillo (solo si pertenece al usuario)
   */
  async deleteItem(clerkUserId, itemId) {
    try {
      // Verificar que el item pertenezca al usuario
      const isOwner = await this.verifyItemOwnership(clerkUserId, itemId);
      if (!isOwner) {
        throw new Error('Item not found or access denied');
      }

      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", itemId);

      if (error) throw error;
      return true;
    } catch (error) {
      throw new Error(`Error deleting menu item: ${error.message}`);
    }
  }

  // ===============================================
  // MÉTODOS DE VERIFICACIÓN
  // ===============================================

  /**
   * Verificar que una sección pertenezca al usuario
   */
  async verifySectionOwnership(clerkUserId, sectionId) {
    try {
      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);
      if (!restaurant) return false;

      const { data, error } = await supabase
        .from("menu_sections")
        .select("id")
        .eq("id", sectionId)
        .eq("restaurant_id", restaurant.id)
        .single();

      if (error) return false;
      return !!data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verificar que un item pertenezca al usuario
   */
  async verifyItemOwnership(clerkUserId, itemId) {
    try {
      const restaurant = await userAdminPortalService.getUserRestaurant(clerkUserId);
      if (!restaurant) return false;

      const { data, error } = await supabase
        .from("menu_items")
        .select(`
          id,
          menu_sections!inner (
            restaurant_id
          )
        `)
        .eq("id", itemId)
        .eq("menu_sections.restaurant_id", restaurant.id)
        .single();

      if (error) return false;
      return !!data;
    } catch (error) {
      return false;
    }
  }

  // ===============================================
  // MÉTODOS AUXILIARES
  // ===============================================

  /**
   * Parsear custom_fields de JSON string a array
   */
  parseCustomFields(customFields) {
    try {
      // Si ya es un array, devolverlo tal como está
      if (Array.isArray(customFields)) {
        return customFields;
      }

      // Si es string, intentar parsearlo
      if (typeof customFields === 'string') {
        return JSON.parse(customFields);
      }

      // Si es null o undefined, devolver array vacío
      if (customFields === null || customFields === undefined) {
        return [];
      }

      // Para cualquier otro tipo, devolver array vacío
      return [];
    } catch (error) {
      console.warn('Error parsing custom_fields:', error);
      return [];
    }
  }

  /**
   * Obtener menú completo del usuario (usar función SQL)
   */
  async getCompleteMenu(clerkUserId) {
    try {
      return await userAdminPortalService.getUserCompleteMenu(clerkUserId);
    } catch (error) {
      throw new Error(`Error getting complete menu: ${error.message}`);
    }
  }
}

module.exports = new MenuAdminPortalService();// Force restart
