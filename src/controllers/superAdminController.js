const superAdminService = require("../services/superAdminService");

class SuperAdminController {
  // Obtiene todas las estadísticas del super admin
  // Query params: start_date, end_date, restaurant_id, service, gender, age_range
  async getSuperAdminStats(req, res) {
    try {
      // Fecha por defecto (últimos 30 días)
      const defaultEndDate = new Date();
      const defaultStartDate = new Date();
      defaultStartDate.setDate(defaultStartDate.getDate() - 30);

      // restaurant_id: puede ser un número único, un array de números, o 'todos'
      let restaurantId = "todos";
      if (req.query.restaurant_id) {
        if (Array.isArray(req.query.restaurant_id)) {
          // Si viene como array, convertir cada elemento a número
          restaurantId = req.query.restaurant_id.map((id) => parseInt(id));
        } else if (
          typeof req.query.restaurant_id === "string" &&
          req.query.restaurant_id.includes(",")
        ) {
          // Si viene como string separado por comas, convertir a array de números
          restaurantId = req.query.restaurant_id
            .split(",")
            .map((id) => parseInt(id.trim()));
        } else {
          // Si es un único valor, convertir a número
          restaurantId = parseInt(req.query.restaurant_id);
        }
      }

      const filters = {
        start_date: req.query.start_date || defaultStartDate.toISOString(),
        end_date: req.query.end_date || defaultEndDate.toISOString(),
        restaurant_id: restaurantId,
        service: req.query.service || "todos",
        gender: req.query.gender || "todos",
        age_range: req.query.age_range || "todos",
      };

      // Log de filtros aplicados
      console.log("=== SUPER ADMIN STATS REQUEST ===");
      console.log("Filters applied:", JSON.stringify(filters, null, 2));
      console.log("Query params received:", JSON.stringify(req.query, null, 2));

      // Validar servicio
      const validServices = ["todos", "flex-bill", "tap-order-pay", "pick-and-go"];
      if (!validServices.includes(filters.service)) {
        return res.status(400).json({
          success: false,
          error:
            "Servicio inválido. Debe ser: todos, flex-bill, tap-order-pay, o pick-and-go",
        });
      }

      // Validar género
      const validGenders = ["todos", "male", "female", "other"];
      if (!validGenders.includes(filters.gender)) {
        return res.status(400).json({
          success: false,
          error: "Género inválido. Debe ser: todos, male, female, o other",
        });
      }

      // Validar rango de edad
      const validAgeRanges = [
        "todos",
        "18-24",
        "25-34",
        "35-44",
        "45-54",
        "55+",
      ];
      if (!validAgeRanges.includes(filters.age_range)) {
        return res.status(400).json({
          success: false,
          error:
            "Rango de edad inválido. Debe ser: todos, 18-24, 25-34, 35-44, 45-54, 55+",
        });
      }

      // Validar fechas
      if (filters.start_date && filters.end_date) {
        const startDate = new Date(filters.start_date);
        const endDate = new Date(filters.end_date);

        if (startDate > endDate) {
          return res.status(400).json({
            success: false,
            error: "La fecha de inicio debe ser anterior a la fecha de fin",
          });
        }
      }

      const result = await superAdminService.getSuperAdminStats(filters);

      res.json({
        success: true,
        data: result.data,
        filters_applied: result.filters_applied,
        timestamp: result.timestamp,
      });
    } catch (error) {
      console.error("Error in getSuperAdminStats controller:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Obtiene todos los restaurantes del sistema
  async getAllRestaurants(req, res) {
    try {
      const result = await superAdminService.getAllRestaurants();

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in getAllRestaurants controller:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Obtiene datos temporales de volumen por servicio
  async getVolumeTimeline(req, res) {
    try {
      // restaurant_id: puede ser un número único, un array de números, o 'todos'
      let restaurantId = "todos";
      if (req.query.restaurant_id) {
        if (Array.isArray(req.query.restaurant_id)) {
          restaurantId = req.query.restaurant_id.map((id) => parseInt(id));
        } else if (
          typeof req.query.restaurant_id === "string" &&
          req.query.restaurant_id.includes(",")
        ) {
          restaurantId = req.query.restaurant_id
            .split(",")
            .map((id) => parseInt(id.trim()));
        } else {
          restaurantId = parseInt(req.query.restaurant_id);
        }
      }

      const filters = {
        view_type: req.query.view_type || "daily",
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        restaurant_id: restaurantId,
        service: req.query.service || "todos",
      };

      const result = await superAdminService.getVolumeTimeline(filters);

      res.json({
        success: true,
        data: result,
        filters_applied: filters,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in getVolumeTimeline controller:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Obtiene datos temporales de órdenes por servicio
  async getOrdersTimeline(req, res) {
    try {
      let restaurantId = "todos";
      if (req.query.restaurant_id) {
        if (Array.isArray(req.query.restaurant_id)) {
          restaurantId = req.query.restaurant_id.map((id) => parseInt(id));
        } else if (
          typeof req.query.restaurant_id === "string" &&
          req.query.restaurant_id.includes(",")
        ) {
          restaurantId = req.query.restaurant_id
            .split(",")
            .map((id) => parseInt(id.trim()));
        } else {
          restaurantId = parseInt(req.query.restaurant_id);
        }
      }

      const filters = {
        view_type: req.query.view_type || "daily",
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        restaurant_id: restaurantId,
        service: req.query.service || "todos",
      };

      const result = await superAdminService.getOrdersTimeline(filters);

      res.json({
        success: true,
        data: result,
        filters_applied: filters,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in getOrdersTimeline controller:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Obtiene datos temporales de transacciones por servicio
  async getTransactionsTimeline(req, res) {
    try {
      let restaurantId = "todos";
      if (req.query.restaurant_id) {
        if (Array.isArray(req.query.restaurant_id)) {
          restaurantId = req.query.restaurant_id.map((id) => parseInt(id));
        } else if (
          typeof req.query.restaurant_id === "string" &&
          req.query.restaurant_id.includes(",")
        ) {
          restaurantId = req.query.restaurant_id
            .split(",")
            .map((id) => parseInt(id.trim()));
        } else {
          restaurantId = parseInt(req.query.restaurant_id);
        }
      }

      const filters = {
        view_type: req.query.view_type || "daily",
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        restaurant_id: restaurantId,
        service: req.query.service || "todos",
      };

      const result = await superAdminService.getTransactionsTimeline(filters);

      res.json({
        success: true,
        data: result,
        filters_applied: filters,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in getTransactionsTimeline controller:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Obtiene datos temporales de métodos de pago
  async getPaymentMethodsTimeline(req, res) {
    try {
      let restaurantId = "todos";
      if (req.query.restaurant_id) {
        if (Array.isArray(req.query.restaurant_id)) {
          restaurantId = req.query.restaurant_id.map((id) => parseInt(id));
        } else if (
          typeof req.query.restaurant_id === "string" &&
          req.query.restaurant_id.includes(",")
        ) {
          restaurantId = req.query.restaurant_id
            .split(",")
            .map((id) => parseInt(id.trim()));
        } else {
          restaurantId = parseInt(req.query.restaurant_id);
        }
      }

      const filters = {
        view_type: req.query.view_type || "daily",
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        restaurant_id: restaurantId,
        service: req.query.service || "todos",
      };

      const result = await superAdminService.getPaymentMethodsTimeline(filters);

      res.json({
        success: true,
        data: result,
        filters_applied: filters,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in getPaymentMethodsTimeline controller:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

module.exports = new SuperAdminController();
