class BasePOSService {
  constructor(integration) {
    if (this.constructor === BasePOSService) {
      throw new Error(
        "BasePOSService es una clase abstracta y no puede ser instanciada directamente",
      );
    }

    this.integration = integration;
    this.credentials = integration.credentials;
    this.settings = integration.settings;
    this.endpoints = integration.endpoints;
    this.providerId = integration.provider_id;
    this.integrationId = integration.id;
  }

  // ==================== MÉTODOS ABSTRACTOS ====================
  // Estos métodos DEBEN ser implementados por cada servicio POS específico

  // Autenticar con el POS
  async authenticate() {
    throw new Error(
      "El método authenticate() debe ser implementado por la subclase",
    );
  }

  // Crear una orden/check en el POS
  async createOrder(orderData) {
    throw new Error(
      "El método createOrder() debe ser implementado por la subclase",
    );
  }

  // Actualizar una orden existente en el POS
  async updateOrder(posOrderId, orderData) {
    throw new Error(
      "El método updateOrder() debe ser implementado por la subclase",
    );
  }

  // Cerrar/completar una orden en el POS
  async closeOrder(posOrderId) {
    throw new Error(
      "El método closeOrder() debe ser implementado por la subclase",
    );
  }

  // Obtener el estado de una orden en el POS
  async getOrderStatus(posOrderId) {
    throw new Error(
      "El método getOrderStatus() debe ser implementado por la subclase",
    );
  }

  // ==================== MÉTODOS COMPARTIDOS ====================
  // Estos métodos son comunes a todos los servicios POS

  // Validar que las credenciales estén presentes
  validateCredentials() {
    const requiredFields = this.getRequiredCredentialFields();

    for (const field of requiredFields) {
      if (!this.credentials[field]) {
        throw new Error(`Credencial requerida faltante: ${field}`);
      }
    }

    return true;
  }

  // Validar que los settings estén presentes
  validateSettings() {
    const requiredFields = this.getRequiredSettingsFields();

    for (const field of requiredFields) {
      if (!this.settings[field]) {
        throw new Error(`Setting requerido faltante: ${field}`);
      }
    }

    return true;
  }

  // Obtener campos requeridos de credenciales (debe ser implementado por subclase)
  getRequiredCredentialFields() {
    return [];
  }

  // Obtener campos requeridos de settings (debe ser implementado por subclase)
  getRequiredSettingsFields() {
    return [];
  }

  // Manejo estandarizado de errores
  getRequiredSettingsFields() {
    return [];
  }

  // Manejo estandarizado de errores
  handleError(error, operation) {
    console.error(`[${this.constructor.name}] Error en ${operation}:`, error);

    // Extraer información útil del error
    const errorMessage =
      error.response?.data?.message || error.message || "Error desconocido";
    const statusCode = error.response?.status || 500;

    const enhancedError = new Error(
      `Error en ${operation} con ${this.constructor.name}: ${errorMessage}`,
    );
    enhancedError.statusCode = statusCode;
    enhancedError.originalError = error;
    enhancedError.operation = operation;

    return enhancedError;
  }

  // Logging de requests para debugging
  logRequest(method, endpoint, data = null) {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] [${this.constructor.name}] ${method} ${endpoint}`,
    );

    if (data && process.env.NODE_ENV === "development") {
      console.log("Request data:", JSON.stringify(data, null, 2));
    }
  }

  // Logging de responses para debugging
  logResponse(method, endpoint, response) {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] [${this.constructor.name}] ${method} ${endpoint} - Status: ${response.status}`,
    );

    if (process.env.NODE_ENV === "development") {
      console.log("Response data:", JSON.stringify(response.data, null, 2));
    }
  }

  // Verificar si el token está expirado (si aplica)
  isTokenExpired(tokenExpiry) {
    if (!tokenExpiry) return true;
    return Date.now() >= tokenExpiry;
  }
}

module.exports = BasePOSService;
