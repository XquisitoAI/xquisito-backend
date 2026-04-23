const supabase = require("../config/supabase");
const { supabaseAdmin } = require("../config/supabaseAuth");

class PaymentProviderController {
  // GET /api/payment-providers
  // Lista todos los proveedores disponibles
  async getProviders(req, res) {
    try {
      const { data: providers, error } = await supabase
        .from("payment_providers")
        .select("id, code, name, is_active")
        .order("name");

      if (error) throw error;

      res.json({ success: true, providers });
    } catch (error) {
      console.error("Error obteniendo payment providers:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/payment-providers/client/:clientId
  // Proveedor activo del restaurante por client UUID
  async getClientProvider(req, res) {
    try {
      const { clientId } = req.params;

      const { data: integration, error } = await supabase
        .from("payment_integrations")
        .select(
          "id, client_id, is_active, settings, payment_providers(id, code, name, is_active)",
        )
        .eq("client_id", clientId)
        .single();

      if (error && error.code === "PGRST116") {
        // Sin integración configurada aún — devolver null sin error
        return res.json({ success: true, integration: null, provider: null });
      }

      if (error) throw error;

      res.json({
        success: true,
        integration,
        provider: integration?.payment_providers?.code || null,
      });
    } catch (error) {
      console.error("Error obteniendo provider del cliente:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // PUT /api/payment-providers/client/:clientId
  // Guardar o cambiar el proveedor activo del restaurante
  async setClientProvider(req, res) {
    try {
      const { clientId } = req.params;
      const { providerCode, settings = {} } = req.body;

      if (!providerCode) {
        return res.status(400).json({
          success: false,
          error: "providerCode es requerido",
        });
      }

      // Buscar el provider por code
      const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        .select("id, code, name, is_active")
        .eq("code", providerCode)
        .single();

      if (providerError || !provider) {
        return res.status(404).json({
          success: false,
          error: `Proveedor '${providerCode}' no encontrado`,
        });
      }

      if (!provider.is_active) {
        return res.status(400).json({
          success: false,
          error: `El proveedor '${provider.name}' no está disponible todavía`,
        });
      }

      // Upsert — un solo proveedor por cliente (requiere service role para bypass RLS)
      const { data: integration, error: upsertError } = await supabaseAdmin
        .from("payment_integrations")
        .upsert(
          {
            client_id: clientId,
            provider_id: provider.id,
            is_active: true,
            settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" },
        )
        .select("*, payment_providers(id, code, name)")
        .single();

      if (upsertError) throw upsertError;

      console.log(
        `✅ Proveedor de pago actualizado: cliente ${clientId} → ${providerCode}`,
      );

      res.json({ success: true, integration, provider: providerCode });
    } catch (error) {
      console.error("Error guardando provider del cliente:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/payment-providers/client/:clientId/settings
  // Devuelve las API keys del cliente (masked para secretKey)
  async getClientSettings(req, res) {
    try {
      const { clientId } = req.params;

      const { data: integration, error } = await supabaseAdmin
        .from("payment_integrations")
        .select("settings")
        .eq("client_id", clientId)
        .single();

      if (error && error.code === "PGRST116") {
        return res.json({ success: true, settings: null });
      }

      if (error) throw error;

      const settings = integration?.settings || {};

      // Mask secret key — solo mostrar últimos 4 chars
      const result = {
        public_key: settings.public_key || "",
        secret_key: settings.secret_key || "",
        environment: settings.environment || "sandbox",
      };

      res.json({ success: true, settings: result });
    } catch (error) {
      console.error("Error obteniendo settings del cliente:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // PUT /api/payment-providers/client/:clientId/settings
  // Guarda las API keys del cliente
  async saveClientSettings(req, res) {
    try {
      const { clientId } = req.params;
      const { settings } = req.body;

      if (!settings?.public_key || !settings?.secret_key) {
        return res.status(400).json({
          success: false,
          error: "public_key y secret_key son requeridos",
        });
      }

      // Obtener la integración existente
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("payment_integrations")
        .select("settings")
        .eq("client_id", clientId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError;

      const currentSettings = existing?.settings || {};

      const newSettings = {
        ...currentSettings,
        public_key: settings.public_key,
        secret_key: settings.secret_key,
        environment:
          settings.environment || currentSettings.environment || "sandbox",
      };

      const { error: updateError } = await supabaseAdmin
        .from("payment_integrations")
        .update({ settings: newSettings, updated_at: new Date().toISOString() })
        .eq("client_id", clientId);

      if (updateError) throw updateError;

      console.log(`✅ API keys actualizadas para cliente ${clientId}`);

      res.json({ success: true });
    } catch (error) {
      console.error("Error guardando settings del cliente:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/payment-providers/resolve/:restaurantId
  // Endpoint público para xquisito-flexbill — resuelve por restaurant_id (integer)
  async resolveByRestaurantId(req, res) {
    try {
      const { restaurantId } = req.params;
      const restaurantIdInt = parseInt(restaurantId, 10);

      if (isNaN(restaurantIdInt)) {
        return res
          .status(400)
          .json({ success: false, error: "restaurantId inválido" });
      }

      // Buscar el client_id a partir del restaurant_id vía branches
      const { data: branch, error: branchError } = await supabase
        .from("branches")
        .select("client_id")
        .eq("restaurant_id", restaurantIdInt)
        .limit(1)
        .single();

      if (branchError || !branch) {
        // Sin branch → sin configuración → fallback a ecartpay
        return res.json({ success: true, provider: "ecartpay" });
      }

      const { data: integration, error: integrationError } = await supabase
        .from("payment_integrations")
        .select("payment_providers(code)")
        .eq("client_id", branch.client_id)
        .eq("is_active", true)
        .single();

      if (integrationError && integrationError.code === "PGRST116") {
        // Sin integración configurada → ecartpay por defecto
        return res.json({ success: true, provider: "ecartpay" });
      }

      if (integrationError) throw integrationError;

      // Si el proveedor configurado no está activo, caer a ecartpay
      const providerCode = integration?.payment_providers?.code || "ecartpay";

      res.json({ success: true, provider: providerCode });
    } catch (error) {
      console.error("Error resolviendo provider por restaurantId:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new PaymentProviderController();
