const supabase = require("../config/supabase");
const POSFactory = require("../services/pos/POSFactory");

class POSController {
  // Obtener tenders disponibles por branch_id
  async getTendersByBranch(req, res) {
    try {
      const { branchId } = req.params;

      // Buscar integración POS activa para esta sucursal
      const { data: integration, error } = await supabase
        .from("pos_integrations")
        .select(`
          *,
          pos_providers(code, name)
        `)
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
        .select(`
          id,
          branch_id,
          is_active,
          settings,
          last_sync_at,
          sync_status,
          sync_error,
          created_at,
          pos_providers(code, name)
        `)
        .eq("branch_id", branchId)
        .single();

      if (error || !integration) {
        return res.status(404).json({
          success: false,
          error: "No hay integración POS para esta sucursal",
        });
      }

      res.json({
        success: true,
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

  // Obtener lista de menús disponibles
  async getMenuList(req, res) {
    try {
      const { branchId } = req.params;

      const { data: integration, error } = await supabase
        .from("pos_integrations")
        .select(`
          *,
          pos_providers(code, name)
        `)
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
        .select(`
          *,
          pos_providers(code, name)
        `)
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
        .select(`
          *,
          pos_providers(code, name)
        `)
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
}

module.exports = new POSController();
