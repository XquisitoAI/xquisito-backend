const supabase = require("../config/supabase");

class CartService {
  // Agregar item al carrito
  async addToCart(
    userId,
    menuItemId,
    quantity = 1,
    customFields = [],
    extraPrice = 0,
    restaurantId = null
  ) {
    try {
      const { user_id, guest_id } = userId;

      const { data, error } = await supabase.rpc("add_to_cart", {
        p_menu_item_id: menuItemId,
        p_user_id: user_id || null,
        p_guest_id: guest_id || null,
        p_quantity: quantity,
        p_custom_fields: customFields,
        p_extra_price: extraPrice,
        p_restaurant_id: restaurantId,
      });

      if (error) throw error;
      return data; // Retorna el cart_item_id
    } catch (error) {
      throw new Error(`Error adding to cart: ${error.message}`);
    }
  }

  //Obtener carrito completo del usuario
  async getCart(userId, restaurantId = null) {
    try {
      const { user_id, guest_id } = userId;

      const { data, error } = await supabase.rpc("get_cart", {
        p_user_id: user_id || null,
        p_guest_id: guest_id || null,
        p_restaurant_id: restaurantId,
      });

      if (error) throw error;

      // Agrupar items por carrito (aunque debería ser solo uno)
      if (!data || data.length === 0) {
        return {
          cart_id: null,
          items: [],
          total_items: 0,
          total_amount: 0,
        };
      }

      // Parsear custom_fields
      const items = data
        .filter((row) => row.cart_item_id !== null) // Filtrar filas sin items
        .map((row) => ({
          id: row.cart_item_id,
          menu_item_id: row.menu_item_id,
          name: row.item_name,
          description: row.item_description,
          images: row.item_images || [],
          features: row.item_features || [],
          quantity: row.quantity,
          price: parseFloat(row.unit_price),
          discount: row.discount,
          extraPrice: parseFloat(row.extra_price || 0),
          customFields: this.parseCustomFields(row.custom_fields),
          subtotal: parseFloat(row.subtotal),
        }));

      return {
        cart_id: data[0].cart_id,
        items: items,
        total_items: data[0].total_items,
        total_amount: parseFloat(data[0].total_amount),
      };
    } catch (error) {
      throw new Error(`Error getting cart: ${error.message}`);
    }
  }

  // Actualizar cantidad de un item en el carrito
  async updateCartItemQuantity(cartItemId, quantity) {
    try {
      const { data, error } = await supabase.rpc("update_cart_item_quantity", {
        p_cart_item_id: cartItemId,
        p_quantity: quantity,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error updating cart item quantity: ${error.message}`);
    }
  }

  // Eliminar item del carrito
  async removeFromCart(cartItemId) {
    try {
      const { data, error } = await supabase.rpc("remove_from_cart", {
        p_cart_item_id: cartItemId,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error removing from cart: ${error.message}`);
    }
  }

  // Limpiar carrito completo
  async clearCart(userId, restaurantId = null) {
    try {
      const { user_id, guest_id } = userId;

      const { data, error } = await supabase.rpc("clear_cart", {
        p_user_id: user_id || null,
        p_guest_id: guest_id || null,
        p_restaurant_id: restaurantId,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error clearing cart: ${error.message}`);
    }
  }

  // Obtener totales del carrito (rápido, sin items)
  async getCartTotals(userId, restaurantId = null) {
    try {
      const { user_id, guest_id } = userId;

      let query = supabase
        .from("carts")
        .select("id, total_items, total_amount")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (user_id) {
        query = query.eq("user_id", user_id);
      } else {
        query = query.eq("guest_id", guest_id);
      }

      if (restaurantId) {
        query = query.eq("restaurant_id", restaurantId);
      }

      const { data, error } = await query.single();

      if (error) {
        // Si no hay carrito, retornar valores por defecto
        if (error.code === "PGRST116") {
          return {
            cart_id: null,
            total_items: 0,
            total_amount: 0,
          };
        }
        throw error;
      }

      return {
        cart_id: data.id,
        total_items: data.total_items,
        total_amount: parseFloat(data.total_amount),
      };
    } catch (error) {
      throw new Error(`Error getting cart totals: ${error.message}`);
    }
  }

  // Migrar carrito de invitado a usuario autenticado
  async migrateGuestCartToUser(guestId, userId, restaurantId = null) {
    try {
      const { data, error } = await supabase.rpc("migrate_guest_cart_to_user", {
        p_guest_id: guestId,
        p_user_id: userId,
        p_restaurant_id: restaurantId,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error migrating guest cart: ${error.message}`);
    }
  }

  // Parsear custom_fields de JSONB a array
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

module.exports = new CartService();
