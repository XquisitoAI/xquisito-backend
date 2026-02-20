const { getIO, isSocketInitialized } = require("../socket/socketServer");

// Servicio para emitir eventos de Socket.IO desde cualquier parte del backend
class SocketEmitter {
  // Emite un evento a la sala de un restaurante específico
  emitToRestaurant(restaurantId, event, data) {
    if (!isSocketInitialized()) {
      console.log("⚠️ Socket.IO not initialized, skipping emit");
      return false;
    }

    try {
      const io = getIO();
      io.to(`restaurant:${restaurantId}`).emit(event, data);
      console.log(`📡 Emitted ${event} to restaurant:${restaurantId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error emitting ${event}:`, error);
      return false;
    }
  }

  // Emite actualización de métricas del dashboard
  emitMetricsUpdate(restaurantId, metrics) {
    return this.emitToRestaurant(restaurantId, "dashboard:metrics-update", {
      metrics,
      timestamp: new Date().toISOString(),
    });
  }

  // Emite nueva transacción
  emitNewTransaction(restaurantId, transaction) {
    return this.emitToRestaurant(restaurantId, "dashboard:new-transaction", {
      transaction,
      timestamp: new Date().toISOString(),
    });
  }

  // Emite actualización de orden (creada, actualizada o cerrada)
  emitOrderUpdate(restaurantId, order, action) {
    return this.emitToRestaurant(restaurantId, "dashboard:order-update", {
      order,
      action, // 'created' | 'updated' | 'closed'
      timestamp: new Date().toISOString(),
    });
  }

  // Emite actualización del gráfico
  emitChartUpdate(restaurantId, dataPoint, granularity) {
    return this.emitToRestaurant(restaurantId, "dashboard:chart-update", {
      dataPoint,
      granularity,
      timestamp: new Date().toISOString(),
    });
  }

  // Emite notificación genérica
  emitNotification(restaurantId, notification) {
    return this.emitToRestaurant(restaurantId, "dashboard:notification", {
      notification,
      timestamp: new Date().toISOString(),
    });
  }

  // Emite evento de recarga completa (útil para forzar refresh)
  emitFullRefresh(restaurantId) {
    return this.emitToRestaurant(restaurantId, "dashboard:full-refresh", {
      timestamp: new Date().toISOString(),
    });
  }

  // ==================== FLEXBILL TABLE EVENTS ====================

  // Emite un evento a la sala de una mesa específica
  emitToTable(restaurantId, branchNumber, tableNumber, event, data) {
    if (!isSocketInitialized()) {
      console.log("⚠️ Socket.IO not initialized, skipping emit");
      return false;
    }

    try {
      const io = getIO();
      const roomName = `table:${restaurantId}:${branchNumber || "main"}:${tableNumber}`;
      io.to(roomName).emit(event, data);
      console.log(`📡 Emitted ${event} to ${roomName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error emitting ${event}:`, error);
      return false;
    }
  }

  // Emite cuando se crea un nuevo platillo en la mesa
  emitDishCreated(restaurantId, branchNumber, tableNumber, dish) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:dish-created",
      {
        dish,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando cambia el estado de un platillo (pending → preparing → ready)
  emitDishStatusChanged(
    restaurantId,
    branchNumber,
    tableNumber,
    dishId,
    status,
  ) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:dish-status",
      {
        dishId,
        status,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando se paga un platillo
  emitDishPaid(restaurantId, branchNumber, tableNumber, dishId, paidBy) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:dish-paid",
      {
        dishId,
        paidBy,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite actualización del resumen de la mesa (totales)
  emitTableSummaryUpdate(restaurantId, branchNumber, tableNumber, summary) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:summary-update",
      {
        summary,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando un usuario se une a la mesa
  emitTableUserJoined(restaurantId, branchNumber, tableNumber, user) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:user-joined",
      {
        user,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando un usuario abandona la mesa
  emitTableUserLeft(restaurantId, branchNumber, tableNumber, userId) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:user-left",
      {
        userId,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite actualización del split bill
  emitSplitBillUpdate(restaurantId, branchNumber, tableNumber, splitPayments) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:split-update",
      {
        splitPayments,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite recarga completa de datos de la mesa
  emitTableFullRefresh(restaurantId, branchNumber, tableNumber) {
    return this.emitToTable(
      restaurantId,
      branchNumber,
      tableNumber,
      "table:full-refresh",
      {
        timestamp: new Date().toISOString(),
      },
    );
  }

  // ==================== TAP & PAY EVENTS ====================

  // Emite un evento a la sala de tap-pay de una mesa específica
  emitToTapPay(restaurantId, branchNumber, tableNumber, event, data) {
    if (!isSocketInitialized()) {
      console.log("⚠️ Socket.IO not initialized, skipping emit");
      return false;
    }

    try {
      const io = getIO();
      const roomName = `tappay:${restaurantId}:${branchNumber || 1}:${tableNumber}`;
      io.to(roomName).emit(event, data);
      console.log(`📡 Emitted ${event} to ${roomName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error emitting ${event}:`, error);
      return false;
    }
  }

  // Emite cuando se crea una nueva orden tap-pay
  emitTapPayOrderCreated(restaurantId, branchNumber, tableNumber, order) {
    return this.emitToTapPay(
      restaurantId,
      branchNumber,
      tableNumber,
      "tappay:order-created",
      {
        order,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando se recibe un pago en tap-pay
  emitTapPayPaymentReceived(
    restaurantId,
    branchNumber,
    tableNumber,
    paymentInfo,
  ) {
    return this.emitToTapPay(
      restaurantId,
      branchNumber,
      tableNumber,
      "tappay:payment-received",
      {
        payment: paymentInfo,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando cambia el estado de la orden tap-pay
  emitTapPayOrderStatusChanged(
    restaurantId,
    branchNumber,
    tableNumber,
    orderId,
    status,
  ) {
    return this.emitToTapPay(
      restaurantId,
      branchNumber,
      tableNumber,
      "tappay:order-status-changed",
      {
        orderId,
        status,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando cambia el estado de un platillo en tap-pay
  emitTapPayDishStatusChanged(
    restaurantId,
    branchNumber,
    tableNumber,
    dishId,
    status,
  ) {
    return this.emitToTapPay(
      restaurantId,
      branchNumber,
      tableNumber,
      "tappay:dish-status-changed",
      {
        dishId,
        status,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite cuando se completa una orden tap-pay
  emitTapPayOrderCompleted(restaurantId, branchNumber, tableNumber, order) {
    return this.emitToTapPay(
      restaurantId,
      branchNumber,
      tableNumber,
      "tappay:order-completed",
      {
        order,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Emite recarga completa de datos tap-pay
  emitTapPayFullRefresh(restaurantId, branchNumber, tableNumber) {
    return this.emitToTapPay(
      restaurantId,
      branchNumber,
      tableNumber,
      "tappay:full-refresh",
      {
        timestamp: new Date().toISOString(),
      },
    );
  }
}

module.exports = new SocketEmitter();
