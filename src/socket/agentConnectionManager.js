/**
 * AgentConnectionManager
 * Gestiona conexiones de agentes Soft Restaurant por WebSocket
 * Trackea qué agentes están conectados y permite enviarles mensajes
 */

const { supabaseAdmin } = require("../config/supabaseAuth");

class AgentConnectionManager {
  constructor() {
    // Map: branchId -> { socket, connectedAt, lastPing }
    this.agents = new Map();
    // Map: socketId -> branchId (para lookup inverso)
    this.socketToBranch = new Map();
    // Pending promises para esperar respuestas
    this.pendingRequests = new Map();
    // Timeout para requests (30 segundos)
    this.requestTimeout = 30000;
  }

  // Registrar un agente conectado
  register(socket, branchId) {
    // Si ya había un agente para esta sucursal, desconectarlo
    const existing = this.agents.get(branchId);
    if (existing && existing.socket.id !== socket.id) {
      console.log(`⚠️ Reemplazando agente anterior para branch ${branchId}`);
      existing.socket.disconnect(true);
    }

    this.agents.set(branchId, {
      socket,
      branchId,
      connectedAt: new Date(),
      lastPing: new Date(),
    });

    this.socketToBranch.set(socket.id, branchId);

    console.log(
      `✅ Agente registrado: branch=${branchId}, socket=${socket.id}`,
    );
    console.log(`📊 Total agentes conectados: ${this.agents.size}`);
  }

  // Remover un agente desconectado
  unregister(socketId) {
    const branchId = this.socketToBranch.get(socketId);
    if (branchId) {
      this.agents.delete(branchId);
      this.socketToBranch.delete(socketId);
      console.log(`❌ Agente desconectado: branch=${branchId}`);
      console.log(`📊 Total agentes conectados: ${this.agents.size}`);
    }
  }

  // Verificar si una sucursal tiene agente conectado
  isConnected(branchId) {
    return this.agents.has(branchId);
  }

  // Obtener socket de una sucursal
  getSocket(branchId) {
    const agent = this.agents.get(branchId);
    return agent?.socket || null;
  }

  // Enviar mensaje a un agente (fire and forget)
  send(branchId, messageType, payload) {
    const socket = this.getSocket(branchId);
    if (!socket) {
      console.warn(`⚠️ No hay agente conectado para branch ${branchId}`);
      return false;
    }

    socket.emit(messageType, payload);
    return true;
  }

  // Enviar mensaje y esperar respuesta
  sendAndWait(branchId, messageType, payload, timeoutMs = this.requestTimeout) {
    return new Promise(async (resolve, reject) => {
      // Esperar un momento si es un evento de pago (para dar tiempo a reconexión)
      if (messageType === "apply_payment") {
        await new Promise((r) => setTimeout(r, 500));
      }

      let socket = this.getSocket(branchId);
      console.log(
        `📤 sendAndWait: event=${messageType}, branch=${branchId}, socket=${socket?.id || "NULL"}, connected=${socket?.connected}`,
      );

      // Si el socket no está conectado, esperar y reintentar
      if (socket && !socket.connected) {
        console.log(`⚠️ Socket desconectado, esperando reconexión...`);
        await new Promise((r) => setTimeout(r, 1000));
        socket = this.getSocket(branchId);
        console.log(
          `📤 Retry: socket=${socket?.id || "NULL"}, connected=${socket?.connected}`,
        );
      }

      if (!socket || !socket.connected) {
        reject(new Error(`No hay agente conectado para branch ${branchId}`));
        return;
      }

      // Generar ID único para esta request
      const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      // Timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new Error(`Timeout esperando respuesta del agente (${timeoutMs}ms)`),
        );
      }, timeoutMs);

      // Guardar promise pending
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Enviar con requestId
      console.log(
        `📤 Emitiendo ${messageType} a socket ${socket.id}, connected=${socket.connected}`,
      );
      socket.emit(messageType, { ...payload, requestId });
      console.log(`📤 Evento ${messageType} emitido`);
    });
  }

  // Manejar respuesta de un agente
  handleResponse(socketId, response) {
    const { requestId, ...data } = response;

    if (!requestId) {
      console.warn("Respuesta sin requestId:", response);
      return;
    }

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`No hay request pendiente para requestId: ${requestId}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    if (data.error) {
      pending.reject(new Error(data.error));
    } else {
      pending.resolve(data);
    }
  }

  // Actualizar timestamp de ping
  updatePing(branchId) {
    const agent = this.agents.get(branchId);
    if (agent) {
      agent.lastPing = new Date();
    }
  }

  // Obtener lista de agentes conectados
  getConnectedAgents() {
    const agents = [];
    for (const [branchId, data] of this.agents) {
      agents.push({
        branchId,
        socketId: data.socket.id,
        connectedAt: data.connectedAt,
        lastPing: data.lastPing,
      });
    }
    return agents;
  }

  // Validar syncToken de un agente
  async validateToken(branchId, syncToken) {
    try {
      const { data: integration, error } = await supabaseAdmin
        .from("pos_integrations")
        .select("id, credentials")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (error || !integration) {
        console.warn(
          `No se encontró integración activa para branch ${branchId}`,
        );
        return false;
      }

      // Comparar token
      const storedToken = integration.credentials?.sync_token;
      if (!storedToken) {
        console.warn(
          `Integración ${integration.id} no tiene sync_token configurado`,
        );
        return false;
      }

      return storedToken === syncToken;
    } catch (error) {
      console.error("Error validando token:", error);
      return false;
    }
  }
}

// Singleton
const agentConnectionManager = new AgentConnectionManager();

module.exports = agentConnectionManager;
