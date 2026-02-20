const tapPayService = require("../services/tapPayService");
const socketEmitter = require("../services/socketEmitter");

class TapPayController {
  // Health check
  async healthCheck(req, res) {
    try {
      res.json({
        success: true,
        message: "Tap & Pay API is running",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener orden activa por mesa
  async getActiveOrderByTable(req, res) {
    try {
      const { restaurantId, branchNumber, tableNumber } = req.params;

      const order = await tapPayService.getActiveOrderByTable(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
      );

      // Si no hay orden, retornamos success con data null
      // Esto no es un error, simplemente no hay orden abierta para esta mesa
      res.json({
        success: true,
        data: order || null,
      });
    } catch (error) {
      console.error("Error getting active order:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener orden por ID
  async getOrderById(req, res) {
    try {
      const { orderId } = req.params;

      const order = await tapPayService.getOrderById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Orden no encontrada",
        });
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error("Error getting order by ID:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener items de una orden
  async getOrderItems(req, res) {
    try {
      const { orderId } = req.params;

      const items = await tapPayService.getOrderItems(orderId);

      res.json({
        success: true,
        data: items,
      });
    } catch (error) {
      console.error("Error getting order items:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Crear nueva orden (usado por POS)
  async createOrder(req, res) {
    try {
      const {
        restaurantId,
        branchNumber,
        tableNumber,
        customerName,
        customerPhone,
        customerEmail,
        userId,
        guestId,
        items, // Array de platillos
      } = req.body;

      // Validaciones
      if (!restaurantId || !branchNumber || !tableNumber || !customerName) {
        return res.status(400).json({
          success: false,
          message:
            "restaurantId, branchNumber, tableNumber y customerName son requeridos",
        });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se requiere al menos un item",
        });
      }

      const order = await tapPayService.createOrder({
        restaurantId: parseInt(restaurantId),
        branchNumber: parseInt(branchNumber),
        tableNumber: parseInt(tableNumber),
        customerName,
        customerPhone,
        customerEmail,
        userId,
        guestId,
        items,
      });

      // Emitir evento de socket para orden creada
      socketEmitter.emitTapPayOrderCreated(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
        order,
      );

      res.status(201).json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Procesar pago completo
  async processPayment(req, res) {
    try {
      const { orderId } = req.params;
      const {
        paymentType, // 'full-bill', 'select-items', 'equal-shares', 'choose-amount'
        amount,
        tipAmount,
        paymentMethodId,
        selectedItems, // Array de dish_order IDs
        userId,
        guestName,
      } = req.body;

      // Validaciones
      if (!paymentType || !paymentMethodId) {
        return res.status(400).json({
          success: false,
          message: "paymentType y paymentMethodId son requeridos",
        });
      }

      const result = await tapPayService.processPayment({
        orderId,
        paymentType,
        amount: amount ? parseFloat(amount) : null,
        tipAmount: tipAmount ? parseFloat(tipAmount) : 0,
        paymentMethodId,
        selectedItems: selectedItems || [],
        userId,
        guestName,
      });

      // Obtener info de la orden para emitir evento
      const order = await tapPayService.getOrderById(orderId);
      if (order) {
        socketEmitter.emitTapPayPaymentReceived(
          order.restaurant_id,
          order.branch_number,
          order.table_number,
          { orderId, amount, tipAmount, paymentType, userId, guestName },
        );
        socketEmitter.emitTapPayFullRefresh(
          order.restaurant_id,
          order.branch_number,
          order.table_number,
        );
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Pagar un platillo individual
  async payDishOrder(req, res) {
    try {
      const { dishId } = req.params;
      const { paymentMethodId, userId, guestId, guestName } = req.body;

      const result = await tapPayService.payDishOrder({
        dishId,
        paymentMethodId: paymentMethodId || null,
        userId: userId || null,
        guestId: guestId || null,
        guestName: guestName || null,
      });

      res.json({
        success: true,
        message: "Platillo pagado exitosamente",
        data: result,
      });
    } catch (error) {
      console.error("Error paying dish order:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Pagar monto específico de la orden
  async payOrderAmount(req, res) {
    try {
      const { orderId } = req.params;
      const { amount, userId, guestId, guestName } = req.body;

      // NOTA: paymentMethodId ya NO es requerido
      // Los endpoints de pago solo registran que se pagó (actualizan paid_amount)
      // El cargo real se hace por separado con EcartPay cuando hay tarjeta real
      if (!amount) {
        return res.status(400).json({
          success: false,
          message: "amount es requerido",
        });
      }

      const result = await tapPayService.payOrderAmount({
        orderId,
        amount: parseFloat(amount),
        paymentMethodId: null, // Siempre null - no se usa en este endpoint
        userId,
        guestId,
        guestName,
      });

      // Obtener info de la orden para emitir evento
      const order = await tapPayService.getOrderById(orderId);
      if (order) {
        socketEmitter.emitTapPayPaymentReceived(
          order.restaurant_id,
          order.branch_number,
          order.table_number,
          { orderId, amount: parseFloat(amount), userId, guestId, guestName },
        );
        socketEmitter.emitTapPayFullRefresh(
          order.restaurant_id,
          order.branch_number,
          order.table_number,
        );
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error paying order amount:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Inicializar división de cuenta
  async initializeSplitBill(req, res) {
    try {
      const { orderId } = req.params;
      const { numberOfPeople, userIds, guestNames } = req.body;

      if (!numberOfPeople || numberOfPeople < 2) {
        return res.status(400).json({
          success: false,
          message: "numberOfPeople debe ser al menos 2",
        });
      }

      const result = await tapPayService.initializeSplitBill({
        orderId,
        numberOfPeople: parseInt(numberOfPeople),
        userIds: userIds || [],
        guestNames: guestNames || [],
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error initializing split bill:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Pagar parte de división
  async paySplitAmount(req, res) {
    try {
      const { orderId } = req.params;
      const { userId, guestId, guestName, paymentMethodId } = req.body;

      // NOTA: paymentMethodId ya NO es requerido (igual que payOrderAmount)
      // if (!paymentMethodId) {
      //   return res.status(400).json({
      //     success: false,
      //     message: "paymentMethodId es requerido",
      //   });
      // }

      if (!userId && !guestId && !guestName) {
        return res.status(400).json({
          success: false,
          message: "Se requiere userId, guestId o guestName",
        });
      }

      const result = await tapPayService.paySplitAmount({
        orderId,
        userId,
        guestId,
        guestName,
        paymentMethodId: null, // Siempre null - no se usa en este endpoint
      });

      // Obtener info de la orden para emitir evento
      const order = await tapPayService.getOrderById(orderId);
      if (order) {
        socketEmitter.emitTapPayPaymentReceived(
          order.restaurant_id,
          order.branch_number,
          order.table_number,
          { orderId, paymentType: "split", userId, guestId, guestName },
        );
        socketEmitter.emitTapPayFullRefresh(
          order.restaurant_id,
          order.branch_number,
          order.table_number,
        );
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error paying split amount:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener estado de división
  async getSplitPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;

      const status = await tapPayService.getSplitPaymentStatus(orderId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error("Error getting split payment status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener usuarios activos
  async getActiveUsers(req, res) {
    try {
      const { orderId } = req.params;

      const users = await tapPayService.getActiveUsers(orderId);

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      console.error("Error getting active users:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Agregar usuario activo
  async addActiveUser(req, res) {
    try {
      const { orderId } = req.params;
      const { userId, guestId, guestName } = req.body;

      if (!userId && !guestId && !guestName) {
        return res.status(400).json({
          success: false,
          message: "Se requiere userId, guestId o guestName",
        });
      }

      // addOrUpdateActiveUser ya valida si existe antes de insertar
      await tapPayService.addOrUpdateActiveUser(
        orderId,
        userId,
        guestId,
        guestName,
        0,
      );

      res.json({
        success: true,
        message: "Usuario agregado exitosamente",
      });
    } catch (error) {
      console.error("Error adding active user:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Actualizar estado de orden
  async updateOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { orderStatus } = req.body;

      if (!orderStatus) {
        return res.status(400).json({
          success: false,
          message: "orderStatus es requerido",
        });
      }

      const validStatuses = [
        "active",
        "confirmed",
        "preparing",
        "ready",
        "completed",
        "cancelled",
        "abandoned",
      ];
      if (!validStatuses.includes(orderStatus)) {
        return res.status(400).json({
          success: false,
          message: `orderStatus debe ser uno de: ${validStatuses.join(", ")}`,
        });
      }

      const result = await tapPayService.updateOrderStatus(
        orderId,
        orderStatus,
      );

      // Obtener info de la orden para emitir evento
      const order = await tapPayService.getOrderById(orderId);
      if (order) {
        socketEmitter.emitTapPayOrderStatusChanged(
          order.restaurant_id,
          order.branch_number,
          order.table_number,
          orderId,
          orderStatus,
        );

        // Si la orden se completó, emitir evento especial
        if (orderStatus === "completed") {
          socketEmitter.emitTapPayOrderCompleted(
            order.restaurant_id,
            order.branch_number,
            order.table_number,
            order,
          );
        }
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Actualizar estado de platillo
  async updateDishStatus(req, res) {
    try {
      const { dishId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "status es requerido",
        });
      }

      const validStatuses = ["pending", "cooking", "delivered"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `status debe ser uno de: ${validStatuses.join(", ")}`,
        });
      }

      const result = await tapPayService.updateDishStatus(dishId, status);

      // Obtener info de la orden a través del platillo para emitir evento
      if (result && result.tap_pay_order_id) {
        const order = await tapPayService.getOrderById(result.tap_pay_order_id);
        if (order) {
          socketEmitter.emitTapPayDishStatusChanged(
            order.restaurant_id,
            order.branch_number,
            order.table_number,
            dishId,
            status,
          );
        }
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error updating dish status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Dashboard metrics
  async getDashboardMetrics(req, res) {
    try {
      const {
        restaurant_id,
        branch_number,
        time_range = "daily",
        start_date,
        end_date,
      } = req.query;

      if (!restaurant_id) {
        return res.status(400).json({
          success: false,
          message: "restaurant_id es requerido",
        });
      }

      const metrics = await tapPayService.getDashboardMetrics({
        restaurantId: parseInt(restaurant_id),
        branchNumber: branch_number ? parseInt(branch_number) : null,
        timeRange: time_range,
        startDate: start_date,
        endDate: end_date,
      });

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      console.error("Error getting dashboard metrics:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new TapPayController();
