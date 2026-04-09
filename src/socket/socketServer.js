const { Server } = require("socket.io");
const { authenticateSocket } = require("./socketAuth");
const { registerDashboardHandlers } = require("./dashboardEvents");
const { registerTableHandlers } = require("./tableEvents");
const { registerTapPayHandlers } = require("./tapPayEvents");
const { setupAgentNamespace } = require("./agentEvents");

let io = null;

// Inicializa Socket.IO con el servidor HTTP
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:3000", // FlexBill
        "http://localhost:3001", // Main Portal
        "http://localhost:3002", // Admin Portal
        "http://tauri.localhost",   // Xquisito Crew (Windows .exe)
        "https://tauri.localhost",  // Xquisito Crew (Android APK)
        "http://localhost:5173",   // Xquisito Crew (tauri:dev)
        process.env.ADMIN_PORTAL_URL,
        process.env.MAIN_PORTAL_URL,
        process.env.FLEXBILL_URL,
        process.env.TAP_PAY_URL,
      ].filter(Boolean),
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Middleware de autenticación
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}, User: ${socket.user?.id}`);

    // Registrar handlers según el tipo de cliente
    const clientType = socket.user?.clientType;

    if (clientType === "admin-portal" || clientType === "main-portal") {
      // Handlers para Admin Portal y Main Portal (dashboard)
      registerDashboardHandlers(io, socket);
    }

    // Handlers para FlexBill (mesas) - disponible para todos
    registerTableHandlers(io, socket);

    // Handlers para Tap & Pay - disponible para todos
    registerTapPayHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`❌ Socket disconnected: ${socket.id}, Reason: ${reason}`);
    });

    socket.on("error", (error) => {
      console.error(`⚠️ Socket error: ${socket.id}`, error);
    });
  });

  // Configurar namespace /sync para agentes Soft Restaurant
  setupAgentNamespace(io);

  console.log("✅ Socket.IO initialized");
  return io;
}

// Obtiene la instancia de Socket.IO
function getIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initializeSocket first.");
  }
  return io;
}

// Verifica si Socket.IO está inicializado
function isSocketInitialized() {
  return io !== null;
}

module.exports = { initializeSocket, getIO, isSocketInitialized };
