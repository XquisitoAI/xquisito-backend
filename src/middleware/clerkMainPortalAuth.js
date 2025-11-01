const { createClerkClient } = require('@clerk/clerk-sdk-node');
const { getClerkConfig } = require('../config/clerkConfig');

/**
 * Autentica un token de Clerk para el proyecto Main Portal específicamente
 */
const authenticateMainPortalToken = async (req, res, next) => {
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
      // Obtener configuración específica del main portal
      const mainPortalConfig = getClerkConfig('mainPortal');

      // Crear cliente de Clerk específico para main portal
      const mainPortalClerk = createClerkClient({
        secretKey: mainPortalConfig.secretKey
      });

      // Verificar el token con la configuración del main portal
      const verifiedToken = await mainPortalClerk.verifyToken(token);

      if (verifiedToken && verifiedToken.sub) {
        // Obtener información del usuario
        const user = await mainPortalClerk.users.getUser(verifiedToken.sub);

        req.user = {
          id: user.id,
          email: user.emailAddresses?.[0]?.emailAddress,
          firstName: user.firstName,
          lastName: user.lastName,
          clerkData: user
        };

        console.log('✅ Main Portal token verified for user:', req.user.email);
      } else {
        console.log('⚠️ Main Portal token verification failed: Invalid token structure');
        req.user = null;
      }
    } catch (tokenError) {
      console.log('❌ Main Portal token verification failed:', tokenError.message);
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('❌ Main Portal auth middleware error:', error);
    req.user = null;
    next();
  }
};

/**
 * Middleware específico para Main Portal que garantiza autenticación
 * Solo permite usuarios autenticados (super administradores)
 */
const mainPortalAuth = async (req, res, next) => {
  try {
    // Usar el middleware de autenticación específico del main portal
    await new Promise((resolve, reject) => {
      authenticateMainPortalToken(req, res, (error) => {
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

      console.log('✅ Main Portal auth successful for user:', req.user.email);
      next();
    } else {
      console.log('❌ Main Portal access denied: Authentication required');
      return res.status(401).json({
        success: false,
        error: 'authentication_required',
        message: 'Main Portal access requires authentication. Please sign in.'
      });
    }
  } catch (error) {
    console.error('❌ Main Portal auth error:', error);
    return res.status(401).json({
      success: false,
      error: 'authentication_failed',
      message: 'Authentication failed'
    });
  }
};

/**
 * Middleware opcional para rutas que pueden funcionar sin auth
 * (útil para endpoints de información pública como /info)
 */
const optionalMainPortalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Si hay token, intentar autenticar
      try {
        await new Promise((resolve, reject) => {
          authenticateMainPortalToken(req, res, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        if (req.user && req.user.id) {
          req.auth = {
            userId: req.user.id,
            user: req.user
          };
          console.log('✅ Optional Main Portal auth successful for user:', req.user.email);
        }
      } catch (error) {
        console.log('ℹ️ Optional main portal auth failed, continuing without auth');
      }
    }

    // Continuar con o sin autenticación
    if (!req.auth) {
      req.auth = null;
      req.user = null;
      console.log('👥 Continuing as guest user: guest-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    }

    next();
  } catch (error) {
    console.error('❌ Optional Main Portal auth error:', error);
    // Continuar sin autenticación en caso de error
    req.auth = null;
    req.user = null;
    console.log('👥 Continuing as guest user due to error: guest-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    next();
  }
};

module.exports = {
  mainPortalAuth,
  optionalMainPortalAuth
};