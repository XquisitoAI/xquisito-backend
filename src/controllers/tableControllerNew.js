const tableService = require("../services/tableServiceNew");
const socketEmitter = require("../services/socketEmitter");

class TableController {
  // Obtener resumen de cuenta de mesa
  async getTableSummary(req, res) {
    try {
      const { restaurantId, branchNumber, tableNumber } = req.params;
      const summary = await tableService.getTableSummary(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
      );

      if (!summary) {
        return res.status(200).json({
          success: true,
          message: `No hay cuenta activa para la mesa ${tableNumber} del restaurante ${restaurantId}`,
          data: null,
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
      const { restaurantId, branchNumber, tableNumber } = req.params;
      const orders = await tableService.getTableOrders(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
      );

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
      const { restaurantId, branchNumber, tableNumber } = req.params;
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
        parseInt(restaurantId),
        parseInt(branchNumber),
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
      );

      // Emitir evento de socket para actualización en tiempo real
      socketEmitter.emitDishCreated(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
        result,
      );

      // Emitir evento al dashboard admin-portal para actualizar Actividad Reciente
      const summary = await tableService.getTableSummary(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
      );
      if (summary) {
        // Determinar si es una nueva orden o actualización
        const isNewOrder = summary.no_items === 1;
        socketEmitter.emitOrderUpdate(
          parseInt(restaurantId),
          {
            id: summary.table_order_id,
            serviceType: "flex-bill",
            orderIdentifier: `Mesa ${tableNumber}`,
            totalAmount: parseFloat(summary.total_amount || 0),
            paidAmount: parseFloat(summary.paid_amount || 0),
            remainingAmount: parseFloat(summary.remaining_amount || 0),
            noItems: summary.no_items || 0,
            orderStatus: summary.status,
            createdAt: summary.created_at,
          },
          isNewOrder ? "created" : "updated",
        );
      }

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
      const { paymentMethodId, restaurantId, branchNumber, tableNumber } =
        req.body;

      const success = await tableService.payDishOrder(
        dishId,
        paymentMethodId || null,
      );

      if (success) {
        // Emitir evento de socket si tenemos info de la mesa
        if (restaurantId && tableNumber) {
          socketEmitter.emitDishPaid(
            parseInt(restaurantId),
            parseInt(branchNumber) || 1,
            parseInt(tableNumber),
            dishId,
            req.body.userId || req.body.guestName || "unknown",
          );
          // También emitir actualización del summary
          socketEmitter.emitTableFullRefresh(
            parseInt(restaurantId),
            parseInt(branchNumber) || 1,
            parseInt(tableNumber),
          );

          // Emitir evento al dashboard admin-portal para actualizar Actividad Reciente
          const summary = await tableService.getTableSummary(
            parseInt(restaurantId),
            parseInt(branchNumber) || 1,
            parseInt(tableNumber),
          );
          if (summary) {
            socketEmitter.emitOrderUpdate(
              parseInt(restaurantId),
              {
                id: summary.table_order_id,
                serviceType: "flex-bill",
                orderIdentifier: `Mesa ${tableNumber}`,
                totalAmount: parseFloat(summary.total_amount || 0),
                paidAmount: parseFloat(summary.paid_amount || 0),
                remainingAmount: parseFloat(summary.remaining_amount || 0),
                noItems: summary.no_items || 0,
                orderStatus: summary.status,
                createdAt: summary.created_at,
              },
              "updated",
            );
          }
        }

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
      const { restaurantId, branchNumber, tableNumber } = req.params;
      const { amount, userId, guestName, paymentMethodId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "El monto debe ser mayor a 0",
        });
      }

      const success = await tableService.payTableAmount(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
        parseFloat(amount),
        userId || null,
        guestName || null,
        paymentMethodId || null,
      );

      if (success) {
        // Emitir actualización de la mesa en tiempo real
        socketEmitter.emitTableFullRefresh(
          parseInt(restaurantId),
          parseInt(branchNumber),
          parseInt(tableNumber),
        );

        // Emitir evento al dashboard admin-portal para actualizar Actividad Reciente
        const summary = await tableService.getTableSummary(
          parseInt(restaurantId),
          parseInt(branchNumber),
          parseInt(tableNumber),
        );
        if (summary) {
          socketEmitter.emitOrderUpdate(
            parseInt(restaurantId),
            {
              id: summary.table_order_id,
              serviceType: "flex-bill",
              orderIdentifier: `Mesa ${tableNumber}`,
              totalAmount: parseFloat(summary.total_amount || 0),
              paidAmount: parseFloat(summary.paid_amount || 0),
              remainingAmount: parseFloat(summary.remaining_amount || 0),
              noItems: summary.no_items || 0,
              orderStatus: summary.status,
              createdAt: summary.created_at,
            },
            "updated",
          );
        }

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
      const { status, restaurantId, branchNumber, tableNumber } = req.body;

      if (!["pending", "cooking", "delivered"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Estado inválido. Debe ser: pending, cooking, o delivered",
        });
      }

      const success = await tableService.updateDishStatus(dishId, status);

      if (success) {
        // Emitir evento de socket si tenemos info de la mesa
        if (restaurantId && tableNumber) {
          socketEmitter.emitDishStatusChanged(
            parseInt(restaurantId),
            parseInt(branchNumber) || 1,
            parseInt(tableNumber),
            dishId,
            status,
          );
        }

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
      const { restaurantId } = req.params;
      const tables = await tableService.getAllTables(parseInt(restaurantId));

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
      const { restaurantId, tableNumber } = req.params;
      const table = await tableService.checkTableAvailability(
        parseInt(restaurantId),
        parseInt(tableNumber),
      );

      if (!table) {
        return res.status(404).json({
          success: false,
          message: `Mesa ${tableNumber} no existe en el restaurante ${restaurantId}`,
        });
      }

      res.json({
        success: true,
        data: {
          restaurant_id: parseInt(restaurantId),
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
      const { restaurantId, branchNumber, tableNumber } = req.params;
      const { numberOfPeople, userIds, guestNames } = req.body;

      if (!numberOfPeople || numberOfPeople <= 0) {
        return res.status(400).json({
          success: false,
          message: "Número de personas debe ser mayor a 0",
        });
      }

      const result = await tableService.initializeSplitBill(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
        numberOfPeople,
        userIds,
        guestNames,
      );

      // Emitir actualización en tiempo real
      socketEmitter.emitTableFullRefresh(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
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
      const { restaurantId, branchNumber, tableNumber } = req.params;
      const { userId, guestName, paymentMethodId } = req.body;

      if (!userId && !guestName) {
        return res.status(400).json({
          success: false,
          message: "Se requiere userId o guestName",
        });
      }

      const success = await tableService.paySplitAmount(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
        userId,
        guestName,
        paymentMethodId || null,
      );

      if (success) {
        // Emitir actualización en tiempo real
        socketEmitter.emitTableFullRefresh(
          parseInt(restaurantId),
          parseInt(branchNumber),
          parseInt(tableNumber),
        );

        // Emitir evento al dashboard admin-portal para actualizar Actividad Reciente
        const summary = await tableService.getTableSummary(
          parseInt(restaurantId),
          parseInt(branchNumber),
          parseInt(tableNumber),
        );
        if (summary) {
          socketEmitter.emitOrderUpdate(
            parseInt(restaurantId),
            {
              id: summary.table_order_id,
              serviceType: "flex-bill",
              orderIdentifier: `Mesa ${tableNumber}`,
              totalAmount: parseFloat(summary.total_amount || 0),
              paidAmount: parseFloat(summary.paid_amount || 0),
              remainingAmount: parseFloat(summary.remaining_amount || 0),
              noItems: summary.no_items || 0,
              orderStatus: summary.status,
              createdAt: summary.created_at,
            },
            "updated",
          );
        }

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
      const { restaurantId, branchNumber, tableNumber } = req.params;
      const splitStatus = await tableService.getSplitPaymentStatus(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
      );

      const summary = {
        total_people: splitStatus.length,
        paid_people: splitStatus.filter((p) => p.status === "paid").length,
        pending_people: splitStatus.filter((p) => p.status === "pending")
          .length,
        total_collected: splitStatus.reduce(
          (sum, p) => sum + parseFloat(p.amount_paid || 0),
          0,
        ),
        total_remaining: splitStatus.reduce(
          (sum, p) => sum + parseFloat(p.remaining || 0),
          0,
        ),
      };

      res.json({
        success: true,
        data: {
          restaurant_id: parseInt(restaurantId),
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
      const { restaurantId, branchNumber, tableNumber } = req.params;
      const activeUsers = await tableService.getActiveUsers(
        parseInt(restaurantId),
        parseInt(branchNumber),
        parseInt(tableNumber),
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
      const { guestId, userId, tableNumber, restaurantId } = req.body;

      if (!guestId || !userId) {
        return res.status(400).json({
          success: false,
          message: "guestId y userId son requeridos",
        });
      }

      const result = await tableService.linkGuestOrdersToUser(
        guestId,
        userId,
        tableNumber ? parseInt(tableNumber) : null,
        restaurantId ? parseInt(restaurantId) : null,
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
