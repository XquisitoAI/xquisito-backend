const supabase = require("../config/supabase");

class SuperAdminService {
  // Calcula el período anterior basado en el período actual
  getPreviousPeriod(start_date, end_date) {
    if (!start_date || !end_date)
      return { previous_start_date: null, previous_end_date: null };

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // Calcular duración del período en días
    const durationMs = endDate - startDate;
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

    // Calcular período anterior
    const previousEndDate = new Date(startDate);
    previousEndDate.setDate(previousEndDate.getDate() - 1); // Un día antes del start_date actual

    const previousStartDate = new Date(previousEndDate);
    previousStartDate.setDate(previousStartDate.getDate() - durationDays + 1);

    return {
      previous_start_date: previousStartDate.toISOString().split("T")[0],
      previous_end_date: previousEndDate.toISOString().split("T")[0],
    };
  }

  // Calcula el porcentaje de cambio entre dos valores
  calculateChange(current, previous) {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return parseFloat((((current - previous) / previous) * 100).toFixed(2));
  }

  // Obtiene todas las estadísticas del super admin con filtros aplicados
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
      // Calcular período anterior
      const { previous_start_date, previous_end_date } = this.getPreviousPeriod(
        start_date,
        end_date
      );
      const previousFilters = {
        ...filters,
        start_date: previous_start_date,
        end_date: previous_end_date,
      };

      // Ejecutar consultas para período actual
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

      // Ejecutar consultas para período anterior (solo si hay fechas)
      let previousStats = null;
      if (previous_start_date && previous_end_date) {
        const [
          prevTransactionVolume,
          prevXquisitoIncome,
          prevActiveDiners,
          prevSuccessfulOrders,
          prevActiveAdmins,
          prevTotalTransactions,
        ] = await Promise.all([
          this.getTransactionVolume(previousFilters),
          this.getXquisitoIncome(previousFilters),
          this.getActiveDiners(previousFilters),
          this.getSuccessfulOrders(previousFilters),
          this.getActiveAdmins(previousFilters),
          this.getTotalTransactions(previousFilters),
        ]);

        previousStats = {
          transaction_volume: prevTransactionVolume,
          xquisito_income: prevXquisitoIncome,
          active_diners: prevActiveDiners,
          successful_orders: prevSuccessfulOrders,
          active_admins: prevActiveAdmins,
          total_transactions: prevTotalTransactions,
        };
      }

      // Calcular cambios porcentuales
      const changes = previousStats
        ? {
            transaction_volume_change: this.calculateChange(
              transactionVolume,
              previousStats.transaction_volume
            ),
            xquisito_income_change: this.calculateChange(
              xquisitoIncome,
              previousStats.xquisito_income
            ),
            active_diners_change: this.calculateChange(
              activeDiners,
              previousStats.active_diners
            ),
            successful_orders_change: this.calculateChange(
              successfulOrders,
              previousStats.successful_orders
            ),
            active_admins_change: this.calculateChange(
              activeAdmins,
              previousStats.active_admins
            ),
            total_transactions_change: this.calculateChange(
              totalTransactions,
              previousStats.total_transactions
            ),
          }
        : {
            transaction_volume_change: 0,
            xquisito_income_change: 0,
            active_diners_change: 0,
            successful_orders_change: 0,
            active_admins_change: 0,
            total_transactions_change: 0,
          };

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

          // Cambios porcentuales
          ...changes,

          // Métricas del período anterior (para referencia)
          previous_period: previousStats,

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
      let flexBillQuery = supabase
        .from("user_order")
        .select(
          "user_id, guest_id, table_order!inner(created_at, table_id, tables!inner(restaurant_id))"
        );

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
            "table_order.tables.restaurant_id",
            restaurant_id
          );
        } else {
          flexBillQuery = flexBillQuery.eq(
            "table_order.tables.restaurant_id",
            restaurant_id
          );
        }
      }

      // Obtener usuarios únicos de tap_orders_and_pay (Tap Order & Pay)
      let tapOrderQuery = supabase
        .from("tap_orders_and_pay")
        .select("clerk_user_id, tables!inner(restaurant_id)");

      if (start_date)
        tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
      if (end_date)
        tapOrderQuery = tapOrderQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          tapOrderQuery = tapOrderQuery.in(
            "tables.restaurant_id",
            restaurant_id
          );
        } else {
          tapOrderQuery = tapOrderQuery.eq(
            "tables.restaurant_id",
            restaurant_id
          );
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

      // Combinar todos los IDs únicos (user_id, guest_id, clerk_user_id)
      const allUserIds = new Set();
      const allGuestIds = new Set();

      // Procesar Flex Bill - user_id y guest_id
      if (flexBillResult.data) {
        flexBillResult.data.forEach((row) => {
          // Preferir user_id (usuario registrado) sobre guest_id
          if (row.user_id) {
            allUserIds.add(row.user_id);
          } else if (row.guest_id) {
            allGuestIds.add(row.guest_id);
          }
        });
      }

      // Procesar Tap Order & Pay - clerk_user_id
      if (tapOrderResult.data) {
        tapOrderResult.data.forEach((row) => {
          if (row.clerk_user_id) allUserIds.add(row.clerk_user_id);
        });
      }

      // Si hay filtros demográficos, filtrar por usuarios registrados
      if (
        (gender !== "todos" || age_range !== "todos") &&
        allUserIds.size > 0
      ) {
        let userQuery = supabase
          .from("users")
          .select("id")
          .in("id", Array.from(allUserIds));

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

        // Solo contamos usuarios registrados que cumplen los filtros demográficos
        // Los invitados (guest_id) no tienen demografía, así que no se incluyen cuando hay filtros
        return filteredUsers ? filteredUsers.length : 0;
      }

      // Sin filtros demográficos: contar usuarios registrados + invitados
      return allUserIds.size + allGuestIds.size;
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
      let pickOrderCount = 0;
      let roomOrderCount = 0;

      // Contar órdenes de flex-bill
      // user_order no tiene created_at, así que contamos desde table_order
      if (service === "todos" || service === "flex-bill") {
        try {
          let flexQuery = supabase
            .from("table_order")
            .select("id, tables!inner(restaurant_id)", {
              count: "exact",
              head: true,
            });

          if (start_date) flexQuery = flexQuery.gte("created_at", start_date);
          if (end_date)
            flexQuery = flexQuery.lt(
              "created_at",
              this.getEndDateInclusive(end_date)
            );
          if (restaurant_id && restaurant_id !== "todos") {
            if (Array.isArray(restaurant_id)) {
              flexQuery = flexQuery.in("tables.restaurant_id", restaurant_id);
            } else {
              flexQuery = flexQuery.eq("tables.restaurant_id", restaurant_id);
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
            .select("id, tables!inner(restaurant_id)", {
              count: "exact",
              head: true,
            });

          if (start_date) tapQuery = tapQuery.gte("created_at", start_date);
          if (end_date)
            tapQuery = tapQuery.lt(
              "created_at",
              this.getEndDateInclusive(end_date)
            );
          if (restaurant_id && restaurant_id !== "todos") {
            if (Array.isArray(restaurant_id)) {
              tapQuery = tapQuery.in("tables.restaurant_id", restaurant_id);
            } else {
              tapQuery = tapQuery.eq("tables.restaurant_id", restaurant_id);
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

      // Contar órdenes de pick and go
      if (service === "todos" || service === "pick-and-go") {
        try {
          let pickQuery = supabase
            .from("pick_and_go_orders")
            .select("id, restaurant_id", {
              count: "exact",
              head: true,
            });

          if (start_date) pickQuery = pickQuery.gte("created_at", start_date);
          if (end_date)
            pickQuery = pickQuery.lt(
              "created_at",
              this.getEndDateInclusive(end_date)
            );
          if (restaurant_id && restaurant_id !== "todos") {
            if (Array.isArray(restaurant_id)) {
              pickQuery = pickQuery.in("restaurant_id", restaurant_id);
            } else {
              pickQuery = pickQuery.eq("restaurant_id", restaurant_id);
            }
          }

          const { count, error } = await pickQuery;
          if (error) {
            console.error("Error in pick-and-go orders query:", error);
          } else {
            pickOrderCount = count || 0;
          }
        } catch (err) {
          console.error("Error querying pick-and-go orders:", err);
        }
      }

      // Contar órdenes de room service
      if (service === "todos" || service === "room-service") {
        try {
          let roomQuery = supabase
            .from("room_orders")
            .select("id, rooms!inner(restaurant_id)", {
              count: "exact",
              head: true,
            });

          if (start_date) {
            roomQuery = roomQuery.gte("created_at", start_date);
          }

          if (end_date) {
            roomQuery = roomQuery.lt(
              "created_at",
              this.getEndDateInclusive(end_date)
            );
          }

          if (restaurant_id && restaurant_id !== "todos") {
            if (Array.isArray(restaurant_id)) {
              roomQuery = roomQuery.in("rooms.restaurant_id", restaurant_id);
            } else {
              roomQuery = roomQuery.eq("rooms.restaurant_id", restaurant_id);
            }
          }

          const { count, error } = await roomQuery;

          if (error) {
            console.error("Error in room-service orders query:", error);
          } else {
            roomOrderCount = count || 0;
          }
        } catch (err) {
          console.error("Error querying room-service orders:", err);
        }
      }

      return flexBillCount + tapOrderCount + pickOrderCount + roomOrderCount;
    } catch (error) {
      console.error("Error getting successful orders:", error);
      return 0;
    }
  }

  // Obtiene el número de administradores activos
  // NOTA: Este método NO aplica filtros
  async getActiveAdmins() {
    try {
      // Ignorar todos los filtros - siempre devolver el total de administradores activos
      const query = supabase
        .from("user_admin_portal")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

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

      console.log("🔍 getVolumeByService - Filters:", filters);

      const results = [];
      let flexBillVolume = 0;
      let tapOrderVolume = 0;
      let pickAndGoVolume = 0;
      let roomServiceVolume = 0;

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

        console.log(
          `💰 Flex Bill Volume: ${flexBillVolume} (${flexBillResult.data?.length || 0} transactions)`
        );

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

        console.log(
          `💰 Tap Order & Pay Volume: ${tapOrderVolume} (${tapOrderResult.data?.length || 0} transactions)`
        );

        results.push({
          service: "Tap Order & Pay",
          volume: parseFloat(tapOrderVolume.toFixed(2)),
        });
      }

      // Volumen de Pick & Go
      if (service === "todos" || service === "pick-and-go") {
        let pickAndGoQuery = supabase
          .from("payment_transactions")
          .select("total_amount_charged, id_pick_and_go_order");

        if (start_date)
          pickAndGoQuery = pickAndGoQuery.gte("created_at", start_date);
        if (end_date)
          pickAndGoQuery = pickAndGoQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            pickAndGoQuery = pickAndGoQuery.in("restaurant_id", restaurant_id);
          } else {
            pickAndGoQuery = pickAndGoQuery.eq("restaurant_id", restaurant_id);
          }
        }
        pickAndGoQuery = pickAndGoQuery.not("id_pick_and_go_order", "is", null);

        const pickAndGoResult = await pickAndGoQuery;
        pickAndGoVolume = pickAndGoResult.data
          ? pickAndGoResult.data.reduce(
              (sum, row) => sum + (parseFloat(row.total_amount_charged) || 0),
              0
            )
          : 0;

        console.log(
          `💰 Pick & Go Volume: ${pickAndGoVolume} (${pickAndGoResult.data?.length || 0} transactions)`
        );

        results.push({
          service: "Pick & Go",
          volume: parseFloat(pickAndGoVolume.toFixed(2)),
        });
      }

      // Volumen de Room Service
      if (service === "todos" || service === "room-service") {
        let roomServiceQuery = supabase
          .from("payment_transactions")
          .select("total_amount_charged, id_room_order");

        if (start_date)
          roomServiceQuery = roomServiceQuery.gte("created_at", start_date);
        if (end_date)
          roomServiceQuery = roomServiceQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            roomServiceQuery = roomServiceQuery.in(
              "restaurant_id",
              restaurant_id
            );
          } else {
            roomServiceQuery = roomServiceQuery.eq(
              "restaurant_id",
              restaurant_id
            );
          }
        }
        roomServiceQuery = roomServiceQuery.not("id_room_order", "is", null);

        const roomServiceResult = await roomServiceQuery;
        roomServiceVolume = roomServiceResult.data
          ? roomServiceResult.data.reduce(
              (sum, row) => sum + (parseFloat(row.total_amount_charged) || 0),
              0
            )
          : 0;

        console.log(
          `💰 Room Service Volume: ${roomServiceVolume} (${roomServiceResult.data?.length || 0} transactions)`
        );

        results.push({
          service: "Room Service",
          volume: parseFloat(roomServiceVolume.toFixed(2)),
        });
      }

      console.log("📊 Volume by Service Results:", results);
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

      console.log("🔍 getOrdersByService - Filters:", filters);

      const results = [];

      // Órdenes de Flex Bill - contar desde table_order
      if (service === "todos" || service === "flex-bill") {
        let flexBillQuery = supabase
          .from("table_order")
          .select("id, tables!inner(restaurant_id)", {
            count: "exact",
            head: true,
          });

        if (start_date)
          flexBillQuery = flexBillQuery.gte("created_at", start_date);
        if (end_date)
          flexBillQuery = flexBillQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            flexBillQuery = flexBillQuery.in(
              "tables.restaurant_id",
              restaurant_id
            );
          } else {
            flexBillQuery = flexBillQuery.eq(
              "tables.restaurant_id",
              restaurant_id
            );
          }
        }

        const flexBillResult = await flexBillQuery;
        console.log(`📦 Flex Bill Orders: ${flexBillResult.count || 0}`);
        results.push({
          service: "Flex Bill",
          count: flexBillResult.count || 0,
        });
      }

      // Órdenes de Tap Order & Pay
      if (service === "todos" || service === "tap-order-pay") {
        let tapOrderQuery = supabase
          .from("tap_orders_and_pay")
          .select("id, tables!inner(restaurant_id)", {
            count: "exact",
            head: true,
          });

        if (start_date)
          tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
        if (end_date)
          tapOrderQuery = tapOrderQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            tapOrderQuery = tapOrderQuery.in(
              "tables.restaurant_id",
              restaurant_id
            );
          } else {
            tapOrderQuery = tapOrderQuery.eq(
              "tables.restaurant_id",
              restaurant_id
            );
          }
        }

        const tapOrderResult = await tapOrderQuery;
        console.log(`📦 Tap Order & Pay Orders: ${tapOrderResult.count || 0}`);
        results.push({
          service: "Tap Order & Pay",
          count: tapOrderResult.count || 0,
        });
      }

      // Órdenes de Pick & Go
      if (service === "todos" || service === "pick-and-go") {
        let pickAndGoQuery = supabase.from("pick_and_go_orders").select("id", {
          count: "exact",
          head: true,
        });

        if (start_date)
          pickAndGoQuery = pickAndGoQuery.gte("created_at", start_date);
        if (end_date)
          pickAndGoQuery = pickAndGoQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            pickAndGoQuery = pickAndGoQuery.in("restaurant_id", restaurant_id);
          } else {
            pickAndGoQuery = pickAndGoQuery.eq("restaurant_id", restaurant_id);
          }
        }

        const pickAndGoResult = await pickAndGoQuery;
        console.log(`📦 Pick & Go Orders: ${pickAndGoResult.count || 0}`);
        results.push({
          service: "Pick & Go",
          count: pickAndGoResult.count || 0,
        });
      }

      // Órdenes de Room Service
      if (service === "todos" || service === "room-service") {
        let roomServiceQuery = supabase.from("room_orders").select("id", {
          count: "exact",
          head: true,
        });

        if (start_date)
          roomServiceQuery = roomServiceQuery.gte("created_at", start_date);
        if (end_date)
          roomServiceQuery = roomServiceQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            roomServiceQuery = roomServiceQuery.in(
              "restaurant_id",
              restaurant_id
            );
          } else {
            roomServiceQuery = roomServiceQuery.eq(
              "restaurant_id",
              restaurant_id
            );
          }
        }

        const roomServiceResult = await roomServiceQuery;
        console.log(`📦 Room Service Orders: ${roomServiceResult.count || 0}`);
        results.push({
          service: "Room Service",
          count: roomServiceResult.count || 0,
        });
      }

      console.log("📊 Orders by Service Results:", results);
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

      console.log("🔍 getTransactionsByService - Filters:", filters);

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
        console.log(`💳 Flex Bill Transactions: ${flexBillResult.count || 0}`);
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
        console.log(
          `💳 Tap Order & Pay Transactions: ${tapOrderResult.count || 0}`
        );
        results.push({
          service: "Tap Order & Pay",
          count: tapOrderResult.count || 0,
        });
      }

      // Transacciones de Pick & Go
      if (service === "todos" || service === "pick-and-go") {
        let pickAndGoQuery = supabase
          .from("payment_transactions")
          .select("id", { count: "exact", head: true })
          .not("id_pick_and_go_order", "is", null);

        if (start_date)
          pickAndGoQuery = pickAndGoQuery.gte("created_at", start_date);
        if (end_date)
          pickAndGoQuery = pickAndGoQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            pickAndGoQuery = pickAndGoQuery.in("restaurant_id", restaurant_id);
          } else {
            pickAndGoQuery = pickAndGoQuery.eq("restaurant_id", restaurant_id);
          }
        }

        const pickAndGoResult = await pickAndGoQuery;
        console.log(`💳 Pick & Go Transactions: ${pickAndGoResult.count || 0}`);
        results.push({
          service: "Pick & Go",
          count: pickAndGoResult.count || 0,
        });
      }

      // Transacciones de Room Service
      if (service === "todos" || service === "room-service") {
        let roomServiceQuery = supabase
          .from("payment_transactions")
          .select("id", { count: "exact", head: true })
          .not("id_room_order", "is", null);

        if (start_date)
          roomServiceQuery = roomServiceQuery.gte("created_at", start_date);
        if (end_date)
          roomServiceQuery = roomServiceQuery.lt(
            "created_at",
            this.getEndDateInclusive(end_date)
          );
        if (restaurant_id && restaurant_id !== "todos") {
          if (Array.isArray(restaurant_id)) {
            roomServiceQuery = roomServiceQuery.in(
              "restaurant_id",
              restaurant_id
            );
          } else {
            roomServiceQuery = roomServiceQuery.eq(
              "restaurant_id",
              restaurant_id
            );
          }
        }

        const roomServiceResult = await roomServiceQuery;
        console.log(
          `💳 Room Service Transactions: ${roomServiceResult.count || 0}`
        );
        results.push({
          service: "Room Service",
          count: roomServiceResult.count || 0,
        });
      }

      console.log("📊 Transactions by Service Results:", results);
      return results;
    } catch (error) {
      console.error("Error getting transactions by service:", error);
      return [];
    }
  }

  // Aplica filtros comunes a las consultas de payment_transactions
  applyFilters(query, filters) {
    const { start_date, end_date, restaurant_id, service } = filters;

    console.log("🔧 applyFilters - Service filter:", service);

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
        console.log("✅ Filtering for Flex Bill");
        query = query.not("id_table_order", "is", null);
      } else if (service === "tap-order-pay") {
        // Solo transacciones de Tap Order & Pay (tienen id_tap_orders_and_pay)
        console.log("✅ Filtering for Tap Order & Pay");
        query = query.not("id_tap_orders_and_pay", "is", null);
      } else if (service === "pick-and-go") {
        // Solo transacciones de Pick & Go (tienen id_pick_and_go_order)
        console.log("✅ Filtering for Pick & Go");
        query = query.not("id_pick_and_go_order", "is", null);
      } else if (service === "room-service") {
        // Solo transacciones de Room Service (tienen id_room_order)
        console.log("✅ Filtering for Room Service");
        query = query.not("id_room_order", "is", null);
      }
    } else {
      console.log("✅ No service filter (todos)");
    }

    return query;
  }

  // Convierte una fecha de fin para incluir TODO el día
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

  // Obtiene datos temporales de volumen por servicio
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

      // Obtener transacciones de Pick & Go
      let pickAndGoQuery = supabase
        .from("payment_transactions")
        .select("created_at, total_amount_charged, restaurant_id")
        .not("id_pick_and_go_order", "is", null);

      if (start_date)
        pickAndGoQuery = pickAndGoQuery.gte("created_at", start_date);
      if (end_date)
        pickAndGoQuery = pickAndGoQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          pickAndGoQuery = pickAndGoQuery.in("restaurant_id", restaurant_id);
        } else {
          pickAndGoQuery = pickAndGoQuery.eq("restaurant_id", restaurant_id);
        }
      }

      // Obtener transacciones de Room Service
      let roomServiceQuery = supabase
        .from("payment_transactions")
        .select("created_at, total_amount_charged, restaurant_id")
        .not("id_room_order", "is", null);

      if (start_date)
        roomServiceQuery = roomServiceQuery.gte("created_at", start_date);
      if (end_date)
        roomServiceQuery = roomServiceQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          roomServiceQuery = roomServiceQuery.in(
            "restaurant_id",
            restaurant_id
          );
        } else {
          roomServiceQuery = roomServiceQuery.eq(
            "restaurant_id",
            restaurant_id
          );
        }
      }

      const [
        flexBillResult,
        tapOrderResult,
        pickAndGoResult,
        roomServiceResult,
      ] = await Promise.all([
        service === "todos" || service === "flex-bill"
          ? flexBillQuery
          : { data: [] },
        service === "todos" || service === "tap-order-pay"
          ? tapOrderQuery
          : { data: [] },
        service === "todos" || service === "pick-and-go"
          ? pickAndGoQuery
          : { data: [] },
        service === "todos" || service === "room-service"
          ? roomServiceQuery
          : { data: [] },
      ]);

      // Agrupar datos por período de tiempo
      const groupedData = this.groupDataByTimePeriod(
        flexBillResult.data || [],
        tapOrderResult.data || [],
        pickAndGoResult.data || [],
        roomServiceResult.data || [],
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

  // Obtiene datos temporales de órdenes por servicio (para gráfica de líneas)
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
        .select("created_at, id, table_id, tables!inner(restaurant_id)");

      if (start_date)
        flexBillQuery = flexBillQuery.gte("created_at", start_date);
      if (end_date)
        flexBillQuery = flexBillQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          flexBillQuery = flexBillQuery.in(
            "tables.restaurant_id",
            restaurant_id
          );
        } else {
          flexBillQuery = flexBillQuery.eq(
            "tables.restaurant_id",
            restaurant_id
          );
        }
      }

      // Obtener órdenes de Tap Order & Pay
      let tapOrderQuery = supabase
        .from("tap_orders_and_pay")
        .select("created_at, id, tables!inner(restaurant_id)");

      if (start_date)
        tapOrderQuery = tapOrderQuery.gte("created_at", start_date);
      if (end_date)
        tapOrderQuery = tapOrderQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          tapOrderQuery = tapOrderQuery.in(
            "tables.restaurant_id",
            restaurant_id
          );
        } else {
          tapOrderQuery = tapOrderQuery.eq(
            "tables.restaurant_id",
            restaurant_id
          );
        }
      }

      // Obtener órdenes de Pick & Go
      let pickAndGoQuery = supabase
        .from("pick_and_go_orders")
        .select("created_at, id, restaurant_id");

      if (start_date)
        pickAndGoQuery = pickAndGoQuery.gte("created_at", start_date);
      if (end_date)
        pickAndGoQuery = pickAndGoQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          pickAndGoQuery = pickAndGoQuery.in("restaurant_id", restaurant_id);
        } else {
          pickAndGoQuery = pickAndGoQuery.eq("restaurant_id", restaurant_id);
        }
      }

      // Obtener órdenes de Room Service
      let roomServiceQuery = supabase
        .from("room_orders")
        .select(`created_at, id, rooms!inner (restaurant_id)`);

      if (start_date) {
        roomServiceQuery = roomServiceQuery.gte("created_at", start_date);
      }

      if (end_date) {
        roomServiceQuery = roomServiceQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      }

      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          roomServiceQuery = roomServiceQuery.in(
            "rooms.restaurant_id",
            restaurant_id
          );
        } else {
          roomServiceQuery = roomServiceQuery.eq(
            "rooms.restaurant_id",
            restaurant_id
          );
        }
      }

      const [
        flexBillResult,
        tapOrderResult,
        pickAndGoResult,
        roomServiceResult,
      ] = await Promise.all([
        service === "todos" || service === "flex-bill"
          ? flexBillQuery
          : Promise.resolve({ data: [], error: null }),
        service === "todos" || service === "tap-order-pay"
          ? tapOrderQuery
          : Promise.resolve({ data: [], error: null }),
        service === "todos" || service === "pick-and-go"
          ? pickAndGoQuery
          : Promise.resolve({ data: [], error: null }),
        service === "todos" || service === "room-service"
          ? roomServiceQuery
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Agrupar datos por período de tiempo
      const groupedData = this.groupDataByTimePeriod(
        flexBillResult.data || [],
        tapOrderResult.data || [],
        pickAndGoResult.data || [],
        roomServiceResult.data || [],
        view_type,
        "orders",
        start_date,
        end_date
      );

      return groupedData;
    } catch (error) {
      console.error("Error getting orders timeline:", error);
      throw error;
    }
  }

  // Obtiene datos temporales de transacciones por servicio (para gráfica de líneas)
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

      // Obtener transacciones de Pick & Go
      let pickAndGoQuery = supabase
        .from("payment_transactions")
        .select("created_at, id, restaurant_id")
        .not("id_pick_and_go_order", "is", null);

      if (start_date)
        pickAndGoQuery = pickAndGoQuery.gte("created_at", start_date);
      if (end_date)
        pickAndGoQuery = pickAndGoQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          pickAndGoQuery = pickAndGoQuery.in("restaurant_id", restaurant_id);
        } else {
          pickAndGoQuery = pickAndGoQuery.eq("restaurant_id", restaurant_id);
        }
      }

      // Obtener transacciones de Pick & Go
      let roomServiceQuery = supabase
        .from("payment_transactions")
        .select("created_at, id, restaurant_id")
        .not("id_room_order", "is", null);

      if (start_date)
        roomServiceQuery = roomServiceQuery.gte("created_at", start_date);
      if (end_date)
        roomServiceQuery = roomServiceQuery.lt(
          "created_at",
          this.getEndDateInclusive(end_date)
        );
      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          roomServiceQuery = roomServiceQuery.in(
            "restaurant_id",
            restaurant_id
          );
        } else {
          roomServiceQuery = roomServiceQuery.eq(
            "restaurant_id",
            restaurant_id
          );
        }
      }

      const [
        flexBillResult,
        tapOrderResult,
        pickAndGoResult,
        roomServiceResult,
      ] = await Promise.all([
        service === "todos" || service === "flex-bill"
          ? flexBillQuery
          : { data: [] },
        service === "todos" || service === "tap-order-pay"
          ? tapOrderQuery
          : { data: [] },
        service === "todos" || service === "pick-and-go"
          ? pickAndGoQuery
          : { data: [] },
        service === "todos" || service === "room-service"
          ? roomServiceQuery
          : { data: [] },
      ]);

      // Agrupar datos por período de tiempo
      const groupedData = this.groupDataByTimePeriod(
        flexBillResult.data || [],
        tapOrderResult.data || [],
        pickAndGoResult.data || [],
        roomServiceResult.data || [],
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

  // Agrupa datos por período de tiempo (daily, weekly, monthly)
  groupDataByTimePeriod(
    flexBillData,
    tapOrderData,
    pickAndGoData = [],
    roomServiceData,
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
        // Obtener el inicio de la semana (lunes) usando UTC para evitar problemas de zona horaria
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const day = date.getUTCDate();

        // Crear fecha en UTC
        const utcDate = new Date(Date.UTC(year, month, day));
        const dayOfWeek = utcDate.getUTCDay();

        // Calcular días para retroceder hasta el lunes
        // Si es domingo (0), retroceder 6 días; si es lunes-sábado (1-6), retroceder (dayOfWeek - 1) días
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

        // Restar los días necesarios para llegar al lunes
        const monday = new Date(Date.UTC(year, month, day - daysToMonday));
        const mondayKey = monday.toISOString().split("T")[0];

        return mondayKey;
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
          "Pick & Go": 0,
          "Room Service": 0,
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
          "Pick & Go": 0,
          "Room Service": 0,
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

    // Procesar datos de Pick & Go
    pickAndGoData.forEach((item) => {
      const dateKey = getDateKey(item.created_at);
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
          "Flex Bill": 0,
          "Tap Order & Pay": 0,
          "Pick & Go": 0,
          "Room Service": 0,
        };
      }

      if (dataType === "volume") {
        grouped[dateKey]["Pick & Go"] += parseFloat(
          item.total_amount_charged || 0
        );
      } else {
        grouped[dateKey]["Pick & Go"] += 1;
      }
    });

    // Procesar datos de Pick & Go
    roomServiceData.forEach((item) => {
      const dateKey = getDateKey(item.created_at);
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
          "Flex Bill": 0,
          "Tap Order & Pay": 0,
          "Pick & Go": 0,
          "Room Service": 0,
        };
      }

      if (dataType === "volume") {
        grouped[dateKey]["Room Service"] += parseFloat(
          item.total_amount_charged || 0
        );
      } else {
        grouped[dateKey]["Room Service"] += 1;
      }
    });

    // Convertir a array y ordenar por fecha
    const sortedData = Object.values(grouped).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Rellenar periodos faltantes según el tipo de vista
    if (filterStartDate && filterEndDate) {
      const filledData = [];
      const startDate = new Date(filterStartDate);
      const endDate = new Date(filterEndDate);

      if (viewType === "daily") {
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
              "Pick & Go": 0,
              "Room Service": 0,
            });
          }

          // Avanzar al siguiente día
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (viewType === "weekly") {
        // Iterar semana por semana desde el inicio hasta el final usando UTC
        const startDateObj = new Date(startDate);

        // Ajustar al lunes de la primera semana usando UTC
        const startYear = startDateObj.getUTCFullYear();
        const startMonth = startDateObj.getUTCMonth();
        const startDay = startDateObj.getUTCDate();
        const startUtcDate = new Date(
          Date.UTC(startYear, startMonth, startDay)
        );
        const startDayOfWeek = startUtcDate.getUTCDay();
        const daysToStartMonday = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
        const currentDate = new Date(
          Date.UTC(startYear, startMonth, startDay - daysToStartMonday)
        );

        // Obtener el lunes de la última semana que contiene el endDate usando UTC
        const endDateObj = new Date(endDate);
        const endYear = endDateObj.getUTCFullYear();
        const endMonth = endDateObj.getUTCMonth();
        const endDay = endDateObj.getUTCDate();
        const endUtcDate = new Date(Date.UTC(endYear, endMonth, endDay));
        const endDayOfWeek = endUtcDate.getUTCDay();
        const daysToEndMonday = endDayOfWeek === 0 ? 6 : endDayOfWeek - 1;
        const endDateMonday = new Date(
          Date.UTC(endYear, endMonth, endDay - daysToEndMonday)
        );

        while (currentDate <= endDateMonday) {
          const dateKey = currentDate.toISOString().split("T")[0];

          // Buscar si existe data para esta semana
          const existingData = sortedData.find((item) => item.date === dateKey);

          if (existingData) {
            filledData.push(existingData);
          } else {
            // Agregar semana con valores en 0
            filledData.push({
              date: dateKey,
              "Flex Bill": 0,
              "Tap Order & Pay": 0,
              "Pick & Go": 0,
              "Room Service": 0,
            });
          }

          // Avanzar a la siguiente semana (7 días) usando UTC
          const nextWeek = new Date(currentDate);
          nextWeek.setUTCDate(currentDate.getUTCDate() + 7);
          currentDate.setTime(nextWeek.getTime());
        }
      } else if (viewType === "monthly") {
        // Iterar mes por mes desde el inicio hasta el final
        const currentDate = new Date(startDate);
        currentDate.setDate(1); // Primer día del mes

        const endDateMonth = new Date(endDate);
        endDateMonth.setDate(1);

        while (currentDate <= endDateMonth) {
          const dateKey = `${currentDate.getFullYear()}-${String(
            currentDate.getMonth() + 1
          ).padStart(2, "0")}`;

          // Buscar si existe data para este mes
          const existingData = sortedData.find((item) => item.date === dateKey);

          if (existingData) {
            filledData.push(existingData);
          } else {
            // Agregar mes con valores en 0
            filledData.push({
              date: dateKey,
              "Flex Bill": 0,
              "Tap Order & Pay": 0,
              "Pick & Go": 0,
              "Room Service": 0,
            });
          }

          // Avanzar al siguiente mes
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }

      return filledData;
    }

    return sortedData;
  }

  // Obtiene datos temporales de métodos de pago (timeline)
  async getPaymentMethodsTimeline(filters) {
    const {
      view_type = "daily",
      start_date,
      end_date,
      restaurant_id = "todos",
      service = "todos",
    } = filters;

    try {
      // Obtener transacciones con información del método de pago
      let query = supabase
        .from("payment_transactions")
        .select(
          "created_at, id_table_order, id_tap_orders_and_pay, id_pick_and_go_order, id_room_order, restaurant_id, payment_method_id, card_type"
        );

      if (start_date) query = query.gte("created_at", start_date);
      if (end_date)
        query = query.lt("created_at", this.getEndDateInclusive(end_date));

      if (restaurant_id && restaurant_id !== "todos") {
        if (Array.isArray(restaurant_id)) {
          query = query.in("restaurant_id", restaurant_id);
        } else {
          query = query.eq("restaurant_id", restaurant_id);
        }
      }

      // Filtrar por servicio
      if (service === "flex-bill") {
        query = query.not("id_table_order", "is", null);
      } else if (service === "tap-order-pay") {
        query = query.not("id_tap_orders_and_pay", "is", null);
      } else if (service === "pick-and-go") {
        query = query.not("id_pick_and_go_order", "is", null);
      } else if (service === "room-service") {
        query = query.not("id_room_order", "is", null);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transformar datos para incluir el nombre del método de pago
      const transformedData = data.map((item) => ({
        ...item,
        payment_method_name: item.card_type || "Desconocido",
      }));

      // Agrupar por período y método de pago
      const groupedData = this.groupPaymentMethodsByTimePeriod(
        transformedData || [],
        view_type,
        start_date,
        end_date
      );

      return groupedData;
    } catch (error) {
      console.error("Error getting payment methods timeline:", error);
      throw error;
    }
  }

  // Agrupa datos de métodos de pago por período de tiempo
  groupPaymentMethodsByTimePeriod(
    transactionsData,
    viewType,
    filterStartDate,
    filterEndDate
  ) {
    const grouped = {};

    // Función para formatear la fecha según el tipo de vista
    const getDateKey = (dateString) => {
      const date = new Date(dateString);

      if (viewType === "daily") {
        return date.toISOString().split("T")[0];
      } else if (viewType === "weekly") {
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        const utcDate = new Date(Date.UTC(year, month, day));
        const dayOfWeek = utcDate.getUTCDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(Date.UTC(year, month, day - daysToMonday));
        return monday.toISOString().split("T")[0];
      } else if (viewType === "monthly") {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}`;
      }
    };

    // Mapear nombres de métodos de pago para consistencia
    const normalizePaymentMethod = (method) => {
      if (!method) return "Desconocido";
      const methodLower = method.toLowerCase();
      if (methodLower.includes("debit") || methodLower.includes("débito"))
        return "Tarjeta Débito";
      if (methodLower.includes("credit") || methodLower.includes("crédito"))
        return "Tarjeta Crédito";
      return method;
    };

    // Procesar cada transacción
    transactionsData.forEach((transaction) => {
      const dateKey = getDateKey(transaction.created_at);
      const paymentMethod = normalizePaymentMethod(
        transaction.payment_method_name
      );

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
        };
      }

      if (!grouped[dateKey][paymentMethod]) {
        grouped[dateKey][paymentMethod] = 0;
      }

      grouped[dateKey][paymentMethod] += 1;
    });

    // Convertir a array y ordenar
    const sortedData = Object.values(grouped).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Rellenar períodos faltantes
    if (filterStartDate && filterEndDate) {
      const filledData = [];
      const startDate = new Date(filterStartDate);
      const endDate = new Date(filterEndDate);

      // Obtener todos los métodos de pago únicos
      const allPaymentMethods = new Set();
      sortedData.forEach((item) => {
        Object.keys(item).forEach((key) => {
          if (key !== "date") {
            allPaymentMethods.add(key);
          }
        });
      });

      if (viewType === "daily") {
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dateKey = currentDate.toISOString().split("T")[0];
          const existingData = sortedData.find((item) => item.date === dateKey);

          if (existingData) {
            filledData.push(existingData);
          } else {
            const emptyEntry = { date: dateKey };
            allPaymentMethods.forEach((method) => {
              emptyEntry[method] = 0;
            });
            filledData.push(emptyEntry);
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (viewType === "weekly") {
        const startDateObj = new Date(startDate);
        const startYear = startDateObj.getUTCFullYear();
        const startMonth = startDateObj.getUTCMonth();
        const startDay = startDateObj.getUTCDate();
        const startUtcDate = new Date(
          Date.UTC(startYear, startMonth, startDay)
        );
        const startDayOfWeek = startUtcDate.getUTCDay();
        const daysToStartMonday = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
        const currentDate = new Date(
          Date.UTC(startYear, startMonth, startDay - daysToStartMonday)
        );

        const endDateObj = new Date(endDate);
        const endYear = endDateObj.getUTCFullYear();
        const endMonth = endDateObj.getUTCMonth();
        const endDay = endDateObj.getUTCDate();
        const endUtcDate = new Date(Date.UTC(endYear, endMonth, endDay));
        const endDayOfWeek = endUtcDate.getUTCDay();
        const daysToEndMonday = endDayOfWeek === 0 ? 6 : endDayOfWeek - 1;
        const endDateMonday = new Date(
          Date.UTC(endYear, endMonth, endDay - daysToEndMonday)
        );

        while (currentDate <= endDateMonday) {
          const dateKey = currentDate.toISOString().split("T")[0];
          const existingData = sortedData.find((item) => item.date === dateKey);

          if (existingData) {
            filledData.push(existingData);
          } else {
            const emptyEntry = { date: dateKey };
            allPaymentMethods.forEach((method) => {
              emptyEntry[method] = 0;
            });
            filledData.push(emptyEntry);
          }

          const nextWeek = new Date(currentDate);
          nextWeek.setUTCDate(currentDate.getUTCDate() + 7);
          currentDate.setTime(nextWeek.getTime());
        }
      } else if (viewType === "monthly") {
        const currentDate = new Date(startDate);
        currentDate.setDate(1);
        const endDateMonth = new Date(endDate);
        endDateMonth.setDate(1);

        while (currentDate <= endDateMonth) {
          const dateKey = `${currentDate.getFullYear()}-${String(
            currentDate.getMonth() + 1
          ).padStart(2, "0")}`;
          const existingData = sortedData.find((item) => item.date === dateKey);

          if (existingData) {
            filledData.push(existingData);
          } else {
            const emptyEntry = { date: dateKey };
            allPaymentMethods.forEach((method) => {
              emptyEntry[method] = 0;
            });
            filledData.push(emptyEntry);
          }

          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }
      return filledData;
    }
    return sortedData;
  }
}

module.exports = new SuperAdminService();
