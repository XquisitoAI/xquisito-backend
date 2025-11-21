const supabase = require("../config/supabase");

class PaymentTransactionService {
  // Detecta el tipo de tarjeta (crédito o débito)
  async detectCardType(paymentMethodId, isGuest) {
    try {
      const tableName = isGuest
        ? "guest_payment_methods"
        : "user_payment_methods";

      const { data: paymentMethod, error } = await supabase
        .from(tableName)
        .select("card_type, card_brand")
        .eq("id", paymentMethodId)
        .single();

      if (error || !paymentMethod) {
        console.warn(
          "⚠️ No se pudo obtener tipo de tarjeta, asumiendo crédito"
        );
        return "credit";
      }

      const cardType = paymentMethod.card_type?.toLowerCase() || "";
      const cardBrand = paymentMethod.card_brand?.toLowerCase() || "";

      // Intentar detectar si es débito basándose en el nombre
      if (
        cardType.includes("debit") ||
        cardType.includes("débito") ||
        cardType.includes("debito") ||
        cardBrand.includes("debit")
      ) {
        return "debit";
      }

      // Por defecto, asumir crédito (peor caso para comisiones)
      return "credit";
    } catch (error) {
      console.error("❌ Error detectando tipo de tarjeta:", error);
      return "credit"; // Fallback a crédito
    }
  }

  // Calcula la comisión de E-cart según el tipo de tarjeta
  calculateEcartCommission(totalAmountCharged, cardType) {
    // Tasas según tipo de tarjeta
    const ecartRate = cardType === "debit" ? 2.3 : 2.6;

    // Comisión porcentual
    const ecartCommissionAmount = totalAmountCharged * (ecartRate / 100);

    // Cargo fijo
    const ecartFixedFee = 1.5;

    // Base para IVA
    const ecartCommissionBase = ecartCommissionAmount + ecartFixedFee;

    // IVA (16%)
    const ivaEcart = ecartCommissionBase * 0.16;

    // Total comisión E-cart
    const ecartCommissionTotal = ecartCommissionBase + ivaEcart;

    return {
      ecart_commission_rate: parseFloat(ecartRate.toFixed(2)),
      ecart_commission_amount: parseFloat(ecartCommissionAmount.toFixed(2)),
      ecart_fixed_fee: ecartFixedFee,
      iva_ecart: parseFloat(ivaEcart.toFixed(2)),
      ecart_commission_total: parseFloat(ecartCommissionTotal.toFixed(2)),
    };
  }

  // Crea una nueva transacción de pago
  async createTransaction(transactionData, isGuest, userId = null) {
    try {
      const {
        // Identificación
        payment_method_id,
        restaurant_id,
        id_table_order = null,
        id_tap_orders_and_pay = null,
        pick_and_go_order_id = null,

        // Montos base (vienen del frontend)
        base_amount,
        tip_amount,
        iva_tip,

        // Comisiones Xquisito (vienen del frontend)
        xquisito_commission_total,
        xquisito_commission_client,
        xquisito_commission_restaurant,
        iva_xquisito_client,
        iva_xquisito_restaurant,
        xquisito_client_charge,
        xquisito_restaurant_charge,
        xquisito_rate_applied,

        // Totales (vienen del frontend)
        total_amount_charged,
        subtotal_for_commission,

        // Metadata
        currency = "MXN",
      } = transactionData;

      // Validar datos requeridos
      if (!payment_method_id == undefined) {
        throw new Error("payment_method_id es requerido");
      }

      if (!restaurant_id) {
        throw new Error("restaurant_id es requerido");
      }

      // Validar que exista al menos un tipo de orden
      if (!id_table_order && !id_tap_orders_and_pay && !pick_and_go_order_id) {
        throw new Error("Se requiere id_table_order, id_tap_orders_and_pay o pick_and_go_order_id");
      }

      // Validar que solo exista un tipo de orden
      const orderTypes = [id_table_order, id_tap_orders_and_pay, pick_and_go_order_id].filter(Boolean);
      if (orderTypes.length > 1) {
        throw new Error("Solo puede existir un tipo de orden");
      }

      // Validar montos
      if (!base_amount || base_amount <= 0) {
        throw new Error("base_amount debe ser mayor a 0");
      }

      if (!total_amount_charged || total_amount_charged <= 0) {
        throw new Error("total_amount_charged debe ser mayor a 0");
      }

      // Detectar tipo de tarjeta
      const cardType = await this.detectCardType(payment_method_id, isGuest);
      console.log(`💳 Tipo de tarjeta detectado: ${cardType}`);

      // Calcular comisión E-cart según tipo de tarjeta
      const ecartCommission = this.calculateEcartCommission(
        total_amount_charged,
        cardType
      );
      console.log("💰 Comisión E-cart calculada:", ecartCommission);

      // Calcular ingresos netos
      const baseAmountNum = parseFloat(base_amount);
      const tipAmountNum = parseFloat(tip_amount || 0);
      const ivaTipNum = parseFloat(iva_tip || 0);
      const xquisitoClientChargeNum = parseFloat(xquisito_client_charge || 0);
      const xquisitoRestaurantChargeNum = parseFloat(
        xquisito_restaurant_charge || 0
      );
      const ecartCommissionTotalNum = parseFloat(
        ecartCommission.ecart_commission_total
      );

      // Ingreso neto del restaurante = base + propina - comisión_restaurante
      const restaurantNetIncome =
        baseAmountNum + tipAmountNum - xquisitoRestaurantChargeNum;

      // Ingreso neto de Xquisito = comisiones totales - comisión E-cart
      const xquisitoNetIncome =
        xquisitoClientChargeNum +
        xquisitoRestaurantChargeNum -
        ecartCommissionTotalNum;

      console.log("💵 Ingresos netos calculados:", {
        restaurant_net_income: restaurantNetIncome.toFixed(2),
        xquisito_net_income: xquisitoNetIncome.toFixed(2),
      });

      // Preparar datos para inserción
      const transactionRecord = {
        // Identificación
        payment_method_id,
        restaurant_id,
        id_table_order,
        id_tap_orders_and_pay,
        id_pick_and_go_order: pick_and_go_order_id, // Mapear para que coincida con el esquema de BD
        user_id: userId, // Clerk user ID (puede ser null para invitados)

        // Montos base
        base_amount: baseAmountNum,
        tip_amount: tipAmountNum,
        iva_tip: ivaTipNum,

        // Comisiones Xquisito
        xquisito_commission_total: parseFloat(xquisito_commission_total || 0),
        xquisito_commission_client: parseFloat(xquisito_commission_client || 0),
        xquisito_commission_restaurant: parseFloat(
          xquisito_commission_restaurant || 0
        ),
        iva_xquisito_client: parseFloat(iva_xquisito_client || 0),
        iva_xquisito_restaurant: parseFloat(iva_xquisito_restaurant || 0),
        xquisito_client_charge: xquisitoClientChargeNum,
        xquisito_restaurant_charge: xquisitoRestaurantChargeNum,
        xquisito_rate_applied: parseFloat(xquisito_rate_applied || 0),

        // Comisión E-cart (calculada en backend)
        ...ecartCommission,
        card_type: cardType,

        // Totales
        total_amount_charged: parseFloat(total_amount_charged),
        subtotal_for_commission: parseFloat(
          subtotal_for_commission || baseAmountNum + tipAmountNum
        ),

        // Ingresos netos (calculados en backend)
        restaurant_net_income: parseFloat(restaurantNetIncome.toFixed(2)),
        xquisito_net_income: parseFloat(xquisitoNetIncome.toFixed(2)),

        // Metadata
        currency,
      };

      console.log("📝 Insertando transacción en BD:", {
        payment_method_id: "***",
        restaurant_id: "***",
        base_amount: transactionRecord.base_amount,
        total_amount_charged: transactionRecord.total_amount_charged,
        card_type: cardType,
        ecart_commission_total: ecartCommission.ecart_commission_total,
      });

      // Insertar en la base de datos
      const { data, error } = await supabase
        .from("payment_transactions")
        .insert([transactionRecord])
        .select()
        .single();

      if (error) {
        console.error("❌ Error al insertar transacción:", error);
        throw error;
      }

      console.log("✅ Transacción guardada exitosamente:", data.id);

      return {
        success: true,
        transaction: data,
      };
    } catch (error) {
      console.error("❌ Error en createTransaction:", error);
      return {
        success: false,
        error: {
          type: "database_error",
          message: error.message,
          details: error.detail || error.hint,
        },
      };
    }
  }

  // Obtiene el historial de transacciones de un usuario
  async getUserTransactions(userId, isGuest = false, options = {}) {
    try {
      const { limit = 50, offset = 0, restaurantId = null } = options;

      // Primero, obtener los payment_method_ids del usuario
      const tableName = isGuest
        ? "guest_payment_methods"
        : "user_payment_methods";
      const userField = isGuest ? "guest_id" : "user_id";

      const { data: paymentMethods, error: pmError } = await supabase
        .from(tableName)
        .select("id")
        .eq(userField, userId);

      if (pmError) throw pmError;

      if (!paymentMethods || paymentMethods.length === 0) {
        return {
          success: true,
          transactions: [],
          total: 0,
        };
      }

      const paymentMethodIds = paymentMethods.map((pm) => pm.id);

      // Construir query
      let query = supabase
        .from("payment_transactions")
        .select("*", { count: "exact" })
        .in("payment_method_id", paymentMethodIds)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Filtrar por restaurante si se proporciona
      if (restaurantId) {
        query = query.eq("restaurant_id", restaurantId);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        success: true,
        transactions: data || [],
        total: count || 0,
      };
    } catch (error) {
      console.error("❌ Error en getUserTransactions:", error);
      return {
        success: false,
        error: {
          type: "database_error",
          message: error.message,
        },
      };
    }
  }

  // Obtiene una transacción por ID
  async getTransactionById(transactionId) {
    try {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("id", transactionId)
        .single();

      if (error) throw error;

      if (!data) {
        return {
          success: false,
          error: {
            type: "not_found",
            message: "Transacción no encontrada",
          },
        };
      }

      return {
        success: true,
        transaction: data,
      };
    } catch (error) {
      console.error("❌ Error en getTransactionById:", error);
      return {
        success: false,
        error: {
          type: "database_error",
          message: error.message,
        },
      };
    }
  }
}

module.exports = new PaymentTransactionService();
