require("dotenv").config();

// ===============================================
// CONFIGURACIONES DE CLERK PARA MÚLTIPLES PROYECTOS
// ===============================================

const clerkConfigs = {
  // Configuración para el proyecto even-frontend (existente)
  even: {
    secretKey:
      process.env.CLERK_SECRET_KEY_EVEN || process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY_EVEN,
    project: "even-frontend",
  },

  // Configuración para el proyecto admin-portal
  adminPortal: {
    secretKey: process.env.CLERK_SECRET_KEY_ADMIN_PORTAL,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY_ADMIN_PORTAL,
    project: "admin-portal",
  },

  // Configuración para el proyecto main-portal (super admin)
  mainPortal: {
    secretKey: process.env.CLERK_SECRET_KEY_MAIN_PORTAL,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY_MAIN_PORTAL,
    project: "main-portal",
  },
};

// ===============================================
// FUNCIONES DE UTILIDAD
// ===============================================

/**
 * Obtiene la configuración de Clerk para un proyecto específico
 * @param {string} project - 'even', 'adminPortal' o 'mainPortal'
 * @returns {object} Configuración de Clerk
 */
const getClerkConfig = (project) => {
  const config = clerkConfigs[project];

  if (!config) {
    throw new Error(
      `Configuración de Clerk no encontrada para el proyecto: ${project}`,
    );
  }

  if (!config.secretKey) {
    throw new Error(
      `CLERK_SECRET_KEY no configurado para el proyecto: ${project}`,
    );
  }

  return config;
};

/**
 * Valida que todas las configuraciones necesarias estén presentes
 */
const validateClerkConfigs = () => {
  const errors = [];

  // Validar configuración even (existente)
  if (!clerkConfigs.even.secretKey) {
    errors.push("CLERK_SECRET_KEY_EVEN o CLERK_SECRET_KEY no está configurado");
  }

  // Validar configuración admin-portal
  if (!clerkConfigs.adminPortal.secretKey) {
    errors.push("CLERK_SECRET_KEY_ADMIN_PORTAL no está configurado");
  }

  // Validar configuración main-portal
  if (!clerkConfigs.mainPortal.secretKey) {
    errors.push("CLERK_SECRET_KEY_MAIN_PORTAL no está configurado");
  }

  if (errors.length > 0) {
    console.warn("⚠️ Algunas configuraciones de Clerk están incompletas:");
    errors.forEach((error) => console.warn(`   - ${error}`));
    console.warn(
      "   El sistema funcionará con las configuraciones disponibles.",
    );
  } else {
    console.log("CLERK: Configuración de Clerk completa");
  }

  return errors.length === 0;
};

module.exports = {
  clerkConfigs,
  getClerkConfig,
  validateClerkConfigs,
};
