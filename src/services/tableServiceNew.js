const supabase = require("../config/supabase");

class TableService {
  // Obtener resumen de cuenta de mesa
  async getTableSummary(tableNumber) {
    try {
      const { data, error } = await supabase.rpc("get_table_order_summary", {
        p_table_number: tableNumber,
      });

      if (error) throw error;
      return data[0] || null;
    } catch (error) {
      throw new Error(`Error getting table summary: ${error.message}`);
    }
  }

  // Obtener todos los platillos de una mesa
  async getTableOrders(tableNumber) {
    try {
      const { data, error } = await supabase
        .from("dish_order")
        .select(
          `
                    id,
                    item,
                    quantity,
                    price,
                    status,
                    payment_status,
                    images,
                    custom_fields,
                    extra_price,
                    user_order!inner(
                        user_id,
                        guest_name,
                        table_order!inner(
                            id,
                            tables!inner(table_number)
                        )
                    )
                `
        )
        .eq("user_order.table_order.tables.table_number", tableNumber)
        .in("user_order.table_order.status", ["not_paid", "partial"]);

      if (error) throw error;

      // Transformar datos para mantener compatibilidad
      return data.map((item) => ({
        dish_order_id: item.id,
        item: item.item,
        quantity: item.quantity,
        price: item.price,
        total_price: item.quantity * (item.price + (item.extra_price || 0)),
        status: item.status,
        payment_status: item.payment_status,
        images: item.images || [],
        custom_fields: item.custom_fields,
        extra_price: item.extra_price || 0,
        user_id: item.user_order.user_id,
        guest_name: item.user_order.guest_name,
        table_order_id: item.user_order.table_order.id,
      }));
    } catch (error) {
      throw new Error(`Error getting table orders: ${error.message}`);
    }
  }

  // Crear nueva orden de platillo
  async createDishOrder(
    tableNumber,
    userId,
    guestName,
    item,
    quantity,
    price,
    guestId = null,
    images = [],
    customFields = null,
    extraPrice = 0,
    restaurantId = null
  ) {
    try {
      const { data, error } = await supabase.rpc("create_dish_order", {
        p_table_number: tableNumber,
        p_item: item,
        p_price: price,
        p_user_id: userId,
        p_guest_name: guestName,
        p_quantity: quantity,
        p_guest_id: guestId,
        p_images: images,
        p_custom_fields: customFields,
        p_extra_price: extraPrice,
        p_restaurant_id: restaurantId,
      });

      if (error) throw error;

      // Registrar usuario como activo en la mesa
      await this.addActiveUser(tableNumber, userId, guestName, guestId);

      // Verificar si hay división activa y re-dividir automáticamente
      const redistributionResult = await this.redistributeSplitBill(
        tableNumber,
        userId,
        guestName,
        guestId
      );

      const result = {
        dish_order_id: data,
        table_number: tableNumber,
        item,
        quantity,
        price: parseFloat(price),
        images: images || [],
      };

      if (redistributionResult && redistributionResult.redistributed) {
        result.split_bill_redistributed = true;
        result.redistribution_info = redistributionResult;
      }

      return result;
    } catch (error) {
      throw new Error(`Error creating dish order: ${error.message}`);
    }
  }

  // Pagar un platillo individual
  async payDishOrder(dishOrderId) {
    try {
      // Obtener información del dish order antes de pagarlo
      const { data: dishData, error: dishError } = await supabase
        .from("dish_order")
        .select("*")
        .eq("id", dishOrderId)
        .single();

      if (dishError) throw dishError;

      const { data, error } = await supabase.rpc("pay_dish_order", {
        p_dish_order_id: dishOrderId,
      });

      if (error) throw error;

      // Trackear pago individual en active users
      if (dishData) {
        await this.updateUserPayment(
          dishData.table_number,
          dishData.user_id,
          dishData.guest_name,
          "individual",
          parseFloat(dishData.price)
        );
      }

      return data;
    } catch (error) {
      throw new Error(`Error paying dish order: ${error.message}`);
    }
  }

  // Pagar monto específico a la mesa (sin marcar items como pagados)
  async payTableAmount(tableNumber, amount) {
    try {
      const { data, error } = await supabase.rpc("pay_table_amount", {
        p_table_number: tableNumber,
        p_amount: amount,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error paying table amount: ${error.message}`);
    }
  }

  // Actualizar estado de platillo (cocina)
  async updateDishStatus(dishOrderId, newStatus) {
    try {
      const { data, error } = await supabase.rpc("update_dish_status", {
        p_dish_order_id: dishOrderId,
        p_new_status: newStatus,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error updating dish status: ${error.message}`);
    }
  }

  // Verificar si mesa existe y está disponible
  async checkTableAvailability(tableNumber) {
    try {
      const { data, error } = await supabase
        .from("tables")
        .select("id, status")
        .eq("table_number", tableNumber)
        .single();

      if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
      return data || null;
    } catch (error) {
      throw new Error(`Error checking table availability: ${error.message}`);
    }
  }

  // Obtener todas las mesas con su estado
  async getAllTables() {
    try {
      const { data, error } = await supabase
        .from("tables")
        .select(
          `
                    id,
                    table_number,
                    status,
                    table_order!left(
                        total_amount,
                        paid_amount,
                        remaining_amount,
                        no_items
                    )
                `
        )
        .in("table_order.status", ["not_paid", "partial"])
        .order("table_number");

      if (error) throw error;

      // Transformar datos para mantener compatibilidad
      return data.map((table) => ({
        id: table.id,
        table_number: table.table_number,
        status: table.status,
        total_amount: table.table_order?.[0]?.total_amount || null,
        paid_amount: table.table_order?.[0]?.paid_amount || null,
        remaining_amount: table.table_order?.[0]?.remaining_amount || null,
        no_items: table.table_order?.[0]?.no_items || null,
      }));
    } catch (error) {
      throw new Error(`Error getting all tables: ${error.message}`);
    }
  }

  // ===============================================
  // MÉTODOS PARA DIVISIÓN DE CUENTA (SPLIT BILL)
  // ===============================================

  // Inicializar división de cuenta
  async initializeSplitBill(
    tableNumber,
    numberOfPeople,
    userIds = null,
    guestNames = null
  ) {
    try {
      // Obtener el total actual de la mesa
      const summary = await this.getTableSummary(tableNumber);
      if (!summary) {
        throw new Error(`No hay cuenta activa para la mesa ${tableNumber}`);
      }

      const totalAmount = parseFloat(summary.total_amount);
      const remainingAmount = parseFloat(summary.remaining_amount);
      // FIX: Dividir el monto RESTANTE, no el total
      const amountPerPerson =
        Math.round((remainingAmount / numberOfPeople) * 100) / 100;

      // Limpiar división anterior si existe
      const { error: deleteError } = await supabase
        .from("split_payments")
        .delete()
        .eq("table_number", tableNumber);

      if (deleteError) throw deleteError;

      // Crear registros para cada persona
      const splitRecords = [];
      for (let i = 0; i < numberOfPeople; i++) {
        const record = {
          table_number: tableNumber,
          expected_amount: amountPerPerson,
          original_total: totalAmount,
          user_id: userIds && userIds[i] ? userIds[i] : null,
          guest_name:
            guestNames && guestNames[i] ? guestNames[i] : `Persona ${i + 1}`,
        };
        splitRecords.push(record);
      }

      const { data, error } = await supabase
        .from("split_payments")
        .insert(splitRecords)
        .select();

      if (error) throw error;

      return {
        table_number: tableNumber,
        total_amount: totalAmount,
        amount_per_person: amountPerPerson,
        number_of_people: numberOfPeople,
        split_payments: data,
      };
    } catch (error) {
      throw new Error(`Error initializing split bill: ${error.message}`);
    }
  }

  // Re-dividir cuando se agrega un nuevo item
  async redistributeSplitBill(
    tableNumber,
    newOrderUserId = null,
    newOrderGuestName = null,
    newOrderGuestId = null
  ) {
    try {
      // Verificar si hay división activa
      const { data: activeSplits, error: selectError } = await supabase
        .from("split_payments")
        .select("*")
        .eq("table_number", tableNumber);

      if (selectError) throw selectError;
      if (!activeSplits || activeSplits.length === 0) return false; // No hay división activa

      // Obtener todos los huéspedes únicos que tienen órdenes en la mesa
      const orders = await this.getTableOrders(tableNumber);
      const uniqueGuests = new Map();

      orders.forEach((order) => {
        // Usar guest_id como key si está disponible, sino user_id o guest_name
        const key = order.guest_id || order.user_id || order.guest_name;
        if (!uniqueGuests.has(key)) {
          uniqueGuests.set(key, {
            user_id: order.user_id,
            guest_name: order.guest_name,
            guest_id: order.guest_id,
          });
        }
      });

      // Obtener nuevo total de la mesa
      const summary = await this.getTableSummary(tableNumber);
      if (!summary) return false;

      const newTotalAmount = parseFloat(summary.total_amount);

      // Calcular cuánto ya se pagó por división
      const totalPaidBySplit = activeSplits.reduce(
        (sum, split) => sum + parseFloat(split.amount_paid || 0),
        0
      );

      // Usar la tabla de usuarios activos para determinar correctamente quién debe estar en el split
      const activeUsers = await this.getActiveUsers(tableNumber);
      const newGuests = [];

      uniqueGuests.forEach((guest, key) => {
        const existsInSplit = activeSplits.some(
          (split) =>
            (split.guest_id && split.guest_id === guest.guest_id) ||
            (split.user_id && split.user_id === guest.user_id) ||
            (split.guest_name && split.guest_name === guest.guest_name)
        );

        if (!existsInSplit) {
          // Verificar si es la persona que hizo la nueva orden
          const isNewOrderPerson =
            (newOrderGuestId && guest.guest_id === newOrderGuestId) ||
            (newOrderUserId && guest.user_id === newOrderUserId) ||
            (newOrderGuestName && guest.guest_name === newOrderGuestName);

          // Buscar en usuarios activos para ver cuánto ha pagado
          const activeUser = activeUsers.find(
            (user) =>
              (user.guest_id && user.guest_id === guest.guest_id) ||
              (user.user_id && user.user_id === guest.user_id) ||
              (user.guest_name && user.guest_name === guest.guest_name)
          );

          const totalPaidByUser = activeUser
            ? parseFloat(activeUser.total_paid_individual || 0) +
              parseFloat(activeUser.total_paid_amount || 0)
            : 0;

          // Incluir en split SOLO si:
          // 1. Es quien hizo la nueva orden (siempre se incluye)
          // NO incluir personas que ya habían pagado antes del split inicial
          if (isNewOrderPerson) {
            // Siempre incluir quien ordenó nuevos items
            newGuests.push(guest);
          }
          // NO incluir a nadie más, ni siquiera los que no han pagado nada
          // porque si no habían pagado nada cuando se inicializó el split,
          // ya habrían sido incluidos en el split original
        }
      });

      // Agregar nuevos huéspedes a la división
      if (newGuests.length > 0) {
        const newSplitRecords = newGuests.map((guest) => ({
          table_number: tableNumber,
          expected_amount: 0, // Se calculará después
          original_total: newTotalAmount,
          user_id: guest.user_id,
          guest_name: guest.guest_name,
          guest_id: guest.guest_id,
          status: "pending",
        }));

        const { data: insertedSplits, error: insertError } = await supabase
          .from("split_payments")
          .insert(newSplitRecords)
          .select();

        if (insertError) throw insertError;

        // Actualizar la lista de splits activos
        activeSplits.push(...insertedSplits);
      }

      // Contar personas que aún no han pagado (excluyendo quienes ya pagaron por otros métodos)
      const pendingPeople = activeSplits.filter((split) => {
        if (split.status !== "pending") return false;

        // Buscar si esta persona ya pagó significativamente por otros métodos
        const activeUser = activeUsers.find(
          (user) =>
            (user.guest_id && user.guest_id === split.guest_id) ||
            (user.user_id && user.user_id === split.user_id) ||
            (user.guest_name && user.guest_name === split.guest_name)
        );

        if (activeUser) {
          const totalPaidByOtherMethods =
            parseFloat(activeUser.total_paid_individual || 0) +
            parseFloat(activeUser.total_paid_amount || 0);

          // Si ya pagó una cantidad significativa (más de $10) por otros métodos, excluirlo del split
          return totalPaidByOtherMethods < 10;
        }

        return true;
      });

      if (pendingPeople.length === 0) {
        // Todos ya pagaron, no se puede re-dividir
        return false;
      }

      // Calcular el monto justo para las personas pendientes
      // Lo que realmente falta pagar en la mesa
      const remainingAmountTable = parseFloat(summary.remaining_amount);

      // Dividir el restante real entre las personas pendientes
      const newAmountPerPendingPerson =
        pendingPeople.length > 0
          ? Math.round((remainingAmountTable / pendingPeople.length) * 100) /
            100
          : 0;

      // Actualizar solo las personas pendientes
      const updatePromises = pendingPeople.map((split) => {
        return supabase
          .from("split_payments")
          .update({
            expected_amount: newAmountPerPendingPerson,
            original_total: newTotalAmount,
          })
          .eq("id", split.id);
      });

      await Promise.all(updatePromises);

      return {
        redistributed: true,
        new_total: newTotalAmount,
        new_amount_per_pending_person: newAmountPerPendingPerson,
        pending_people: pendingPeople.length,
        total_people: activeSplits.length,
        total_paid_by_split: totalPaidBySplit,
        new_guests_added: newGuests.length,
      };
    } catch (error) {
      console.error("Error redistributing split bill:", error);
      return false;
    }
  }

  // Pagar parte individual
  async paySplitAmount(tableNumber, userId = null, guestName = null) {
    try {
      // Obtener todos los pagos pendientes para ver si es la última persona
      const { data: allPendingSplits, error: allPendingError } = await supabase
        .from("split_payments")
        .select("*")
        .eq("table_number", tableNumber)
        .eq("status", "pending");

      if (allPendingError) throw allPendingError;

      // Buscar el pago pendiente del usuario específico
      let query = supabase
        .from("split_payments")
        .select("*")
        .eq("table_number", tableNumber)
        .eq("status", "pending");

      if (userId) {
        query = query.eq("user_id", userId);
      } else if (guestName) {
        query = query.eq("guest_name", guestName);
      } else {
        throw new Error("Se requiere userId o guestName");
      }

      const { data: splitPayments, error: selectError } = await query;
      if (selectError) throw selectError;

      if (!splitPayments || splitPayments.length === 0) {
        throw new Error(
          `No se encontró pago pendiente para este usuario en la mesa ${tableNumber}`
        );
      }

      const splitPayment = splitPayments[0];
      let amountToPay = parseFloat(splitPayment.expected_amount);

      // Si es la única persona que realmente no ha contribuido, debe pagar todo el restante
      // Verificar si esta persona es efectivamente la única sin contribuir
      const summary = await this.getTableSummary(tableNumber);
      if (summary) {
        const remainingAmount = parseFloat(summary.remaining_amount);

        // Solo si es la última persona pendiente, debe pagar todo el restante
        if (allPendingSplits.length === 1) {
          amountToPay = remainingAmount;
        }
      }

      // Marcar como pagado
      const { error: updateError } = await supabase
        .from("split_payments")
        .update({
          amount_paid: amountToPay,
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", splitPayment.id);

      if (updateError) throw updateError;

      // Aplicar el pago al total de la mesa usando la función existente
      await this.payTableAmount(tableNumber, amountToPay);

      // Trackear pago por split en active users
      await this.updateUserPayment(
        tableNumber,
        userId,
        guestName,
        "split",
        amountToPay
      );

      return true;
    } catch (error) {
      throw new Error(`Error paying split amount: ${error.message}`);
    }
  }

  // === MÉTODOS PARA ACTIVE TABLE USERS ===

  // Registrar usuario en la mesa (cuando hace primera orden)
  async addActiveUser(
    tableNumber,
    userId = null,
    guestName = null,
    guestId = null
  ) {
    try {
      const { data, error } = await supabase
        .from("active_table_users")
        .upsert(
          {
            table_number: tableNumber,
            user_id: userId,
            guest_name: guestName,
            guest_id: guestId,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "table_number,user_id,guest_id,guest_name",
          }
        )
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error("Error adding active user:", error);
      return null;
    }
  }

  // Actualizar pagos de un usuario
  async updateUserPayment(
    tableNumber,
    userId = null,
    guestName = null,
    paymentType,
    amount
  ) {
    try {
      const updateField = {
        individual: "total_paid_individual",
        amount: "total_paid_amount",
        split: "total_paid_split",
      }[paymentType];

      if (!updateField) throw new Error(`Invalid payment type: ${paymentType}`);

      const { data, error } = await supabase.rpc("increment_user_payment", {
        p_table_number: tableNumber,
        p_field: updateField,
        p_amount: amount,
        p_user_id: userId,
        p_guest_name: guestName,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error updating user payment:", error);
      return false;
    }
  }

  // Obtener usuarios activos de una mesa
  async getActiveUsers(tableNumber) {
    try {
      const { data, error } = await supabase
        .from("active_table_users")
        .select("*")
        .eq("table_number", tableNumber);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error getting active users:", error);
      return [];
    }
  }

  // Limpiar usuarios activos cuando mesa se cierra
  async clearActiveUsers(tableNumber) {
    try {
      const { error } = await supabase
        .from("active_table_users")
        .delete()
        .eq("table_number", tableNumber);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error clearing active users:", error);
      return false;
    }
  }

  // Marcar usuarios como en split
  async setUsersInSplit(tableNumber, userIds = [], guestNames = []) {
    try {
      const updates = [];

      // Reset todos a false primero
      updates.push(
        supabase
          .from("active_table_users")
          .update({ is_in_split: false })
          .eq("table_number", tableNumber)
      );

      // Marcar usuarios específicos como en split
      for (const userId of userIds) {
        if (userId) {
          updates.push(
            supabase
              .from("active_table_users")
              .update({ is_in_split: true })
              .eq("table_number", tableNumber)
              .eq("user_id", userId)
          );
        }
      }

      for (const guestName of guestNames) {
        if (guestName) {
          updates.push(
            supabase
              .from("active_table_users")
              .update({ is_in_split: true })
              .eq("table_number", tableNumber)
              .eq("guest_name", guestName)
          );
        }
      }

      await Promise.all(updates);
      return true;
    } catch (error) {
      console.error("Error setting users in split:", error);
      return false;
    }
  }

  // === FIN MÉTODOS ACTIVE TABLE USERS ===

  // Vincular órdenes de invitado con userId cuando se autentica
  async linkGuestOrdersToUser(guestId, userId, tableNumber = null) {
    try {
      // Actualizar user_order para vincular guest_id con user_id
      // Usamos guest_id como identificador único para evitar conflictos
      const { data: userOrderData, error: userOrderError } = await supabase
        .from("user_order")
        .update({ user_id: userId })
        .eq("guest_id", guestId)
        .is("user_id", null)
        .select();

      if (userOrderError) throw userOrderError;

      // Actualizar active_table_users para vincular guest_id con user_id
      let activeUserQuery = supabase
        .from("active_table_users")
        .update({ user_id: userId })
        .eq("guest_id", guestId)
        .is("user_id", null);

      if (tableNumber) {
        activeUserQuery = activeUserQuery.eq("table_number", tableNumber);
      }

      const { data: activeUserData, error: activeUserError } =
        await activeUserQuery.select();

      if (activeUserError) throw activeUserError;

      // Actualizar split_payments para vincular guest_id con user_id
      let splitQuery = supabase
        .from("split_payments")
        .update({ user_id: userId })
        .eq("guest_id", guestId)
        .is("user_id", null);

      if (tableNumber) {
        splitQuery = splitQuery.eq("table_number", tableNumber);
      }

      const { data: splitData, error: splitError } = await splitQuery.select();

      if (splitError) throw splitError;

      return {
        updated_orders: userOrderData?.length || 0,
        updated_active_users: activeUserData?.length || 0,
        updated_split_payments: splitData?.length || 0,
      };
    } catch (error) {
      throw new Error(`Error linking guest orders to user: ${error.message}`);
    }
  }

  // Obtener estado de pagos divididos
  async getSplitPaymentStatus(tableNumber) {
    try {
      const { data, error } = await supabase
        .from("split_payments")
        .select("*")
        .eq("table_number", tableNumber)
        .order("created_at");

      if (error) throw error;

      return data.map((split) => ({
        user_id: split.user_id,
        guest_name: split.guest_name,
        expected_amount: parseFloat(split.expected_amount),
        amount_paid: parseFloat(split.amount_paid || 0),
        status: split.status,
        remaining:
          parseFloat(split.expected_amount) -
          parseFloat(split.amount_paid || 0),
        paid_at: split.paid_at,
      }));
    } catch (error) {
      throw new Error(`Error getting split payment status: ${error.message}`);
    }
  }
}

module.exports = new TableService();
