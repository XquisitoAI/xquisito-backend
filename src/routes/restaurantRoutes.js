const express = require("express");
const restaurantController = require("../controllers/restaurantController");

const router = express.Router();

// GET /api/restaurants - Obtener todos los restaurantes activos
router.get("/", restaurantController.getAllRestaurants);

// GET /api/restaurants/:id - Obtener información de un restaurante específico
router.get("/:id", restaurantController.getRestaurantById);

// GET /api/restaurants/:id/menu - Obtener menú completo de un restaurante
router.get("/:id/menu", restaurantController.getRestaurantMenu);

// GET /api/restaurants/:id/complete - Obtener restaurante con su menú completo (todo en una petición)
router.get("/:id/complete", restaurantController.getRestaurantWithMenu);

module.exports = router;
