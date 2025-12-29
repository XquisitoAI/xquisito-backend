const supabase = require("../config/supabase");

class RestaurantService {
  // Obtener restaurante por ID
  async getRestaurantById(restaurantId) {
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", restaurantId)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new Error("Restaurant not found");
        }
        throw error;
      }

      return data;
    } catch (error) {
      throw new Error(`Error getting restaurant: ${error.message}`);
    }
  }

  // Obtener menú completo de un restaurante específico
  async getRestaurantMenu(restaurantId) {
    try {
      // Primero verificar que el restaurante existe
      const restaurant = await this.getRestaurantById(restaurantId);

      if (!restaurant) {
        throw new Error("Restaurant not found");
      }

      // Obtener todas las secciones del restaurante con sus items
      const { data: sections, error: sectionsError } = await supabase
        .from("menu_sections")
        .select(
          `
          id,
          name,
          is_active,
          display_order,
          restaurant_id,
          created_at,
          updated_at
        `
        )
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true });

      if (sectionsError) throw sectionsError;

      // Si no hay secciones, devolver array vacío
      if (!sections || sections.length === 0) {
        return [];
      }

      // Obtener todos los items de esas secciones
      const sectionIds = sections.map((s) => s.id);

      const { data: items, error: itemsError } = await supabase
        .from("menu_items")
        .select(
          `
          id,
          section_id,
          name,
          description,
          image_url,
          price,
          discount,
          custom_fields,
          is_available,
          display_order,
          created_at,
          updated_at
        `
        )
        .in("section_id", sectionIds)
        .eq("is_available", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true });

      if (itemsError) throw itemsError;

      // Agrupar items por sección
      const menu = sections.map((section) => ({
        ...section,
        items: (items || [])
          .filter((item) => item.section_id === section.id)
          .map((item) => ({
            ...item,
            custom_fields: this.parseCustomFields(item.custom_fields),
          })),
      }));

      return menu;
    } catch (error) {
      throw new Error(`Error getting restaurant menu: ${error.message}`);
    }
  }

  // Obtener restaurante con su menú completo
  async getRestaurantWithMenu(restaurantId) {
    try {
      const restaurant = await this.getRestaurantById(restaurantId);
      const menu = await this.getRestaurantMenu(restaurantId);

      return {
        restaurant,
        menu,
      };
    } catch (error) {
      throw new Error(`Error getting restaurant with menu: ${error.message}`);
    }
  }

  // Listar todos los restaurantes activos (para futuras funcionalidades)
  async getAllRestaurants() {
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Error getting restaurants: ${error.message}`);
    }
  }

  // Obtener sucursales de un restaurante
  async getRestaurantBranches(restaurantId) {
    try {
      // Primero verificar que el restaurante existe y obtener su client_id
      const restaurant = await this.getRestaurantById(restaurantId);

      if (!restaurant) {
        throw new Error("Restaurant not found");
      }

      // Si el restaurante no tiene client_id, devolver array vacío
      if (!restaurant.client_id) {
        console.warn(`Restaurant ${restaurantId} has no client_id`);
        return [];
      }

      // Obtener todas las sucursales activas del cliente
      const { data, error } = await supabase
        .from("branches")
        .select("id, client_id, branch_number, name, address, tables, active, created_at, updated_at")
        .eq("client_id", restaurant.client_id)
        .eq("active", true)
        .order("branch_number", { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new Error(`Error getting restaurant branches: ${error.message}`);
    }
  }

  // Validar que una mesa existe para una sucursal específica
  async validateTable(branchId, tableNumber) {
    try {
      const { error } = await supabase
        .from("tables")
        .select("id")
        .eq("branch_id", branchId)
        .eq("table_number", tableNumber)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No se encontró la mesa
          return false;
        }
        throw error;
      }

      return true;
    } catch (error) {
      console.error(`Error validating table: ${error.message}`);
      return false;
    }
  }

  async validateRoom(branchId, roomNumber) {
    try {
      const { error } = await supabase
        .from("rooms")
        .select("id")
        .eq("branch_id", branchId)
        .eq("room_number", roomNumber)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No se encontró la habitación
          return false;
        }
        throw error;
      }

      return true;
    } catch (error) {
      console.error(`Error validating room: ${error.message}`);
      return false;
    }
  }

  //Parsear custom_fields de JSON string a array
  parseCustomFields(customFields) {
    try {
      if (Array.isArray(customFields)) {
        return customFields;
      }

      if (typeof customFields === "string") {
        return JSON.parse(customFields);
      }

      if (customFields === null || customFields === undefined) {
        return [];
      }

      return [];
    } catch (error) {
      console.warn("Error parsing custom_fields:", error);
      return [];
    }
  }
}

module.exports = new RestaurantService();
