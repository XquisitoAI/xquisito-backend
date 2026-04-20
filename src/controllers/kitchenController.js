const kitchenService = require("../services/kitchenService");
const kitchenPushService = require("../services/kitchenPushService");
const supabase = require("../config/supabase");

class KitchenController {
  /**
   * GET /api/kitchen/orders
   * Retorna órdenes activas con dishes no entregados
   */
  async getActiveOrders(req, res) {
    try {
      const clerkUserId = req.auth.userId;
      const restaurantId =
        await kitchenService.getRestaurantIdForUser(clerkUserId);
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
        return res
          .status(400)
          .json({ success: false, error: "token y platform son requeridos" });
      }

      const restaurantId =
        await kitchenService.getRestaurantIdForUser(clerkUserId);
      await kitchenService.saveFcmToken(restaurantId, token, platform);
      res.json({ success: true });
    } catch (error) {
      console.error("[KITCHEN] saveFcmToken error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * DELETE /api/kitchen/fcm-token
   * Elimina el token FCM del dispositivo al cerrar sesión
   */
  async deleteFcmToken(req, res) {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ success: false, error: "token requerido" });
      }
      await kitchenService.deleteFcmToken(token);
      res.json({ success: true });
    } catch (error) {
      console.error("[KITCHEN] deleteFcmToken error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/kitchen/branches
   * Retorna las sucursales activas del restaurante del usuario
   */
  async getBranches(req, res) {
    try {
      const clerkUserId = req.auth.userId;
      const restaurantId =
        await kitchenService.getRestaurantIdForUser(clerkUserId);

      const { data, error } = await supabase
        .from("branches")
        .select("id, name, branch_number")
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .eq("deleted", false)
        .order("branch_number", { ascending: true });

      if (error) throw error;

      res.json({ success: true, branches: data });
    } catch (error) {
      console.error("[KITCHEN] getBranches error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/kitchen/printers/sync
   * Upsert de impresoras encontradas en un scan local (desde xquisito-crew)
   * Body: { branchId, printers: [{ip, port}] | [{usb_device_name, connection_type: 'usb'}] }
   */
  async syncPrinters(req, res) {
    try {
      const clerkUserId = req.auth.userId;
      const { branchId, printers = [] } = req.body;

      if (!branchId) {
        return res
          .status(400)
          .json({ success: false, error: "branchId requerido" });
      }

      // Verificar que el branchId pertenece al restaurante del usuario
      const restaurantId =
        await kitchenService.getRestaurantIdForUser(clerkUserId);
      const { data: branch, error: branchError } = await supabase
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("restaurant_id", restaurantId)
        .single();

      if (branchError || !branch) {
        return res
          .status(403)
          .json({ success: false, error: "Sucursal no autorizada" });
      }

      if (printers.length > 0) {
        const wifiPrinters = printers.filter((p) => p.connection_type !== "usb");
        const usbPrinters = printers.filter((p) => p.connection_type === "usb");

        if (wifiPrinters.length > 0) {
          const rows = wifiPrinters.map(({ ip, port }) => ({
            branch_id: branchId,
            ip,
            port,
            connection_type: "wifi",
            last_seen_at: new Date().toISOString(),
          }));
          const { error: upsertError } = await supabase
            .from("branch_printers")
            .upsert(rows, { onConflict: "branch_id,ip", ignoreDuplicates: false });
          if (upsertError) throw upsertError;
        }

        if (usbPrinters.length > 0) {
          const rows = usbPrinters.map(({ usb_device_name, vendor_id, product_id }) => ({
            branch_id: branchId,
            ip: null,
            port: null,
            connection_type: "usb",
            usb_device_name,
            last_seen_at: new Date().toISOString(),
          }));
          const { error: upsertError } = await supabase
            .from("branch_printers")
            .upsert(rows, { onConflict: "branch_id,usb_device_name", ignoreDuplicates: false });
          if (upsertError) throw upsertError;
        }
      }

      const { data, error } = await supabase
        .from("branch_printers")
        .select("*")
        .eq("branch_id", branchId)
        .order("created_at");

      if (error) throw error;

      res.json({ success: true, printers: data });
    } catch (error) {
      console.error("[KITCHEN] syncPrinters error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * PUT /api/kitchen/printers/:printerId
   * Actualiza nombre/rol de una impresora (desde xquisito-crew)
   */
  async updatePrinter(req, res) {
    try {
      const clerkUserId = req.auth.userId;
      const { printerId } = req.params;
      const { name, role, is_active } = req.body;

      // Verificar que la impresora pertenece al restaurante del usuario
      const restaurantId =
        await kitchenService.getRestaurantIdForUser(clerkUserId);
      const { data: existing, error: fetchError } = await supabase
        .from("branch_printers")
        .select("id, branches!inner(restaurant_id)")
        .eq("id", printerId)
        .single();

      if (fetchError || !existing) {
        return res
          .status(404)
          .json({ success: false, error: "Impresora no encontrada" });
      }

      if (existing.branches.restaurant_id !== restaurantId) {
        return res.status(403).json({ success: false, error: "No autorizado" });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data, error } = await supabase
        .from("branch_printers")
        .update(updates)
        .eq("id", printerId)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, printer: data });
    } catch (error) {
      console.error("[KITCHEN] updatePrinter error:", error.message);
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
