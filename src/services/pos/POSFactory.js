const SymphonyPOSService = require("./SymphonyPOSService");
const SoftRestaurantPOSService = require("./SoftRestaurantPOSService");

class POSFactory {
  // Crear una instancia del servicio POS apropiado
  static createPOSService(integration, providerCode) {
    if (!integration) {
      throw new Error("Integration object is required");
    }

    if (!providerCode) {
      throw new Error("Provider code is required");
    }

    console.log(`Creating POS service for provider: ${providerCode}`);

    switch (providerCode.toLowerCase()) {
      case "symphony":
        return new SymphonyPOSService(integration);

      case "soft_restaurant":
        return new SoftRestaurantPOSService(integration);

      default:
        throw new Error(
          `Unknown POS provider: ${providerCode}. Available providers: symphony, soft_restaurant`,
        );
    }
  }

  // Verificar si un proveedor está soportado
  static isProviderSupported(providerCode) {
    const supportedProviders = ["symphony", "soft_restaurant"];
    return supportedProviders.includes(providerCode.toLowerCase());
  }

  // Obtener lista de proveedores soportados
  static getSupportedProviders() {
    return ["symphony", "soft_restaurant"];
  }
}

module.exports = POSFactory;
