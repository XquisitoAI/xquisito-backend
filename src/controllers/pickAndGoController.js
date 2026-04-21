const pickAndGoService = require("../services/pickAndGoService");
const socketEmitter = require("../services/socketEmitter");
const kitchenService = require("../services/kitchenService");
const {
  emitPrintJobForPickAndGoOrder,
} = require("../services/printJobService");
const whatsappService = require("../services/whatsappService");

/**
 * Controlador para gestionar endpoints de Pick & Go
 * Maneja todas las operaciones relacionadas con pedidos para llevar
 */
class PickAndGoController {
  /**
   * Crear nueva orden Pick & Go
   * POST /api/pick-and-go/orders
   */
  async createOrder(req, res) {
    try {
      const {
        clerk_user_id,
        user_id, // Mantener compatibilidad temporal
        customer_name,
        customer_phone,
        customer_email,
        restaurant_id,
        branch_number,
        session_data,
        prep_metadata,
      } = req.body;

      // Usar clerk_user_id si está disponible, sino user_id por compatibilidad
      const finalUserId = clerk_user_id !== undefined ? clerk_user_id : user_id;

      // Validaciones básicas
      if (finalUserId === undefined && finalUserId === null) {
        return res.status(400).json({
          success: false,
          error: "clerk_user_id is required",
        });
      }

      if (!customer_name && !customer_email) {
        return res.status(400).json({
          success: false,
          error: "customer_name or customer_email is required",
        });
      }

      if (!restaurant_id) {
        return res.status(400).json({
          success: false,
          error: "restaurant_id is required",
        });
      }

      if (!branch_number) {
        return res.status(400).json({
          success: false,
          error: "branch_number is required",
        });
      }

      // Extraer total_amount del session_data si está disponible
      const totalAmount = session_data?.total_amount || 0;

      const orderData = {
        clerk_user_id: finalUserId,
        customer_name,
        customer_phone,
        customer_email,
        restaurant_id: parseInt(restaurant_id),
        branch_number: parseInt(branch_number),
        total_amount: totalAmount,
        session_data: session_data || {},
        prep_metadata: prep_metadata || {},
      };

      const result = await pickAndGoService.createOrder(orderData);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error("💥 Error in createOrder controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Obtener orden por ID
   * GET /api/pick-and-go/orders/:orderId
   */
  async getOrder(req, res) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "orderId is required",
        });
      }

      const result = await pickAndGoService.getOrderById(orderId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in getOrder controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Obtener órdenes del usuario
   * GET /api/pick-and-go/user/:userId/orders
   */
  async getUserOrders(req, res) {
    try {
      const { userId } = req.params;
      const { order_status, payment_status, limit } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "userId is required",
        });
      }

      const filters = {
        order_status,
        payment_status,
        limit: limit ? parseInt(limit) : null,
      };

      const result = await pickAndGoService.getUserOrders(userId, filters);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in getUserOrders controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Agregar item a la orden
   * POST /api/pick-and-go/orders/:orderId/items
   */
  async addItemToOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { item, quantity, price, images, custom_fields, extra_price } =
        req.body;

      // Validaciones básicas
      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "orderId is required",
        });
      }

      if (!item || !price) {
        return res.status(400).json({
          success: false,
          error: "item and price are required",
        });
      }

      if (quantity && quantity < 1) {
        return res.status(400).json({
          success: false,
          error: "quantity must be at least 1",
        });
      }

      const itemData = {
        item,
        quantity: quantity || 1,
        price: parseFloat(price),
        images: images || [],
        custom_fields: custom_fields || {},
        extra_price: parseFloat(extra_price) || 0,
      };

      const result = await pickAndGoService.addItemToOrder(orderId, itemData);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error("💥 Error in addItemToOrder controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Actualizar estado de la orden
   * PUT /api/pick-and-go/orders/:orderId/status
   */
  async updateOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { order_status, prep_metadata } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "orderId is required",
        });
      }

      if (!order_status) {
        return res.status(400).json({
          success: false,
          error: "order_status is required",
        });
      }

      // Validar estados permitidos
      const validStatuses = [
        "active",
        "confirmed",
        "preparing",
        "completed",
        "abandoned",
      ];
      if (!validStatuses.includes(order_status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid order_status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      const additionalData = {};
      if (prep_metadata) {
        additionalData.prep_metadata = prep_metadata;
      }

      const result = await pickAndGoService.updateOrderStatus(
        orderId,
        order_status,
        additionalData,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in updateOrderStatus controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Actualizar estado de pago
   * PUT /api/pick-and-go/orders/:orderId/payment-status
   */
  async updatePaymentStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { payment_status } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "orderId is required",
        });
      }

      if (!payment_status) {
        return res.status(400).json({
          success: false,
          error: "payment_status is required",
        });
      }

      // Validar estados de pago permitidos
      const validPaymentStatuses = ["pending", "paid"];
      if (!validPaymentStatuses.includes(payment_status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid payment_status. Must be one of: ${validPaymentStatuses.join(", ")}`,
        });
      }

      const result = await pickAndGoService.updatePaymentStatus(
        orderId,
        payment_status,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in updatePaymentStatus controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Vincular orden a cliente (después de verificación de teléfono)
   * PUT /api/pick-and-go/orders/:orderId/link-customer
   */
  async linkOrderToCustomer(req, res) {
    try {
      const { orderId } = req.params;
      const { customer_phone, customer_id } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "orderId is required",
        });
      }

      if (!customer_phone) {
        return res.status(400).json({
          success: false,
          error: "customer_phone is required",
        });
      }

      const result = await pickAndGoService.linkOrderToCustomer(
        orderId,
        customer_phone,
        customer_id,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in linkOrderToCustomer controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Obtener órdenes del restaurante
   * GET /api/pick-and-go/restaurant/:restaurantId/orders
   */
  async getRestaurantOrders(req, res) {
    try {
      const { restaurantId } = req.params;
      const { order_status, branch_number, date_from, date_to } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: "restaurantId is required",
        });
      }

      const filters = {
        order_status,
        branch_number: branch_number ? parseInt(branch_number) : null,
        date_from,
        date_to,
      };

      const result = await pickAndGoService.getRestaurantOrders(
        parseInt(restaurantId),
        filters,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in getRestaurantOrders controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Obtener órdenes de una sucursal específica
   * GET /api/pick-and-go/restaurant/:restaurantId/branch/:branchNumber/orders
   */
  async getBranchOrders(req, res) {
    try {
      const { restaurantId, branchNumber } = req.params;
      const { order_status, date_from, date_to } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: "restaurantId is required",
        });
      }

      if (!branchNumber) {
        return res.status(400).json({
          success: false,
          error: "branchNumber is required",
        });
      }

      const filters = {
        order_status,
        date_from,
        date_to,
      };

      const result = await pickAndGoService.getBranchOrders(
        parseInt(restaurantId),
        parseInt(branchNumber),
        filters,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in getBranchOrders controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Calcular tiempo estimado de preparación
   * POST /api/pick-and-go/estimate-prep-time
   */
  async estimatePrepTime(req, res) {
    try {
      const { items, restaurant_id } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: "items array is required",
        });
      }

      if (items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "items array cannot be empty",
        });
      }

      const result = await pickAndGoService.calculateEstimatedPrepTime(
        items,
        restaurant_id,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in estimatePrepTime controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  /**
   * Crear dish order vinculado a una orden Pick & Go
   * POST /api/pick-and-go/orders/:orderId/dishes
   */
  async createDishOrder(req, res) {
    try {
      const { orderId } = req.params;
      const {
        item,
        quantity = 1,
        price,
        userId,
        guestId,
        guestName,
        images = [],
        customFields = null,
        extraPrice = 0,
        menuItemId = null,
      } = req.body;

      // Validaciones básicas
      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "orderId is required",
        });
      }

      if (!item || !price) {
        return res.status(400).json({
          success: false,
          error: "item and price are required",
        });
      }

      if (!userId && !guestName) {
        return res.status(400).json({
          success: false,
          error: "userId or guestName is required",
        });
      }

      const result = await pickAndGoService.createDishOrder(
        orderId,
        item,
        quantity,
        parseFloat(price),
        userId,
        guestId,
        guestName,
        images,
        customFields,
        parseFloat(extraPrice),
        menuItemId,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      emitPrintJobForPickAndGoOrder(orderId, [
        { name: item, quantity, menu_item_id: menuItemId, custom_fields: customFields ?? null },
      ]);

      res.status(201).json(result);
    } catch (error) {
      console.error("💥 Error in createDishOrder controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // GET /api/pick-and-go/restaurant/:restaurantId/active/user/:clientId - Obtener orden activa por clientId
  async getActiveOrderByUser(req, res) {
    try {
      const { clientId, restaurantId } = req.params;

      if (!clientId) {
        return res
          .status(400)
          .json({ success: false, message: "Client ID is required" });
      }

      if (!restaurantId) {
        return res
          .status(400)
          .json({ success: false, message: "Restaurant ID is required" });
      }

      const result = await pickAndGoService.getActiveOrderByClientId(
        clientId,
        parseInt(restaurantId),
      );

      if (!result.success) {
        return res.status(400).json({ success: false, message: result.error });
      }

      res.status(200).json({
        success: true,
        hasActiveOrder: result.hasActiveOrder,
        data: result.data,
        orders: result.orders,
      });
    } catch (error) {
      console.error("Error getting active order by user:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  /**
   * Actualizar estado de un dish order
   * PUT /api/pick-and-go/dishes/:dishId/status
   */
  async updateDishStatus(req, res) {
    try {
      const { dishId } = req.params;
      const { status } = req.body;

      if (!dishId) {
        return res.status(400).json({
          success: false,
          error: "dishId is required",
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          error: "status is required",
        });
      }

      // Validar estados permitidos
      const validStatuses = ["preparing", "ready", "delivered"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      const result = await pickAndGoService.updateDishStatus(dishId, status);

      if (!result.success) {
        return res.status(404).json(result);
      }

      // Notificar a todos los Crew del restaurante
      try {
        const restaurantId = await kitchenService.getRestaurantIdForUser(
          req.auth.userId,
        );
        socketEmitter.emitKitchenDishStatusChanged(
          restaurantId,
          dishId,
          status,
        );
      } catch (_) {}

      // Notificación WhatsApp al cliente cuando el platillo está listo
      if (status === "ready" && result.data?.pick_and_go_order_id) {
        whatsappService
          .notifyDishReady(result.data.pick_and_go_order_id, result.data.item)
          .catch(() => {});
      }

      res.json(result);
    } catch (error) {
      console.error("💥 Error in updateDishStatus controller:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}

module.exports = new PickAndGoController();
