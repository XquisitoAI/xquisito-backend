const supabase = require("../config/supabase");

class TableService {
  // Obtener resumen de cuenta de mesa
  async getTableSummary(restaurantId, tableNumber) {
    try {
      const { data, error } = await supabase.rpc("get_table_order_summary", {
        p_restaurant_id: restaurantId,
        p_table_number: tableNumber,
      });

      if (error) throw error;
      return data[0] || null;
    } catch (error) {
      throw new Error(`Error getting table summary: ${error.message}`);
    }
  }

  // Obtener todos los platillos de una mesa
  async getTableOrders(restaurantId, tableNumber) {
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
                            tables!inner(table_number, restaurant_id)
                        )
                    )
                `
        )
        .eq("user_order.table_order.tables.restaurant_id", restaurantId)
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
    restaurantId,
    tableNumber,
    userId,
    guestName,
    item,
    quantity,
    price,
    guestId = null,
    images = [],
    customFields = null,
    extraPrice = 0
  ) {
    try {
      const { data, error } = await supabase.rpc("create_dish_order", {
        p_restaurant_id: restaurantId,
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
      });

      if (error) throw error;

      // Registrar usuario como activo en la mesa
      await this.addActiveUser(restaurantId, tableNumber, userId, guestName, guestId);

      // Verificar si hay división activa y re-dividir automáticamente
      const redistributionResult = await this.redistributeSplitBill(
        restaurantId,
        tableNumber,
        userId,
        guestName,
        guestId
      );

      const result = {
        dish_order_id: data,
        restaurant_id: restaurantId,
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
  async payDishOrder(dishOrderId, paymentMethodId = null) {
    try {
      // Obtener información del dish order antes de pagarlo, incluyendo restaurant_id
      const { data: dishData, error: dishError } = await supabase
        .from("dish_order")
        .select(`
          *,
          user_order!inner(
            table_order!inner(
              tables!inner(table_number, restaurant_id)
            )
          )
        `)
        .eq("id", dishOrderId)
        .single();

      if (dishError) throw dishError;

      const restaurantId = dishData.user_order.table_order.tables.restaurant_id;
      const tableNumber = dishData.user_order.table_order.tables.table_number;

      const { data, error } = await supabase.rpc("pay_dish_order", {
        p_dish_order_id: dishOrderId,
      });

      if (error) throw error;

      // Si se proporcionó paymentMethodId, guardar en user_order
      if (paymentMethodId && dishData) {
        await this.savePaymentMethodToUserOrder(
          restaurantId,
          tableNumber,
          dishData.user_id,
          dishData.guest_name,
          paymentMethodId
        );
      }

      const amountPaid = parseFloat(dishData.total_price || dishData.price);

      // Verificar si la mesa sigue activa (no se cerró automáticamente)
      const summary = await this.getTableSummary(restaurantId, tableNumber);
      const tableStillActive = summary && summary.status !== "paid";

      // Solo trackear pago si la mesa sigue activa
      if (dishData && tableStillActive) {
        await this.updateUserPayment(
          restaurantId,
          tableNumber,
          dishData.user_id,
          dishData.guest_name,
          "individual",
          amountPaid
        );

        // Actualizar split_payments si existe
        await this.updateSplitPaymentProgress(
          restaurantId,
          tableNumber,
          dishData.user_id,
          dishData.guest_name,
          dishData.guest_id,
          amountPaid
        );
      }

      return data;
    } catch (error) {
      throw new Error(`Error paying dish order: ${error.message}`);
    }
  }

  // Pagar monto específico a la mesa (sin marcar items como pagados)
  async payTableAmount(
    restaurantId,
    tableNumber,
    amount,
    userId = null,
    guestName = null,
    paymentMethodId = null
  ) {
    try {
      const { data, error } = await supabase.rpc("pay_table_amount", {
        p_restaurant_id: restaurantId,
        p_table_number: tableNumber,
        p_amount: amount,
      });

      if (error) throw error;

      // Si se proporcionó paymentMethodId, guardar en user_order
      if (paymentMethodId && (userId || guestName)) {
        await this.savePaymentMethodToUserOrder(
          restaurantId,
          tableNumber,
          userId,
          guestName,
          paymentMethodId
        );
      }

      // Verificar si la mesa sigue activa (no se cerró automáticamente)
      const summary = await this.getTableSummary(restaurantId, tableNumber);
      const tableStillActive = summary && summary.status !== "paid";

      // Solo trackear pago si la mesa sigue activa y se proporciona userId o guestName
      if ((userId || guestName) && tableStillActive) {
        await this.updateUserPayment(
          restaurantId,
          tableNumber,
          userId,
          guestName,
          "amount",
          amount
        );

        // Actualizar split_payments si existe - marcar como paid sin importar la cantidad
        await this.updateSplitPaymentProgress(
          restaurantId,
          tableNumber,
          userId,
          guestName,
          null, // guest_id no disponible aquí
          amount,
          true // forceMarkAsPaid = true
        );
      }

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
  async checkTableAvailability(restaurantId, tableNumber) {
    try {
      const { data, error } = await supabase
        .from("tables")
        .select("id, status")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber)
        .single();

      if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
      return data || null;
    } catch (error) {
      throw new Error(`Error checking table availability: ${error.message}`);
    }
  }

  // Obtener todas las mesas con su estado
  async getAllTables(restaurantId) {
    try {
      const { data, error } = await supabase
        .from("tables")
        .select(
          `
                    id,
                    table_number,
                    restaurant_id,
                    status,
                    table_order!left(
                        total_amount,
                        paid_amount,
                        remaining_amount,
                        no_items
                    )
                `
        )
        .eq("restaurant_id", restaurantId)
        .in("table_order.status", ["not_paid", "partial"])
        .order("table_number");

      if (error) throw error;

      // Transformar datos para mantener compatibilidad
      return data.map((table) => ({
        id: table.id,
        table_number: table.table_number,
        restaurant_id: table.restaurant_id,
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
    restaurantId,
    tableNumber,
    numberOfPeople,
    userIds = null,
    guestNames = null
  ) {
    try {
      // Obtener el total actual de la mesa
      const summary = await this.getTableSummary(restaurantId, tableNumber);
      if (!summary) {
        throw new Error(`No hay cuenta activa para la mesa ${tableNumber} del restaurante ${restaurantId}`);
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
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber);

      if (deleteError) throw deleteError;

      // Obtener active users para obtener guest_ids
      const { data: activeUsers } = await supabase
        .from("active_table_users")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber);

      // Crear registros para cada persona
      const splitRecords = [];
      for (let i = 0; i < numberOfPeople; i++) {
        const userId = userIds && userIds[i] ? userIds[i] : null;
        const guestName =
          guestNames && guestNames[i] ? guestNames[i] : `Persona ${i + 1}`;

        // Buscar guest_id en active_table_users
        let guestId = null;
        if (activeUsers && activeUsers.length > 0) {
          const activeUser = activeUsers.find(
            (u) =>
              (userId && u.user_id === userId) ||
              (!userId && u.guest_name === guestName)
          );
          guestId = activeUser?.guest_id || null;
        }

        const record = {
          restaurant_id: restaurantId,
          table_number: tableNumber,
          expected_amount: amountPerPerson,
          original_total: totalAmount,
          user_id: userId,
          guest_name: guestName,
          guest_id: guestId,
        };
        splitRecords.push(record);
      }

      const { data, error } = await supabase
        .from("split_payments")
        .insert(splitRecords)
        .select();

      if (error) throw error;

      return {
        restaurant_id: restaurantId,
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
    restaurantId,
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
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber);

      if (selectError) throw selectError;
      if (!activeSplits || activeSplits.length === 0) return false; // No hay división activa

      // Obtener todos los huéspedes únicos que tienen órdenes en la mesa
      const orders = await this.getTableOrders(restaurantId, tableNumber);
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
      const summary = await this.getTableSummary(restaurantId, tableNumber);
      if (!summary) return false;

      const newTotalAmount = parseFloat(summary.total_amount);

      // Calcular cuánto ya se pagó por división
      const totalPaidBySplit = activeSplits.reduce(
        (sum, split) => sum + parseFloat(split.amount_paid || 0),
        0
      );

      // Usar la tabla de usuarios activos para determinar correctamente quién debe estar en el split
      const activeUsers = await this.getActiveUsers(restaurantId, tableNumber);
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
          restaurant_id: restaurantId,
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
  async paySplitAmount(restaurantId, tableNumber, userId = null, guestName = null, paymentMethodId = null) {
    try {
      // Obtener todos los pagos pendientes para ver si es la última persona
      const { data: allPendingSplits, error: allPendingError } = await supabase
        .from("split_payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber)
        .eq("status", "pending");

      if (allPendingError) throw allPendingError;

      // Buscar el pago pendiente del usuario específico
      let query = supabase
        .from("split_payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
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
      const summary = await this.getTableSummary(restaurantId, tableNumber);
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
      await this.payTableAmount(restaurantId, tableNumber, amountToPay, userId, guestName, paymentMethodId);

      // Verificar si la mesa sigue activa después del pago
      const summaryAfterPayment = await this.getTableSummary(restaurantId, tableNumber);
      const tableStillActive =
        summaryAfterPayment && summaryAfterPayment.status !== "paid";

      // Solo trackear pago por split si la mesa sigue activa
      if (tableStillActive) {
        await this.updateUserPayment(
          restaurantId,
          tableNumber,
          userId,
          guestName,
          "split",
          amountToPay
        );
      }

      return true;
    } catch (error) {
      throw new Error(`Error paying split amount: ${error.message}`);
    }
  }

  // === MÉTODOS PARA ACTIVE TABLE USERS ===

  // Registrar usuario en la mesa (cuando hace primera orden)
  async addActiveUser(
    restaurantId,
    tableNumber,
    userId = null,
    guestName = null,
    guestId = null
  ) {
    try {
      // Primero intentar encontrar el usuario existente
      let query = supabase
        .from("active_table_users")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber);

      // Filtrar por el identificador apropiado
      if (userId) {
        query = query.eq("user_id", userId);
      } else if (guestId) {
        query = query.eq("guest_id", guestId);
      } else if (guestName) {
        query = query.eq("guest_name", guestName).is("guest_id", null);
      }

      const { data: existingUser } = await query.maybeSingle();

      if (existingUser) {
        // Usuario ya existe, actualizar
        const { data, error } = await supabase
          .from("active_table_users")
          .update({
            guest_name: guestName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingUser.id)
          .select();

        if (error) throw error;
        return data[0];
      } else {
        // Usuario no existe, insertar
        const { data, error } = await supabase
          .from("active_table_users")
          .insert({
            restaurant_id: restaurantId,
            table_number: tableNumber,
            user_id: userId,
            guest_name: guestName,
            guest_id: guestId,
            updated_at: new Date().toISOString(),
          })
          .select();

        if (error) throw error;
        return data[0];
      }
    } catch (error) {
      console.error("Error adding active user:", error);
      return null;
    }
  }

  // Actualizar pagos de un usuario
  async updateUserPayment(
    restaurantId,
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
        p_restaurant_id: restaurantId,
        p_amount: amount,
        p_field: updateField,
        p_guest_name: guestName,
        p_table_number: tableNumber,
        p_user_id: userId,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error updating user payment:", error);
      return false;
    }
  }

  // Actualizar progreso de pago en split_payments cuando se hace un pago individual o por monto
  async updateSplitPaymentProgress(
    restaurantId,
    tableNumber,
    userId = null,
    guestName = null,
    guestId = null,
    amountPaid,
    forceMarkAsPaid = false
  ) {
    try {
      // Buscar el registro en split_payments para este usuario
      let query = supabase
        .from("split_payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber)
        .eq("status", "pending");

      // Filtrar por identificador apropiado
      if (userId) {
        query = query.eq("user_id", userId);
      } else if (guestId) {
        query = query.eq("guest_id", guestId);
      } else if (guestName) {
        query = query.eq("guest_name", guestName);
      } else {
        return; // No hay identificador, no hacer nada
      }

      const { data: splitPayment, error: selectError } =
        await query.maybeSingle();

      if (selectError) throw selectError;
      if (!splitPayment) return; // No hay split activo para este usuario

      // Incrementar amount_paid
      const newAmountPaid =
        parseFloat(splitPayment.amount_paid || 0) + parseFloat(amountPaid);
      const expectedAmount = parseFloat(splitPayment.expected_amount);

      // Determinar si el pago está completo
      const isPaid = forceMarkAsPaid || newAmountPaid >= expectedAmount;

      // Actualizar el registro
      const { error: updateError } = await supabase
        .from("split_payments")
        .update({
          amount_paid: newAmountPaid,
          status: isPaid ? "paid" : "pending",
          paid_at: isPaid ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", splitPayment.id);

      if (updateError) throw updateError;

      return true;
    } catch (error) {
      console.error("Error updating split payment progress:", error);
      return false;
    }
  }

  // Marcar usuario como pagado en split_payments si existe un split activo
  async markUserAsPaidInSplit(
    restaurantId,
    tableNumber,
    userId = null,
    guestName = null,
    amount
  ) {
    try {
      console.log(`🔍 Checking split_payments for restaurant ${restaurantId}, table ${tableNumber}:`, {
        userId,
        guestName,
        amount,
      });

      // Buscar si hay un split_payment pendiente para este usuario
      let query = supabase
        .from("split_payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber)
        .eq("status", "pending");

      if (userId) {
        query = query.eq("user_id", userId);
      } else if (guestName) {
        query = query.eq("guest_name", guestName);
      } else {
        console.log(
          "⚠️ No userId or guestName provided, skipping split_payments update"
        );
        return; // No hay identificador de usuario
      }

      const { data: splitPayments, error: selectError } = await query;
      if (selectError) {
        console.error("❌ Error querying split_payments:", selectError);
        throw selectError;
      }

      console.log(
        `📊 Found ${splitPayments?.length || 0} pending split_payments`
      );

      // Si existe un split payment pendiente, marcarlo como pagado
      if (splitPayments && splitPayments.length > 0) {
        const splitPayment = splitPayments[0];
        console.log(`💳 Updating split_payment:`, splitPayment);

        const { error: updateError } = await supabase
          .from("split_payments")
          .update({
            amount_paid: amount,
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("id", splitPayment.id);

        if (updateError) {
          console.error("❌ Error updating split_payment:", updateError);
          throw updateError;
        }
        console.log(
          `✅ Marked user as paid in split_payments: ${userId || guestName}`
        );
      } else {
        console.log(
          `ℹ️ No pending split_payment found for ${userId || guestName}`
        );
      }
    } catch (error) {
      console.error("❌ Error marking user as paid in split:", error);
      // No fallar si esto no funciona, es solo un update adicional
    }
  }

  // Obtener usuarios activos de una mesa
  async getActiveUsers(restaurantId, tableNumber) {
    try {
      const { data, error } = await supabase
        .from("active_table_users")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error getting active users:", error);
      return [];
    }
  }

  // Limpiar usuarios activos cuando mesa se cierra
  async clearActiveUsers(restaurantId, tableNumber) {
    try {
      const { error } = await supabase
        .from("active_table_users")
        .delete()
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error clearing active users:", error);
      return false;
    }
  }

  // Marcar usuarios como en split
  async setUsersInSplit(restaurantId, tableNumber, userIds = [], guestNames = []) {
    try {
      const updates = [];

      // Reset todos a false primero
      updates.push(
        supabase
          .from("active_table_users")
          .update({ is_in_split: false })
          .eq("restaurant_id", restaurantId)
          .eq("table_number", tableNumber)
      );

      // Marcar usuarios específicos como en split
      for (const userId of userIds) {
        if (userId) {
          updates.push(
            supabase
              .from("active_table_users")
              .update({ is_in_split: true })
              .eq("restaurant_id", restaurantId)
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
              .eq("restaurant_id", restaurantId)
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
  async linkGuestOrdersToUser(guestId, userId, tableNumber = null, restaurantId = null) {
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

      if (restaurantId) {
        activeUserQuery = activeUserQuery.eq("restaurant_id", restaurantId);
      }

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

      if (restaurantId) {
        splitQuery = splitQuery.eq("restaurant_id", restaurantId);
      }

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
  async getSplitPaymentStatus(restaurantId, tableNumber) {
    try {
      const { data, error } = await supabase
        .from("split_payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
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

  // Guardar información del método de pago en user_order
  async savePaymentMethodToUserOrder(
    restaurantId,
    tableNumber,
    userId = null,
    guestName = null,
    paymentMethodId
  ) {
    try {
      // Obtener info del método de pago
      const tableName = userId
        ? "user_payment_methods"
        : "guest_payment_methods";
      const userFieldName = userId ? "clerk_user_id" : "guest_id";
      const userValue = userId || guestName;

      const { data: paymentMethod, error: pmError } = await supabase
        .from(tableName)
        .select("last_four_digits, card_type")
        .eq(userFieldName, userValue)
        .eq("id", paymentMethodId)
        .single();

      if (pmError || !paymentMethod) {
        console.error("Payment method not found:", pmError);
        return; // No fallar, solo no guardar
      }

      // Obtener el table_id desde la tabla tables
      const { data: tableData, error: tableError } = await supabase
        .from("tables")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("table_number", tableNumber)
        .single();

      if (tableError || !tableData) {
        console.error("Table not found:", tableError);
        return;
      }

      // Obtener el table_order más reciente para esta mesa
      const { data: tableOrders, error: orderError } = await supabase
        .from("table_order")
        .select("id")
        .eq("table_id", tableData.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (orderError || !tableOrders || tableOrders.length === 0) {
        console.error("Table order not found:", orderError);
        return;
      }

      const tableOrderId = tableOrders[0].id;

      // Actualizar user_order con info del método de pago
      let updateQuery = supabase
        .from("user_order")
        .update({
          payment_card_last_four: paymentMethod.last_four_digits,
          payment_card_type: paymentMethod.card_type,
        })
        .eq("table_order_id", tableOrderId);

      if (userId) {
        updateQuery = updateQuery.eq("user_id", userId);
      } else if (guestName) {
        updateQuery = updateQuery.eq("guest_name", guestName);
      }

      const { error: updateError } = await updateQuery;

      if (updateError) {
        console.error(
          "Error updating user_order with payment method:",
          updateError
        );
      }
    } catch (error) {
      console.error("Error in savePaymentMethodToUserOrder:", error);
    }
  }
}

module.exports = new TableService();
