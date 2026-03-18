const axios = require("axios");
const crypto = require("crypto");
const BasePOSService = require("./BasePOSService");

class SymphonyPOSService extends BasePOSService {
  constructor(integration) {
    super(integration);

    // Tokens de autenticación
    this.idToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;

    // Estado del flujo OAuth
    this.codeVerifier = null;
    this.state = null;

    // Crear instancia de axios con configuración base
    this.axiosInstance = axios.create({
      baseURL: this.endpoints.base_url,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Xquisito-Backend/1.0.0",
      },
    });

    // Interceptor para agregar token y headers de Symphony automáticamente
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // Asegurar que tenemos un token válido
        await this.ensureAuthenticated();

        if (this.idToken) {
          config.headers.Authorization = `Bearer ${this.idToken}`;
        }

        // Agregar headers requeridos de Symphony
        config.headers["Simphony-OrgShortName"] = this.credentials.orgname;
        config.headers["Simphony-LocRef"] = this.settings.loc_ref;
        config.headers["Simphony-RvcRef"] = this.settings.rvc_ref;

        this.logRequest(config.method?.toUpperCase(), config.url, config.data);
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Interceptor para logging de responses
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logResponse(
          response.config.method?.toUpperCase(),
          response.config.url,
          response,
        );
        return response;
      },
      (error) => {
        console.error(
          "Symphony API Error:",
          error.response?.data || error.message,
        );
        return Promise.reject(error);
      },
    );
  }

  // ==================== CAMPOS REQUERIDOS ====================

  getRequiredCredentialFields() {
    return ["client_id", "username", "password", "orgname"];
  }

  getRequiredSettingsFields() {
    return ["loc_ref", "rvc_ref", "employee_ref", "order_type_ref"];
  }

  // ==================== UTILIDADES ====================

  // Generar idempotencyId (UUID v4 sin guiones, 32 caracteres hex)
  generateIdempotencyId() {
    return crypto.randomUUID().replace(/-/g, "");
  }

  // ==================== AUTENTICACIÓN OAuth 2.0 PKCE ====================

  // Generar code_verifier aleatorio (43-128 caracteres)
  generateCodeVerifier() {
    return crypto.randomBytes(32).toString("base64url");
  }

  // Generar code_challenge usando SHA256
  generateCodeChallenge(codeVerifier) {
    return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  }

  // Paso 1: Iniciar flujo de autorización
  async initiateAuthorization() {
    this.codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(this.codeVerifier);

    console.log("🔐 Symphony OAuth: Iniciando autorización...");

    const response = await axios.get(
      `${this.endpoints.base_url}/oauth2/authorize`,
      {
        params: {
          response_type: "code",
          client_id: this.credentials.client_id,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    // Extraer state de la respuesta
    this.state = response.data.state;

    console.log("✅ Symphony OAuth: Autorización iniciada");
    return this.state;
  }

  // Paso 2: Sign-in con credenciales
  async signIn() {
    if (!this.state) {
      await this.initiateAuthorization();
    }

    console.log("🔐 Symphony OAuth: Realizando sign-in...");

    const response = await axios.post(
      `${this.endpoints.base_url}/oauth2/signin`,
      {
        username: this.credentials.username,
        password: this.credentials.password,
        orgname: this.credentials.orgname,
        state: this.state,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log("✅ Symphony OAuth: Sign-in exitoso");
    return response.data.code;
  }

  // Paso 3: Obtener tokens
  async getTokens(authorizationCode) {
    console.log("🔐 Symphony OAuth: Obteniendo tokens...");

    const response = await axios.post(
      `${this.endpoints.base_url}/oauth2/token`,
      {
        grant_type: "authorization_code",
        code: authorizationCode,
        code_verifier: this.codeVerifier,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    this.idToken = response.data.id_token;
    this.refreshToken = response.data.refresh_token;

    // id_token expira en 14 días, usar 13 días como margen de seguridad
    this.tokenExpiry = Date.now() + 13 * 24 * 60 * 60 * 1000;

    console.log("✅ Symphony OAuth: Tokens obtenidos exitosamente");
    return this.idToken;
  }

  // Refrescar token usando refresh_token
  async refreshTokens() {
    if (!this.refreshToken) {
      throw new Error("No hay refresh_token disponible. Debe re-autenticar.");
    }

    console.log("🔄 Symphony OAuth: Refrescando tokens...");

    try {
      const response = await axios.post(
        `${this.endpoints.base_url}/oauth2/token`,
        {
          grant_type: "refresh_token",
          refresh_token: this.refreshToken,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      this.idToken = response.data.id_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiry = Date.now() + 13 * 24 * 60 * 60 * 1000;

      console.log("✅ Symphony OAuth: Tokens refrescados exitosamente");
      return this.idToken;
    } catch (error) {
      // Si falla el refresh, hacer autenticación completa
      console.warn("⚠️ Error refrescando token, re-autenticando...");
      return this.authenticate();
    }
  }

  // Flujo completo de autenticación
  async authenticate() {
    try {
      this.validateCredentials();

      console.log("🔐 Autenticando con Symphony (OAuth 2.0 PKCE)...");

      // Paso 1: Iniciar autorización
      await this.initiateAuthorization();

      // Paso 2: Sign-in
      const authorizationCode = await this.signIn();

      // Paso 3: Obtener tokens
      await this.getTokens(authorizationCode);

      console.log("✅ Autenticación con Symphony completada");
      return this.idToken;
    } catch (error) {
      throw this.handleError(error, "authenticate");
    }
  }

  // Asegurar que tenemos un token válido
  async ensureAuthenticated() {
    if (!this.idToken || this.isTokenExpired(this.tokenExpiry)) {
      // Si tenemos refresh_token, intentar refrescar primero
      if (this.refreshToken && !this.isRefreshTokenExpired()) {
        await this.refreshTokens();
      } else {
        await this.authenticate();
      }
    }
  }

  // Verificar si el refresh_token está expirado (28 días)
  isRefreshTokenExpired() {
    if (!this.tokenExpiry) return true;
    const refreshExpiry = this.tokenExpiry + 14 * 24 * 60 * 60 * 1000;
    return Date.now() >= refreshExpiry;
  }

  // ==================== OPERACIONES DE ÓRDENES ====================

  // Crear una orden/check en Symphony
  async createOrder(orderData) {
    try {
      this.validateSettings();

      console.log(
        `📝 Creando orden en Symphony para ${orderData.customer_name || "cliente"}...`,
      );

      // Estructura de orden según API de Symphony
      const symphonyCheck = {
        header: {
          orgShortName: this.credentials.orgname,
          locRef: this.settings.loc_ref,
          rvcRef: this.settings.rvc_ref,
          idempotencyId: this.generateIdempotencyId(),
          checkEmployeeRef: this.settings.employee_ref,
          orderTypeRef: this.settings.order_type_ref,
          checkName:
            orderData.check_name || orderData.table_number || "Xquisito Order",
          guestCount: orderData.guest_count || 1,
          tableName: orderData.table_number || null,
          orderChannelRef: this.settings.order_channel_ref || undefined,
        },
        menuItems: orderData.items.map((item) => ({
          menuItemId: parseInt(item.pos_item_id, 10),
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.price * item.quantity,
        })),
      };

      // Si auto_close está habilitado y hay tender_ref, incluir pago para cerrar check
      if (this.settings.auto_close && this.settings.tender_ref) {
        symphonyCheck.tenders = [
          {
            tenderId: parseInt(this.settings.tender_ref, 10),
            total: 0, // 0 = pago completo automático
          },
        ];
        console.log(
          `💳 Auto-close habilitado. Incluyendo tender ${this.settings.tender_ref}`,
        );
      }

      const response = await this.axiosInstance.post(
        "/api/v1/checks",
        symphonyCheck,
      );

      const isClosed = response.data.header.status === "closed";
      console.log(
        `✅ Orden creada en Symphony. Check Ref: ${response.data.header.checkRef} | Status: ${response.data.header.status}`,
      );

      return {
        success: true,
        posOrderId: response.data.header.checkRef,
        posCheckNumber: response.data.header.checkNumber,
        posTableId: response.data.header.tableName,
        status: response.data.header.status,
        isClosed,
        totals: response.data.totals,
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "createOrder");
    }
  }

  // Actualizar una orden existente en Symphony (agregar items)
  async updateOrder(posOrderId, orderData) {
    try {
      console.log(`📝 Actualizando orden ${posOrderId} en Symphony...`);

      // Agregar items nuevos al check existente
      const updateData = {
        menuItems: orderData.items.map((item) => ({
          menuItemId: parseInt(item.pos_item_id, 10),
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.price * item.quantity,
        })),
      };

      const response = await this.axiosInstance.post(
        `/api/v1/checks/${posOrderId}/menuItems`,
        updateData,
      );

      console.log(`✅ Orden ${posOrderId} actualizada en Symphony`);

      return {
        success: true,
        posOrderId: response.data.header.checkRef,
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "updateOrder");
    }
  }

  // Agregar una nueva ronda de items a un check existente
  async addRound(posOrderId, items) {
    try {
      console.log(
        `🔄 Agregando ronda de ${items.length} items al check ${posOrderId}...`,
      );

      const roundData = {
        menuItems: items.map((item) => ({
          menuItemId: parseInt(item.pos_item_id, 10),
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.price * item.quantity,
        })),
      };

      const response = await this.axiosInstance.post(
        `/api/v1/checks/${posOrderId}/round`,
        roundData,
      );

      console.log(
        `✅ Ronda agregada al check ${posOrderId}. Total items: ${response.data.menuItems?.length || 0}`,
      );

      return {
        success: true,
        posOrderId: response.data.header.checkRef,
        status: response.data.header.status,
        totals: response.data.totals,
        menuItems: response.data.menuItems,
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "addRound");
    }
  }

  // ==================== TENDERS (PAGOS) ====================

  // Obtener tenders disponibles para el centro de ingresos
  async getTenders() {
    try {
      console.log("💳 Obteniendo tenders disponibles en Symphony...");

      const response = await this.axiosInstance.get(
        "/api/v1/tenders/collection",
      );

      console.log(`✅ ${response.data.items?.length || 0} tenders encontrados`);

      return {
        success: true,
        tenders: response.data.items || [],
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "getTenders");
    }
  }

  // Aplicar pago a un check existente (para cerrar el check)
  async applyTender(posOrderId, tenderData) {
    try {
      console.log(`💳 Aplicando pago a check ${posOrderId} en Symphony...`);

      const tenderId = tenderData.tender_id || this.settings.tender_ref;
      if (!tenderId) {
        throw new Error("tender_id es requerido para aplicar pago");
      }

      const tenderPayload = {
        tenders: [
          {
            tenderId: parseInt(tenderId, 10),
            total: tenderData.amount || 0, // 0 = pago completo
          },
        ],
      };

      const response = await this.axiosInstance.post(
        `/api/v1/checks/${posOrderId}/tenders`,
        tenderPayload,
      );

      console.log(
        `✅ Pago aplicado. Check ${posOrderId} status: ${response.data.header?.status}`,
      );

      return {
        success: true,
        posOrderId: response.data.header.checkRef,
        status: response.data.header.status,
        totals: response.data.totals,
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "applyTender");
    }
  }

  // Cerrar check aplicando tender configurado
  async closeOrder(posOrderId) {
    // Si hay tender_ref configurado, intentar cerrar con pago
    if (this.settings.tender_ref) {
      console.log(
        `🔒 Cerrando check ${posOrderId} con tender ${this.settings.tender_ref}...`,
      );
      return this.applyTender(posOrderId, { amount: 0 });
    }

    // Si no hay tender configurado, solo retornar estado
    console.log(
      `⚠️ No hay tender_ref configurado. Check ${posOrderId} permanece abierto.`,
    );
    return this.getOrderStatus(posOrderId);
  }

  // ==================== CHECKS (CONSULTA) ====================

  // Obtener checks abiertos de una mesa específica
  async getChecksByTable(tableNumber, options = {}) {
    try {
      console.log(`🔍 Buscando checks abiertos para mesa ${tableNumber}...`);

      const params = {
        tableName: String(tableNumber),
        includeClosed: options.includeClosed || false,
      };

      // Filtros opcionales
      if (options.checkEmployeeRef) {
        params.checkEmployeeRef = options.checkEmployeeRef;
      }
      if (options.orderTypeRef) {
        params.orderTypeRef = options.orderTypeRef;
      }
      if (options.sinceTime) {
        params.sinceTime = options.sinceTime;
      }

      const response = await this.axiosInstance.get("/api/v1/checks", { params });

      const checks = response.data.items || [];
      console.log(`✅ ${checks.length} check(s) encontrado(s) para mesa ${tableNumber}`);

      return {
        success: true,
        checks: checks.map((check) => ({
          checkRef: check.header.checkRef,
          checkNumber: check.header.checkNumber,
          tableName: check.header.tableName,
          status: check.header.status,
          preparationStatus: check.header.preparationStatus,
          guestCount: check.header.guestCount,
          checkName: check.header.checkName,
          totals: check.totals,
          menuItems: check.menuItems || [],
          rawResponse: check,
        })),
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "getChecksByTable");
    }
  }

  // Obtener un check abierto de una mesa (el primero si hay varios)
  async getOpenCheckByTable(tableNumber) {
    try {
      const result = await this.getChecksByTable(tableNumber, { includeClosed: false });

      if (!result.success || result.checks.length === 0) {
        return {
          success: false,
          error: `No hay checks abiertos para mesa ${tableNumber}`,
        };
      }

      // Retornar el primer check abierto
      const check = result.checks[0];
      console.log(`✅ Check abierto encontrado: ${check.checkRef} (${check.checkNumber})`);

      return {
        success: true,
        check,
      };
    } catch (error) {
      throw this.handleError(error, "getOpenCheckByTable");
    }
  }

  // ==================== MENÚ ====================

  // Obtener menú completo del revenue center (v2 API)
  async getMenu(menuId = "1") {
    try {
      console.log(`📋 Obteniendo menú ${menuId} de Symphony...`);

      const response = await this.axiosInstance.get(`/api/v2/menus/${menuId}`);

      const menu = response.data;

      console.log(
        `✅ Menú obtenido: ${menu.menuItems?.length || 0} items, ${menu.comboMealsV2?.length || 0} combos`,
      );

      return {
        success: true,
        menuId: menu.menuId,
        name: menu.name,
        description: menu.description,
        menuItems: menu.menuItems || [],
        comboMeals: menu.comboMealsV2 || [],
        comboGroups: menu.comboGroupsV2 || [],
        condimentItems: menu.condimentItems || [],
        condimentGroups: menu.condimentGroups || [],
        familyGroups: menu.familyGroups || [],
        allergens: menu.allergens || [],
        rawResponse: menu,
      };
    } catch (error) {
      throw this.handleError(error, "getMenu");
    }
  }

  // Obtener lista de menús disponibles
  async getMenuList() {
    try {
      console.log("📋 Obteniendo lista de menús de Symphony...");

      const response = await this.axiosInstance.get("/api/v2/menus");

      console.log(`✅ ${response.data.items?.length || 0} menús encontrados`);

      return {
        success: true,
        menus: response.data.items || [],
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "getMenuList");
    }
  }

  // Obtener el estado de una orden en Symphony
  async getOrderStatus(posOrderId) {
    try {
      console.log(
        `📊 Consultando estado de orden ${posOrderId} en Symphony...`,
      );

      const response = await this.axiosInstance.get(
        `/api/v1/checks/${posOrderId}`,
      );

      return {
        success: true,
        posOrderId: response.data.header.checkRef,
        checkNumber: response.data.header.checkNumber,
        status: response.data.header.status,
        preparationStatus: response.data.header.preparationStatus,
        totals: response.data.totals,
        menuItems: response.data.menuItems,
        rawResponse: response.data,
      };
    } catch (error) {
      throw this.handleError(error, "getOrderStatus");
    }
  }
}

module.exports = SymphonyPOSService;
