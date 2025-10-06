require('dotenv').config();

// ===============================================
// CONFIGURACIONES DE CLERK PARA MÚLTIPLES PROYECTOS
// ===============================================

const clerkConfigs = {
  // Configuración para el proyecto xquisito-frontend (existente)
  xquisito: {
    secretKey: process.env.CLERK_SECRET_KEY_XQUISITO || process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY_XQUISITO,
    project: 'xquisito-frontend'
  },

  // Configuración para el proyecto admin-portal (nuevo)
  adminPortal: {
    secretKey: process.env.CLERK_SECRET_KEY_ADMIN_PORTAL,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY_ADMIN_PORTAL,
    project: 'admin-portal'
  }
};

// ===============================================
// FUNCIONES DE UTILIDAD
// ===============================================

/**
 * Obtiene la configuración de Clerk para un proyecto específico
 * @param {string} project - 'xquisito' o 'adminPortal'
 * @returns {object} Configuración de Clerk
 */
const getClerkConfig = (project) => {
  const config = clerkConfigs[project];

  if (!config) {
    throw new Error(`Configuración de Clerk no encontrada para el proyecto: ${project}`);
  }

  if (!config.secretKey) {
    throw new Error(`CLERK_SECRET_KEY no configurado para el proyecto: ${project}`);
  }

  return config;
};

/**
 * Valida que todas las configuraciones necesarias estén presentes
 */
const validateClerkConfigs = () => {
  const errors = [];

  // Validar configuración xquisito (existente)
  if (!clerkConfigs.xquisito.secretKey) {
    errors.push('CLERK_SECRET_KEY_XQUISITO o CLERK_SECRET_KEY no está configurado');
  }

  // Validar configuración admin-portal
  if (!clerkConfigs.adminPortal.secretKey) {
    errors.push('CLERK_SECRET_KEY_ADMIN_PORTAL no está configurado');
  }

  if (errors.length > 0) {
    console.warn('⚠️ Algunas configuraciones de Clerk están incompletas:');
    errors.forEach(error => console.warn(`   - ${error}`));
    console.warn('   El sistema funcionará con las configuraciones disponibles.');
  } else {
    console.log('✅ Todas las configuraciones de Clerk están completas');
  }

  return errors.length === 0;
};

module.exports = {
  clerkConfigs,
  getClerkConfig,
  validateClerkConfigs
};