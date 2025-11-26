const express = require("express");
const axios = require("axios");
const router = express.Router();

/**
 * POST /api/ai-agent/chat
 * Endpoint seguro para comunicarse con el agente de AI
 * Body: { message: string, session_id?: string }
 *
 * Detecta automáticamente si es del admin-portal o del frontend
 * basándose en el contexto del mensaje para usar la API key correcta
 */
router.post("/chat", async (req, res) => {
  try {
    const { message, session_id } = req.body;

    // Validar que se envió un mensaje
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "El campo 'message' es requerido y debe ser un string",
      });
    }

    // Detectar el tipo de contexto del mensaje
    const isAdminPortal = message.includes("admin_portal=true");
    const isSupportDashboard = message.includes("support_dashboard");

    // Seleccionar la API key apropiada
    let apiKey;
    let agentType;

    if (isAdminPortal) {
      apiKey = process.env.AI_AGENT_ADMIN_API_KEY;
      agentType = "Admin Portal";
    } else if (isSupportDashboard) {
      apiKey = process.env.AI_AGENT_SUPPORT_API_KEY;
      agentType = "Support Dashboard";
    } else {
      apiKey = process.env.AI_AGENT_API_KEY;
      agentType = "Frontend";
    }

    // Validar que la API key existe
    if (!apiKey) {
      const keyName = isAdminPortal
        ? "AI_AGENT_ADMIN_API_KEY"
        : isSupportDashboard
          ? "AI_AGENT_SUPPORT_API_KEY"
          : "AI_AGENT_API_KEY";
      console.error(`❌ ${keyName} no está configurada en .env`);
      return res.status(500).json({
        error: "Configuración del servidor incompleta",
      });
    }

    // Llamar al agente de AI usando axios
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

    // Retornar la respuesta del agente
    res.status(200).json(response.data);
  } catch (error) {
    console.error("❌ Error en /api/ai-agent/chat:", error.message);

    // Si es un error de axios con respuesta del servidor
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
      return res.status(error.response.status).json({
        error: "Error al comunicarse con el agente de AI",
        details: error.response.data,
      });
    }

    // Error de red o de conexión
    res.status(502).json({
      error: "Error de conexión con el agente de AI",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
