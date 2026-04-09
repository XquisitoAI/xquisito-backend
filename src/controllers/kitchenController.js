const kitchenService = require("../services/kitchenService");
const kitchenPushService = require("../services/kitchenPushService");

class KitchenController {
  /**
   * GET /api/kitchen/orders
   * Retorna órdenes activas con dishes no entregados
   */
  async getActiveOrders(req, res) {
    try {
      const clerkUserId = req.auth.userId;
      const restaurantId = await kitchenService.getRestaurantIdForUser(clerkUserId);
      const orders = await kitchenService.getActiveOrders(restaurantId);
      res.json({ success: true, orders, total: orders.length });
    } catch (error) {
      console.error("[KITCHEN] getActiveOrders error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/kitchen/fcm-token
   * Registra token FCM del dispositivo para push notifications
   */
  async saveFcmToken(req, res) {
    try {
      const clerkUserId = req.auth.userId;
      const { token, platform } = req.body;

      if (!token || !platform) {
        return res.status(400).json({ success: false, error: "token y platform son requeridos" });
      }

      const restaurantId = await kitchenService.getRestaurantIdForUser(clerkUserId);
      await kitchenService.saveFcmToken(restaurantId, token, platform);
      res.json({ success: true });
    } catch (error) {
      console.error("[KITCHEN] saveFcmToken error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/kitchen/notify (interno - llamado desde socketEmitter)
   * Envía push FCM a todos los dispositivos del restaurante
   */
  async sendPushToRestaurant(restaurantId, title, body) {
    try {
      const tokens = await kitchenService.getFcmTokens(restaurantId);
      if (tokens.length === 0) return;

      const fcmTokens = tokens.map((t) => t.token);
      await kitchenPushService.sendToTokens(fcmTokens, { title, body });
    } catch (error) {
      console.error("[KITCHEN] sendPushToRestaurant error:", error.message);
    }
  }
}

module.exports = new KitchenController();
