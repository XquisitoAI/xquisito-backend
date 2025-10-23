/**
 * Middleware para detectar el tipo de aplicación basado en headers
 * Permite reutilizar endpoints existentes para múltiples apps
 */

const detectAppType = (req, res, next) => {
  // Obtener tipo de app del header (por defecto: flexbill)
  const appType = req.headers['x-app-type'] || 'flexbill';

  // Validar tipos de app permitidos
  const validAppTypes = ['flexbill', 'taporder'];

  if (!validAppTypes.includes(appType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid app type: ${appType}. Valid types: ${validAppTypes.join(', ')}`
    });
  }

  // Agregar información del tipo de app al request
  req.appType = appType;
  req.isTapOrder = appType === 'taporder';
  req.isFlexBill = appType === 'flexbill';

  // Log para debugging (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[App Type Detector] ${req.method} ${req.originalUrl} - App: ${appType}`);
  }

  next();
};

/**
 * Middleware específico para validar que la request sea de Tap Order
 */
const requireTapOrder = (req, res, next) => {
  if (!req.isTapOrder) {
    return res.status(400).json({
      success: false,
      error: 'This endpoint requires X-App-Type: taporder header'
    });
  }
  next();
};

/**
 * Middleware específico para validar que la request sea de Flex-Bill
 */
const requireFlexBill = (req, res, next) => {
  if (!req.isFlexBill) {
    return res.status(400).json({
      success: false,
      error: 'This endpoint requires X-App-Type: flexbill header'
    });
  }
  next();
};

/**
 * Middleware para agregar información de contexto basada en el tipo de app
 */
const addAppContext = (req, res, next) => {
  // Agregar contexto específico por app
  req.appContext = {
    type: req.appType,
    isTapOrder: req.isTapOrder,
    isFlexBill: req.isFlexBill,

    // Configuraciones específicas por app
    config: {
      taporder: {
        autoCreateOrder: true,
        useSimplifiedFlow: true,
        requireCustomerInfo: false,
        allowGuestOrders: true
      },
      flexbill: {
        autoCreateOrder: false,
        useSimplifiedFlow: false,
        requireCustomerInfo: true,
        allowGuestOrders: true
      }
    }[req.appType]
  };

  next();
};

module.exports = {
  detectAppType,
  requireTapOrder,
  requireFlexBill,
  addAppContext
};