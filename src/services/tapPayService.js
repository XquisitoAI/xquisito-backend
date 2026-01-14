const supabase = require("../config/supabase");

class TapPayService {
  async getActiveOrderByTable(restaurantId, branchNumber, tableNumber) {
    try {
      const { data, error } = await supabase.rpc(
        "get_tap_pay_order_by_table",
        {
          p_restaurant_id: restaurantId,
          p_branch_number: branchNumber,
          p_table_number: tableNumber,
        }
      );

      if (error) {
        console.error("Error getting active order:", error);
        throw error;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error("Error in getActiveOrderByTable:", error);
      throw error;
    }
  }

  async getOrderById(orderId) {
    try {
      const { data, error } = await supabase.rpc("get_tap_pay_order_by_id", {
        p_order_id: orderId,
      });

      if (error) {
        console.error("Error getting order by ID:", error);
        throw error;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error("Error in getOrderById:", error);
      throw error;
    }
  }

  async getOrderItems(orderId) {
    try {
      const { data, error } = await supabase
        .from("dish_order")
        .select("*")
        .eq("tap_pay_order_id", orderId);

      if (error) {
        console.error("Error getting order items:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Error in getOrderItems:", error);
      throw error;
    }
  }

  async createOrder({
    restaurantId,
    branchNumber,
    tableNumber,
    customerName,
    customerPhone,
    customerEmail,
    userId,
    guestId,
    items,
  }) {
    try {
      const { data, error } = await supabase.rpc("create_tap_pay_order", {
        p_restaurant_id: restaurantId,
        p_branch_number: branchNumber,
        p_table_number: tableNumber,
        p_customer_name: customerName,
        p_customer_phone: customerPhone || null,
        p_customer_email: customerEmail || null,
        p_user_id: userId || null,
        p_guest_id: guestId || null,
        p_items: items,
      });

      if (error) {
        console.error("Error creating order:", error);
        throw error;
      }

      const orderId = data;
      return await this.getOrderById(orderId);
    } catch (error) {
      console.error("Error in createOrder:", error);
      throw error;
    }
  }

  async processPayment({
    orderId,
    paymentType,
    amount,
    tipAmount,
    paymentMethodId,
    selectedItems,
    userId,
    guestName,
  }) {
    try {
      let result;

      switch (paymentType) {
        case "full-bill":
          result = await this.payFullBill(orderId, tipAmount, paymentMethodId, userId, guestName);
          break;
        case "select-items":
          result = await this.paySelectedItems(orderId, selectedItems, tipAmount, paymentMethodId, userId, guestName);
          break;
        case "equal-shares":
          result = await this.payEqualShare(orderId, tipAmount, paymentMethodId, userId, guestName);
          break;
        case "choose-amount":
          result = await this.payChooseAmount(orderId, amount, tipAmount, paymentMethodId, userId, guestName);
          break;
        default:
          throw new Error(`Tipo de pago no soportado: ${paymentType}`);
      }

      await this.checkAndCompleteOrder(orderId);

      return result;
    } catch (error) {
      console.error("Error in processPayment:", error);
      throw error;
    }
  }

  async payFullBill(orderId, tipAmount, paymentMethodId, userId, guestName) {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) {
        throw new Error("Orden no encontrada");
      }

      const totalAmount = parseFloat(order.total_amount) + (tipAmount || 0);

      const { data: transaction, error: transactionError } = await supabase
        .from("payment_transactions")
        .insert({
          id_tap_pay_order: orderId,
          total_amount_charged: totalAmount,
          tip_amount: tipAmount || 0,
          payment_method_id: paymentMethodId,
        })
        .select()
        .single();

      if (transactionError) {
        console.error("Error creating transaction:", transactionError);
        throw transactionError;
      }

      const { error: updateError } = await supabase.rpc(
        "update_tap_pay_order_paid_amount",
        {
          p_order_id: orderId,
          p_amount_to_add: totalAmount,
        }
      );

      if (updateError) {
        console.error("Error updating paid amount:", updateError);
        throw updateError;
      }

      const items = order.items || [];
      for (const item of items) {
        await supabase
          .from("dish_order")
          .update({ payment_status: "paid" })
          .eq("id", item.id);
      }

      await this.addOrUpdateActiveUser(orderId, userId, guestName, totalAmount);

      return {
        transaction_id: transaction.id,
        amount_paid: totalAmount,
        remaining_amount: 0,
      };
    } catch (error) {
      console.error("Error in payFullBill:", error);
      throw error;
    }
  }

  async paySelectedItems(orderId, selectedItems, tipAmount, paymentMethodId, userId, guestName) {
    try {
      if (!selectedItems || selectedItems.length === 0) {
        throw new Error("No se han seleccionado items");
      }

      const { data: dishes, error: dishesError } = await supabase
        .from("dish_order")
        .select("*")
        .in("id", selectedItems);

      if (dishesError) throw dishesError;

      const itemsTotal = dishes.reduce((sum, dish) => {
        return sum + (parseFloat(dish.price) + parseFloat(dish.extra_price || 0)) * dish.quantity;
      }, 0);

      const totalAmount = itemsTotal + (tipAmount || 0);

      const { data: transaction, error: transactionError } = await supabase
        .from("payment_transactions")
        .insert({
          id_tap_pay_order: orderId,
          total_amount_charged: totalAmount,
          tip_amount: tipAmount || 0,
          payment_method_id: paymentMethodId,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      const { error: updateError } = await supabase.rpc(
        "update_tap_pay_order_paid_amount",
        {
          p_order_id: orderId,
          p_amount_to_add: totalAmount,
        }
      );

      if (updateError) throw updateError;

      for (const dishId of selectedItems) {
        await supabase
          .from("dish_order")
          .update({ payment_status: "paid" })
          .eq("id", dishId);
      }

      await this.addOrUpdateActiveUser(orderId, userId, guestName, totalAmount);

      return {
        transaction_id: transaction.id,
        amount_paid: totalAmount,
        items_paid: selectedItems.length,
      };
    } catch (error) {
      console.error("Error in paySelectedItems:", error);
      throw error;
    }
  }

  async payEqualShare(orderId, tipAmount, paymentMethodId, userId, guestId, guestName) {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) {
        throw new Error("Orden no encontrada");
      }

      if (!order.is_split_active || !order.number_of_splits) {
        throw new Error("División de cuenta no está activa");
      }

      const splitAmount = parseFloat(order.remaining_amount) / order.number_of_splits;
      const totalAmount = splitAmount + (tipAmount || 0);

      // TODO: Descomentar cuando se agregue restaurant_id al flujo
      // const { data: transaction, error: transactionError } = await supabase
      //   .from("payment_transactions")
      //   .insert({
      //     id_tap_pay_order: orderId,
      //     total_amount_charged: totalAmount,
      //     tip_amount: tipAmount || 0,
      //     payment_method_id: paymentMethodId,
      //     restaurant_id: restaurantId, // Falta este campo
      //   })
      //   .select()
      //   .single();

      // if (transactionError) throw transactionError;

      const { error: updateError } = await supabase.rpc(
        "update_tap_pay_order_paid_amount",
        {
          p_order_id: orderId,
          p_amount_to_add: totalAmount,
        }
      );

      if (updateError) throw updateError;

      await this.addOrUpdateActiveUser(orderId, userId, guestId, guestName, totalAmount);

      const { error: splitError } = await supabase
        .from("tap_pay_orders")
        .update({ number_of_splits: order.number_of_splits - 1 })
        .eq("id", orderId);

      if (splitError) throw splitError;

      return {
        transaction_id: `temp-${Date.now()}`, // Temporal hasta que se implemente correctamente
        amount_paid: totalAmount,
        split_amount: splitAmount,
      };
    } catch (error) {
      console.error("Error in payEqualShare:", error);
      throw error;
    }
  }

  async payChooseAmount(orderId, amount, tipAmount, paymentMethodId, userId, guestId, guestName) {
    try {
      if (!amount || amount <= 0) {
        throw new Error("Monto inválido");
      }

      const totalAmount = parseFloat(amount) + (tipAmount || 0);

      // TODO: Descomentar cuando se agregue restaurant_id al flujo
      // const { data: transaction, error: transactionError } = await supabase
      //   .from("payment_transactions")
      //   .insert({
      //     id_tap_pay_order: orderId,
      //     total_amount_charged: totalAmount,
      //     tip_amount: tipAmount || 0,
      //     payment_method_id: paymentMethodId,
      //     restaurant_id: restaurantId, // Falta este campo
      //   })
      //   .select()
      //   .single();

      // if (transactionError) throw transactionError;

      const { error: updateError } = await supabase.rpc(
        "update_tap_pay_order_paid_amount",
        {
          p_order_id: orderId,
          p_amount_to_add: totalAmount,
        }
      );

      if (updateError) throw updateError;

      await this.addOrUpdateActiveUser(orderId, userId, guestId, guestName, totalAmount);

      return {
        transaction_id: `temp-${Date.now()}`, // Temporal hasta que se implemente correctamente
        amount_paid: totalAmount,
      };
    } catch (error) {
      console.error("Error in payChooseAmount:", error);
      throw error;
    }
  }

  async payDishOrder(dishId, paymentMethodId) {
    try {
      const { data: dish, error: dishError } = await supabase
        .from("dish_order")
        .select("*, tap_pay_order_id")
        .eq("id", dishId)
        .single();

      if (dishError || !dish) {
        throw new Error("Platillo no encontrado");
      }

      const totalPrice = (parseFloat(dish.price) + parseFloat(dish.extra_price || 0)) * dish.quantity;

      // TODO: Descomentar cuando se agregue restaurant_id al flujo
      // const { error: transactionError } = await supabase
      //   .from("payment_transactions")
      //   .insert({
      //     id_tap_pay_order: dish.tap_pay_order_id,
      //     total_amount_charged: totalPrice,
      //     tip_amount: 0,
      //     payment_method_id: paymentMethodId,
      //     restaurant_id: restaurantId, // Falta este campo
      //   });

      // if (transactionError) throw transactionError;

      const { error: updateDishError } = await supabase
        .from("dish_order")
        .update({ payment_status: "paid" })
        .eq("id", dishId);

      if (updateDishError) throw updateDishError;

      const { error: updateOrderError } = await supabase.rpc(
        "update_tap_pay_order_paid_amount",
        {
          p_order_id: dish.tap_pay_order_id,
          p_amount_to_add: totalPrice,
        }
      );

      if (updateOrderError) throw updateOrderError;

      await this.checkAndCompleteOrder(dish.tap_pay_order_id);

      return true;
    } catch (error) {
      console.error("Error in payDishOrder:", error);
      throw error;
    }
  }

  async payOrderAmount({ orderId, amount, paymentMethodId, userId, guestId, guestName }) {
    try {
      return await this.payChooseAmount(orderId, amount, 0, paymentMethodId, userId, guestId, guestName);
    } catch (error) {
      console.error("Error in payOrderAmount:", error);
      throw error;
    }
  }

  async initializeSplitBill({ orderId, numberOfPeople, userIds, guestNames }) {
    try {
      const { error } = await supabase
        .from("tap_pay_orders")
        .update({
          is_split_active: true,
          split_method: "equal-shares",
          number_of_splits: numberOfPeople,
        })
        .eq("id", orderId);

      if (error) {
        console.error("Error initializing split bill:", error);
        throw error;
      }

      for (let i = 0; i < numberOfPeople; i++) {
        await supabase.from("active_tap_pay_users").insert({
          tap_pay_order_id: orderId,
          user_id: userIds[i] || null,
          guest_name: guestNames[i] || `Invitado ${i + 1}`,
          amount_paid: 0,
        });
      }

      return {
        orderId,
        numberOfPeople,
        splitActive: true,
      };
    } catch (error) {
      console.error("Error in initializeSplitBill:", error);
      throw error;
    }
  }

  async paySplitAmount({ orderId, userId, guestId, guestName, paymentMethodId }) {
    try {
      return await this.payEqualShare(orderId, 0, paymentMethodId, userId, guestId, guestName);
    } catch (error) {
      console.error("Error in paySplitAmount:", error);
      throw error;
    }
  }

  async getSplitPaymentStatus(orderId) {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) {
        throw new Error("Orden no encontrada");
      }

      const { data: activeUsers, error: usersError } = await supabase
        .from("active_tap_pay_users")
        .select("*")
        .eq("tap_pay_order_id", orderId);

      if (usersError) throw usersError;

      return {
        orderId,
        is_split_active: order.is_split_active,
        split_method: order.split_method,
        number_of_splits: order.number_of_splits,
        total_amount: order.total_amount,
        paid_amount: order.paid_amount,
        remaining_amount: order.remaining_amount,
        active_users: activeUsers || [],
      };
    } catch (error) {
      console.error("Error in getSplitPaymentStatus:", error);
      throw error;
    }
  }

  async getActiveUsers(orderId) {
    try {
      // Primero obtenemos los active users
      const { data: activeUsers, error: activeUsersError } = await supabase
        .from("active_tap_pay_users")
        .select("*")
        .eq("tap_pay_order_id", orderId);

      if (activeUsersError) throw activeUsersError;

      if (!activeUsers || activeUsers.length === 0) {
        return [];
      }

      // Obtener los user_ids que no son null
      const userIds = activeUsers
        .filter(u => u.user_id)
        .map(u => u.user_id);

      let profiles = [];
      if (userIds.length > 0) {
        // Obtener los perfiles de los usuarios
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, phone")
          .in("id", userIds);

        if (!profilesError && profilesData) {
          profiles = profilesData;
        }
      }

      // Mapear los profiles a los active users
      const formattedData = activeUsers.map(activeUser => {
        const profile = profiles.find(p => p.id === activeUser.user_id);

        return {
          ...activeUser,
          profile,
          display_name: activeUser.guest_name ||
                       (profile?.first_name && profile?.last_name
                         ? `${profile.first_name} ${profile.last_name}`
                         : profile?.first_name) ||
                       profile?.email ||
                       profile?.phone ||
                       'Usuario',
        };
      });

      return formattedData;
    } catch (error) {
      console.error("Error in getActiveUsers:", error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, orderStatus) {
    try {
      const { data, error } = await supabase
        .from("tap_pay_orders")
        .update({ order_status: orderStatus })
        .eq("id", orderId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error("Error in updateOrderStatus:", error);
      throw error;
    }
  }

  async updateDishStatus(dishId, status) {
    try {
      const { data, error } = await supabase
        .from("dish_order")
        .update({ status })
        .eq("id", dishId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error("Error in updateDishStatus:", error);
      throw error;
    }
  }

  async getDashboardMetrics({ restaurantId, branchNumber, timeRange, startDate, endDate }) {
    try {
      const now = new Date();
      let calculatedStartDate = startDate;
      let calculatedEndDate = endDate || now.toISOString();

      if (!startDate) {
        switch (timeRange) {
          case "daily":
            calculatedStartDate = new Date(now);
            calculatedStartDate.setHours(0, 0, 0, 0);
            calculatedStartDate = calculatedStartDate.toISOString();
            break;
          case "weekly":
            calculatedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case "monthly":
            calculatedStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            break;
          default:
            calculatedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      let query = supabase
        .from("tap_pay_orders")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", calculatedStartDate)
        .lte("created_at", calculatedEndDate);

      if (branchNumber) {
        query = query.eq("branch_number", branchNumber);
      }

      const { data: orders, error } = await query;

      if (error) throw error;

      const totalOrders = orders.length;
      const completedOrders = orders.filter((o) => o.order_status === "completed").length;
      const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      return {
        total_orders: totalOrders,
        completed_orders: completedOrders,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        avg_order_value: Math.round(avgOrderValue * 100) / 100,
        time_range: timeRange,
      };
    } catch (error) {
      console.error("Error in getDashboardMetrics:", error);
      throw error;
    }
  }

  async checkAndCompleteOrder(orderId) {
    try {
      const { error } = await supabase.rpc("check_and_complete_tap_pay_order", {
        p_order_id: orderId,
      });

      if (error) {
        console.error("Error checking and completing order:", error);
      }
    } catch (error) {
      console.error("Error in checkAndCompleteOrder:", error);
    }
  }

  async addOrUpdateActiveUser(orderId, userId, guestId, guestName, amountPaid) {
    try {
      // Buscar por userId o guestId (preferir userId, luego guestId, luego guestName)
      const searchKey = userId ? "user_id" : (guestId ? "guest_id" : "guest_name");
      const searchValue = userId || guestId || guestName;

      // Usar maybeSingle() para evitar errores si no existe o si hay múltiples
      const { data: existing, error: findError } = await supabase
        .from("active_tap_pay_users")
        .select("*")
        .eq("tap_pay_order_id", orderId)
        .eq(searchKey, searchValue)
        .maybeSingle();

      if (findError) {
        console.error("Error finding active user:", findError);
        // Continuar con el flujo normal - si hay error, intentar insertar
      }

      if (existing) {
        // Usuario ya existe - actualizar amount_paid
        await supabase
          .from("active_tap_pay_users")
          .update({
            amount_paid: parseFloat(existing.amount_paid) + amountPaid,
            guest_name: guestName || existing.guest_name || "Invitado" // Actualizar nombre si cambió
          })
          .eq("id", existing.id);
      } else {
        // Usuario no existe - insertar nuevo
        await supabase.from("active_tap_pay_users").insert({
          tap_pay_order_id: orderId,
          user_id: userId || null,
          guest_id: guestId || null,
          guest_name: guestName || "Invitado",
          amount_paid: amountPaid,
        });
      }
    } catch (error) {
      console.error("Error in addOrUpdateActiveUser:", error);
      // No lanzar el error - esto es best-effort
    }
  }
}

module.exports = new TapPayService();
