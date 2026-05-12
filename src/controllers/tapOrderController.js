const tapOrderService = require("../services/tapOrderService");
const {
  emitPrintJobForTapOrder,
} = require("../services/printJobService");

class TapOrderController {
  // POST /api/tap-orders - Crear nueva orden de tap
  async createTapOrder(req, res) {
    try {
      const { table_id, customer_name, customer_phone } = req.body;

      // Validaciones básicas
      if (!table_id) {
        return res.status(400).json({
          success: false,
          message: "Table ID is required",
        });
      }

      // Obtener clerk_user_id del middleware de autenticación si existe
      const clerk_user_id = req.user?.id || null;

      const orderData = {
        table_id,
        clerk_user_id,
        customer_name,
        customer_phone,
      };

      const result = await tapOrderService.createTapOrder(orderData);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: "Tap order created successfully",
      });
    } catch (error) {
      console.error("Error creating tap order:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // GET /api/tap-orders/restaurant/:restaurantId/table/:tableNumber - Obtener orden existente (NO crear)
  async getOrderByTable(req, res) {
    try {
      const { restaurantId, branchNumber, tableNumber } = req.params;

      if (!restaurantId || !branchNumber || !tableNumber) {
        return res.status(400).json({
          success: false,
          message:
            "Restaurant ID, branch number, and table number are required",
        });
      }

      const result = await tapOrderService.getTapOrderByTable(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
      );

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        hasOrder: result.hasOrder,
        message: result.hasOrder
          ? "Active order found"
          : "No active order for this table",
      });
    } catch (error) {
      console.error("Error getting tap order by table:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // GET /api/tap-orders/:id - Obtener orden por ID
  async getTapOrderById(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Order ID is required",
        });
      }

      const result = await tapOrderService.getTapOrderById(id);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: "Tap order not found",
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      console.error("Error getting tap order by ID:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // PATCH /api/tap-orders/:id/customer - Actualizar información del cliente
  async updateCustomerInfo(req, res) {
    try {
      const { id } = req.params;
      const { customer_name, customer_phone } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Order ID is required",
        });
      }

      // Obtener clerk_user_id del middleware si el usuario se registra
      const clerk_user_id = req.user?.id || null;

      const customerData = {
        customer_name,
        customer_phone,
        clerk_user_id,
      };

      const result = await tapOrderService.updateCustomerInfo(id, customerData);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: "Customer information updated successfully",
      });
    } catch (error) {
      console.error("Error updating customer info:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // PATCH /api/tap-orders/:id/status - Actualizar estado de la orden
  async updateOrderStatus(req, res) {
    console.log(req.params);

    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!id || !status) {
        return res.status(400).json({
          success: false,
          message: "Order ID and status are required",
        });
      }

      const result = await tapOrderService.updateOrderStatus(id, status);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: "Order status updated successfully",
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // PATCH /api/tap-orders/:id/payment-status - Actualizar estado de pago
  async updatePaymentStatus(req, res) {
    try {
      const { id } = req.params;
      const { payment_status } = req.body;

      if (!id || !payment_status) {
        return res.status(400).json({
          success: false,
          message: "Order ID and payment status are required",
        });
      }

      const result = await tapOrderService.updatePaymentStatus(
        id,
        payment_status,
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: "Payment status updated successfully",
      });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // POST /api/tap-orders/:id/calculate-total - Recalcular total de la orden
  async calculateTotal(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Order ID is required",
        });
      }

      const result = await tapOrderService.updateTotal(id);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        total: result.total,
        message: "Total calculated successfully",
      });
    } catch (error) {
      console.error("Error calculating total:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // GET /api/tap-orders/table/:tableId/history - Obtener historial de una mesa
  async getTableOrderHistory(req, res) {
    try {
      const { tableId } = req.params;
      const { limit = 10 } = req.query;

      if (!tableId) {
        return res.status(400).json({
          success: false,
          message: "Table ID is required",
        });
      }

      const result = await tapOrderService.getTableOrderHistory(
        tableId,
        parseInt(limit),
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      console.error("Error getting table history:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // GET /api/tap-orders/active/user/:clerkUserId - Obtener orden activa por clerk_user_id
  async getActiveOrderByUser(req, res) {
    try {
      const { clientId, restaurantId } = req.params;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "Clerk user ID is required",
        });
      }

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          message: "Restaurant ID is required",
        });
      }

      const result = await tapOrderService.getActiveOrderByClientId(
        clientId,
        parseInt(restaurantId),
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        hasActiveOrder: result.hasActiveOrder,
        data: result.data,
      });
    } catch (error) {
      console.error("Error getting active order by user:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // GET /api/tap-orders/restaurant/:restaurantId/user/:clientId/last - Última orden del usuario
  async getLastOrderByUser(req, res) {
    try {
      const { clientId, restaurantId } = req.params;

      if (!clientId || !restaurantId) {
        return res.status(400).json({
          success: false,
          message: "clientId and restaurantId are required",
        });
      }

      const result = await tapOrderService.getLastOrderByUser(
        clientId,
        parseInt(restaurantId),
      );

      if (!result.success) {
        return res.status(400).json({ success: false, message: result.error });
      }

      res.status(200).json({
        success: true,
        hasLastOrder: result.hasLastOrder,
        data: result.data,
      });
    } catch (error) {
      console.error("Error getting last order by user:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  // POST /api/tap-orders/confirm - Crear orden, dish orders y transacción en una sola llamada
  async confirmOrder(req, res) {
    try {
      const {
        clerk_user_id,
        guest_id,
        customer_name,
        customer_email,
        customer_phone,
        restaurant_id,
        branch_number,
        table_number,
        order_notes,
        items,
        payment_method_id,
        base_amount,
        tip_amount,
        total_amount_charged,
        currency,
        payment_source,
        ecartpay_order_id,
        transaction_by,
        is_guest,
        user_id,
        installments,
      } = req.body;

      if (!customer_name) {
        return res.status(400).json({ success: false, error: "customer_name is required" });
      }
      if (!restaurant_id) {
        return res.status(400).json({ success: false, error: "restaurant_id is required" });
      }
      if (!branch_number) {
        return res.status(400).json({ success: false, error: "branch_number is required" });
      }
      if (!table_number) {
        return res.status(400).json({ success: false, error: "table_number is required" });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: "items array is required" });
      }
      if (!base_amount || Number(base_amount) <= 0) {
        return res.status(400).json({ success: false, error: "base_amount must be > 0" });
      }
      if (!total_amount_charged || Number(total_amount_charged) <= 0) {
        return res.status(400).json({ success: false, error: "total_amount_charged must be > 0" });
      }

      const result = await tapOrderService.confirmOrder({
        clerk_user_id,
        guest_id,
        customer_name,
        customer_email,
        customer_phone,
        restaurant_id: parseInt(restaurant_id),
        branch_number: parseInt(branch_number),
        table_number: parseInt(table_number),
        order_notes,
        items,
        payment_method_id,
        base_amount,
        tip_amount,
        total_amount_charged,
        currency,
        payment_source: payment_source || null,
        ecartpay_order_id: ecartpay_order_id || null,
        transaction_by,
        is_guest,
        user_id,
        installments,
      });

      if (!result.success) {
        return res.status(500).json(result);
      }

      // Emitir print job para cocina (fire-and-forget)
      const orderId = result.data.order.id;
      emitPrintJobForTapOrder(
        orderId,
        items.map((item) => ({
          name: item.item,
          quantity: item.quantity || 1,
          menu_item_id: item.menu_item_id || null,
          custom_fields: item.custom_fields || null,
          special_instructions: item.special_instructions || null,
        })),
      );

      res.status(201).json(result);
    } catch (error) {
      console.error("💥 Error in confirmOrder controller:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  // DELETE /api/tap-orders/:id - Abandonar orden
  async abandonOrder(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Order ID is required",
        });
      }

      const result = await tapOrderService.abandonOrder(id);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: "Order abandoned successfully",
      });
    } catch (error) {
      console.error("Error abandoning order:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new TapOrderController();
