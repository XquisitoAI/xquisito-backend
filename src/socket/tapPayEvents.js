/**
 * Handlers de eventos de Socket.IO para órdenes de Tap & Pay
 */
function registerTapPayHandlers(io, socket) {
  const { user } = socket;

  // Unirse a una sala de tap-pay específica
  socket.on("join:tappay", ({ restaurantId, branchNumber, tableNumber }) => {
    if (!restaurantId || !tableNumber) {
      socket.emit("tappay:error", {
        message: "restaurantId and tableNumber required",
      });
      return;
    }

    const roomName = `tappay:${restaurantId}:${branchNumber || 1}:${tableNumber}`;
    socket.join(roomName);

    // Guardar info en el socket para referencia
    socket.tapPayRoom = roomName;
    socket.tapPayInfo = { restaurantId, branchNumber, tableNumber };

    console.log(
      `💳 User ${user?.id || user?.guestId || "guest"} joined tap-pay room ${roomName}`,
    );

    // Notificar al usuario que se unió
    socket.emit("tappay:joined", {
      roomName,
      restaurantId,
      branchNumber,
      tableNumber,
    });
  });

  // Abandonar sala de tap-pay
  socket.on("leave:tappay", ({ restaurantId, branchNumber, tableNumber }) => {
    const roomName = `tappay:${restaurantId}:${branchNumber || 1}:${tableNumber}`;
    socket.leave(roomName);

    console.log(
      `🚪 User ${user?.id || user?.guestId || "guest"} left tap-pay room ${roomName}`,
    );

    socket.emit("tappay:left", { roomName });

    // Limpiar referencia
    socket.tapPayRoom = null;
    socket.tapPayInfo = null;
  });

  // Cuando el socket se desconecta, limpiar referencias
  socket.on("disconnect", () => {
    if (socket.tapPayRoom) {
      console.log(
        `💳 User disconnected from tap-pay room ${socket.tapPayRoom}`,
      );
    }
  });
}

module.exports = { registerTapPayHandlers };
