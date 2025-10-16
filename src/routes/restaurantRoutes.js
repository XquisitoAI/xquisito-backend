const express = require("express");
const restaurantController = require("../controllers/restaurantController");
const reviewController = require("../controllers/reviewController");

const router = express.Router();

// GET /api/restaurants - Obtener todos los restaurantes activos
router.get("/", restaurantController.getAllRestaurants);

// GET /api/restaurants/:id - Obtener información de un restaurante específico
router.get("/:id", restaurantController.getRestaurantById);

// GET /api/restaurants/:id/menu - Obtener menú completo de un restaurante
router.get("/:id/menu", restaurantController.getRestaurantMenu);

// GET /api/restaurants/:id/complete - Obtener restaurante con su menú completo (todo en una petición)
router.get("/:id/complete", restaurantController.getRestaurantWithMenu);

// ===============================================
// RUTAS DE REVIEWS
// ===============================================

// POST /api/restaurants/reviews - Crear una review
router.post("/reviews", reviewController.createReview);

// GET /api/restaurants/reviews/menu-item/:menuItemId - Obtener reviews de un platillo
router.get(
  "/reviews/menu-item/:menuItemId",
  reviewController.getReviewsByMenuItem
);

// GET /api/restaurants/reviews/menu-item/:menuItemId/stats - Obtener estadísticas de un platillo
router.get(
  "/reviews/menu-item/:menuItemId/stats",
  reviewController.getMenuItemStats
);

// GET /api/restaurants/reviews/menu-item/:menuItemId/my-review - Obtener review del usuario actual
router.get(
  "/reviews/menu-item/:menuItemId/my-review/:id",
  reviewController.getMyReview
);

// PATCH /api/restaurants/reviews/:reviewId - Actualizar una review
router.patch("/reviews/:reviewId", reviewController.updateReview);

module.exports = router;
