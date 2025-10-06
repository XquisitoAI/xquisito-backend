const { createClerkClient } = require('@clerk/clerk-sdk-node');
const { getClerkConfig } = require('../config/clerkConfig');

/**
 * Autentica un token de Clerk para el proyecto Admin Portal específicamente
 */
const authenticateAdminPortalToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('ℹ️ No authorization header found, continuing as guest');
      req.user = null;
      req.auth = null;
      return next();
    }

    const token = authHeader.substring(7);

    try {
      // Obtener configuración específica del admin portal
      const adminPortalConfig = getClerkConfig('adminPortal');

      // Crear cliente de Clerk específico para admin portal
      const adminPortalClerk = createClerkClient({
        secretKey: adminPortalConfig.secretKey
      });

      // Verificar el token con la configuración del admin portal
      const verifiedToken = await adminPortalClerk.verifyToken(token);

      if (verifiedToken && verifiedToken.sub) {
        // Obtener información del usuario
        const user = await adminPortalClerk.users.getUser(verifiedToken.sub);

        req.user = {
          id: user.id,
          email: user.emailAddresses?.[0]?.emailAddress,
          firstName: user.firstName,
          lastName: user.lastName,
          clerkData: user
        };

        console.log('✅ Admin Portal token verified for user:', req.user.id);
      } else {
        console.log('⚠️ Admin Portal token verification failed: Invalid token structure');
        req.user = null;
      }
    } catch (tokenError) {
      console.log('❌ Admin Portal token verification failed:', tokenError.message);
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('❌ Admin Portal auth middleware error:', error);
    req.user = null;
    next();
  }
};

/**
 * Middleware específico para Admin Portal que garantiza autenticación
 * y estructura el objeto auth según lo esperado por los controllers
 */
const adminPortalAuth = async (req, res, next) => {
  try {
    // Usar el middleware de autenticación específico del admin portal
    await new Promise((resolve, reject) => {
      authenticateAdminPortalToken(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Verificar que el usuario esté autenticado
    if (req.user && req.user.id) {
      req.auth = {
        userId: req.user.id, // Clerk user ID
        user: req.user
      };

      console.log('✅ Admin Portal auth successful for user:', req.auth.userId);
      next();
    } else {
      return res.status(401).json({
        success: false,
        message: 'Admin Portal access requires authentication'
      });
    }
  } catch (error) {
    console.error('❌ Admin Portal auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Middleware opcional para rutas que pueden funcionar sin auth
 * (por ejemplo, setup inicial desde webhooks)
 */
const optionalAdminPortalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Si hay token, intentar autenticar
      try {
        await adminPortalAuth(req, res, next);
        return; // Si funciona, continuar
      } catch (error) {
        // Si falla, continuar sin auth
        console.log('ℹ️ Optional admin portal auth failed, continuing without auth');
      }
    }

    // Continuar sin autenticación
    req.auth = null;
    req.user = null;
    next();
  } catch (error) {
    console.error('❌ Optional Admin Portal auth error:', error);
    // Continuar sin autenticación en caso de error
    req.auth = null;
    req.user = null;
    next();
  }
};

module.exports = {
  adminPortalAuth,
  optionalAdminPortalAuth
};