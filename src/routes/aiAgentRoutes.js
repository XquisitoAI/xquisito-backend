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

    // Detectar si el mensaje viene del admin-portal
    const isAdminPortal = message.includes("admin_portal=true");

    // Seleccionar la API key apropiada
    const apiKey = isAdminPortal
      ? process.env.AI_AGENT_ADMIN_API_KEY
      : process.env.AI_AGENT_API_KEY;

    // Validar que la API key existe
    if (!apiKey) {
      const keyName = isAdminPortal
        ? "AI_AGENT_ADMIN_API_KEY"
        : "AI_AGENT_API_KEY";
      console.error(`❌ ${keyName} no está configurada en .env`);
      return res.status(500).json({
        error: "Configuración del servidor incompleta",
      });
    }

    const agentType = isAdminPortal ? "Admin Portal" : "Frontend";

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
