/**
 * Handlers de eventos de Socket.IO para mesas de FlexBill
 */
function registerTableHandlers(io, socket) {
  const { user } = socket;

  // Unirse a una sala de mesa específica
  socket.on("join:table", ({ restaurantId, branchNumber, tableNumber }) => {
    if (!restaurantId || !tableNumber) {
      socket.emit("table:error", {
        message: "restaurantId and tableNumber required",
      });
      return;
    }

    const roomName = `table:${restaurantId}:${branchNumber || "main"}:${tableNumber}`;
    socket.join(roomName);

    // Guardar info de la mesa en el socket para referencia
    socket.tableRoom = roomName;
    socket.tableInfo = { restaurantId, branchNumber, tableNumber };

    console.log(`🍽️ User ${user?.id || "guest"} joined table room ${roomName}`);

    // Notificar al usuario que se unió
    socket.emit("table:joined", {
      roomName,
      restaurantId,
      branchNumber,
      tableNumber,
    });

    // Notificar a otros en la mesa que alguien se unió
    socket.to(roomName).emit("table:user-joined", {
      userId: user?.id,
      guestId: user?.guestId,
      guestName: user?.guestName,
      tableNumber,
    });
  });

  // Abandonar sala de mesa
  socket.on("leave:table", ({ restaurantId, branchNumber, tableNumber }) => {
    const roomName = `table:${restaurantId}:${branchNumber || "main"}:${tableNumber}`;
    socket.leave(roomName);

    console.log(`🚪 User ${user?.id || "guest"} left table room ${roomName}`);

    socket.emit("table:left", { roomName });

    // Notificar a otros que alguien se fue
    socket.to(roomName).emit("table:user-left", {
      userId: user?.id,
      guestId: user?.guestId,
      tableNumber,
    });

    // Limpiar referencia
    socket.tableRoom = null;
    socket.tableInfo = null;
  });

  // Cuando el socket se desconecta, notificar a la mesa
  socket.on("disconnect", () => {
    if (socket.tableRoom) {
      socket.to(socket.tableRoom).emit("table:user-left", {
        userId: user?.id,
        guestId: user?.guestId,
        tableNumber: socket.tableInfo?.tableNumber,
      });
    }
  });
}

module.exports = { registerTableHandlers };
