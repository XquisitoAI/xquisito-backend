// Registra los handlers de eventos del dashboard para un socket
function registerDashboardHandlers(io, socket) {
  const { user } = socket;

  // Emitir confirmación de conexión exitosa
  socket.emit("connection:authenticated", {
    userId: user.id,
    restaurantId: user.restaurantId,
    restaurantName: user.restaurantName,
  });

  // Unirse a la sala del restaurante
  socket.on("join:restaurant", ({ restaurantId }) => {
    // Verificar que el usuario pertenece a este restaurante
    if (user.restaurantId !== restaurantId) {
      console.log(
        `⚠️ Unauthorized room access: User ${user.id} tried to join restaurant ${restaurantId}`,
      );
      socket.emit("connection:error", {
        message: "Unauthorized access to restaurant",
      });
      return;
    }

    const roomName = `restaurant:${restaurantId}`;
    socket.join(roomName);
    console.log(`🏠 User ${user.id} joined room ${roomName}`);

    // Confirmar unión a la sala
    socket.emit("room:joined", { restaurantId, roomName });
  });

  // Abandonar la sala del restaurante
  socket.on("leave:restaurant", ({ restaurantId }) => {
    const roomName = `restaurant:${restaurantId}`;
    socket.leave(roomName);
    console.log(`🚪 User ${user.id} left room ${roomName}`);

    socket.emit("room:left", { restaurantId, roomName });
  });

  // Solicitar actualización manual de datos
  socket.on("request:refresh", async ({ restaurantId, dataType }) => {
    // Verificar permisos
    if (user.restaurantId !== restaurantId) {
      socket.emit("connection:error", {
        message: "Unauthorized refresh request",
      });
      return;
    }

    console.log(
      `🔄 Refresh requested by ${user.id} for restaurant ${restaurantId}, type: ${dataType}`,
    );

    // Emitir confirmación de que se recibió la solicitud
    socket.emit("refresh:acknowledged", { restaurantId, dataType });
  });

  // Auto-unirse a la sala del restaurante del usuario al conectar
  if (user.restaurantId) {
    const roomName = `restaurant:${user.restaurantId}`;
    socket.join(roomName);
    console.log(`🏠 Auto-joined user ${user.id} to room ${roomName}`);
  }
}

module.exports = { registerDashboardHandlers };
