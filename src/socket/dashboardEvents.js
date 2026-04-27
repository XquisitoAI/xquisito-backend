const superAdminService = require("../services/superAdminService");
const supabase = require("../config/supabase");

// Presencia de dispositivos crew por sucursal (en memoria)
// branchId → Map<deviceId, { socketId, connectedAt }>
const branchDevices = new Map();

function getBranchDeviceList(branchId) {
  const map = branchDevices.get(branchId);
  if (!map) return [];
  return [...map.entries()].map(([deviceId, info]) => ({ deviceId, ...info }));
}

// Registra los handlers de eventos del dashboard para un socket
async function registerDashboardHandlers(io, socket) {
  const { user } = socket;

  // Emitir confirmación de conexión exitosa
  socket.emit("connection:authenticated", {
    userId: user.id,
    restaurantId: user.restaurantId,
    restaurantName: user.restaurantName,
  });

  // Unirse a la sala del restaurante
  socket.on("join:restaurant", (data) => {
    const { restaurantId } = data || {};
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
  socket.on("leave:restaurant", (data) => {
    const { restaurantId } = data || {};
    const roomName = `restaurant:${restaurantId}`;
    socket.leave(roomName);
    console.log(`🚪 User ${user.id} left room ${roomName}`);

    socket.emit("room:left", { restaurantId, roomName });
  });

  // Solicitar actualización manual de datos
  socket.on("request:refresh", async (data) => {
    const { restaurantId, dataType } = data || {};
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

  // Unirse a la sala de super-admin (para estadísticas globales)
  socket.on("join:super-admin", () => {
    const roomName = "super-admin";
    socket.join(roomName);
    console.log(`👑 User ${user.id} joined room ${roomName}`);

    // Confirmar unión a la sala
    socket.emit("room:joined", { roomName });
  });

  // Solicitar estadísticas en tiempo real
  socket.on("request:stats", async (filters) => {
    try {
      console.log(`[Dashboard] Stats requested by ${user.id}:`, filters);

      // Llamar al servicio de super admin para obtener stats
      const statsResponse = await superAdminService.getSuperAdminStats(filters);

      // Emitir stats actualizados al cliente (extraer solo la parte 'data')
      socket.emit("stats:updated", {
        success: true,
        data: statsResponse.data, // Solo enviar la parte 'data' del response
        timestamp: new Date().toISOString(),
      });

      console.log(
        `[Dashboard] Stats sent to ${user.id}, filters:`,
        Object.keys(filters).join(", "),
      );
    } catch (error) {
      console.error(`[Dashboard] Error getting stats for ${user.id}:`, error);
      socket.emit("stats:error", {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Auto-unirse a la sala del restaurante del usuario al conectar
  if (user.restaurantId) {
    const roomName = `restaurant:${user.restaurantId}`;
    socket.join(roomName);
    console.log(`🏠 Auto-joined user ${user.id} to room ${roomName}`);
  }

  // Crew: presencia y master printer
  if (user.clientType === "crew") {
    const branchId = user.branchId;
    const deviceId = user.deviceId || socket.id;

    // Registrar dispositivo en memoria
    if (!branchDevices.has(branchId)) branchDevices.set(branchId, new Map());
    branchDevices.get(branchId).set(deviceId, {
      socketId: socket.id,
      connectedAt: new Date().toISOString(),
    });

    // Unirse a room de sucursal para broadcasts dirigidos
    socket.join(`crew:${branchId}`);

    // Obtener master actual de Supabase
    const { data: branchRow } = await supabase
      .from("branches")
      .select("master_crew_device_id")
      .eq("id", branchId)
      .single();
    const masterDeviceId = branchRow?.master_crew_device_id || null;

    // Emitir estado actual a todos en la sucursal (incluyendo el nuevo)
    const devices = getBranchDeviceList(branchId);
    io.to(`crew:${branchId}`).emit("crew:devices-updated", {
      devices,
      masterDeviceId,
    });

    // Confirmar conexión al dispositivo que acaba de unirse
    socket.emit("room:joined", {
      restaurantId: user.restaurantId,
      branchId,
      masterDeviceId,
      devices,
    });

    // Seleccionar Master (cualquier dispositivo de la sucursal puede llamar esto)
    socket.on("crew:set-master", async ({ deviceId: targetDeviceId }) => {
      await supabase
        .from("branches")
        .update({ master_crew_device_id: targetDeviceId })
        .eq("id", branchId);
      const updatedDevices = getBranchDeviceList(branchId);
      io.to(`crew:${branchId}`).emit("crew:devices-updated", {
        devices: updatedDevices,
        masterDeviceId: targetDeviceId,
      });
      console.log(
        `[CREW] Master set: device=${targetDeviceId} branch=${branchId}`,
      );
    });

    // Limpiar al desconectarse
    socket.on("disconnect", async () => {
      branchDevices.get(branchId)?.delete(deviceId);
      const remaining = getBranchDeviceList(branchId);

      // Si el master se fue, limpiar en DB
      const { data: b } = await supabase
        .from("branches")
        .select("master_crew_device_id")
        .eq("id", branchId)
        .single();

      if (b?.master_crew_device_id === deviceId) {
        await supabase
          .from("branches")
          .update({ master_crew_device_id: null })
          .eq("id", branchId);
        io.to(`crew:${branchId}`).emit("crew:devices-updated", {
          devices: remaining,
          masterDeviceId: null,
        });
        console.log(
          `[CREW] Master desconectado, limpiando master para branch=${branchId}`,
        );
      } else {
        io.to(`crew:${branchId}`).emit("crew:devices-updated", {
          devices: remaining,
          masterDeviceId: b?.master_crew_device_id || null,
        });
      }
      console.log(
        `[CREW] Dispositivo desconectado: device=${deviceId} branch=${branchId} restantes=${remaining.length}`,
      );
    });
  }
}

module.exports = { registerDashboardHandlers };
