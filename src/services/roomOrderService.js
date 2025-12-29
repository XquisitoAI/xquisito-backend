const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

class RoomOrderService {
  // Obtener orden activa de una habitación
  async getActiveRoomOrder(restaurantId, branchNumber, roomNumber) {
    try {
      // 1. Obtener room_id
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("room_number", roomNumber)
        .single();

      if (roomError || !room) {
        throw new Error(
          `Room ${roomNumber} not found for restaurant ${restaurantId}`
        );
      }

      // 2. Obtener orden activa con relaciones
      const { data, error } = await supabase
        .from("room_orders")
        .select(
          `
          *,
          room:rooms!room_orders_room_id_fkey(
            id,
            room_number,
            restaurant_id,
            status
          ),
          dishes:dish_order!dish_order_room_order_id_fkey(
            id,
            item,
            quantity,
            price,
            extra_price,
            status,
            payment_status,
            images,
            custom_fields,
            user_order_id
          )
        `
        )
        .eq("room_id", room.id)
        .eq("order_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (!data) return null;

      // 3. Calcular resumen
      const summary = {
        total_dishes: data.dishes?.length || 0,
        total_items: data.dishes?.reduce((sum, d) => sum + d.quantity, 0) || 0,
        calculated_total: parseFloat(data.total_amount) || 0,
      };

      return {
        room_order: data,
        room: data.room,
        dishes: data.dishes || [],
        summary,
      };
    } catch (error) {
      console.error("Error getting active room order:", error);
      throw error;
    }
  }

  // Obtener orden por ID
  async getRoomOrderById(orderId) {
    try {
      const { data, error } = await supabase
        .from("room_orders")
        .select(
          `
          *,
          room:rooms!room_orders_room_id_fkey(
            id,
            room_number,
            restaurant_id,
            status
          ),
          dishes:dish_order!dish_order_room_order_id_fkey(
            id,
            item,
            quantity,
            price,
            extra_price,
            status,
            payment_status,
            images,
            custom_fields,
            user_order_id
          )
        `
        )
        .eq("id", orderId)
        .single();

      if (error) throw error;

      const summary = {
        total_dishes: data.dishes?.length || 0,
        total_items: data.dishes?.reduce((sum, d) => sum + d.quantity, 0) || 0,
        calculated_total: parseFloat(data.total_amount) || 0,
      };

      return {
        room_order: data,
        room: data.room,
        dishes: data.dishes || [],
        summary,
      };
    } catch (error) {
      console.error("Error getting room order by ID:", error);
      throw error;
    }
  }

  // Crear orden con primer platillo usando stored procedure
  async createOrderWithFirstDish(params) {
    try {
      const { data, error } = await supabase.rpc(
        "create_room_order_with_first_dish",
        {
          p_restaurant_id: parseInt(params.restaurantId),
          p_branch_number: parseInt(params.branchNumber),
          p_room_number: parseInt(params.roomNumber),
          p_item_name: params.itemName,
          p_quantity: params.quantity,
          p_price: parseFloat(params.price),
          p_extra_price: parseFloat(params.extraPrice) || 0,
          p_customer_name: params.customerName || null,
          p_customer_phone: params.customerPhone || null,
          p_user_id: params.userId || null,
          p_images: params.images || [],
          p_custom_fields: params.customFields || {},
        }
      );

      if (error) {
        console.error("Error creating order with first dish:", error);
        throw error;
      }

      return data; // Retorna JSON con room_order_id, dish_order_id, etc.
    } catch (error) {
      console.error("Error in createOrderWithFirstDish:", error);
      throw error;
    }
  }

  // Actualizar estado de pago
  async updatePaymentStatus(orderId, paymentStatus) {
    try {
      const { data, error } = await supabase
        .from("room_orders")
        .update({
          payment_status: paymentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error("Error updating payment status:", error);
      throw error;
    }
  }

  // Actualizar estado de orden
  async updateOrderStatus(orderId, orderStatus) {
    try {
      const { data, error } = await supabase
        .from("room_orders")
        .update({
          order_status: orderStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error("Error updating order status:", error);
      throw error;
    }
  }

  // Marcar platillo como pagado
  async markDishAsPaid(dishOrderId) {
    try {
      // Usar stored procedure
      const { error } = await supabase.rpc("mark_room_dish_as_paid", {
        p_dish_order_id: dishOrderId,
      });

      if (error) throw error;

      // Obtener el dish actualizado
      const { data: dish, error: dishError } = await supabase
        .from("dish_order")
        .select("*")
        .eq("id", dishOrderId)
        .single();

      if (dishError) throw dishError;

      return dish;
    } catch (error) {
      console.error("Error marking dish as paid:", error);
      throw error;
    }
  }

  // Recalcular total de orden
  async recalculateTotal(roomOrderId) {
    try {
      const { data, error } = await supabase.rpc(
        "recalculate_room_order_total",
        {
          p_room_order_id: roomOrderId,
        }
      );

      if (error) throw error;

      return data; // Retorna el nuevo total
    } catch (error) {
      console.error("Error recalculating total:", error);
      throw error;
    }
  }

  // Agregar platillo a orden existente
  async addDishToOrder(roomOrderId, dishData) {
    try {
      // 1. Verificar que la orden existe y está activa
      const { data: order, error: orderError } = await supabase
        .from("room_orders")
        .select("id, order_status")
        .eq("id", roomOrderId)
        .single();

      if (orderError || !order) {
        throw new Error("Room order not found");
      }

      if (order.order_status !== "pending") {
        throw new Error("Cannot add dishes to completed orders");
      }

      // 2. Crear dish_order (sin user_order_id porque room service no usa user_order)
      // NOTA: NO incluir total_price, esa columna no existe en dish_order
      const { data: dish, error: dishError } = await supabase
        .from("dish_order")
        .insert({
          user_order_id: null,
          room_order_id: roomOrderId,
          item: dishData.itemName,
          quantity: dishData.quantity,
          price: parseFloat(dishData.price),
          extra_price: parseFloat(dishData.extraPrice || 0),
          images: dishData.images || [],
          custom_fields: dishData.customFields || {},
          status: "pending",
          payment_status: "not_paid",
        })
        .select()
        .single();

      if (dishError) throw dishError;

      // 4. Recalcular total de la orden
      await this.recalculateTotal(roomOrderId);

      return dish;
    } catch (error) {
      console.error("Error adding dish to order:", error);
      throw error;
    }
  }
}

module.exports = new RoomOrderService();
