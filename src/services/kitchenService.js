const supabase = require("../config/supabase");

class KitchenService {
  // Obtiene el restaurantId de un usuario Clerk
  async getRestaurantIdForUser(clerkUserId) {
    const { data, error } = await supabase.rpc("get_user_with_restaurant", {
      p_clerk_user_id: clerkUserId,
    });
    if (error) throw new Error(`Error getting restaurant: ${error.message}`);
    if (!data || !data.restaurant) throw new Error("Usuario sin restaurante");
    return data.restaurant.id;
  }

  // Órdenes activas de todos los tipos donde al menos 1 dish no está entregado
  async getActiveOrders(restaurantId) {
    const [tapOrders, pickOrders, roomOrders, tapPayOrders, flexBillOrders] =
      await Promise.all([
        this._getTapOrders(restaurantId),
        this._getPickAndGoOrders(restaurantId),
        this._getRoomOrders(restaurantId),
        this._getTapPayOrders(restaurantId),
        this._getFlexBillOrders(restaurantId),
      ]);

    return [
      ...tapOrders,
      ...pickOrders,
      ...roomOrders,
      ...tapPayOrders,
      ...flexBillOrders,
    ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  // Tap Order & Pay
  async _getTapOrders(restaurantId) {
    const { data, error } = await supabase
      .from("tap_orders_and_pay")
      .select(
        `id, order_status, created_at,
         tables!inner(table_number, restaurant_id),
         dish_order(id, item, quantity, status, images)`,
      )
      .eq("tables.restaurant_id", restaurantId);

    if (error) {
      console.error("[KITCHEN] tap orders:", error.message);
      return [];
    }

    return (data || [])
      .map((o) => ({
        id: o.id,
        orderType: "tap",
        identifier: `Mesa ${o.tables.table_number}`,
        createdAt: o.created_at,
        dishes: this._mapDishes(o.dish_order),
      }))
      .filter((o) => o.dishes.some((d) => d.status !== "delivered"));
  }

  // Pick & Go
  async _getPickAndGoOrders(restaurantId) {
    const { data, error } = await supabase
      .from("pick_and_go_orders")
      .select(
        `id, order_status, created_at, customer_name,
         dish_order(id, item, quantity, status, images)`,
      )
      .eq("restaurant_id", restaurantId);

    if (error) {
      console.error("[KITCHEN] pick&go orders:", error.message);
      return [];
    }

    return (data || [])
      .map((o) => ({
        id: o.id,
        orderType: "pick_and_go",
        identifier: `Pick & Go${o.customer_name ? ` - ${o.customer_name}` : ""}`,
        createdAt: o.created_at,
        dishes: this._mapDishes(o.dish_order),
      }))
      .filter((o) => o.dishes.some((d) => d.status !== "delivered"));
  }

  // Room Service
  async _getRoomOrders(restaurantId) {
    const { data, error } = await supabase
      .from("room_orders")
      .select(
        `id, order_status, created_at,
         rooms!inner(room_number, restaurant_id),
         dish_order(id, item, quantity, status, images)`,
      )
      .eq("rooms.restaurant_id", restaurantId);

    if (error) {
      console.error("[KITCHEN] room orders:", error.message);
      return [];
    }

    return (data || [])
      .map((o) => ({
        id: o.id,
        orderType: "room",
        identifier: `Cuarto ${o.rooms.room_number}`,
        createdAt: o.created_at,
        dishes: this._mapDishes(o.dish_order),
      }))
      .filter((o) => o.dishes.some((d) => d.status !== "delivered"));
  }

  // Tap & Pay
  async _getTapPayOrders(restaurantId) {
    const { data, error } = await supabase
      .from("tap_pay_orders")
      .select(
        `id, order_status, created_at,
         tables(table_number),
         dish_order(id, item, quantity, status, images)`,
      )
      .eq("restaurant_id", restaurantId);

    if (error) {
      console.error("[KITCHEN] tap pay orders:", error.message);
      return [];
    }

    return (data || [])
      .map((o) => ({
        id: o.id,
        orderType: "tap_pay",
        identifier: o.tables ? `Mesa ${o.tables.table_number}` : "Tap & Pay",
        createdAt: o.created_at,
        dishes: this._mapDishes(o.dish_order),
      }))
      .filter((o) => o.dishes.some((d) => d.status !== "delivered"));
  }

  // FlexBill: table_order → user_order → dish_order (via user_order_id)
  async _getFlexBillOrders(restaurantId) {
    const { data, error } = await supabase
      .from("table_order")
      .select(
        `id, status, created_at,
         tables(table_number),
         user_order(
           id,
           dish_order(id, item, quantity, status, images)
         )`,
      )
      .eq("restaurant_id", restaurantId);

    if (error) {
      console.error("[KITCHEN] flexbill orders:", error.message);
      return [];
    }

    return (data || [])
      .map((o) => {
        // Aplanar dishes de todos los user_orders dentro de la mesa
        const allDishes = (o.user_order || []).flatMap(
          (uo) => uo.dish_order || [],
        );
        return {
          id: o.id,
          orderType: "flex_bill",
          identifier: o.tables ? `Mesa ${o.tables.table_number}` : "FlexBill",
          createdAt: o.created_at,
          dishes: this._mapDishes(allDishes),
        };
      })
      .filter((o) => o.dishes.some((d) => d.status !== "delivered"));
  }

  _mapDishes(dishes) {
    return (dishes || []).map((d) => ({
      id: d.id,
      item: d.item,
      quantity: d.quantity,
      status: d.status,
      images: d.images || [],
    }));
  }

  // Guarda o actualiza token FCM de un dispositivo
  async saveFcmToken(restaurantId, token, platform) {
    const { error } = await supabase
      .from("kitchen_push_subscriptions")
      .upsert(
        { restaurant_id: restaurantId, token, platform },
        { onConflict: "token" },
      );

    if (error) throw new Error(`Error saving FCM token: ${error.message}`);
    return { success: true };
  }

  // Obtiene todos los tokens FCM de un restaurante
  async getFcmTokens(restaurantId) {
    const { data, error } = await supabase
      .from("kitchen_push_subscriptions")
      .select("token, platform")
      .eq("restaurant_id", restaurantId);

    if (error) throw new Error(`Error getting FCM tokens: ${error.message}`);
    return data || [];
  }
}

module.exports = new KitchenService();
