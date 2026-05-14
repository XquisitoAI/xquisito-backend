const supabase = require("../../config/supabase");
const paymentTransactionService = require("../shared/paymentTransactionService");
const { calculateCommissions } = require("../../utils/commissionCalculator");
const ecartPayService = require("../shared/ecartpayService");
const { logOrderFlowStep } = require("../../utils/orderFlowLog");

class TapOrderService {
  // Ya no necesitamos generar QR tokens para el flujo de URL directa

  // Crear nueva sesión de tap order
  async createTapOrder(orderData) {
    try {
      const {
        table_id,
        clerk_user_id = null,
        customer_name = null,
        customer_phone = null,
        customer_email = null,
      } = orderData;

      // Validar que la mesa existe
      const { data: table, error: tableError } = await supabase
        .from("tables")
        .select("id, table_number, status")
        .eq("id", table_id)
        .single();

      if (tableError || !table) {
        return { success: false, error: "Table not found" };
      }

      // Ya no necesitamos qr_token

      // Crear el tap order
      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .insert({
          table_id,
          clerk_user_id,
          customer_name,
          customer_phone,
          customer_email,
          // qr_token ya no es necesario
          total_amount: 0,
          payment_status: "pending",
          order_status: "active",
        })
        .select(
          `
          *,
          tables(id, table_number, status)
        `,
        )
        .single();

      if (error) throw error;

      return {
        success: true,
        data,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // SOLO buscar tap order existente por restaurant_id, branch_number y table_number (NO auto-crear)
  async getTapOrderByTable(restaurant_id, branch_number, table_number) {
    try {
      // Usar función SQL para verificar orden activa
      const { data, error } = await supabase.rpc(
        "check_active_tap_order_by_table",
        {
          p_table_number: table_number,
          p_restaurant_id: restaurant_id,
          p_branch_number: branch_number,
        },
      );

      if (error) throw error;

      return {
        success: true,
        data: data.data || data.table_info,
        hasOrder: data.hasOrder,
        message: data.hasOrder
          ? "Active order found"
          : "No active order found for this table",
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Crear tap order al agregar primer item con platillo
  async createTapOrderWithFirstDish(
    restaurant_id,
    branch_number,
    table_number,
    dishData,
    customerData = {},
  ) {
    try {
      const {
        item,
        price,
        quantity = 1,
        images = [],
        custom_fields = null,
        extra_price = 0,
        menu_item_id = null,
        special_instructions = null,
        order_notes = null,
      } = dishData;

      // Usar función SQL para crear orden completa con primer platillo
      const { data, error } = await supabase.rpc(
        "create_tap_order_with_first_dish",
        {
          p_table_number: table_number,
          p_restaurant_id: restaurant_id,
          p_branch_number: branch_number,
          p_item: item,
          p_price: price,
          p_quantity: quantity,
          p_customer_name: customerData.customer_name || null,
          p_customer_phone: customerData.customer_phone || null,
          p_customer_email: customerData.customer_email || null,
          p_clerk_user_id: customerData.clerk_user_id || null,
          p_images: images,
          p_custom_fields: custom_fields,
          p_extra_price: extra_price,
          p_menu_item_id: menu_item_id,
          p_special_instructions: special_instructions || null,
          p_order_notes: order_notes || null,
        },
      );

      if (error) throw error;

      // Obtener resumen completo de la orden creada
      const orderSummary = await this.getTapOrderById(data.tap_order_id);

      return {
        success: true,
        data: {
          ...orderSummary.data,
          tap_order_id: data.tap_order_id,
          action: data.action,
          dish_order_id: data.dish_order_id,
        },
        isNew: data.action === "new_order_created_with_first_dish",
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener tap order por ID con resumen completo
  async getTapOrderById(id) {
    try {
      // Usar función SQL para obtener resumen completo
      const { data, error } = await supabase.rpc(
        "get_tap_order_complete_summary",
        {
          p_tap_order_id: id,
        },
      );

      if (error) throw error;

      if (!data) {
        return { success: false, error: "Tap order not found" };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar información del cliente
  async updateCustomerInfo(tap_order_id, customerData) {
    try {
      const { customer_name, customer_phone, customer_email, clerk_user_id } =
        customerData;

      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .update({
          customer_name,
          customer_phone,
          customer_email,
          clerk_user_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar estado de la orden
  async updateOrderStatus(tap_order_id, status, additionalData = {}) {
    try {
      const validStatuses = [
        "active",
        "confirmed",
        "preparing",
        "completed",
        "abandoned",
      ];
      if (!validStatuses.includes(status)) {
        return { success: false, error: "Invalid order status" };
      }

      const updateData = {
        order_status: status,
        updated_at: new Date().toISOString(),
      };

      // Si se completa, agregar timestamp
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .update(updateData)
        .eq("id", tap_order_id)
        .select()
        .single();

      if (error) throw error;

      // POS sync ahora se hace desde PaymentTransactionService.createTransaction
      // cuando se crea el pago, donde ya tenemos acceso directo al tip_amount

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar estado de pago
  async updatePaymentStatus(tap_order_id, payment_status) {
    try {
      const validStatuses = ["pending", "paid"];
      if (!validStatuses.includes(payment_status)) {
        return { success: false, error: "Invalid payment status" };
      }

      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .update({
          payment_status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Calcular total y actualizar
  async updateTotal(tap_order_id) {
    try {
      // Obtener todos los dish_orders de este tap_order
      const { data: dishOrders, error: dishError } = await supabase
        .from("dish_order")
        .select("price, quantity, extra_price")
        .eq("tap_order_id", tap_order_id);

      if (dishError) throw dishError;

      // Calcular total
      const total = dishOrders.reduce((sum, dish) => {
        const dishTotal =
          (dish.price + (dish.extra_price || 0)) * dish.quantity;
        return sum + dishTotal;
      }, 0);

      // Actualizar el total en tap_orders_and_pay
      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .update({
          total_amount: total,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data, total };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener historial de órdenes de una mesa
  async getTableOrderHistory(table_id, limit = 10) {
    try {
      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .select(
          `
          *,
          tables(table_number)
        `,
        )
        .eq("table_id", table_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener orden activa por clerk_user_id (user_id o guest_id)
  // Retorna la orden si tiene al menos un dish_order sin entregar
  async getActiveOrderByClientId(clientId, restaurantId) {
    try {
      // Buscar tap_orders_and_pay con dish_orders no entregados
      // No filtramos por order_status porque una orden "completed" (pagada) puede tener platillos pendientes de entrega
      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .select(
          `
          id,
          table_id,
          clerk_user_id,
          customer_name,
          total_amount,
          payment_status,
          order_status,
          created_at,
          tables!inner(id, table_number, restaurant_id),
          dish_order(id, item, quantity, price, status, payment_status, images)
        `,
        )
        .eq("clerk_user_id", clientId)
        .eq("tables.restaurant_id", restaurantId)
        .neq("order_status", "abandoned")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: true, hasActiveOrder: false, data: null };
      }

      // Buscar la primera orden que tenga dish_orders sin entregar
      for (const order of data) {
        const pendingDishes =
          order.dish_order?.filter((dish) => dish.status !== "delivered") || [];

        if (pendingDishes.length > 0) {
          return {
            success: true,
            hasActiveOrder: true,
            data: {
              tap_order: {
                id: order.id,
                table_id: order.table_id,
                clerk_user_id: order.clerk_user_id,
                customer_name: order.customer_name,
                total_amount: order.total_amount,
                payment_status: order.payment_status,
                order_status: order.order_status,
                created_at: order.created_at,
              },
              table: order.tables,
              dishes: order.dish_order,
              pending_dishes_count: pendingDishes.length,
            },
          };
        }
      }

      return { success: true, hasActiveOrder: false, data: null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener la última orden de un usuario en un restaurante
  async getLastOrderByUser(clientId, restaurantId) {
    try {
      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .select(
          `
          id,
          created_at,
          tables!inner(id, table_number, restaurant_id),
          dish_order(id, item, quantity, price, extra_price, images, custom_fields, menu_item_id, special_instructions)
        `,
        )
        .eq("clerk_user_id", clientId)
        .eq("tables.restaurant_id", restaurantId)
        .neq("order_status", "abandoned")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return { success: true, hasLastOrder: false, data: null };
      }

      const dishes = (data.dish_order || []).filter((d) => d.menu_item_id);

      return {
        success: true,
        hasLastOrder: dishes.length > 0,
        data: dishes.length > 0 ? { tap_order_id: data.id, dishes } : null,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Crear orden, dish orders y transacción de pago en una sola operación atómica
  async confirmOrder(data) {
    const {
      clerk_user_id = null,
      guest_id = null,
      customer_name,
      customer_email = null,
      customer_phone = null,
      restaurant_id,
      branch_number,
      table_number,
      order_notes = null,
      items,
      payment_method_id = null,
      base_amount,
      tip_amount = 0,
      total_amount_charged,
      currency = "MXN",
      payment_source = null,
      ecartpay_order_id = null,
      transaction_by = null,
      is_guest = false,
      user_id = null,
      installments = null,
    } = data;

    // Paso 0: verificar pago en EcartPay si corresponde
    if (ecartpay_order_id) {
      try {
        const verification = await ecartPayService.getOrder(ecartpay_order_id);
        if (verification.success && verification.order) {
          const PAID_STATUSES = ["paid", "completed", "succeeded", "approved"];
          if (!PAID_STATUSES.includes(verification.order.status)) {
            return {
              success: false,
              error: `El pago no fue confirmado por EcartPay (status: ${verification.order.status})`,
            };
          }
          const ecartAmount = parseFloat(verification.order.amount || 0);
          const expectedAmount = parseFloat(total_amount_charged || 0);
          if (Math.abs(ecartAmount - expectedAmount) > 1) {
            return {
              success: false,
              error: "El monto del pago no coincide con el total de la orden",
            };
          }
        }
      } catch (e) {
        console.warn(
          "[confirmOrder] No se pudo verificar EcartPay:",
          e.message,
        );
      }
    }

    // Paso 1: resolver table_id desde restaurant_id + branch_number + table_number
    const { data: branchRow, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("restaurant_id", restaurant_id)
      .eq("branch_number", branch_number)
      .single();

    if (branchError || !branchRow) {
      return { success: false, error: "Sucursal no encontrada" };
    }

    const { data: tableRow, error: tableError } = await supabase
      .from("tables")
      .select("id")
      .eq("branch_id", branchRow.id)
      .eq("table_number", table_number)
      .single();

    if (tableError || !tableRow) {
      return { success: false, error: "Mesa no encontrada" };
    }

    // Paso 2: crear tap_orders_and_pay ya pagado y completado
    const { data: order, error: orderError } = await supabase
      .from("tap_orders_and_pay")
      .insert([
        {
          table_id: tableRow.id,
          clerk_user_id: clerk_user_id || guest_id || null,
          customer_name,
          customer_phone,
          customer_email,
          total_amount: Number(total_amount_charged) || 0,
          payment_status: "paid",
          order_status: "completed",
          session_data: {},
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (orderError) throw orderError;
    const tapOrderId = order.id;

    // Paso 3: batch insert de dish_orders
    if (items && items.length > 0) {
      const dishRecords = items.map((item) => ({
        user_order_id: null,
        tap_order_id: tapOrderId,
        item: item.item,
        quantity: item.quantity || 1,
        price: item.price,
        status: "preparing",
        payment_status: "paid",
        images: item.images || [],
        custom_fields: item.custom_fields || null,
        extra_price: item.extra_price || 0,
        menu_item_id: item.menu_item_id || null,
        special_instructions: item.special_instructions || null,
      }));

      const { error: dishError } = await supabase
        .from("dish_order")
        .insert(dishRecords);

      if (dishError) throw dishError;
    }

    // Log del paso payment — solo para flujos directos (Apple Pay / Google Pay / dev).
    // Para tarjetas guardadas, processPayment ya escribió este log.
    const isDirectPayment =
      !payment_method_id || payment_method_id === "system-default-card";
    if (isDirectPayment) {
      logOrderFlowStep({
        order_id: tapOrderId,
        order_type: "tap-order-pay",
        restaurant_id,
        step: "payment",
        status: "success",
        metadata: {
          payment_method_id: payment_method_id || null,
          total_amount_charged: Number(total_amount_charged) || 0,
          currency: currency || "MXN",
        },
      }).catch(() => {});
    }

    // Paso 4: grabar transacción de pago (comisiones recalculadas en el servidor)
    const commissions = calculateCommissions(
      Number(base_amount) || 0,
      Number(tip_amount) || 0,
    );

    const transactionResult = await paymentTransactionService.createTransaction(
      {
        payment_method_id,
        restaurant_id,
        id_tap_orders_and_pay: tapOrderId,
        base_amount: Number(base_amount) || 0,
        tip_amount: Number(tip_amount) || 0,
        iva_tip: commissions.ivaTip,
        even_commission_total: commissions.evenCommissionTotal,
        even_commission_client: commissions.evenCommissionClient,
        even_commission_restaurant: commissions.evenCommissionRestaurant,
        iva_even_client: commissions.ivaEvenClient,
        iva_even_restaurant: commissions.ivaEvenRestaurant,
        even_client_charge: commissions.evenClientCharge,
        even_restaurant_charge: commissions.evenRestaurantCharge,
        even_rate_applied: commissions.evenRateApplied,
        total_amount_charged: commissions.totalAmountCharged,
        transaction_by: transaction_by || customer_name,
        currency,
        payment_source,
        ecartpay_order_id,
        installments: installments || null,
      },
      is_guest || false,
      user_id || null,
    );

    if (!transactionResult.success) {
      console.error(
        "❌ [confirmOrder] Transaction recording failed:",
        transactionResult.error,
      );
    }

    return {
      success: true,
      data: {
        order,
        transaction: transactionResult.transaction || null,
      },
    };
  }

  // Abandonar orden (cleanup)
  async abandonOrder(tap_order_id) {
    try {
      // Primero eliminar los dish_orders asociados
      await supabase
        .from("dish_order")
        .delete()
        .eq("tap_order_id", tap_order_id);

      // Luego marcar como abandonada
      const { data, error } = await supabase
        .from("tap_orders_and_pay")
        .update({
          order_status: "abandoned",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TapOrderService();
