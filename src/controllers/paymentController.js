const paymentService = require("../services/paymentService");
const { EcartPayService } = require("../services/ecartpayService");
const ecartPayService = require("../services/ecartpayService");
const tableService = require("../services/tableService");
const { savePaymentMethodToUserOrder } = require("../services/tableServiceNew");
const paymentTransactionService = require("../services/paymentTransactionService");
const socketEmitter = require("../services/socketEmitter");
const { pciLog, PCI_ACTIONS } = require("../utils/pciLog");
const POSSyncService = require("../services/pos/POSSyncService");
const supabase = require("../config/supabase");
const { supabaseAdmin } = require("../config/supabaseAuth");

/**
 * Resuelve el proveedor de pago activo para un restaurante.
 * Retorna 'ecartpay' como fallback si no hay integración configurada.
 */
async function resolvePaymentProvider(restaurantId) {
  if (!restaurantId) return "ecartpay";

  const restaurantIdInt = parseInt(restaurantId, 10);
  if (isNaN(restaurantIdInt)) return "ecartpay";

  try {
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("client_id")
      .eq("id", restaurantIdInt)
      .single();

    if (!restaurant?.client_id) return "ecartpay";

    const { data: integration } = await supabase
      .from("payment_integrations")
      .select("payment_providers(code)")
      .eq("client_id", restaurant.client_id)
      .eq("is_active", true)
      .single();

    return integration?.payment_providers?.code || "ecartpay";
  } catch (err) {
    console.warn(
      `[resolvePaymentProvider] fallback to ecartpay: ${err.message}`,
    );
    return "ecartpay";
  }
}

/**
 * Retorna una instancia de EcartPayService con las credenciales del cliente.
 * Si el restaurante no tiene credenciales configuradas, usa el singleton global (env vars).
 */
async function resolveEcartPayInstance(restaurantId) {
  if (!restaurantId) return ecartPayService;

  const restaurantIdInt = parseInt(restaurantId, 10);
  if (isNaN(restaurantIdInt)) return ecartPayService;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("client_id")
    .eq("id", restaurantIdInt)
    .single();

  if (!restaurant?.client_id) return ecartPayService;

  const { data: integration } = await supabase
    .from("payment_integrations")
    .select("settings")
    .eq("client_id", restaurant.client_id)
    .eq("is_active", true)
    .single();

  const settings = integration?.settings;
  if (!settings?.public_key || !settings?.secret_key) return ecartPayService;

  return new EcartPayService({
    publicKey: settings.public_key,
    secretKey: settings.secret_key,
    environment: settings.environment,
  });
}

class PaymentController {
  async addPaymentMethod(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;

      // PCI Log: Attempt to create payment token
      pciLog({
        action: PCI_ACTIONS.TOKEN_CREATE_ATTEMPT,
        userId: userId || "unauthenticated",
        processor: "ecartpay",
        req,
      });

      if (!userId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_CREATE_ERROR,
          userId: "unauthenticated",
          processor: "ecartpay",
          req,
          error: "User not authenticated",
        });
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      console.log(
        `Processing payment method for ${isGuest ? "guest" : "authenticated"} user: ${userId}`,
      );

      const { fullName, email, cardNumber, expDate, cvv, restaurantId } =
        req.body;

      // Validate required fields (email solo requerido para guests)
      if (!fullName || !cardNumber || !expDate || !cvv) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "All fields are required",
          },
        });
      }

      if (isGuest && !email) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Email is required for guest users",
          },
        });
      }

      // Parse expiry date (MM/YY format)
      const [expMonth, expYear] = expDate.split("/");
      const fullYear = parseInt(`20${expYear}`);
      const monthInt = parseInt(expMonth);

      // Prepare payment data
      const paymentData = {
        cardholderName: fullName.trim(),
        cardNumber: cardNumber.replace(/\s/g, ""), // Remove spaces
        expMonth: monthInt,
        expYear: fullYear,
        cvv: cvv.trim(),
      };

      console.log("💳 About to call paymentService.addPaymentMethod with:", {
        userId,
        isGuest,
        paymentData: {
          ...paymentData,
          cardNumber: "****" + paymentData.cardNumber.slice(-4),
          cvv: "***",
        },
      });

      // Add payment method with guest context
      const result = await paymentService.addPaymentMethod(
        userId,
        paymentData,
        {
          isGuest,
          userEmail: email,
          restaurantId,
        },
      );

      console.log("💳 PaymentService result:", {
        success: result.success,
        error: result.error?.type,
        message: result.error?.message,
      });

      if (!result.success) {
        console.error("❌ Payment method creation failed:", result.error);
        pciLog({
          action: PCI_ACTIONS.TOKEN_CREATE_ERROR,
          userId,
          processor: "ecartpay",
          req,
          error: result.error?.message || result.error?.type,
        });
        const statusCode =
          result.error.type === "validation_error"
            ? 400
            : result.error.type === "user_error"
              ? 404
              : 500;

        return res.status(statusCode).json(result);
      }

      // PCI Log: Success
      pciLog({
        action: PCI_ACTIONS.TOKEN_CREATE_SUCCESS,
        userId,
        processor: "ecartpay",
        req,
        metadata: { paymentMethodId: result.paymentMethod?.id },
      });

      // Don't return sensitive data
      res.status(201).json({
        success: true,
        message: "Payment method added successfully",
        paymentMethod: result.paymentMethod,
      });
    } catch (error) {
      console.error("Error in addPaymentMethod controller:", error);
      pciLog({
        action: PCI_ACTIONS.TOKEN_CREATE_ERROR,
        userId: req.user?.id || "unknown",
        processor: "ecartpay",
        req,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async getUserPaymentMethods(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;

      // PCI Log: Attempt to access payment tokens
      pciLog({
        action: PCI_ACTIONS.TOKEN_ACCESS_ATTEMPT,
        userId: userId || "unauthenticated",
        processor: "ecartpay",
        req,
      });

      if (!userId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_ACCESS_ERROR,
          userId: "unauthenticated",
          processor: provider,
          req,
          error: "User not authenticated",
        });
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      const result = await paymentService.getUserPaymentMethods(userId, {
        isGuest,
      });

      if (!result.success) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_ACCESS_ERROR,
          userId,
          processor: provider,
          req,
          error: result.error?.message || result.error?.type,
        });
        const statusCode = result.error.type === "database_error" ? 500 : 400;
        return res.status(statusCode).json(result);
      }

      // PCI Log: Success
      pciLog({
        action: PCI_ACTIONS.TOKEN_ACCESS_SUCCESS,
        userId,
        processor: "ecartpay",
        req,
        metadata: { count: result.paymentMethods?.length || 0 },
      });

      res.json({
        success: true,
        paymentMethods: result.paymentMethods,
      });
    } catch (error) {
      console.error("Error in getUserPaymentMethods controller:", error);
      pciLog({
        action: PCI_ACTIONS.TOKEN_ACCESS_ERROR,
        userId: req.user?.id || "unknown",
        processor: "ecartpay",
        req,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async deletePaymentMethod(req, res) {
    try {
      const userId = req.user?.id;
      const { paymentMethodId } = req.params;

      // PCI Log: Attempt to delete payment token
      pciLog({
        action: PCI_ACTIONS.TOKEN_DELETE_ATTEMPT,
        userId: userId || "unauthenticated",
        processor: "ecartpay",
        req,
        metadata: { paymentMethodId },
      });

      if (!userId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_DELETE_ERROR,
          userId: "unauthenticated",
          processor: "ecartpay",
          req,
          error: "User not authenticated",
        });
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      if (!paymentMethodId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_DELETE_ERROR,
          userId,
          processor: provider,
          req,
          error: "Payment method ID is required",
        });
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Payment method ID is required",
          },
        });
      }

      const isGuest = req.isGuest || req.user?.isGuest;
      const restaurantId = req.query?.restaurantId || req.body?.restaurantId;
      const result = await paymentService.deletePaymentMethod(
        userId,
        paymentMethodId,
        { isGuest, restaurantId },
      );

      if (!result.success) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_DELETE_ERROR,
          userId,
          processor: provider,
          req,
          error: result.error?.message || result.error?.type,
          metadata: { paymentMethodId },
        });
        const statusCode =
          result.error.type === "not_found"
            ? 404
            : result.error.type === "database_error"
              ? 500
              : 400;

        return res.status(statusCode).json(result);
      }

      // PCI Log: Success
      pciLog({
        action: PCI_ACTIONS.TOKEN_DELETE_SUCCESS,
        userId,
        processor: "ecartpay",
        req,
        metadata: { paymentMethodId },
      });

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error("Error in deletePaymentMethod controller:", error);
      pciLog({
        action: PCI_ACTIONS.TOKEN_DELETE_ERROR,
        userId: req.user?.id || "unknown",
        processor: "ecartpay",
        req,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async setDefaultPaymentMethod(req, res) {
    try {
      const userId = req.user?.id;
      const { paymentMethodId } = req.params;

      // PCI Log: Attempt to update payment token
      pciLog({
        action: PCI_ACTIONS.TOKEN_UPDATE_ATTEMPT,
        userId: userId || "unauthenticated",
        processor: "ecartpay",
        req,
        metadata: { paymentMethodId, operation: "set_default" },
      });

      if (!userId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_UPDATE_ERROR,
          userId: "unauthenticated",
          processor: provider,
          req,
          error: "User not authenticated",
        });
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      if (!paymentMethodId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_UPDATE_ERROR,
          userId,
          processor: provider,
          req,
          error: "Payment method ID is required",
        });
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Payment method ID is required",
          },
        });
      }

      const result = await paymentService.setDefaultPaymentMethod(
        userId,
        paymentMethodId,
      );

      if (!result.success) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_UPDATE_ERROR,
          userId,
          processor: provider,
          req,
          error: result.error?.message || result.error?.type,
          metadata: { paymentMethodId },
        });
        const statusCode =
          result.error.type === "not_found"
            ? 404
            : result.error.type === "database_error"
              ? 500
              : 400;

        return res.status(statusCode).json(result);
      }

      // PCI Log: Success
      pciLog({
        action: PCI_ACTIONS.TOKEN_UPDATE_SUCCESS,
        userId,
        processor: "ecartpay",
        req,
        metadata: { paymentMethodId, operation: "set_default" },
      });

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error("Error in setDefaultPaymentMethod controller:", error);
      pciLog({
        action: PCI_ACTIONS.TOKEN_UPDATE_ERROR,
        userId: req.user?.id || "unknown",
        processor: "ecartpay",
        req,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async processPayment(req, res) {
    // PCI DSS: Never log req.body as it may contain sensitive card data
    console.log("⚡ processPayment method STARTED");
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;
      const { paymentMethodId, amount, tableNumber, restaurantId } = req.body;

      // Resolver proveedor de pago activo para este restaurante
      console.log(
        `[processPayment] restaurantId=${restaurantId}, userId=${userId}, resolving provider...`,
      );
      const provider = await resolvePaymentProvider(restaurantId);
      console.log(`[processPayment] provider resolved: ${provider}`);
      const ecartPay = await resolveEcartPayInstance(restaurantId);
      console.log(`[processPayment] ecartPay instance resolved`);
      console.log(
        `[PaymentProvider] Procesando pago con proveedor: ${provider} (restaurantId: ${restaurantId})`,
      );

      // PCI Log: Attempt to process payment
      pciLog({
        action: PCI_ACTIONS.PAYMENT_PROCESS_ATTEMPT,
        userId: userId || "unauthenticated",
        processor: provider,
        req,
        metadata: {
          paymentMethodId,
          amount,
          tableNumber,
          restaurantId,
          provider,
        },
      });

      if (!userId) {
        pciLog({
          action: PCI_ACTIONS.PAYMENT_PROCESS_ERROR,
          userId: "unauthenticated",
          processor: provider,
          req,
          error: "User not authenticated",
        });
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      const { currency = "MXN", description, orderId, installments } = req.body;

      // Validate required fields
      if (!paymentMethodId || !amount) {
        pciLog({
          action: PCI_ACTIONS.PAYMENT_PROCESS_ERROR,
          userId,
          processor: provider,
          req,
          error: "Payment method ID and amount are required",
        });
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Payment method ID and amount are required",
          },
        });
      }

      // Validate amount
      if (typeof amount !== "number" || amount <= 0) {
        pciLog({
          action: PCI_ACTIONS.PAYMENT_PROCESS_ERROR,
          userId,
          processor: provider,
          req,
          error: "Invalid amount",
        });
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Invalid amount",
          },
        });
      }

      console.log(
        `💰 Processing payment for ${isGuest ? "guest" : "authenticated"} user: ${userId}`,
      );
      console.log(`💰 Payment details:`, {
        paymentMethodId,
        amount,
        currency,
        orderId,
        tableNumber,
      });

      // Despachar a proveedor no implementado antes de tocar la DB
      if (provider !== "ecartpay") {
        console.warn(
          `[PaymentProvider] Proveedor '${provider}' no implementado aún`,
        );
        return res.status(501).json({
          success: false,
          error: {
            type: "not_implemented",
            message: `El proveedor de pago '${provider}' no está disponible todavía`,
          },
        });
      }

      // Get the payment method from database
      const tableName = isGuest
        ? "guest_payment_methods"
        : "user_payment_methods";
      const userFieldName = isGuest ? "guest_id" : "user_id";

      console.log(`🔍 Fetching payment method from database:`, {
        tableName,
        userFieldName,
        userId,
        paymentMethodId,
        isGuest,
      });

      // Obtener metadatos de la tarjeta
      const { data: paymentMethod, error: fetchError } = await supabase
        .from(tableName)
        .select("id, last_four_digits, card_type, cardholder_name")
        .eq(userFieldName, userId)
        .eq("id", paymentMethodId)
        .eq("is_active", true)
        .single();

      if (!fetchError && paymentMethod) {
        // Buscar token del proveedor activo en payment_method_tokens (tabla unificada guest+user)
        const { data: tokenRow } = await supabase
          .from("payment_method_tokens")
          .select("provider_token, provider_customer_id")
          .eq("payment_method_id", paymentMethod.id)
          .eq("provider", provider)
          .eq("is_active", true)
          .single();

        if (tokenRow) {
          paymentMethod.provider_token = tokenRow.provider_token;
          paymentMethod.provider_customer_id = tokenRow.provider_customer_id;
        } else {
          // No hay token para este proveedor — tarjeta no tokenizada con él aún
          paymentMethod.provider_token = null;
          paymentMethod.provider_customer_id = null;
        }
      }

      savePaymentMethodToUserOrder(userId, paymentMethodId);

      console.log(`🔍 Database query result:`, {
        paymentMethodFound: !!paymentMethod,
        fetchError: fetchError?.message,
        paymentMethodDetails: paymentMethod
          ? {
              hasToken: !!paymentMethod.provider_token,
              hasCustomerId: !!paymentMethod.provider_customer_id,
              cardType: paymentMethod.card_type,
              lastFour: paymentMethod.last_four_digits,
            }
          : null,
      });

      if (fetchError || !paymentMethod) {
        console.error(`❌ Payment method fetch failed:`, {
          error: fetchError?.message,
          paymentMethodId,
          tableName,
          userId,
        });

        pciLog({
          action: PCI_ACTIONS.TOKEN_ACCESS_ERROR,
          userId,
          processor: provider,
          req,
          error: "Payment method not found",
          metadata: { paymentMethodId },
        });

        return res.status(404).json({
          success: false,
          error: {
            type: "not_found",
            message: "Payment method not found",
          },
        });
      }

      // Verificar que existe token para el proveedor activo
      if (!paymentMethod.provider_token) {
        console.warn(
          `[PaymentProvider] Tarjeta ${paymentMethodId} no tiene token para '${provider}'`,
        );
        pciLog({
          action: PCI_ACTIONS.TOKEN_ACCESS_ERROR,
          userId,
          processor: provider,
          req,
          error: "Token missing for provider",
          metadata: { paymentMethodId, provider },
        });
        return res.status(422).json({
          success: false,
          error: {
            type: "token_missing",
            provider,
            message: `Esta tarjeta no está tokenizada con el proveedor actual (${provider}). Por favor agrega la tarjeta de nuevo.`,
          },
        });
      }

      // PCI Log: Token accessed for payment
      pciLog({
        action: PCI_ACTIONS.TOKEN_ACCESS_SUCCESS,
        userId,
        processor: provider,
        req,
        metadata: { paymentMethodId, purpose: "payment_processing" },
      });

      // Prepare order data for eCartPay
      const orderDescription =
        description || `Xquisito Restaurant - Table ${tableNumber}`;
      const itemName = `${orderDescription}${req.body.selectedUsers ? " - " + req.body.selectedUsers : ""}`;

      console.log("💰 Processing eCartPay order:", {
        customerId: paymentMethod.provider_customer_id,
        amount: amount,
        currency: currency,
        tableNumber: tableNumber,
        orderId: orderId,
      });

      // Try direct payment processing with stored card token
      try {
        const directPaymentResult =
          await ecartPay.processCheckoutWithPaymentMethod(
            paymentMethod.provider_customer_id,
            paymentMethod.provider_token, // This is the card ID
            {
              amount: amount,
              currency: currency,
              description: orderDescription,
              quantity: 1,
              cardholderName: paymentMethod.cardholder_name, // Pass the cardholder name
              installments: installments || null,
              items: [
                {
                  name: itemName.substring(0, 100),
                  quantity: 1,
                  price: amount,
                },
              ],
              webhookUrl: `${process.env.BASE_URL || "http://localhost:5000"}/api/payments/webhooks/ecartpay`,
            },
          );

        if (directPaymentResult.success) {
          console.log(
            "✅ Direct payment processed successfully:",
            directPaymentResult.order.id,
          );
          console.log("📊 Direct payment details:", {
            orderId: directPaymentResult.order.id,
            orderStatus: directPaymentResult.order.status,
            hasToken: !!directPaymentResult.token,
          });

          // PCI Log: Payment success
          pciLog({
            action: PCI_ACTIONS.PAYMENT_PROCESS_SUCCESS,
            userId,
            processor: provider,
            req,
            metadata: {
              paymentMethodId,
              amount,
              orderId: directPaymentResult.order.id,
              type: "direct_charge",
            },
          });

          res.status(200).json({
            success: true,
            payment: {
              id: directPaymentResult.order.id,
              amount: amount,
              currency: currency,
              status: directPaymentResult.order.status || "succeeded",
              type: "direct_charge",
              paymentMethod: {
                lastFourDigits: paymentMethod.last_four_digits,
                cardType: paymentMethod.card_type,
              },
              token: directPaymentResult.token,
              createdAt:
                directPaymentResult.order.created_at ||
                new Date().toISOString(),
            },
          });
          return;
        } else {
          console.error(
            "❌ Direct payment processing failed:",
            directPaymentResult.error,
          );

          // Si eCartPay rechazó la transacción (4xx), no hacer fallback — el pago fue declinado
          const rejectedStatus =
            directPaymentResult.error?.status ||
            directPaymentResult.error?.statusCode;
          if (rejectedStatus && rejectedStatus >= 400 && rejectedStatus < 500) {
            pciLog({
              action: PCI_ACTIONS.PAYMENT_PROCESS_ERROR,
              userId,
              processor: provider,
              req,
              error: directPaymentResult.error?.message,
              metadata: { paymentMethodId, amount, statusCode: rejectedStatus },
            });
            return res.status(402).json({
              success: false,
              error: {
                type: "payment_declined",
                message:
                  "El pago fue rechazado. Verifica los datos de tu tarjeta e intenta de nuevo.",
              },
            });
          }

          console.log("🔄 Will fallback to payLink method");
          throw new Error("Failed to process direct payment with stored card");
        }
      } catch (directProcessError) {
        console.error(
          "❌ Direct processing failed:",
          directProcessError.message,
        );
        console.log("⚠️ Falling back to order creation with payLink");
      }

      // Fallback to order creation if direct charge fails
      const orderResult = await ecartPay.createOrder({
        customerId: paymentMethod.provider_customer_id,
        currency: currency,
        tableNumber: tableNumber,
        items: [
          {
            name: itemName.substring(0, 100), // Limit length for eCartPay
            quantity: 1,
            price: amount,
          },
        ],
        webhookUrl: `${process.env.BASE_URL || "http://localhost:5000"}/api/payments/webhooks/ecartpay`,
        redirectUrl: `${process.env.FRONTEND_URL || "https://pickandgo.xquisito.ai"}/payment-success?orderId=${orderId}&amount=${amount}&table=${tableNumber}`,
      });

      if (!orderResult.success) {
        console.error("❌ Order creation failed:", orderResult.error);
        pciLog({
          action: PCI_ACTIONS.PAYMENT_PROCESS_ERROR,
          userId,
          processor: provider,
          req,
          error: orderResult.error?.message || "Order creation failed",
          metadata: { paymentMethodId, amount },
        });
        return res.status(400).json({
          success: false,
          error: orderResult.error,
        });
      }

      // PCI Log: Payment success (fallback with payLink)
      pciLog({
        action: PCI_ACTIONS.PAYMENT_PROCESS_SUCCESS,
        userId,
        processor: "ecartpay",
        req,
        metadata: {
          paymentMethodId,
          amount,
          orderId: orderResult.order.id,
          type: "order_with_link",
        },
      });

      res.status(200).json({
        success: true,
        order: {
          id: orderResult.order.id,
          amount: amount,
          currency: currency,
          status: orderResult.order.status,
          payLink: orderResult.order.pay_link,
          paymentMethod: {
            lastFourDigits: paymentMethod.last_four_digits,
            cardType: paymentMethod.card_type,
          },
          createdAt: orderResult.order.created_at || new Date().toISOString(),
        },
        // For backward compatibility, also return as payment
        payment: {
          id: orderResult.order.id,
          amount: amount,
          currency: currency,
          status: orderResult.order.status,
          payLink: orderResult.order.pay_link,
          type: "order_with_link",
        },
      });
    } catch (error) {
      console.error("Error in processPayment controller:", error);
      pciLog({
        action: PCI_ACTIONS.PAYMENT_PROCESS_ERROR,
        userId: req.user?.id || "unknown",
        processor: "ecartpay",
        req,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async getPaymentHistory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      // TODO: Implement payment history retrieval
      // This would query payment transactions for the user

      res.status(501).json({
        success: false,
        error: {
          type: "not_implemented",
          message: "Payment history will be implemented in next phase",
        },
      });
    } catch (error) {
      console.error("Error in getPaymentHistory controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async handleWebhook(req, res) {
    try {
      const webhookData = req.body;
      console.log("🔗 EcartPay webhook received:", {
        type: webhookData.type,
        id: webhookData.data?.object?.id,
      });

      // Verify webhook signature if needed
      // const signature = req.headers['ecartpay-signature'];
      // const isValid = ecartPayService.verifyWebhookSignature(req.body, signature);

      switch (webhookData.type) {
        case "payment_intent.succeeded":
          console.log("✅ Payment succeeded:", webhookData.data.object.id);
          await this.handlePaymentSuccess(webhookData.data.object);
          break;

        case "payment_intent.payment_failed":
          console.log("❌ Payment failed:", webhookData.data.object.id);
          // Update payment status in database
          break;

        case "payment_method.attached":
          console.log(
            "🔗 Payment method attached:",
            webhookData.data.object.id,
          );
          break;

        default:
          console.log("📥 Unhandled webhook type:", webhookData.type);
      }

      res.status(200).json({
        success: true,
        message: "Webhook processed",
      });
    } catch (error) {
      console.error("Error in handleWebhook controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  // Admin endpoints for managing eCartPay data
  async listEcartPayCustomers(req, res) {
    try {
      console.log("🔍 Admin request: List eCartPay customers");

      const result = await ecartPayService.listAllCustomers();

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        customers: result.customers,
        count: result.customers.length,
      });
    } catch (error) {
      console.error("Error in listEcartPayCustomers controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async cleanupTestCustomers(req, res) {
    try {
      console.log("🧹 Admin request: Cleanup test customers");

      const result = await ecartPayService.deleteAllTestCustomers();

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        message: result.message,
        details: result.details,
      });
    } catch (error) {
      console.error("Error in cleanupTestCustomers controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async deleteEcartPayCustomer(req, res) {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Customer ID is required",
          },
        });
      }

      console.log(`🗑️ Admin request: Delete eCartPay customer ${customerId}`);

      const result = await ecartPayService.deleteCustomer(customerId);

      if (!result.success) {
        const statusCode = result.error.status || 500;
        return res.status(statusCode).json(result);
      }

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error("Error in deleteEcartPayCustomer controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  async cleanupGuestData(req, res) {
    try {
      const { guestId } = req.body;
      const isGuest = req.isGuest || req.user?.isGuest;

      // PCI Log: Attempt to cleanup guest tokens
      pciLog({
        action: PCI_ACTIONS.TOKEN_CLEANUP_ATTEMPT,
        userId: guestId || "unknown",
        processor: "ecartpay",
        req,
      });

      if (!isGuest) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_CLEANUP_ERROR,
          userId: guestId || "unknown",
          processor: provider,
          req,
          error: "Operation only allowed for guest users",
        });
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "This operation is only allowed for guest users",
          },
        });
      }

      if (!guestId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_CLEANUP_ERROR,
          userId: "unknown",
          processor: provider,
          req,
          error: "Guest ID is required",
        });
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Guest ID is required",
          },
        });
      }

      console.log(`🧹 Cleaning up guest data for: ${guestId}`);

      // Find eCartPay customer for this guest
      const customerResult =
        await ecartPayService.findCustomerByUserId(guestId);

      if (customerResult.success && customerResult.customer) {
        console.log(
          `🗑️ Deleting eCartPay customer: ${customerResult.customer.id}`,
        );

        // Delete from eCartPay
        const deleteResult = await ecartPayService.deleteCustomer(
          customerResult.customer.id,
        );

        if (!deleteResult.success) {
          console.error(
            "Failed to delete eCartPay customer:",
            deleteResult.error,
          );
        }

        // Delete from local database
        const { error: dbError } = await require("../config/supabase")
          .from("guest_payment_methods")
          .delete()
          .eq("guest_id", guestId);

        if (dbError) {
          console.error(
            "Failed to delete guest payment methods from DB:",
            dbError,
          );
        }

        // PCI Log: Cleanup success
        pciLog({
          action: PCI_ACTIONS.TOKEN_CLEANUP_SUCCESS,
          userId: guestId,
          processor: provider,
          req,
        });

        res.json({
          success: true,
          message: "Guest data cleanup completed",
          cleaned: {
            ecartpayCustomer: deleteResult.success,
            localPaymentMethods: !dbError,
          },
        });
      } else {
        // PCI Log: No data to cleanup
        pciLog({
          action: PCI_ACTIONS.TOKEN_CLEANUP_SUCCESS,
          userId: guestId,
          processor: provider,
          req,
          metadata: { noDataFound: true },
        });
        res.json({
          success: true,
          message: "No guest data found to cleanup",
        });
      }
    } catch (error) {
      console.error("Error in cleanupGuestData controller:", error);
      pciLog({
        action: PCI_ACTIONS.TOKEN_CLEANUP_ERROR,
        userId: req.body?.guestId || "unknown",
        processor: "ecartpay",
        req,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }
  // Helper method to handle successful payments
  async handlePaymentSuccess(paymentObject) {
    try {
      console.log("🔄 Processing payment success:", paymentObject.id);

      // Extract table number from payment metadata or description
      // eCartPay may include this in the order reference or metadata
      let tableNumber = null;

      // Try to extract table number from reference_id or description
      if (paymentObject.reference_id) {
        // Match our format: xq_table_12_timestamp
        const match = paymentObject.reference_id.match(
          /(?:xq_)?table[_-]?(\d+)/i,
        );
        if (match) {
          tableNumber = parseInt(match[1]);
        }
      }

      // Try to extract from description if not found in reference
      if (!tableNumber && paymentObject.description) {
        const match = paymentObject.description.match(/table[_\s-]?(\d+)/i);
        if (match) {
          tableNumber = parseInt(match[1]);
        }
      }

      // Try to extract from metadata if available
      if (
        !tableNumber &&
        paymentObject.metadata &&
        paymentObject.metadata.table_number
      ) {
        tableNumber = parseInt(paymentObject.metadata.table_number);
      }

      if (tableNumber) {
        console.log(`🎯 Marking orders as paid for table ${tableNumber}`);

        // Mark all unpaid orders for this table as paid
        const result = await tableService.markOrdersAsPaid(tableNumber);

        if (result.success) {
          console.log(
            `✅ Successfully marked ${result.count} orders as paid for table ${tableNumber}`,
          );
        } else {
          console.error(
            `❌ Failed to mark orders as paid for table ${tableNumber}:`,
            result.error,
          );
        }
      } else {
        console.warn("⚠️ Could not extract table number from payment object:", {
          id: paymentObject.id,
          reference_id: paymentObject.reference_id,
          description: paymentObject.description,
        });
      }
    } catch (error) {
      console.error("❌ Error in handlePaymentSuccess:", error);
    }
  }

  /**
   * Crea una nueva transacción de pago en la base de datos
   * Este endpoint es llamado desde el frontend después de un pago exitoso
   */
  async createPaymentTransaction(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      console.log(
        `📊 Creating payment transaction for ${isGuest ? "guest" : "user"}: ${userId}`,
      );

      const transactionData = req.body;

      // Validar datos requeridos
      const requiredFields = [
        "payment_method_id", // Can be null for system card payments
        "restaurant_id",
        "base_amount",
        "total_amount_charged",
      ];

      const missingFields = requiredFields.filter(
        (field) => transactionData[field] === undefined,
      );

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: `Missing required fields: ${missingFields.join(", ")}`,
          },
        });
      }

      console.log(missingFields);

      // Validar que exista al menos un tipo de orden
      if (
        !transactionData.id_table_order &&
        !transactionData.id_tap_orders_and_pay &&
        !transactionData.pick_and_go_order_id &&
        !transactionData.id_room_order &&
        !transactionData.id_tap_pay_order
      ) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message:
              "Either id_table_order, id_tap_orders_and_pay, pick_and_go_order_id,, id_room_order or id_tap_pay_order is required",
          },
        });
      }

      console.log("Exito hasta aqui");

      // Crear transacción
      const result = await paymentTransactionService.createTransaction(
        transactionData,
        isGuest,
        userId,
      );

      if (!result.success) {
        console.error("❌ Failed to create transaction:", result.error);
        return res.status(400).json(result);
      }

      console.log(
        "✅ Transaction created successfully:",
        result.transaction.id,
      );

      // Determinar el tipo de servicio basado en el tipo de orden
      let serviceType = "unknown";
      let orderIdentifier = "";

      if (transactionData.id_table_order) {
        serviceType = "flex-bill";
        orderIdentifier = `Mesa #${transactionData.table_number || transactionData.id_table_order}`;
      } else if (transactionData.id_tap_orders_and_pay) {
        serviceType = "tap-order-pay";
        orderIdentifier = `Orden #${transactionData.id_tap_orders_and_pay}`;
      } else if (transactionData.pick_and_go_order_id) {
        serviceType = "pick-n-go";
        orderIdentifier = `Pick&Go #${transactionData.pick_and_go_order_id}`;
      } else if (transactionData.id_room_order) {
        serviceType = "room-service";
        orderIdentifier = `Habitación #${transactionData.room_number || transactionData.id_room_order}`;
      } else if (transactionData.id_tap_pay_order) {
        serviceType = "tap-pay";
        orderIdentifier = `Tap&Pay #${transactionData.id_tap_pay_order}`;
      }

      // Emitir evento de socket para actualizar dashboard en tiempo real
      const transaction = result.transaction;
      const baseAmount =
        transaction.base_amount || transactionData.base_amount || 0;
      const tipAmount =
        transaction.tip_amount || transactionData.tip_amount || 0;
      const totalAmount =
        transaction.total_amount_charged ||
        transactionData.total_amount_charged ||
        0;

      // Estos servicios confirman la orden al pagar — la cocina se entera aquí
      const notifyKitchenOnPayment = [
        "tap-order-pay",
        "pick-n-go",
        "room-service",
      ].includes(serviceType);

      socketEmitter.emitNewTransaction(transactionData.restaurant_id, {
        id: transaction.id,
        baseAmount: baseAmount,
        tipAmount: tipAmount,
        totalAmount: totalAmount,
        createdAt: transaction.created_at || new Date().toISOString(),
        serviceType: transactionData.service_type || serviceType,
        orderIdentifier:
          orderIdentifier || `Orden #${transaction.id.slice(0, 8)}`,
        orderStatus: "paid",
        notifyKitchen: notifyKitchenOnPayment,
      });

      // También emitir actualización de métricas
      socketEmitter.emitMetricsUpdate(transactionData.restaurant_id, {
        nuevaVenta: baseAmount,
        nuevaPropina: tipAmount,
        nuevoTotal: totalAmount,
      });

      // Notificar nuevo pago a través de WebSocket para actualización de estadísticas en tiempo real
      console.log(
        "🔔 [Payment] Attempting to send WebSocket notification for restaurant:",
        transactionData.restaurant_id,
      );
      try {
        const PaymentNotificationService = require("../services/paymentNotificationService");
        const io = req.app.get("io");
        if (!io) {
          console.error("⚠️ [Payment] Socket.IO instance not available");
        } else {
          console.log(
            "✅ [Payment] Socket.IO instance found, sending notification",
          );
          const notificationService = new PaymentNotificationService(io);
          notificationService.notifyNewPayment(transactionData.restaurant_id);
          console.log("✅ [Payment] WebSocket notification sent successfully");
        }
      } catch (notificationError) {
        // No fallar la transacción si falla la notificación
        console.error(
          "⚠️ Failed to send payment notification:",
          notificationError,
        );
      }

      // Sincronizar pago con POS (solo FlexBill - los demás se sincronizan desde sus servicios)
      try {
        if (transactionData.id_table_order) {
          const tip = transactionData.tip_amount || 0;
          const amount = transactionData.base_amount || 0;
          // FlexBill - sincronizar pago con propina
          POSSyncService.syncFlexBillPayment(
            transactionData.id_table_order,
            amount,
            tip,
          ).catch((err) =>
            console.error("Error sincronizando pago FlexBill con POS:", err),
          );
        }
        // NOTA: Tap Order & Pay, Pick & Go, Room Service se sincronizan
        // desde sus respectivos servicios cuando el status cambia a "completed"
      } catch (posSyncError) {
        console.error("⚠️ Failed to sync payment with POS:", posSyncError);
      }

      res.status(201).json({
        success: true,
        message: "Payment transaction created successfully",
        transaction: result.transaction,
      });
    } catch (error) {
      console.error("Error in createPaymentTransaction controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  // Obtiene el historial de transacciones del usuario
  async getTransactionHistory(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User not authenticated",
          },
        });
      }

      const { limit, offset, restaurantId } = req.query;

      const result = await paymentTransactionService.getUserTransactions(
        userId,
        isGuest,
        {
          limit: limit ? parseInt(limit) : 50,
          offset: offset ? parseInt(offset) : 0,
          restaurantId: restaurantId || null,
        },
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(200).json({
        success: true,
        transactions: result.transactions,
        total: result.total,
      });
    } catch (error) {
      console.error("Error in getTransactionHistory controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  // Obtiene una transacción específica por ID
  async getTransactionById(req, res) {
    try {
      const { transactionId } = req.params;

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Transaction ID is required",
          },
        });
      }

      const result =
        await paymentTransactionService.getTransactionById(transactionId);

      if (!result.success) {
        const statusCode = result.error.type === "not_found" ? 404 : 400;
        return res.status(statusCode).json(result);
      }

      res.status(200).json({
        success: true,
        transaction: result.transaction,
      });
    } catch (error) {
      console.error("Error in getTransactionById controller:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }

  /**
   * Migrate guest payment methods to authenticated user
   * POST /payment-methods/migrate-from-guest
   * Body: { guestId: string }
   */
  async migrateGuestPaymentMethods(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;
      const { guestId } = req.body;

      // PCI Log: Attempt to migrate tokens
      pciLog({
        action: PCI_ACTIONS.TOKEN_MIGRATE_ATTEMPT,
        userId: userId || "unauthenticated",
        processor: "ecartpay",
        req,
        metadata: { guestId, targetUserId: userId },
      });

      console.log("🔄 Migration request received:", {
        userId,
        isGuest,
        guestId,
      });

      // Validar que el usuario esté autenticado
      if (!userId || isGuest) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_MIGRATE_ERROR,
          userId: userId || "unauthenticated",
          processor: provider,
          req,
          error: "User must be authenticated to migrate payment methods",
        });
        return res.status(401).json({
          success: false,
          error: {
            type: "authentication_error",
            message: "User must be authenticated to migrate payment methods",
          },
        });
      }

      // Validar que se proporcione el guestId
      if (!guestId) {
        pciLog({
          action: PCI_ACTIONS.TOKEN_MIGRATE_ERROR,
          userId,
          processor: provider,
          req,
          error: "Guest ID is required",
        });
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Guest ID is required",
          },
        });
      }

      // Llamar al servicio para migrar los métodos de pago
      const result = await paymentService.migrateGuestPaymentMethods(
        guestId,
        userId,
      );

      if (!result.success) {
        console.error("❌ Migration failed:", result.error);
        pciLog({
          action: PCI_ACTIONS.TOKEN_MIGRATE_ERROR,
          userId,
          processor: provider,
          req,
          error: result.error?.message || result.error?.type,
          metadata: { guestId },
        });
        return res.status(500).json(result);
      }

      // PCI Log: Migration success
      pciLog({
        action: PCI_ACTIONS.TOKEN_MIGRATE_SUCCESS,
        userId,
        processor: "ecartpay",
        req,
        metadata: { guestId, migratedCount: result.migratedCount },
      });

      console.log(
        `✅ Successfully migrated ${result.migratedCount} payment methods from guest ${guestId} to user ${userId}`,
      );

      res.status(200).json({
        success: true,
        data: {
          migratedCount: result.migratedCount,
        },
      });
    } catch (error) {
      console.error("❌ Error in migrateGuestPaymentMethods:", error);
      pciLog({
        action: PCI_ACTIONS.TOKEN_MIGRATE_ERROR,
        userId: req.user?.id || "unknown",
        processor: "ecartpay",
        req,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Failed to migrate payment methods",
        },
      });
    }
  }

  /**
   * Crea una orden en Ecart Pay para Apple Pay y devuelve el orderId.
   * El SDK de Apple Pay de Ecart Pay necesita este ID antes de renderizar el botón.
   */
  async createApplePayOrder(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;
      const { amount, currency = "MXN", tableNumber, restaurantId } = req.body;

      if (!amount || typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "amount es requerido y debe ser mayor a 0",
          },
        });
      }

      console.log(
        `🍎 createApplePayOrder para ${isGuest ? "guest" : "user"}: ${userId}, monto: ${amount} ${currency}, restaurant: ${restaurantId}`,
      );

      const ecartPay = await resolveEcartPayInstance(restaurantId);

      // Buscar o crear customer solo para usuarios autenticados
      let customerId;

      if (!isGuest && userId) {
        const existingCustomer = await ecartPay.findCustomerByUserId(userId);

        if (existingCustomer.success && existingCustomer.customer?.id) {
          customerId = existingCustomer.customer.id;
          console.log("✅ Customer existente encontrado:", customerId);
        } else {
          // No existe — crear con nombre real del perfil
          const { data: profileData } = await supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, phone")
            .eq("id", userId)
            .maybeSingle();

          const customerName = profileData?.first_name
            ? [profileData.first_name, profileData.last_name]
                .filter(Boolean)
                .join(" ")
            : "Guest";
          const phone =
            profileData?.phone || `55${Date.now().toString().slice(-8)}`;

          const newCustomer = await ecartPay.createCustomer({
            name: customerName,
            phone,
            userId,
          });

          if (newCustomer.success) {
            customerId = newCustomer.customer.id;
            console.log(
              "✅ Customer creado para Apple Pay:",
              customerId,
              customerName,
            );
          } else {
            // No bloquear Apple Pay si falla la creación del customer
            console.warn(
              "⚠️ No se pudo crear customer para Apple Pay, continuando sin customer:",
              newCustomer.error,
            );
          }
        }
      }
      // guests → customerId queda undefined → orden anónima

      // Crear la orden en Ecart Pay
      const orderResult = await ecartPay.createOrder({
        customerId,
        amount,
        currency,
        quantity: 1,
        description: `Xquisito Restaurant Payment${tableNumber ? ` - Mesa ${tableNumber}` : ""}`,
        tableNumber: tableNumber || null,
        referenceId: `xq_applepay_${Date.now()}`,
        redirectUrl: `${process.env.FRONTEND_URL || "https://pickandgo.xquisito.ai"}/payment-success`,
      });

      if (!orderResult.success || !orderResult.order?.id) {
        console.error(
          "❌ No se pudo crear orden para Apple Pay:",
          orderResult.error,
        );
        return res.status(500).json({
          success: false,
          error: {
            type: "api_error",
            message: "No se pudo crear la orden de pago",
          },
        });
      }

      console.log("✅ Orden Apple Pay creada:", orderResult.order.id);

      return res.json({
        success: true,
        orderId: orderResult.order.id,
      });
    } catch (error) {
      console.error("❌ Error en createApplePayOrder:", error);
      return res.status(500).json({
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      });
    }
  }
}

module.exports = new PaymentController();
