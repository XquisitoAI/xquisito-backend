const SymphonyPOSService = require("./SymphonyPOSService");
// const WansoftPOSService = require("./WansoftPOSService");
// const SoftRestPOSService = require("./SoftRestPOSService");

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

      // case "wansoft":
      //   return new WansoftPOSService(integration);
      //
      // case "softrest":
      //   return new SoftRestPOSService(integration);

      default:
        throw new Error(
          `Unknown POS provider: ${providerCode}. Available providers: symphony`,
        );
    }
  }

  // Verificar si un proveedor está soportado
  static isProviderSupported(providerCode) {
    const supportedProviders = [
      "symphony",
      // "wansoft",
      // "softrest",
    ];

    return supportedProviders.includes(providerCode.toLowerCase());
  }

  // Obtener lista de proveedores soportados
  static getSupportedProviders() {
    return [
      "symphony",
      // Agregar más según se implementen
    ];
  }
}

module.exports = POSFactory;
