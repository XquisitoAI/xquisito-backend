const tableService = require("../services/tableServiceNew");

class TableController {
  // Obtener resumen de cuenta de mesa
  async getTableSummary(req, res) {
    try {
      const { tableNumber } = req.params;
      const summary = await tableService.getTableSummary(parseInt(tableNumber));

      if (!summary) {
        return res.status(404).json({
          success: false,
          message: `No hay cuenta activa para la mesa ${tableNumber}`,
        });
      }

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("Error getting table summary:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener todas las órdenes de una mesa
  async getTableOrders(req, res) {
    try {
      const { tableNumber } = req.params;
      const orders = await tableService.getTableOrders(parseInt(tableNumber));

      res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error("Error getting table orders:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Crear nueva orden de platillo
  async createDishOrder(req, res) {
    try {
      const { tableNumber } = req.params;
      const {
        userId,
        guestName,
        item,
        quantity = 1,
        price,
        guestId,
        images = [],
        customFields = null,
        extraPrice = 0,
        restaurantId = null,
      } = req.body;

      // Validar campos requeridos
      if (!item || !price) {
        return res.status(400).json({
          success: false,
          message: "Item y precio son requeridos",
        });
      }

      if (!userId && !guestName) {
        return res.status(400).json({
          success: false,
          message: "Se requiere userId o guestName",
        });
      }

      const result = await tableService.createDishOrder(
        parseInt(tableNumber),
        userId,
        guestName,
        item,
        quantity,
        parseFloat(price),
        guestId,
        images,
        customFields,
        parseFloat(extraPrice),
        restaurantId ? parseInt(restaurantId) : null
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error creating dish order:", error);
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
      const { paymentMethodId } = req.body;

      const success = await tableService.payDishOrder(
        dishId,
        paymentMethodId || null
      );

      if (success) {
        res.json({
          success: true,
          message: "Platillo pagado exitosamente",
        });
      } else {
        res.status(400).json({
          success: false,
          message: "No se pudo procesar el pago",
        });
      }
    } catch (error) {
      console.error("Error paying dish order:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Pagar monto específico a la mesa
  async payTableAmount(req, res) {
    try {
      const { tableNumber } = req.params;
      const { amount, userId, guestName, paymentMethodId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "El monto debe ser mayor a 0",
        });
      }

      const success = await tableService.payTableAmount(
        parseInt(tableNumber),
        parseFloat(amount),
        userId || null,
        guestName || null,
        paymentMethodId || null
      );

      if (success) {
        res.json({
          success: true,
          message: `Pago de $${amount} aplicado a la mesa ${tableNumber}`,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "No se pudo procesar el pago",
        });
      }
    } catch (error) {
      console.error("Error paying table amount:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Actualizar estado de platillo (cocina)
  async updateDishStatus(req, res) {
    try {
      const { dishId } = req.params;
      const { status } = req.body;

      if (!["pending", "cooking", "delivered"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Estado inválido. Debe ser: pending, cooking, o delivered",
        });
      }

      const success = await tableService.updateDishStatus(dishId, status);

      if (success) {
        res.json({
          success: true,
          message: `Estado actualizado a: ${status}`,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "No se pudo actualizar el estado",
        });
      }
    } catch (error) {
      console.error("Error updating dish status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener todas las mesas con su estado
  async getAllTables(req, res) {
    try {
      const tables = await tableService.getAllTables();

      res.json({
        success: true,
        data: tables,
      });
    } catch (error) {
      console.error("Error getting all tables:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Verificar disponibilidad de mesa
  async checkTableAvailability(req, res) {
    try {
      const { tableNumber } = req.params;
      const table = await tableService.checkTableAvailability(
        parseInt(tableNumber)
      );

      if (!table) {
        return res.status(404).json({
          success: false,
          message: `Mesa ${tableNumber} no existe`,
        });
      }

      res.json({
        success: true,
        data: {
          table_number: parseInt(tableNumber),
          status: table.status,
          available: table.status === "available",
        },
      });
    } catch (error) {
      console.error("Error checking table availability:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ===============================================
  // MÉTODOS PARA DIVISIÓN DE CUENTA (SPLIT BILL)
  // ===============================================

  // Inicializar división de cuenta
  async initializeSplitBill(req, res) {
    try {
      const { tableNumber } = req.params;
      const { numberOfPeople, userIds, guestNames } = req.body;

      if (!numberOfPeople || numberOfPeople <= 0) {
        return res.status(400).json({
          success: false,
          message: "Número de personas debe ser mayor a 0",
        });
      }

      const result = await tableService.initializeSplitBill(
        parseInt(tableNumber),
        numberOfPeople,
        userIds,
        guestNames
      );

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

  // Pagar parte individual de la cuenta dividida
  async paySplitAmount(req, res) {
    try {
      const { tableNumber } = req.params;
      const { userId, guestName, paymentMethodId } = req.body;

      if (!userId && !guestName) {
        return res.status(400).json({
          success: false,
          message: "Se requiere userId o guestName",
        });
      }

      const success = await tableService.paySplitAmount(
        parseInt(tableNumber),
        userId,
        guestName,
        paymentMethodId || null
      );

      if (success) {
        res.json({
          success: true,
          message: "Pago individual procesado exitosamente",
        });
      } else {
        res.status(400).json({
          success: false,
          message: "No se pudo procesar el pago individual",
        });
      }
    } catch (error) {
      console.error("Error paying split amount:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener estado de pagos divididos
  async getSplitPaymentStatus(req, res) {
    try {
      const { tableNumber } = req.params;
      const splitStatus = await tableService.getSplitPaymentStatus(
        parseInt(tableNumber)
      );

      const summary = {
        total_people: splitStatus.length,
        paid_people: splitStatus.filter((p) => p.status === "paid").length,
        pending_people: splitStatus.filter((p) => p.status === "pending")
          .length,
        total_collected: splitStatus.reduce(
          (sum, p) => sum + parseFloat(p.amount_paid || 0),
          0
        ),
        total_remaining: splitStatus.reduce(
          (sum, p) => sum + parseFloat(p.remaining || 0),
          0
        ),
      };

      res.json({
        success: true,
        data: {
          table_number: parseInt(tableNumber),
          split_payments: splitStatus,
          summary,
        },
      });
    } catch (error) {
      console.error("Error getting split payment status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener usuarios activos en la mesa
  async getActiveUsers(req, res) {
    try {
      const { tableNumber } = req.params;
      const activeUsers = await tableService.getActiveUsers(
        parseInt(tableNumber)
      );

      res.json({
        success: true,
        data: activeUsers,
      });
    } catch (error) {
      console.error("Error getting active users:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Vincular órdenes de invitado con userId
  async linkGuestOrdersToUser(req, res) {
    try {
      const { guestId, userId, tableNumber } = req.body;

      if (!guestId || !userId) {
        return res.status(400).json({
          success: false,
          message: "guestId y userId son requeridos",
        });
      }

      const result = await tableService.linkGuestOrdersToUser(
        guestId,
        userId,
        tableNumber ? parseInt(tableNumber) : null
      );

      res.json({
        success: true,
        message: "Órdenes vinculadas exitosamente",
        data: result,
      });
    } catch (error) {
      console.error("Error linking guest orders to user:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new TableController();
