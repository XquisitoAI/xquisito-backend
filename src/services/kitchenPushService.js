let admin = null;

function getAdmin() {
  if (!admin) {
    const firebaseAdmin = require("firebase-admin");

    if (!firebaseAdmin.apps.length) {
      let serviceAccount = null;
      try {
        serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
          ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
          : null;
      } catch (e) {
        console.warn("[KITCHEN PUSH] FIREBASE_SERVICE_ACCOUNT JSON inválido:", e.message);
        return null;
      }

      if (!serviceAccount) {
        console.warn("[KITCHEN PUSH] FIREBASE_SERVICE_ACCOUNT no configurado — push FCM deshabilitado");
        return null;
      }

      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
      });
    }

    admin = firebaseAdmin;
  }
  return admin;
}

class KitchenPushService {
  /**
   * Envía notificación push a una lista de tokens FCM
   */
  async sendToTokens(tokens, { title, body }) {
    const firebaseAdmin = getAdmin();
    if (!firebaseAdmin || tokens.length === 0) return;

    try {
      const message = {
        notification: { title, body },
        android: {
          notification: {
            channelId: "kitchen_orders",
            priority: "high",
            sound: "default",
          },
        },
        tokens,
      };

      const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
      console.log(
        `[KITCHEN PUSH] Enviado: ${response.successCount} ok, ${response.failureCount} errores`
      );

      // Limpiar tokens inválidos
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
          invalidTokens.push(tokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        const supabase = require("../config/supabase");
        await supabase
          .from("kitchen_push_subscriptions")
          .delete()
          .in("token", invalidTokens);
        console.log(`[KITCHEN PUSH] ${invalidTokens.length} tokens inválidos eliminados`);
      }
    } catch (error) {
      console.error("[KITCHEN PUSH] Error enviando FCM:", error.message);
    }
  }
}

module.exports = new KitchenPushService();
