// Servicio para notificar eventos de pagos a través de WebSocket
class PaymentNotificationService {
  constructor(io) {
    this.io = io;
  }

  // Notificar a todos los usuarios conectados al dashboard sobre un nuevo pago
  notifyNewPayment(restaurantId) {
    console.log(
      `[Payment Notification] New payment for restaurant ${restaurantId}`,
    );

    // Emitir evento a la sala del restaurante específico
    this.io.to(`restaurant:${restaurantId}`).emit("payment:new", {
      restaurantId,
      timestamp: new Date().toISOString(),
    });

    // También notificar a la sala global de super-admin
    this.io.to("super-admin").emit("payment:new", {
      restaurantId,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[Payment Notification] Notification sent to restaurant:${restaurantId} and super-admin rooms`,
    );
  }
}

module.exports = PaymentNotificationService;
