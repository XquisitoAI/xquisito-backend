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
}

module.exports = new SocketEmitter();
