const supabase = require("../config/supabase");
const POSFactory = require("../services/pos/POSFactory");
const agentConnectionManager = require("../socket/agentConnectionManager");
const POSMenuSyncService = require("../services/pos/POSMenuSyncService");
const crypto = require("crypto");

// Función auxiliar para generar sync_token único
function generateSyncToken() {
  const randomBytes = crypto.randomBytes(18); // 18 bytes = 24 caracteres en base64url
  const randomString = randomBytes.toString("base64url").substring(0, 24);
  return `xqai_pos_${randomString}`;
}

class POSController {
  // Obtener tenders disponibles por branch_id
  async getTendersByBranch(req, res) {
    try {
      const { branchId } = req.params;

      // Buscar integración POS activa para esta sucursal
      const { data: integration, error } = await supabase
        .from("pos_integrations")
        .select(
          `
          *,
          pos_providers(code, name)
        `,
        )
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (error || !integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS activa para esta sucursal",
        });
      }

      // Crear instancia del servicio POS
      const posService = POSFactory.create(integration.pos_providers.code, {
        credentials: integration.credentials,
        settings: integration.settings,
        endpoints: integration.endpoints,
      });

      // Verificar que el servicio tenga el método getTenders
      if (typeof posService.getTenders !== "function") {
        return res.status(400).json({
          success: false,
          error: `El proveedor ${integration.pos_providers.name} no soporta consulta de tenders`,
        });
      }

      // Obtener tenders
      const result = await posService.getTenders();

      res.json({
        success: true,
        provider: integration.pos_providers.name,
        branch_id: branchId,
        tenders: result.tenders,
      });
    } catch (error) {
      console.error("Error obteniendo tenders:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener integración POS por branch_id
  async getIntegrationByBranch(req, res) {
    try {
      const { branchId } = req.params;

      const { data: integration, error } = await supabase
        .from("pos_integrations")
        .select(
          `
          id,
          branch_id,
          provider_id,
          is_active,
          credentials,
          settings,
          last_sync_at,
          sync_status,
          sync_error,
          created_at,
          pos_providers(id, code, name)
        `,
        )
        .eq("branch_id", branchId)
        .single();

      // Si no hay integración, devolver respuesta exitosa indicando que no existe
      if (error && error.code === "PGRST116") {
        return res.json({
          success: true,
          hasIntegration: false,
          integration: null,
        });
      }

      // Si hay otro tipo de error, devolver error 500
      if (error) {
        throw error;
      }

      res.json({
        success: true,
        hasIntegration: true,
        integration,
      });
    } catch (error) {
      console.error("Error obteniendo integración:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener historial de sincronización por branch
  async getSyncHistory(req, res) {
    try {
      const { branchId } = req.params;
      const { limit = 20 } = req.query;

      // Primero obtener la integración
      const { data: integration, error: intError } = await supabase
        .from("pos_integrations")
        .select("id")
        .eq("branch_id", branchId)
        .single();

      if (intError || !integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS para esta sucursal",
        });
      }

      // Obtener historial de sincronización
      const { data: syncHistory, error } = await supabase
        .from("pos_order_sync")
        .select("*")
        .eq("integration_id", integration.id)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit, 10));

      if (error) throw error;

      res.json({
        success: true,
        branch_id: branchId,
        sync_history: syncHistory,
      });
    } catch (error) {
      console.error("Error obteniendo historial:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Listar proveedores POS disponibles
  async getProviders(req, res) {
    try {
      const { data: providers, error } = await supabase
        .from("pos_providers")
        .select("id, code, name, sync_mode, is_active")
        .order("name");

      if (error) throw error;

      res.json({
        success: true,
        providers,
      });
    } catch (error) {
      console.error("Error obteniendo proveedores:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener todas las integraciones POS (para cargar en batch)
  async getAllIntegrations(req, res) {
    try {
      const { data: integrations, error } = await supabase
        .from("pos_integrations")
        .select(
          `
          id,
          branch_id,
          provider_id,
          is_active,
          pos_providers(id, code, name)
        `,
        )
        .eq("is_active", true);

      if (error) throw error;

      // Convertir a un mapa { branchId: providerId }
      const integrationsMap = {};
      (integrations || []).forEach((integration) => {
        integrationsMap[integration.branch_id] = integration.provider_id;
      });

      res.json({
        success: true,
        integrations: integrationsMap,
      });
    } catch (error) {
      console.error("Error obteniendo integraciones:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener lista de menús disponibles
  async getMenuList(req, res) {
    try {
      const { branchId } = req.params;

      const { data: integration, error } = await supabase
        .from("pos_integrations")
        .select(
          `
          *,
          pos_providers(code, name)
        `,
        )
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (error || !integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS activa para esta sucursal",
        });
      }

      const posService = POSFactory.create(integration.pos_providers.code, {
        credentials: integration.credentials,
        settings: integration.settings,
        endpoints: integration.endpoints,
      });

      if (typeof posService.getMenuList !== "function") {
        return res.status(400).json({
          success: false,
          error: `El proveedor ${integration.pos_providers.name} no soporta consulta de menús`,
        });
      }

      const result = await posService.getMenuList();

      res.json({
        success: true,
        provider: integration.pos_providers.name,
        branch_id: branchId,
        menus: result.menus,
      });
    } catch (error) {
      console.error("Error obteniendo lista de menús:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener menú completo por ID
  async getMenu(req, res) {
    try {
      const { branchId, menuId } = req.params;

      const { data: integration, error } = await supabase
        .from("pos_integrations")
        .select(
          `
          *,
          pos_providers(code, name)
        `,
        )
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (error || !integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS activa para esta sucursal",
        });
      }

      const posService = POSFactory.create(integration.pos_providers.code, {
        credentials: integration.credentials,
        settings: integration.settings,
        endpoints: integration.endpoints,
      });

      if (typeof posService.getMenu !== "function") {
        return res.status(400).json({
          success: false,
          error: `El proveedor ${integration.pos_providers.name} no soporta consulta de menú`,
        });
      }

      const result = await posService.getMenu(menuId);

      res.json({
        success: true,
        provider: integration.pos_providers.name,
        branch_id: branchId,
        menu: {
          menuId: result.menuId,
          name: result.name,
          description: result.description,
          menuItems: result.menuItems,
          comboMeals: result.comboMeals,
          comboGroups: result.comboGroups,
          condimentItems: result.condimentItems,
          condimentGroups: result.condimentGroups,
          familyGroups: result.familyGroups,
          allergens: result.allergens,
        },
      });
    } catch (error) {
      console.error("Error obteniendo menú:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Test de conexión POS
  async testConnection(req, res) {
    try {
      const { branchId } = req.params;

      // Buscar integración
      const { data: integration, error } = await supabase
        .from("pos_integrations")
        .select(
          `
          *,
          pos_providers(code, name)
        `,
        )
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (error || !integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS activa para esta sucursal",
        });
      }

      // Crear instancia y probar conexión
      const posService = POSFactory.create(integration.pos_providers.code, {
        credentials: integration.credentials,
        settings: integration.settings,
        endpoints: integration.endpoints,
      });

      // Intentar autenticar y obtener tenders como prueba
      const result = await posService.getTenders();

      // Actualizar estado de la integración
      await supabase
        .from("pos_integrations")
        .update({
          sync_status: "connected",
          sync_error: null,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      res.json({
        success: true,
        provider: integration.pos_providers.name,
        message: "Conexión exitosa",
        tenders_count: result.tenders?.length || 0,
      });
    } catch (error) {
      console.error("Error en test de conexión:", error);

      // Actualizar estado de error
      if (req.params.branchId) {
        await supabase
          .from("pos_integrations")
          .update({
            sync_status: "error",
            sync_error: error.message,
          })
          .eq("branch_id", req.params.branchId);
      }

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // TEST: Ver agentes conectados
  async getConnectedAgents(req, res) {
    try {
      const agents = agentConnectionManager.getConnectedAgents();

      res.json({
        success: true,
        count: agents.length,
        agents: agents.map((a) => ({
          branchId: a.branchId,
          socketId: a.socketId,
          connectedAt: a.connectedAt,
          lastPing: a.lastPing,
        })),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // TEST: Enviar orden de prueba a agente SR
  async testAgentOrder(req, res) {
    try {
      const { branchId } = req.params;

      // Verificar si hay agente conectado
      const isConnected = agentConnectionManager.isConnected(branchId);

      if (!isConnected) {
        return res.status(400).json({
          success: false,
          error: `No hay agente conectado para branch ${branchId}`,
          hint: "Ejecuta el agente con: node test-connection.js",
        });
      }

      // Enviar orden de prueba
      const testOrder = {
        id: `test-${Date.now()}`,
        tableNumber: req.body.tableNumber || "TEST",
        orderType: "dine_in",
        personas: 1,
        items: req.body.items || [
          {
            pos_item_id: "001",
            name: "Item de Prueba",
            quantity: 1,
            price: 100.0,
          },
        ],
      };

      console.log(`📤 Enviando orden de prueba a branch ${branchId}...`);

      const response = await agentConnectionManager.sendAndWait(
        branchId,
        "new_order",
        testOrder,
        15000, // 15 segundos timeout
      );

      res.json({
        success: true,
        message: "Orden enviada y procesada por el agente",
        order: testOrder,
        response,
      });
    } catch (error) {
      console.error("Error en test de orden:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==================== SYNC DE MENÚ ====================

  // Obtener estado del agente para una sucursal
  async getAgentStatus(req, res) {
    try {
      const { branchId } = req.params;
      const status = await POSMenuSyncService.getAgentStatus(branchId);

      res.json({
        success: true,
        branch_id: branchId,
        ...status,
      });
    } catch (error) {
      console.error("Error obteniendo estado del agente:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Sincronizar menú bidireccional (PULL + PUSH)
  async syncMenu(req, res) {
    try {
      const { branchId } = req.params;

      console.log(`🔄 Iniciando sync de menú para branch ${branchId}...`);

      const result = await POSMenuSyncService.syncMenu(branchId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          errors: result.errors,
        });
      }

      res.json({
        success: true,
        message: "Sincronización completada",
        pulled: result.pulled,
        pushed: result.pushed,
      });
    } catch (error) {
      console.error("Error en sync de menú:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener mapeos de secciones
  async getSectionMappings(req, res) {
    try {
      const { branchId } = req.params;

      // Obtener integración
      const { data: integration } = await supabase
        .from("pos_integrations")
        .select("id")
        .eq("branch_id", branchId)
        .single();

      if (!integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS para esta sucursal",
        });
      }

      // Obtener mapeos
      const { data: mappings, error } = await supabase
        .from("pos_section_mapping")
        .select(
          `
          *,
          menu_sections(id, name, display_order)
        `,
        )
        .eq("integration_id", integration.id);

      if (error) throw error;

      res.json({
        success: true,
        branch_id: branchId,
        mappings,
      });
    } catch (error) {
      console.error("Error obteniendo mapeos de secciones:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Obtener mapeos de items
  async getItemMappings(req, res) {
    try {
      const { branchId } = req.params;

      // Obtener integración
      const { data: integration } = await supabase
        .from("pos_integrations")
        .select("id")
        .eq("branch_id", branchId)
        .single();

      if (!integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS para esta sucursal",
        });
      }

      // Obtener mapeos
      const { data: mappings, error } = await supabase
        .from("pos_menu_mapping")
        .select(
          `
          *,
          menu_items(id, name, price, section_id)
        `,
        )
        .eq("integration_id", integration.id);

      if (error) throw error;

      res.json({
        success: true,
        branch_id: branchId,
        mappings,
      });
    } catch (error) {
      console.error("Error obteniendo mapeos de items:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==================== GESTIÓN DE INTEGRACIÓN ====================

  // Crear o actualizar integración POS para una sucursal
  async setIntegration(req, res) {
    try {
      const { branchId } = req.params;
      const { providerId } = req.body;

      if (!providerId) {
        return res.status(400).json({
          success: false,
          error: "El providerId es requerido",
        });
      }

      // Verificar que el provider existe y está activo
      const { data: provider, error: providerError } = await supabase
        .from("pos_providers")
        .select(
          "id, code, name, credentials_schema, settings_schema, endpoint_schema",
        )
        .eq("id", providerId)
        .eq("is_active", true)
        .single();

      if (providerError || !provider) {
        return res.status(404).json({
          success: false,
          error: "Proveedor POS no encontrado o inactivo",
        });
      }

      // Verificar si ya existe una integración para esta sucursal
      const { data: existingIntegration } = await supabase
        .from("pos_integrations")
        .select("id")
        .eq("branch_id", branchId)
        .single();

      let integration;

      if (existingIntegration) {
        // Actualizar integración existente (no modificar el token)
        const { data, error } = await supabase
          .from("pos_integrations")
          .update({
            provider_id: providerId,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingIntegration.id)
          .select()
          .single();

        if (error) throw error;
        integration = data;
      } else {
        // Crear nueva integración
        let credentials = {};

        // Solo generar token para Soft Restaurant
        if (provider.code === "soft_restaurant") {
          const syncToken = generateSyncToken();
          credentials = {
            sync_token: syncToken,
          };
        }

        const { data, error } = await supabase
          .from("pos_integrations")
          .insert({
            branch_id: branchId,
            provider_id: providerId,
            credentials: credentials,
            settings: {},
            endpoints: {},
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        integration = data;

        if (provider.code === "soft_restaurant" && credentials.sync_token) {
          console.log(
            `🔑 Token generado para integración ${integration.id}: ${credentials.sync_token}`,
          );
        }
      }

      res.json({
        success: true,
        message: existingIntegration
          ? "Integración actualizada"
          : "Integración creada",
        integration: {
          id: integration.id,
          branchId: integration.branch_id,
          providerId: integration.provider_id,
          providerName: provider.name,
          isActive: integration.is_active,
          syncToken: integration.credentials?.sync_token || null,
        },
      });
    } catch (error) {
      console.error("Error configurando integración POS:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Eliminar integración POS de una sucursal
  async deleteIntegration(req, res) {
    try {
      const { branchId } = req.params;

      // Verificar si existe la integración
      const { data: existingIntegration } = await supabase
        .from("pos_integrations")
        .select("id")
        .eq("branch_id", branchId)
        .single();

      if (!existingIntegration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS para esta sucursal",
        });
      }

      // Eliminar la integración
      const { error } = await supabase
        .from("pos_integrations")
        .delete()
        .eq("id", existingIntegration.id);

      if (error) throw error;

      res.json({
        success: true,
        message: "Integración POS eliminada",
      });
    } catch (error) {
      console.error("Error eliminando integración POS:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new POSController();
