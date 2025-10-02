const supabase = require("../config/supabase");

class MenuService {
  // ===============================================
  // OPERACIONES DE SECCIONES
  // ===============================================

  /**
   * Obtener todas las secciones del menú
   */
  async getAllSections() {
    try {
      const { data, error } = await supabase
        .from("menu_sections")
        .select("*")
        .order("display_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Error getting menu sections: ${error.message}`);
    }
  }

  /**
   * Crear nueva sección
   */
  async createSection(sectionData) {
    try {
      const { name, display_order = 0 } = sectionData;

      const { data, error } = await supabase
        .from("menu_sections")
        .insert({
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
   * Actualizar sección
   */
  async updateSection(sectionId, sectionData) {
    try {
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
   * Eliminar sección (solo si no tiene platillos)
   */
  async deleteSection(sectionId) {
    try {
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
   * Reordenar secciones
   */
  async reorderSections(sectionsOrder) {
    try {
      // sectionsOrder debe ser un array de objetos: [{"id": 1, "display_order": 0}, ...]
      const { data, error } = await supabase.rpc("reorder_menu_sections", {
        section_orders: sectionsOrder
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error reordering menu sections: ${error.message}`);
    }
  }

  // ===============================================
  // OPERACIONES DE PLATILLOS
  // ===============================================

  /**
   * Obtener todos los platillos (con filtros opcionales)
   */
  async getAllItems(filters = {}) {
    try {
      let query = supabase
        .from("menu_items")
        .select(`
          *,
          menu_sections!inner (
            id,
            name,
            is_active
          )
        `)
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

      // Parse custom_fields from JSON string to array
      const parsedData = (data || []).map(item => ({
        ...item,
        custom_fields: this.parseCustomFields(item.custom_fields)
      }));

      return parsedData;
    } catch (error) {
      throw new Error(`Error getting menu items: ${error.message}`);
    }
  }

  /**
   * Obtener platillo por ID
   */
  async getItemById(itemId) {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select(`
          *,
          menu_sections (
            id,
            name,
            is_active
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
   * Crear nuevo platillo
   */
  async createItem(itemData) {
    try {
      const {
        section_id,
        name,
        description,
        image_url,
        price,
        discount = 0,
        custom_fields = [],
        display_order = 0
      } = itemData;

      // Validar que la sección existe y está activa
      const { data: section, error: sectionError } = await supabase
        .from("menu_sections")
        .select("id, is_active")
        .eq("id", section_id)
        .single();

      if (sectionError || !section) {
        throw new Error("Menu section not found");
      }

      if (!section.is_active) {
        throw new Error("Cannot add items to inactive section");
      }

      const { data, error } = await supabase
        .from("menu_items")
        .insert({
          section_id,
          name,
          description,
          image_url,
          price,
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
            is_active
          )
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error creating menu item: ${error.message}`);
    }
  }

  /**
   * Actualizar platillo
   */
  async updateItem(itemId, itemData) {
    try {
      const {
        section_id,
        name,
        description,
        image_url,
        price,
        discount,
        custom_fields,
        is_available,
        display_order
      } = itemData;

      const updateData = {};
      if (section_id !== undefined) updateData.section_id = section_id;
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (image_url !== undefined) updateData.image_url = image_url;
      if (price !== undefined) updateData.price = price;
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
            is_active
          )
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error updating menu item: ${error.message}`);
    }
  }

  /**
   * Eliminar platillo
   */
  async deleteItem(itemId) {
    try {
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
  // OPERACIONES ESPECIALES
  // ===============================================

  /**
   * Obtener menú completo (secciones con sus platillos)
   */
  async getCompleteMenu() {
    try {
      const { data, error } = await supabase.rpc("get_complete_menu");

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Error getting complete menu: ${error.message}`);
    }
  }

  /**
   * Obtener estadísticas del menú
   */
  async getMenuStats() {
    try {
      const { data: sections, error: sectionsError } = await supabase
        .from("menu_sections")
        .select("id, name, is_active");

      if (sectionsError) throw sectionsError;

      const { data: items, error: itemsError } = await supabase
        .from("menu_items")
        .select("section_id, is_available");

      if (itemsError) throw itemsError;

      // Calcular estadísticas
      const stats = {
        total_sections: sections.length,
        active_sections: sections.filter(s => s.is_active).length,
        total_items: items.length,
        available_items: items.filter(i => i.is_available).length,
        items_by_section: {}
      };

      sections.forEach(section => {
        const sectionItems = items.filter(i => i.section_id === section.id);
        stats.items_by_section[section.name] = {
          total: sectionItems.length,
          available: sectionItems.filter(i => i.is_available).length
        };
      });

      return stats;
    } catch (error) {
      throw new Error(`Error getting menu stats: ${error.message}`);
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
}

module.exports = new MenuService();