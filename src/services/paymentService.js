const supabase = require("../config/supabase");
const { supabaseAdmin } = require("../config/supabaseAuth");
const ecartPayService = require("./ecartpayService");

class PaymentService {
  async addPaymentMethod(userId, paymentData, context = {}) {
    try {
      // Validate input data
      const validation = this.validatePaymentData(paymentData);
      if (!validation.isValid) {
        return {
          success: false,
          error: {
            type: "validation_error",
            message: validation.errors.join(", "),
          },
        };
      }

      // Check if user exists and get their info
      let user;
      const { isGuest, userEmail } = context;

      if (isGuest) {
        // For guest users, create a temporary user object with valid email format
        const cleanGuestId = userId.replace(/[^a-zA-Z0-9]/g, ""); // Remove special chars
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substr(2, 9);

        // Use provided email but make it unique for eCartpay to avoid conflicts
        const uniqueGuestEmail = userEmail
          ? `${userEmail.split("@")[0]}+${cleanGuestId}${timestamp}${randomSuffix}@${userEmail.split("@")[1]}`
          : `guest${cleanGuestId}${timestamp}${randomSuffix}@xquisito.com`;

        user = {
          user: {
            email: uniqueGuestEmail,
            id: userId,
            originalEmail: userEmail, // Store original email for reference
          },
        };
        console.log(
          `Processing guest user: ${userId} with unique email: ${uniqueGuestEmail} (original: ${userEmail})`,
        );
      } else {
        // For authenticated users, try to get profile (may not exist for new users)
        const { data: userData } = await supabase
          .from("profiles")
          .select("email, phone")
          .eq("id", userId)
          .maybeSingle();

        user = {
          user: {
            email: userData?.email || context.userEmail || null,
            id: userId,
            phone: userData?.phone || null,
          },
        };
        console.log(`Processing authenticated user (Supabase Auth): ${userId}${!userData ? " (no profile yet)" : ""}`);
      }

      // Resolver proveedor activo para este restaurante
      const provider = context.provider || "ecartpay";
      console.log(
        `[PaymentProvider] Tokenizando tarjeta con proveedor: ${provider}`,
      );

      // Solo eCartPay implementado por ahora
      if (provider !== "ecartpay") {
        return {
          success: false,
          error: {
            type: "not_implemented",
            message: `El proveedor '${provider}' no está disponible todavía`,
          },
        };
      }

      // Check if user already has an EcartPay customer
      let ecartPayCustomerId;
      const tableName = isGuest
        ? "guest_payment_methods"
        : "user_payment_methods";
      const userFieldName = isGuest ? "guest_id" : "user_id";

      // Buscar customer_id existente en payment_method_tokens
      const { data: existingMethods } = await supabase
        .from(tableName)
        .select("id")
        .eq(userFieldName, userId)
        .limit(1);

      if (existingMethods && existingMethods.length > 0) {
        const { data: existingToken } = await supabase
          .from("payment_method_tokens")
          .select("provider_customer_id")
          .eq("payment_method_id", existingMethods[0].id)
          .eq("provider", "ecartpay")
          .eq("is_active", true)
          .limit(1)
          .single();

        if (existingToken?.provider_customer_id) {
          ecartPayCustomerId = existingToken.provider_customer_id;
          console.log(
            "🔄 Using existing eCartpay customer:",
            ecartPayCustomerId,
          );
        }
      }

      if (!ecartPayCustomerId) {
        // First, try to find if customer already exists in eCartpay by user_id
        console.log("🔍 Checking if customer already exists in eCartpay...");
        const existingCustomer =
          await ecartPayService.findCustomerByUserId(userId);

        if (existingCustomer.success) {
          // Customer exists, use it
          ecartPayCustomerId = existingCustomer.customer.id;
          console.log(
            "✅ Found existing eCartpay customer:",
            ecartPayCustomerId,
          );
        } else {
          // Create new customer
          console.log("👤 Creating new EcartPay customer for:", {
            name: paymentData.cardholderName,
            userId,
          });

          // Generate a unique phone number for testing to avoid eCartPay conflicts
          // Revisar
          const phone =
            user.user.phone || `1${Date.now().toString().slice(-9)}`; // Unique 10-digit phone

          const customerResult = await ecartPayService.createCustomer({
            name: paymentData.cardholderName,
            userId: userId, // Use the original userId, not modified
            phone: phone,
          });

          console.log("👤 EcartPay customer creation result:", {
            success: customerResult.success,
            error: customerResult.error?.type,
            message: customerResult.error?.message,
          });

          if (!customerResult.success) {
            console.error(
              "❌ Failed to create EcartPay customer:",
              customerResult.error,
            );
            return {
              success: false,
              error: customerResult.error,
            };
          }

          ecartPayCustomerId = customerResult.customer.id;
          console.log("✅ EcartPay customer created:", ecartPayCustomerId);
        }
      }

      // ── Tokenizar con eCartPay (requerido — si falla, abortamos) ──────────
      let paymentMethodResult = await ecartPayService.createPaymentMethod({
        cardNumber: paymentData.cardNumber,
        expMonth: paymentData.expMonth,
        expYear: paymentData.expYear,
        cvv: paymentData.cvv,
        cardholderName: paymentData.cardholderName,
        customerId: ecartPayCustomerId,
      });

      // Si el customer ya no existe en eCartPay, buscarlo o crear uno nuevo y reintentar
      if (!paymentMethodResult.success && paymentMethodResult.error?.status === 404) {
        console.warn(`⚠️ eCartPay customer ${ecartPayCustomerId} not found, looking up by user_id...`);

        const existingCustomer = await ecartPayService.findCustomerByUserId(userId);
        if (existingCustomer.success) {
          ecartPayCustomerId = existingCustomer.customer.id;
          console.log("✅ Found eCartPay customer by user_id:", ecartPayCustomerId);
        } else {
          const phone = user.user.phone || `1${Date.now().toString().slice(-9)}`;
          const customerResult = await ecartPayService.createCustomer({
            name: paymentData.cardholderName,
            userId,
            phone,
          });

          if (!customerResult.success) {
            return { success: false, error: customerResult.error };
          }

          ecartPayCustomerId = customerResult.customer.id;
          console.log("✅ New eCartPay customer created:", ecartPayCustomerId);
        }

        paymentMethodResult = await ecartPayService.createPaymentMethod({
          cardNumber: paymentData.cardNumber,
          expMonth: paymentData.expMonth,
          expYear: paymentData.expYear,
          cvv: paymentData.cvv,
          cardholderName: paymentData.cardholderName,
          customerId: ecartPayCustomerId,
        });
      }

      if (!paymentMethodResult.success) {
        return { success: false, error: paymentMethodResult.error };
      }

      const ecartPayPaymentMethod = paymentMethodResult.paymentMethod;
      console.log("📋 eCartpay payment method created:", {
        id: ecartPayPaymentMethod.id,
        type: ecartPayPaymentMethod.type,
        brand: ecartPayPaymentMethod.brand,
        last4: ecartPayPaymentMethod.last || ecartPayPaymentMethod.last4,
      });

      // ── Guardar fila principal (metadatos de la tarjeta) ──────────────────
      const { data: existingDefault } = await supabase
        .from(tableName)
        .select("id")
        .eq(userFieldName, userId)
        .eq("is_default", true)
        .limit(1);

      const isDefault = !existingDefault || existingDefault.length === 0;

      const insertData = {
        last_four_digits: (
          ecartPayPaymentMethod.last ||
          ecartPayPaymentMethod.last4 ||
          ecartPayPaymentMethod.last_four ||
          paymentData.cardNumber.slice(-4)
        )
          .slice(-4)
          .substring(0, 3),
        card_type: this.normalizeCreditType(ecartPayPaymentMethod.type),
        card_brand: this.normalizeCardType(
          ecartPayPaymentMethod.brand ||
            ecartPayPaymentMethod.type ||
            "unknown",
          paymentData.cardNumber,
        ),
        expiry_month: paymentData.expMonth,
        expiry_year: paymentData.expYear,
        cardholder_name: (paymentData.cardholderName || "").substring(0, 50),
        is_default: isDefault,
        is_active: true,
      };

      if (isGuest) {
        insertData.guest_id = userId;
        if (context.tableNumber) insertData.table_number = context.tableNumber;
        if (context.sessionData) insertData.session_data = context.sessionData;
      } else {
        insertData.user_id = userId;
      }

      const { data: savedMethod, error: saveError } = await supabase
        .from(tableName)
        .insert(insertData)
        .select()
        .single();

      if (saveError) {
        console.error("Database save error:", saveError);
        return {
          success: false,
          error: {
            type: "database_error",
            message: "Failed to save payment method",
            details: saveError.message || saveError,
          },
        };
      }

      // ── Guardar token de eCartPay en payment_method_tokens ───────────────
      console.log(
        `[Tokens] Guardando en payment_method_tokens: payment_method_id=${savedMethod.id}, user_type=${isGuest ? "guest" : "user"}, provider=ecartpay`,
      );

      const dbClient = supabaseAdmin || supabase;
      if (!supabaseAdmin) {
        console.warn(
          "[Tokens] supabaseAdmin no disponible — usando cliente anon (puede fallar por RLS)",
        );
      }

      const { error: tokenSaveError } = await dbClient
        .from("payment_method_tokens")
        .upsert(
          {
            payment_method_id: savedMethod.id,
            user_type: isGuest ? "guest" : "user",
            provider: "ecartpay",
            provider_token: ecartPayPaymentMethod.id,
            provider_customer_id: ecartPayCustomerId,
            is_active: true,
          },
          { onConflict: "payment_method_id,provider" },
        );

      if (tokenSaveError) {
        console.error(
          "❌ Error guardando token en payment_method_tokens:",
          tokenSaveError.message,
          tokenSaveError.details,
          tokenSaveError.hint,
        );
      } else {
        console.log("✅ Token guardado en payment_method_tokens para ecartpay");
      }

      // ── Tokenizar con otros proveedores activos (best-effort) ────────────
      // Cuando se implemente Clip u otros, agregar aquí su lógica de tokenización.
      // Si uno falla no cancela la operación — el token de eCartPay ya está guardado.
      const { data: otherProviders } = await supabase
        .from("payment_providers")
        .select("code")
        .eq("is_active", true)
        .neq("code", "ecartpay");

      if (otherProviders && otherProviders.length > 0) {
        await Promise.allSettled(
          otherProviders.map(async ({ code }) => {
            try {
              // TODO: cuando se implemente un proveedor, agregar su case aquí:
              // if (code === "clip") { ... }
              console.log(
                `[PaymentProvider] Proveedor '${code}' pendiente de implementación — token omitido`,
              );
            } catch (err) {
              console.error(
                `[PaymentProvider] Error tokenizando con '${code}':`,
                err.message,
              );
            }
          }),
        );
      }

      return {
        success: true,
        paymentMethod: {
          id: savedMethod.id,
          lastFourDigits: savedMethod.last_four_digits,
          cardType: savedMethod.card_type,
          expiryMonth: savedMethod.expiry_month,
          expiryYear: savedMethod.expiry_year,
          cardholderName: savedMethod.cardholder_name,
          isDefault: savedMethod.is_default,
          createdAt: savedMethod.created_at,
        },
      };
    } catch (error) {
      console.error("Error in addPaymentMethod:", error);
      return {
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
          details: error.message,
        },
      };
    }
  }

  async getUserPaymentMethods(userId, context = {}) {
    try {
      const { isGuest } = context;
      const tableName = isGuest
        ? "guest_payment_methods"
        : "user_payment_methods";
      const userFieldName = isGuest ? "guest_id" : "user_id";

      // For guest users, also filter by non-expired records
      let query = supabase
        .from(tableName)
        .select(
          `
          id,
          last_four_digits,
          card_type,
          card_brand,
          expiry_month,
          expiry_year,
          cardholder_name,
          is_default,
          is_active,
          created_at
        `,
        )
        .eq(userFieldName, userId)
        .eq("is_active", true);

      // For guests, only return non-expired payment methods
      if (isGuest) {
        query = query.gt("expires_at", new Date().toISOString());
      }

      const { data: methods, error } = await query
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        return {
          success: false,
          error: {
            type: "database_error",
            message: "Failed to retrieve payment methods",
            details: error,
          },
        };
      }

      // Transform the data to match frontend expectations (camelCase)
      const transformedMethods = (methods || []).map((method) => ({
        id: method.id,
        lastFourDigits: method.last_four_digits,
        cardType: method.card_type,
        cardBrand: method.card_brand,
        expiryMonth: method.expiry_month,
        expiryYear: method.expiry_year,
        cardholderName: method.cardholder_name,
        isDefault: method.is_default,
        isActive: method.is_active,
        createdAt: method.created_at,
      }));

      return {
        success: true,
        paymentMethods: transformedMethods,
      };
    } catch (error) {
      console.error("Error in getUserPaymentMethods:", error);
      return {
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      };
    }
  }

  async deletePaymentMethod(userId, paymentMethodId, context = {}) {
    try {
      const { isGuest } = context;
      const tableName = isGuest
        ? "guest_payment_methods"
        : "user_payment_methods";
      const userFieldName = isGuest ? "guest_id" : "user_id";

      // Get the payment method to delete
      const { data: method, error: fetchError } = await supabase
        .from(tableName)
        .select("id, is_default")
        .eq(userFieldName, userId)
        .eq("id", paymentMethodId)
        .single();

      if (fetchError || !method) {
        return {
          success: false,
          error: {
            type: "not_found",
            message: "Payment method not found",
          },
        };
      }

      // Obtener token de eCartPay desde payment_method_tokens
      const { data: tokenRow } = await supabase
        .from("payment_method_tokens")
        .select("provider_token")
        .eq("payment_method_id", paymentMethodId)
        .eq("provider", "ecartpay")
        .eq("is_active", true)
        .single();

      // Attempt to detach from EcartPay (continue even if it fails)
      if (tokenRow?.provider_token) {
        console.log(
          `🗑️ Attempting to delete from EcartPay: ${tokenRow.provider_token}`,
        );
        try {
          const detachResult = await ecartPayService.detachPaymentMethod(
            tokenRow.provider_token,
          );

          if (!detachResult.success) {
            console.warn(
              "⚠️ Failed to delete payment method from EcartPay (will continue with local deletion):",
              detachResult.error,
            );
          } else {
            console.log("✅ Successfully deleted from EcartPay");
          }
        } catch (ecartPayError) {
          console.warn(
            "⚠️ EcartPay deletion failed (will continue with local deletion):",
            ecartPayError,
          );
        }
      } else {
        console.log("ℹ️ No EcartPay token found, skipping external deletion");
      }

      console.log("🗑️ Proceeding with database deletion");

      // Eliminar tokens asociados en payment_method_tokens
      const dbClient = supabaseAdmin || supabase;
      await dbClient
        .from("payment_method_tokens")
        .delete()
        .eq("payment_method_id", paymentMethodId);

      // Delete completely from our database after successful EcartPay deletion
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq(userFieldName, userId)
        .eq("id", paymentMethodId);

      if (deleteError) {
        console.error(
          "❌ Database deletion failed after EcartPay deletion:",
          deleteError,
        );
        return {
          success: false,
          error: {
            type: "database_error",
            message: "Failed to delete payment method from database",
            details: deleteError,
          },
        };
      }

      // If this was the default method, set another one as default
      if (method.is_default) {
        const { data: otherMethods } = await supabase
          .from("user_payment_methods")
          .select("id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .limit(1);

        if (otherMethods && otherMethods.length > 0) {
          await supabase
            .from("user_payment_methods")
            .update({ is_default: true })
            .eq("id", otherMethods[0].id);
        }
      }

      return {
        success: true,
        message: "Payment method deleted successfully",
      };
    } catch (error) {
      console.error("Error in deletePaymentMethod:", error);
      return {
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      };
    }
  }

  async setDefaultPaymentMethod(userId, paymentMethodId) {
    try {
      // Verify the payment method belongs to the user
      const { data: method, error: fetchError } = await supabase
        .from("user_payment_methods")
        .select("id")
        .eq("user_id", userId)
        .eq("id", paymentMethodId)
        .eq("is_active", true)
        .single();

      if (fetchError || !method) {
        return {
          success: false,
          error: {
            type: "not_found",
            message: "Payment method not found",
          },
        };
      }

      // Update all payment methods for this user to not be default
      await supabase
        .from("user_payment_methods")
        .update({ is_default: false })
        .eq("user_id", userId);

      // Set the selected one as default
      const { error: updateError } = await supabase
        .from("user_payment_methods")
        .update({ is_default: true })
        .eq("id", paymentMethodId);

      if (updateError) {
        return {
          success: false,
          error: {
            type: "database_error",
            message: "Failed to set default payment method",
            details: updateError,
          },
        };
      }

      return {
        success: true,
        message: "Default payment method updated successfully",
      };
    } catch (error) {
      console.error("Error in setDefaultPaymentMethod:", error);
      return {
        success: false,
        error: {
          type: "internal_error",
          message: "Internal server error",
        },
      };
    }
  }

  async cleanupTestData(userId, context = {}) {
    try {
      const { isGuest } = context;
      const tableName = isGuest
        ? "guest_payment_methods"
        : "user_payment_methods";
      const userFieldName = isGuest ? "guest_id" : "user_id";

      // Get all payment methods for this user/guest
      const { data: methods, error } = await supabase
        .from(tableName)
        .select("id")
        .eq(userFieldName, userId);

      if (error) {
        console.error("Error fetching methods for cleanup:", error);
        return { success: false, error };
      }

      console.log(
        `🧹 Cleaning up ${methods?.length || 0} payment methods for ${isGuest ? "guest" : "user"}: ${userId}`,
      );

      // Detach each from eCartPay via payment_method_tokens
      for (const method of methods || []) {
        try {
          const { data: tokenRow } = await supabase
            .from("payment_method_tokens")
            .select("provider_token")
            .eq("payment_method_id", method.id)
            .eq("provider", "ecartpay")
            .single();

          if (tokenRow?.provider_token) {
            await ecartPayService.detachPaymentMethod(tokenRow.provider_token);
            console.log(`✅ Detached ${tokenRow.provider_token} from eCartPay`);
          }
        } catch (error) {
          console.warn(
            `⚠️ Failed to detach payment method ${method.id}:`,
            error,
          );
        }
      }

      // Delete from our database
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq(userFieldName, userId);

      if (deleteError) {
        console.error("Error deleting from database:", deleteError);
        return { success: false, error: deleteError };
      }

      console.log("🎉 Cleanup completed successfully");
      return { success: true, cleaned: methods?.length || 0 };
    } catch (error) {
      console.error("Error in cleanupTestData:", error);
      return { success: false, error };
    }
  }

  validatePaymentData(data) {
    const errors = [];

    if (
      !data.cardNumber ||
      !ecartPayService.validateCardNumber(data.cardNumber)
    ) {
      errors.push("Invalid card number");
    }

    if (
      !data.expMonth ||
      !data.expYear ||
      !ecartPayService.validateExpiry(data.expMonth, data.expYear)
    ) {
      errors.push("Invalid expiry date");
    }

    if (!data.cvv || data.cvv.length < 3 || data.cvv.length > 4) {
      errors.push("Invalid CVV");
    }

    if (!data.cardholderName || data.cardholderName.trim().length < 2) {
      errors.push("Invalid cardholder name");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Normaliza el tipo de crédito/débito: devuelve "credit" o "debit"
  // Si EcartPay no devuelve un tipo reconocible, asume "credit"
  normalizeCreditType(rawType) {
    if (!rawType) return "credit";
    const lower = rawType.toLowerCase();
    if (lower === "debit") return "debit";
    return "credit";
  }

  // Normalize card type from EcartPay to standard values
  normalizeCardType(ecartPayType, cardNumber) {
    // First try to determine from card number if ecartPayType is generic
    if (
      ecartPayType === "credit" ||
      ecartPayType === "card" ||
      ecartPayType === "unknown"
    ) {
      return this.detectCardTypeFromNumber(cardNumber);
    }

    // Normalize EcartPay types to standard values
    const typeMap = {
      visa: "visa",
      mastercard: "mastercard",
      master: "mastercard",
      amex: "amex",
      "american-express": "amex",
      american_express: "amex",
      discover: "discover",
      credit: this.detectCardTypeFromNumber(cardNumber), // fallback to number detection
      debit: this.detectCardTypeFromNumber(cardNumber), // fallback to number detection
    };

    return (
      typeMap[ecartPayType.toLowerCase()] ||
      this.detectCardTypeFromNumber(cardNumber)
    );
  }

  // Detect card type from card number patterns
  detectCardTypeFromNumber(cardNumber) {
    if (!cardNumber) return "unknown";

    const cleaned = cardNumber.replace(/\s/g, "");

    const patterns = {
      visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
      mastercard: /^5[1-5][0-9]{14}$/,
      amex: /^3[47][0-9]{13}$/,
      discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(cleaned)) {
        return type;
      }
    }

    return "unknown";
  }

  /**
   * Migrate guest payment methods to authenticated user
   * @param {string} guestId - ID del guest
   * @param {string} userId - ID del usuario autenticado (Supabase UUID)
   * @returns {Promise<{success: boolean, migratedCount?: number, error?: object}>}
   */
  async migrateGuestPaymentMethods(guestId, userId) {
    try {
      console.log(
        `🔄 Starting migration from guest ${guestId} to user ${userId}`,
      );

      // 1. Obtener todos los payment methods del guest
      const { data: guestPaymentMethods, error: fetchError } = await supabase
        .from("guest_payment_methods")
        .select("*")
        .eq("guest_id", guestId)
        .eq("is_active", true);

      if (fetchError) {
        console.error("❌ Error fetching guest payment methods:", fetchError);
        return {
          success: false,
          error: {
            type: "database_error",
            message: "Failed to fetch guest payment methods",
          },
        };
      }

      if (!guestPaymentMethods || guestPaymentMethods.length === 0) {
        console.log("ℹ️ No guest payment methods found to migrate");
        return {
          success: true,
          migratedCount: 0,
        };
      }

      console.log(
        `📋 Found ${guestPaymentMethods.length} payment methods to migrate`,
      );

      // 2. Obtener tokens del guest desde payment_method_tokens
      const guestMethodIds = guestPaymentMethods.map((gpm) => gpm.id);
      const { data: guestTokens } = await supabase
        .from("payment_method_tokens")
        .select("payment_method_id, provider, provider_token")
        .in("payment_method_id", guestMethodIds)
        .eq("user_type", "guest");

      const guestTokenSet = new Set(
        (guestTokens || []).map((t) => t.provider_token),
      );

      // Verificar cuáles ya existen en usuario para evitar duplicados
      const { data: existingUserMethods } = await supabase
        .from("user_payment_methods")
        .select("id")
        .eq("user_id", userId);

      const existingUserIds = new Set(
        (existingUserMethods || []).map((m) => m.id),
      );

      // Verificar tokens de usuario existentes
      const { data: existingUserTokens } = await supabase
        .from("payment_method_tokens")
        .select("provider_token")
        .in("payment_method_id", [...existingUserIds])
        .eq("user_type", "user");

      const existingTokenSet = new Set(
        (existingUserTokens || []).map((t) => t.provider_token),
      );

      // Solo migrar los que no están ya en usuario
      const methodsToMigrate = guestPaymentMethods.filter((gpm) => {
        const token = (guestTokens || []).find(
          (t) => t.payment_method_id === gpm.id,
        );
        return token && !existingTokenSet.has(token.provider_token);
      });

      if (methodsToMigrate.length === 0) {
        console.log("ℹ️ All payment methods already migrated");
        return { success: true, migratedCount: 0 };
      }

      console.log(
        `💳 ${methodsToMigrate.length} new payment methods to migrate`,
      );

      // 3. Insertar en user_payment_methods
      const userPaymentMethods = methodsToMigrate.map((gpm) => ({
        user_id: userId,
        last_four_digits: gpm.last_four_digits,
        card_type: gpm.card_type,
        card_brand: gpm.card_brand,
        expiry_month: parseInt(gpm.expiry_month),
        expiry_year: parseInt(gpm.expiry_year),
        cardholder_name: gpm.cardholder_name,
        billing_country: gpm.billing_country,
        billing_postal_code: gpm.billing_postal_code,
        is_active: true,
        is_default: gpm.is_default,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { data: insertedMethods, error: insertError } = await supabase
        .from("user_payment_methods")
        .insert(userPaymentMethods)
        .select();

      if (insertError) {
        console.error("❌ Error inserting user payment methods:", insertError);
        return {
          success: false,
          error: {
            type: "database_error",
            message: "Failed to insert user payment methods",
          },
        };
      }

      // 4. Migrar tokens — actualizar user_type a 'user' y reasignar payment_method_id
      const dbClient = supabaseAdmin || supabase;
      for (let i = 0; i < methodsToMigrate.length; i++) {
        const guestMethod = methodsToMigrate[i];
        const newUserMethod = insertedMethods[i];
        const guestMethodTokens = (guestTokens || []).filter(
          (t) => t.payment_method_id === guestMethod.id,
        );

        for (const token of guestMethodTokens) {
          await dbClient.from("payment_method_tokens").upsert(
            {
              payment_method_id: newUserMethod.id,
              user_type: "user",
              provider: token.provider,
              provider_token: token.provider_token,
              is_active: true,
            },
            { onConflict: "payment_method_id,provider" },
          );
        }
      }

      console.log(
        `✅ Successfully migrated ${insertedMethods.length} payment methods`,
      );

      // 5. Marcar guest methods como inactivos
      await supabase
        .from("guest_payment_methods")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("guest_id", guestId);

      return { success: true, migratedCount: insertedMethods.length };
    } catch (error) {
      console.error("❌ Error in migrateGuestPaymentMethods:", error);
      return {
        success: false,
        error: {
          type: "internal_error",
          message: error.message || "Failed to migrate payment methods",
        },
      };
    }
  }
}

module.exports = new PaymentService();
