const supabase = require("../config/supabase");

class SuperAdminService {
  /**
   * Obtiene todas las estadísticas del super admin con filtros aplicados
   * @param {Object} filters - Filtros para las estadísticas
   * @param {string} filters.start_date - Fecha de inicio (ISO string)
   * @param {string} filters.end_date - Fecha de fin (ISO string)
   * @param {number} filters.restaurant_id - ID del restaurante (opcional)
   * @param {string} filters.service - Servicio ('todos', 'flex-bill', 'tap-order-pay')
   * @param {string} filters.gender - Género ('todos', 'male', 'female', 'other')
   * @param {string} filters.age_range - Rango de edad ('todos', '18-24', '25-34', '35-44', '45-54', '55+')
   * @returns {Promise<Object>} Estadísticas completas del sistema
   */
  async getSuperAdminStats(filters) {
    const {
      start_date,
      end_date,
      restaurant_id = null,
      service = "todos",
      gender = "todos",
      age_range = "todos",
    } = filters;

    try {
      // Ejecutar todas las consultas en paralelo para mejor performance
      const [
        transactionVolume,
        xquisitoIncome,
        activeDiners,
        successfulOrders,
        activeAdmins,
        mostUsedPaymentMethod,
        totalTransactions,
        volumeByService,
        ordersByService,
        transactionsByService,
      ] = await Promise.all([
        this.getTransactionVolume(filters),
        this.getXquisitoIncome(filters),
        this.getActiveDiners(filters),
        this.getSuccessfulOrders(filters),
        this.getActiveAdmins(filters),
        this.getMostUsedPaymentMethod(filters),
        this.getTotalTransactions(filters),
        this.getVolumeByService(filters),
        this.getOrdersByService(filters),
        this.getTransactionsByService(filters),
      ]);

      return {
        success: true,
        data: {
          // Métricas principales
          transaction_volume: transactionVolume,
          xquisito_income: xquisitoIncome,
          active_diners: activeDiners,
          successful_orders: successfulOrders,
          active_admins: activeAdmins,
          most_used_payment_method: mostUsedPaymentMethod,
          total_transactions: totalTransactions,

          // Métricas por servicio
          volume_by_service: volumeByService,
          orders_by_service: ordersByService,
          transactions_by_service: transactionsByService,
        },
        filters_applied: filters,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching super admin stats:", error);
      throw new Error(`Error fetching super admin stats: ${error.message}`);
    }
  }

  // Obtiene el volumen total transaccionado
  async getTransactionVolume(filters) {
    try {
      let query = supabase
        .from("payment_transactions")
        .select("total_amount_charged");

      query = this.applyFilters(query, filters);

      const { data, error } = await query;

      if (error) throw error;

      const total = data.reduce(
        (sum, row) => sum + (parseFloat(row.total_amount_charged) || 0),
        0
      );
      return parseFloat(total.toFixed(2));
    } catch (error) {
      console.error("Error getting transaction volume:", error);
      return 0;
    }
  }

  // Obtiene los ingresos netos de Xquisito
  async getXquisitoIncome(filters) {
    try {
      let query = supabase
        .from("payment_transactions")
        .select("xquisito_net_income");

      query = this.applyFilters(query, filters);

      const { data, error } = await query;

      if (error) throw error;

      const total = data.reduce(
        (sum, row) => sum + (parseFloat(row.xquisito_net_income) || 0),
        0
      );
      return parseFloat(total.toFixed(2));
    } catch (error) {
      console.error("Error getting xquisito income:", error);
      return 0;
    }
  }

  // Obtiene el número de diners activos (usuarios que han hecho órdenes)
  async getActiveDiners(filters) {
    try {
      const {
        start_date,
        end_date,
        restaurant_id,
        service,
        gender,
        age_range,
      } = filters;

      // Obtener usuarios únicos de user_order (Flex Bill)
      // user_order no tiene created_at ni restaurant_id, así que hacemos join con table_order
      let flexBillQuery = supabase
        .from("user_order")
        .select("clerk_user_id, table_order!inner(created_at, restaurant_id)");

      if (start_date)
        flexBillQuery = flexBillQuery.gte("table_order.created_at", start_date);
      if (end_date)
        flexBillQuery = flexBillQuery.lte("table_order.created_at", end_date);
      if (restaurant_id)
        flexBillQuery = flexBillQuery.eq(
          "table_order.restaurant_id",
          restaurant_id
        );

      // Obtener usuarios únicos de tap_orders_and_pay (Tap Order & Pay)
      let tapOrderQuery = supabase
        .from("tap_orders_and_pay")
        .select("clerk_user_id");

      if (start_date)
        tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
      if (end_date) tapOrderQuery = tapOrderQuery.lte("created_at", end_date);
      if (restaurant_id)
        tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);

      const [flexBillResult, tapOrderResult] = await Promise.all([
        service === "todos" || service === "flex-bill"
          ? flexBillQuery
          : { data: [] },
        service === "todos" || service === "tap-order-pay"
          ? tapOrderQuery
          : { data: [] },
      ]);

      // Combinar todos los clerk_user_ids únicos
      const allUserIds = new Set();

      if (flexBillResult.data) {
        flexBillResult.data.forEach((row) => {
          if (row.clerk_user_id) allUserIds.add(row.clerk_user_id);
        });
      }

      if (tapOrderResult.data) {
        tapOrderResult.data.forEach((row) => {
          if (row.clerk_user_id) allUserIds.add(row.clerk_user_id);
        });
      }

      // Si hay filtros demográficos, filtrar por usuarios
      if (
        (gender !== "todos" || age_range !== "todos") &&
        allUserIds.size > 0
      ) {
        let userQuery = supabase
          .from("users")
          .select("clerk_user_id")
          .in("clerk_user_id", Array.from(allUserIds));

        if (gender !== "todos") {
          userQuery = userQuery.eq("gender", gender);
        }

        if (age_range !== "todos") {
          const ageFilter = this.getAgeFilter(age_range);
          if (ageFilter) {
            userQuery = userQuery.gte("age", ageFilter.min);
            if (ageFilter.max) {
              userQuery = userQuery.lte("age", ageFilter.max);
            }
          }
        }

        const { data: filteredUsers, error } = await userQuery;
        if (error) throw error;

        return filteredUsers ? filteredUsers.length : 0;
      }

      return allUserIds.size;
    } catch (error) {
      console.error("Error getting active diners:", error);
      return 0;
    }
  }

  // Obtiene el número total de órdenes exitosas
  async getSuccessfulOrders(filters) {
    try {
      const { start_date, end_date, restaurant_id, service } = filters;

      let flexBillCount = 0;
      let tapOrderCount = 0;

      // Contar órdenes de flex-bill
      // user_order no tiene created_at, así que contamos desde table_order
      if (service === "todos" || service === "flex-bill") {
        try {
          let flexQuery = supabase
            .from("table_order")
            .select("id", { count: "exact", head: true });

          if (start_date) flexQuery = flexQuery.gte("created_at", start_date);
          if (end_date) flexQuery = flexQuery.lte("created_at", end_date);
          if (restaurant_id)
            flexQuery = flexQuery.eq("restaurant_id", restaurant_id);

          const { count, error } = await flexQuery;
          if (error) {
            console.error("Error in flex-bill orders query:", error);
            console.error("Error details:", JSON.stringify(error));
          } else {
            flexBillCount = count || 0;
          }
        } catch (err) {
          console.error("Error querying flex-bill orders:", err);
          console.error("Error stack:", err.stack);
        }
      }

      // Contar órdenes de tap-order-pay
      if (service === "todos" || service === "tap-order-pay") {
        try {
          let tapQuery = supabase
            .from("tap_orders_and_pay")
            .select("id", { count: "exact", head: true });

          if (start_date) tapQuery = tapQuery.gte("created_at", start_date);
          if (end_date) tapQuery = tapQuery.lte("created_at", end_date);
          if (restaurant_id)
            tapQuery = tapQuery.eq("restaurant_id", restaurant_id);

          const { count, error } = await tapQuery;
          if (error) {
            console.error("Error in tap-order-pay orders query:", error);
          } else {
            tapOrderCount = count || 0;
          }
        } catch (err) {
          console.error("Error querying tap-order-pay orders:", err);
        }
      }

      return flexBillCount + tapOrderCount;
    } catch (error) {
      console.error("Error getting successful orders:", error);
      return 0;
    }
  }

  // Obtiene el número de administradores activos
  async getActiveAdmins(filters) {
    try {
      const { start_date, end_date, restaurant_id } = filters;

      let query = supabase
        .from("user_admin_portal")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      // Si hay filtro de restaurante, obtener solo admins de ese restaurante
      if (restaurant_id) {
        // Primero obtener el user_id del restaurante
        const { data: restaurant, error: restError } = await supabase
          .from("restaurants")
          .select("user_id")
          .eq("id", restaurant_id)
          .single();

        if (restError) throw restError;

        if (restaurant) {
          query = query.eq("id", restaurant.user_id);
        }
      }

      // Filtro de fecha basado en última actividad o creación
      if (start_date) query = query.gte("created_at", start_date);
      if (end_date) query = query.lte("created_at", end_date);

      const { count, error } = await query;

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error("Error getting active admins:", error);
      return 0;
    }
  }

  // Obtiene el método de pago más usado
  async getMostUsedPaymentMethod(filters) {
    try {
      let query = supabase.from("payment_transactions").select("card_type");

      query = this.applyFilters(query, filters);

      const { data, error } = await query;

      if (error) throw error;

      // Contar frecuencia de cada método de pago
      const methodCounts = {};
      data.forEach((row) => {
        const method = row.card_type || "unknown";
        methodCounts[method] = (methodCounts[method] || 0) + 1;
      });

      // Encontrar el método más usado
      let mostUsed = { method: "N/A", count: 0 };
      for (const [method, count] of Object.entries(methodCounts)) {
        if (count > mostUsed.count) {
          mostUsed = { method, count };
        }
      }

      // Formatear el nombre del método
      if (mostUsed.method === "credit") {
        mostUsed.method = "Crédito";
      } else if (mostUsed.method === "debit") {
        mostUsed.method = "Débito";
      }

      return mostUsed;
    } catch (error) {
      console.error("Error getting most used payment method:", error);
      return { method: "N/A", count: 0 };
    }
  }

  // Obtiene el total de transacciones
  async getTotalTransactions(filters) {
    try {
      let query = supabase
        .from("payment_transactions")
        .select("id", { count: "exact", head: true });

      query = this.applyFilters(query, filters);

      const { count, error } = await query;

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error("Error getting total transactions:", error);
      return 0;
    }
  }

  // Obtiene el volumen transaccionado por servicio
  async getVolumeByService(filters) {
    try {
      const { start_date, end_date, restaurant_id, service } = filters;

      const results = [];
      let flexBillVolume = 0;
      let tapOrderVolume = 0;

      // Volumen de Flex Bill
      if (service === "todos" || service === "flex-bill") {
        let flexBillQuery = supabase
          .from("payment_transactions")
          .select("total_amount_charged, id_table_order");

        if (start_date)
          flexBillQuery = flexBillQuery.gte("created_at", start_date);
        if (end_date) flexBillQuery = flexBillQuery.lte("created_at", end_date);
        if (restaurant_id)
          flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);
        flexBillQuery = flexBillQuery.not("id_table_order", "is", null);

        const flexBillResult = await flexBillQuery;
        flexBillVolume = flexBillResult.data
          ? flexBillResult.data.reduce(
              (sum, row) => sum + (parseFloat(row.total_amount_charged) || 0),
              0
            )
          : 0;

        results.push({
          service: "Flex Bill",
          volume: parseFloat(flexBillVolume.toFixed(2)),
        });
      }

      // Volumen de Tap Order & Pay
      if (service === "todos" || service === "tap-order-pay") {
        let tapOrderQuery = supabase
          .from("payment_transactions")
          .select("total_amount_charged, id_tap_orders_and_pay");

        if (start_date)
          tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
        if (end_date) tapOrderQuery = tapOrderQuery.lte("created_at", end_date);
        if (restaurant_id)
          tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
        tapOrderQuery = tapOrderQuery.not("id_tap_orders_and_pay", "is", null);

        const tapOrderResult = await tapOrderQuery;
        tapOrderVolume = tapOrderResult.data
          ? tapOrderResult.data.reduce(
              (sum, row) => sum + (parseFloat(row.total_amount_charged) || 0),
              0
            )
          : 0;

        results.push({
          service: "Tap Order & Pay",
          volume: parseFloat(tapOrderVolume.toFixed(2)),
        });
      }

      return results;
    } catch (error) {
      console.error("Error getting volume by service:", error);
      return [];
    }
  }

  // Obtiene el número de órdenes por servicio
  async getOrdersByService(filters) {
    try {
      const { start_date, end_date, restaurant_id, service } = filters;

      const results = [];

      // Órdenes de Flex Bill - contar desde table_order
      if (service === "todos" || service === "flex-bill") {
        let flexBillQuery = supabase
          .from("table_order")
          .select("id", { count: "exact", head: true });

        if (start_date)
          flexBillQuery = flexBillQuery.gte("created_at", start_date);
        if (end_date) flexBillQuery = flexBillQuery.lte("created_at", end_date);
        if (restaurant_id)
          flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);

        const flexBillResult = await flexBillQuery;
        results.push({
          service: "Flex Bill",
          count: flexBillResult.count || 0,
        });
      }

      // Órdenes de Tap Order & Pay
      if (service === "todos" || service === "tap-order-pay") {
        let tapOrderQuery = supabase
          .from("tap_orders_and_pay")
          .select("id", { count: "exact", head: true });

        if (start_date)
          tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
        if (end_date) tapOrderQuery = tapOrderQuery.lte("created_at", end_date);
        if (restaurant_id)
          tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);

        const tapOrderResult = await tapOrderQuery;
        results.push({
          service: "Tap Order & Pay",
          count: tapOrderResult.count || 0,
        });
      }

      return results;
    } catch (error) {
      console.error("Error getting orders by service:", error);
      return [];
    }
  }

  // Obtiene el número de transacciones por servicio
  async getTransactionsByService(filters) {
    try {
      const { start_date, end_date, restaurant_id, service } = filters;

      const results = [];

      // Transacciones de Flex Bill
      if (service === "todos" || service === "flex-bill") {
        let flexBillQuery = supabase
          .from("payment_transactions")
          .select("id", { count: "exact", head: true })
          .not("id_table_order", "is", null);

        if (start_date)
          flexBillQuery = flexBillQuery.gte("created_at", start_date);
        if (end_date) flexBillQuery = flexBillQuery.lte("created_at", end_date);
        if (restaurant_id)
          flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);

        const flexBillResult = await flexBillQuery;
        results.push({
          service: "Flex Bill",
          count: flexBillResult.count || 0,
        });
      }

      // Transacciones de Tap Order & Pay
      if (service === "todos" || service === "tap-order-pay") {
        let tapOrderQuery = supabase
          .from("payment_transactions")
          .select("id", { count: "exact", head: true })
          .not("id_tap_orders_and_pay", "is", null);

        if (start_date)
          tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
        if (end_date) tapOrderQuery = tapOrderQuery.lte("created_at", end_date);
        if (restaurant_id)
          tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);

        const tapOrderResult = await tapOrderQuery;
        results.push({
          service: "Tap Order & Pay",
          count: tapOrderResult.count || 0,
        });
      }

      return results;
    } catch (error) {
      console.error("Error getting transactions by service:", error);
      return [];
    }
  }

  // Aplica filtros comunes a las consultas de payment_transactions
  applyFilters(query, filters) {
    const { start_date, end_date, restaurant_id, service } = filters;

    if (start_date) {
      query = query.gte("created_at", start_date);
    }
    if (end_date) {
      query = query.lte("created_at", end_date);
    }
    if (restaurant_id) {
      query = query.eq("restaurant_id", restaurant_id);
    }

    // Filtrar por tipo de servicio
    if (service && service !== "todos") {
      if (service === "flex-bill") {
        // Solo transacciones de Flex Bill (tienen id_table_order)
        query = query.not("id_table_order", "is", null);
      } else if (service === "tap-order-pay") {
        // Solo transacciones de Tap Order & Pay (tienen id_tap_orders_and_pay)
        query = query.not("id_tap_orders_and_pay", "is", null);
      }
    }

    return query;
  }

  // Convierte rango de edad en filtro de edad mínima y máxima
  getAgeFilter(age_range) {
    const ranges = {
      "18-24": { min: 18, max: 24 },
      "25-34": { min: 25, max: 34 },
      "35-44": { min: 35, max: 44 },
      "45-54": { min: 45, max: 54 },
      "55+": { min: 55, max: null },
    };

    return ranges[age_range] || null;
  }

  // Obtener todos los restaurantes del sistema
  async getAllRestaurants() {
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching restaurants:", error);
        throw new Error("Error al obtener los restaurantes");
      }

      return data || [];
    } catch (error) {
      console.error("Error in getAllRestaurants:", error);
      throw error;
    }
  }
}

module.exports = new SuperAdminService();
