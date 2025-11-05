const superAdminService = require("../services/superAdminService");

class SuperAdminController {
  // Obtiene todas las estadísticas del super admin
  // GET /api/super-admin/stats
  // Query params: start_date, end_date, restaurant_id, service, gender, age_range
  async getSuperAdminStats(req, res) {
    try {
      // Configurar fechas por defecto (últimos 30 días)
      const defaultEndDate = new Date();
      const defaultStartDate = new Date();
      defaultStartDate.setDate(defaultStartDate.getDate() - 30);

      const filters = {
        start_date: req.query.start_date || defaultStartDate.toISOString(),
        end_date: req.query.end_date || defaultEndDate.toISOString(),
        restaurant_id: req.query.restaurant_id
          ? parseInt(req.query.restaurant_id)
          : null,
        service: req.query.service || "todos",
        gender: req.query.gender || "todos",
        age_range: req.query.age_range || "todos",
      };

      // Log de filtros aplicados
      console.log("=== SUPER ADMIN STATS REQUEST ===");
      console.log("Filters applied:", JSON.stringify(filters, null, 2));
      console.log("Query params received:", JSON.stringify(req.query, null, 2));

      // Validar servicio
      const validServices = ["todos", "flex-bill", "tap-order-pay"];
      if (!validServices.includes(filters.service)) {
        return res.status(400).json({
          success: false,
          error:
            "Servicio inválido. Debe ser: todos, flex-bill, o tap-order-pay",
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
  // GET /api/super-admin/restaurants
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
}

module.exports = new SuperAdminController();
