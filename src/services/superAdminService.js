const supabase = require("../config/supabase");

class SuperAdminService {
  /**
   * Obtiene todas las estadísticas del super admin con filtros aplicados
   * @param {Object} filters - Filtros para las estadísticas
   * @param {string} filters.start_date - Fecha de inicio (ISO string)
   * @param {string} filters.end_date - Fecha de fin (ISO string)
   * @param {number|number[]|string} filters.restaurant_id - ID del restaurante, array de IDs, o 'todos' (opcional)
   * @param {string} filters.service - Servicio ('todos', 'flex-bill', 'tap-order-pay')
   * @param {string} filters.gender - Género ('todos', 'male', 'female', 'other')
   * @param {string} filters.age_range - Rango de edad ('todos', '18-24', '25-34', '35-44', '45-54', '55+')
   * @returns {Promise<Object>} Estadísticas completas del sistema
   */
  async getSuperAdminStats(filters) {
    const {
      start_date,
      end_date,
      restaurant_id = "todos",
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
        flexBillQuery = flexBillQuery.lt(
          "table_order.created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          flexBillQuery = flexBillQuery.in(
            "table_order.restaurant_id",
            restaurant_id
          );
        } else {
          flexBillQuery = flexBillQuery.eq(
            "table_order.restaurant_id",
            restaurant_id
          );
        }
      }

      // Obtener usuarios únicos de tap_orders_and_pay (Tap Order & Pay)
      let tapOrderQuery = supabase
        .from("tap_orders_and_pay")
        .select("clerk_user_id");

      if (start_date)
        tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
      if (end_date)
        tapOrderQuery = tapOrderQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          tapOrderQuery = tapOrderQuery.in("restaurant_id", restaurant_id);
        } else {
          tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
        }
      }

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
          if (end_date)
            flexQuery = flexQuery.lt(
              "created_at",
              this.getEndDateInclusive(end_date)
            );
          if (restaurant_id && restaurant_id !== "todos") {
            if (Array.isArray(restaurant_id)) {
              flexQuery = flexQuery.in("restaurant_id", restaurant_id);
            } else {
              flexQuery = flexQuery.eq("restaurant_id", restaurant_id);
            }
          }

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
          if (end_date)
            tapQuery = tapQuery.lt(
              "created_at",
              this.getEndDateInclusive(end_date)
            );
          if (restaurant_id && restaurant_id !== "todos") {
            if (Array.isArray(restaurant_id)) {
              tapQuery = tapQuery.in("restaurant_id", restaurant_id);
            } else {
              tapQuery = tapQuery.eq("restaurant_id", restaurant_id);
            }
          }

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
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          // Si es un array, obtener los user_ids de todos los restaurantes
          const { data: restaurants, error: restError } = await supabase
            .from("restaurants")
            .select("user_id")
            .in("id", restaurant_id);

          if (restError) throw restError;

          if (restaurants && restaurants.length > 0) {
            const userIds = restaurants
              .map((r) => r.user_id)
              .filter((id) => id != null);
            if (userIds.length > 0) {
              query = query.in("id", userIds);
            }
          }
        } else {
          // Si es un único ID, obtener el user_id del restaurante
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
      }

      // Filtro de fecha basado en última actividad o creación
      if (start_date) query = query.gte("created_at", start_date);
      if (end_date)
        query = query.lt("created_at", this.getEndDateInclusive(end_date));

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
        if (end_date)
          flexBillQuery = flexBillQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            flexBillQuery = flexBillQuery.in("restaurant_id", restaurant_id);
          } else {
            flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);
          }
        }
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
        if (end_date)
          tapOrderQuery = tapOrderQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            tapOrderQuery = tapOrderQuery.in("restaurant_id", restaurant_id);
          } else {
            tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
          }
        }
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

      console.log("=== getOrdersByService ===");
      console.log("Filters:", { start_date, end_date, restaurant_id, service });

      const results = [];

      // Órdenes de Flex Bill - contar desde table_order
      if (service === "todos" || service === "flex-bill") {
        let flexBillQuery = supabase
          .from("table_order")
          .select("id", { count: "exact", head: true });

        if (start_date)
          flexBillQuery = flexBillQuery.gte("created_at", start_date);
        if (end_date)
          flexBillQuery = flexBillQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            flexBillQuery = flexBillQuery.in("restaurant_id", restaurant_id);
          } else {
            flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);
          }
        }

        const flexBillResult = await flexBillQuery;
        console.log("Flex Bill orders count:", flexBillResult.count);
        if (flexBillResult.error) {
          console.error("Flex Bill error:", flexBillResult.error);
        }
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
        if (end_date)
          tapOrderQuery = tapOrderQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            tapOrderQuery = tapOrderQuery.in("restaurant_id", restaurant_id);
          } else {
            tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
          }
        }

        const tapOrderResult = await tapOrderQuery;
        console.log("Tap Order & Pay orders count:", tapOrderResult.count);
        if (tapOrderResult.error) {
          console.error("Tap Order & Pay error:", tapOrderResult.error);
        }
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
        if (end_date)
          flexBillQuery = flexBillQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            flexBillQuery = flexBillQuery.in("restaurant_id", restaurant_id);
          } else {
            flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);
          }
        }

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
        if (end_date)
          tapOrderQuery = tapOrderQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            tapOrderQuery = tapOrderQuery.in("restaurant_id", restaurant_id);
          } else {
            tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
          }
        }

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
      // Usar .lt() con el día siguiente para incluir TODO el día end_date
      query = query.lt("created_at", this.getEndDateInclusive(end_date));
    }
    // Manejar restaurant_id como número único, array de números, o 'todos'
    if (restaurant_id && restaurant_id !== "todos") {
      if (Array.isArray(restaurant_id)) {
        // Si es un array, usar 'in' para filtrar por múltiples IDs
        query = query.in("restaurant_id", restaurant_id);
      } else {
        // Si es un número único, usar 'eq'
        query = query.eq("restaurant_id", restaurant_id);
      }
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

  // Convierte una fecha de fin para incluir TODO el día
  // Si end_date es "2025-01-12", retorna "2025-01-13T00:00:00..."
  // para que .lt() incluya todo el día 12
  getEndDateInclusive(end_date) {
    if (!end_date) return null;
    const endDatePlusOne = new Date(end_date);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    return endDatePlusOne.toISOString();
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

  /**
   * Obtiene datos temporales de volumen por servicio (para gráfica de líneas)
   * @param {Object} filters - Filtros para los datos
   * @param {string} filters.view_type - Tipo de vista ('daily', 'weekly', 'monthly')
   * @param {string} filters.start_date - Fecha de inicio (ISO string)
   * @param {string} filters.end_date - Fecha de fin (ISO string)
   * @param {number|number[]|string} filters.restaurant_id - ID del restaurante, array de IDs, o 'todos'
   * @param {string} filters.service - Servicio ('todos', 'flex-bill', 'tap-order-pay')
   * @returns {Promise<Array>} Datos temporales de volumen
   */
  async getVolumeTimeline(filters) {
    const {
      view_type = "daily",
      start_date,
      end_date,
      restaurant_id = "todos",
      service = "todos",
    } = filters;

    try {
      // Obtener transacciones de Flex Bill
      let flexBillQuery = supabase
        .from("payment_transactions")
        .select("created_at, total_amount_charged, restaurant_id")
        .not("id_table_order", "is", null);

      if (start_date)
        flexBillQuery = flexBillQuery.gte("created_at", start_date);
      if (end_date)
        flexBillQuery = flexBillQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          flexBillQuery = flexBillQuery.in("restaurant_id", restaurant_id);
        } else {
          flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);
        }
      }

      // Obtener transacciones de Tap Order & Pay
      let tapOrderQuery = supabase
        .from("payment_transactions")
        .select("created_at, total_amount_charged, restaurant_id")
        .not("id_tap_orders_and_pay", "is", null);

      if (start_date)
        tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
      if (end_date)
        tapOrderQuery = tapOrderQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          tapOrderQuery = tapOrderQuery.in("restaurant_id", restaurant_id);
        } else {
          tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
        }
      }

      const [flexBillResult, tapOrderResult] = await Promise.all([
        service === "todos" || service === "flex-bill"
          ? flexBillQuery
          : { data: [] },
        service === "todos" || service === "tap-order-pay"
          ? tapOrderQuery
          : { data: [] },
      ]);

      // Agrupar datos por período de tiempo
      const groupedData = this.groupDataByTimePeriod(
        flexBillResult.data || [],
        tapOrderResult.data || [],
        view_type,
        "volume",
        start_date,
        end_date
      );

      return groupedData;
    } catch (error) {
      console.error("Error getting volume timeline:", error);
      throw error;
    }
  }

  /**
   * Obtiene datos temporales de órdenes por servicio (para gráfica de líneas)
   */
  async getOrdersTimeline(filters) {
    const {
      view_type = "daily",
      start_date,
      end_date,
      restaurant_id = "todos",
      service = "todos",
    } = filters;

    try {
      // Obtener órdenes de Flex Bill
      let flexBillQuery = supabase
        .from("table_order")
        .select("created_at, id, restaurant_id");

      if (start_date)
        flexBillQuery = flexBillQuery.gte("created_at", start_date);
      if (end_date)
        flexBillQuery = flexBillQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          flexBillQuery = flexBillQuery.in("restaurant_id", restaurant_id);
        } else {
          flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);
        }
      }

      // Obtener órdenes de Tap Order & Pay
      let tapOrderQuery = supabase
        .from("tap_orders_and_pay")
        .select("created_at, id, restaurant_id");

      if (start_date)
        tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
      if (end_date)
        tapOrderQuery = tapOrderQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          tapOrderQuery = tapOrderQuery.in("restaurant_id", restaurant_id);
        } else {
          tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
        }
      }

      const [flexBillResult, tapOrderResult] = await Promise.all([
        service === "todos" || service === "flex-bill"
          ? flexBillQuery
          : { data: [] },
        service === "todos" || service === "tap-order-pay"
          ? tapOrderQuery
          : { data: [] },
      ]);

      // Agrupar datos por período de tiempo
      const groupedData = this.groupDataByTimePeriod(
        flexBillResult.data || [],
        tapOrderResult.data || [],
        view_type,
        "orders",
        start_date,
        end_date
      );

      console.log(groupedData);

      return groupedData;
    } catch (error) {
      console.error("Error getting orders timeline:", error);
      throw error;
    }
  }

  /**
   * Obtiene datos temporales de transacciones por servicio (para gráfica de líneas)
   */
  async getTransactionsTimeline(filters) {
    const {
      view_type = "daily",
      start_date,
      end_date,
      restaurant_id = "todos",
      service = "todos",
    } = filters;

    try {
      // Obtener transacciones de Flex Bill
      let flexBillQuery = supabase
        .from("payment_transactions")
        .select("created_at, id, restaurant_id")
        .not("id_table_order", "is", null);

      if (start_date)
        flexBillQuery = flexBillQuery.gte("created_at", start_date);
      if (end_date)
        flexBillQuery = flexBillQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          flexBillQuery = flexBillQuery.in("restaurant_id", restaurant_id);
        } else {
          flexBillQuery = flexBillQuery.eq("restaurant_id", restaurant_id);
        }
      }

      // Obtener transacciones de Tap Order & Pay
      let tapOrderQuery = supabase
        .from("payment_transactions")
        .select("created_at, id, restaurant_id")
        .not("id_tap_orders_and_pay", "is", null);

      if (start_date)
        tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
      if (end_date)
        tapOrderQuery = tapOrderQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          tapOrderQuery = tapOrderQuery.in("restaurant_id", restaurant_id);
        } else {
          tapOrderQuery = tapOrderQuery.eq("restaurant_id", restaurant_id);
        }
      }

      const [flexBillResult, tapOrderResult] = await Promise.all([
        service === "todos" || service === "flex-bill"
          ? flexBillQuery
          : { data: [] },
        service === "todos" || service === "tap-order-pay"
          ? tapOrderQuery
          : { data: [] },
      ]);

      // Agrupar datos por período de tiempo
      const groupedData = this.groupDataByTimePeriod(
        flexBillResult.data || [],
        tapOrderResult.data || [],
        view_type,
        "transactions",
        start_date,
        end_date
      );

      return groupedData;
    } catch (error) {
      console.error("Error getting transactions timeline:", error);
      throw error;
    }
  }

  /**
   * Agrupa datos por período de tiempo (daily, weekly, monthly)
   * @private
   */
  groupDataByTimePeriod(
    flexBillData,
    tapOrderData,
    viewType,
    dataType,
    filterStartDate,
    filterEndDate
  ) {
    const grouped = {};

    // Función para formatear la fecha según el tipo de vista
    const getDateKey = (dateString) => {
      const date = new Date(dateString);

      if (viewType === "daily") {
        return date.toISOString().split("T")[0]; // YYYY-MM-DD
      } else if (viewType === "weekly") {
        // Obtener el inicio de la semana (lunes)
        const dayOfWeek = date.getDay();
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return monday.toISOString().split("T")[0];
      } else if (viewType === "monthly") {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}`; // YYYY-MM
      }
    };

    // Procesar datos de Flex Bill
    flexBillData.forEach((item) => {
      const dateKey = getDateKey(item.created_at);
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
          "Flex Bill": 0,
          "Tap Order & Pay": 0,
        };
      }

      if (dataType === "volume") {
        grouped[dateKey]["Flex Bill"] += parseFloat(
          item.total_amount_charged || 0
        );
      } else {
        grouped[dateKey]["Flex Bill"] += 1;
      }
    });

    // Procesar datos de Tap Order & Pay
    tapOrderData.forEach((item) => {
      const dateKey = getDateKey(item.created_at);
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
          "Flex Bill": 0,
          "Tap Order & Pay": 0,
        };
      }

      if (dataType === "volume") {
        grouped[dateKey]["Tap Order & Pay"] += parseFloat(
          item.total_amount_charged || 0
        );
      } else {
        grouped[dateKey]["Tap Order & Pay"] += 1;
      }
    });

    // Convertir a array y ordenar por fecha
    const sortedData = Object.values(grouped).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Para vista diaria, rellenar todos los días faltantes en el rango
    if (viewType === "daily" && filterStartDate && filterEndDate) {
      const filledData = [];
      // Usar las fechas de los filtros en lugar de las fechas de los datos
      const startDate = new Date(filterStartDate);
      const endDate = new Date(filterEndDate);

      // Iterar día por día desde el inicio hasta el final
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split("T")[0];

        // Buscar si existe data para este día
        const existingData = sortedData.find((item) => item.date === dateKey);

        if (existingData) {
          filledData.push(existingData);
        } else {
          // Agregar día con valores en 0
          filledData.push({
            date: dateKey,
            "Flex Bill": 0,
            "Tap Order & Pay": 0,
          });
        }

        // Avanzar al siguiente día
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return filledData;
    }

    return sortedData;
  }
}

module.exports = new SuperAdminService();
