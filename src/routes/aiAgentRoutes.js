const express = require("express");
const axios = require("axios");
const router = express.Router();

/**
 * Función helper para obtener la API key según el contexto del mensaje
 */
function getApiKeyForContext(message) {
  const isAdminPortal = message.includes("admin_portal=true");
  const isSupportDashboard = message.includes("support_dashboard");

  if (isAdminPortal) {
    return {
      apiKey: process.env.AI_AGENT_ADMIN_API_KEY,
      keyName: "AI_AGENT_ADMIN_API_KEY",
      agentType: "Admin Portal",
    };
  } else if (isSupportDashboard) {
    return {
      apiKey: process.env.AI_AGENT_SUPPORT_API_KEY,
      keyName: "AI_AGENT_SUPPORT_API_KEY",
      agentType: "Support Dashboard",
    };
  } else {
    return {
      apiKey: process.env.AI_AGENT_API_KEY,
      keyName: "AI_AGENT_API_KEY",
      agentType: "Frontend",
    };
  }
}

/**
 * POST /api/ai-agent/chat
 * Endpoint seguro para comunicarse con el agente de AI (non-streaming)
 * Body: { message: string, session_id?: string }
 */
router.post("/chat", async (req, res) => {
  try {
    const { message, session_id } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "El campo 'message' es requerido y debe ser un string",
      });
    }

    const { apiKey, keyName } = getApiKeyForContext(message);

    if (!apiKey) {
      console.error(`${keyName} no esta configurada en .env`);
      return res.status(500).json({
        error: "Configuracion del servidor incompleta",
      });
    }

    const response = await axios.post(
      "https://ai-spine-api.up.railway.app/api/v1/agents/embed/chat",
      {
        message,
        session_id: session_id || null,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error en /api/ai-agent/chat:", error.message);

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
      return res.status(error.response.status).json({
        error: "Error al comunicarse con el agente de AI",
        details: error.response.data,
      });
    }

    res.status(502).json({
      error: "Error de conexion con el agente de AI",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * POST /api/ai-agent/chat/stream
 * Endpoint con streaming simulado para respuestas en tiempo real
 * Obtiene la respuesta completa y la envía token por token
 * Body: { message: string, session_id?: string }
 */
router.post("/chat/stream", async (req, res) => {
  try {
    const { message, session_id } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "El campo 'message' es requerido y debe ser un string",
      });
    }

    const { apiKey, keyName } = getApiKeyForContext(message);

    if (!apiKey) {
      console.error(`${keyName} no esta configurada en .env`);
      return res.status(500).json({
        error: "Configuracion del servidor incompleta",
      });
    }

    // Configurar headers para SSE (Server-Sent Events)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Obtener respuesta completa del agente
    const response = await axios.post(
      "https://ai-spine-api.up.railway.app/api/v1/agents/embed/chat",
      {
        message,
        session_id: session_id || null,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { response: agentResponse, session_id: newSessionId } = response.data;

    // Enviar session_id si existe
    if (newSessionId) {
      res.write(`data: ${JSON.stringify({ type: "session", session_id: newSessionId })}\n\n`);
    }

    // Simular streaming: enviar la respuesta palabra por palabra
    const words = agentResponse.split(/(\s+)/); // Mantener espacios

    for (const word of words) {
      if (word) {
        res.write(`data: ${JSON.stringify({ type: "token", content: word })}\n\n`);
        // Pequeno delay para efecto visual (5-15ms por palabra)
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Enviar evento de finalizacion
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Error en /api/ai-agent/chat/stream:", error.message);

    // Si aun no hemos enviado headers, enviar error JSON
    if (!res.headersSent) {
      return res.status(502).json({
        error: "Error de conexion con el agente de AI",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    // Si ya estamos en streaming, enviar error como evento
    res.write(`data: ${JSON.stringify({ type: "error", content: "Error de conexion" })}\n\n`);
    res.end();
  }
});

module.exports = router;
