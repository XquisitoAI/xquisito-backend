const express = require("express");
const restaurantController = require("../controllers/restaurantController");
const reviewController = require("../controllers/reviewController");
const restaurantReviewController = require("../controllers/restaurantReviewController");

const router = express.Router();

// GET /api/restaurants - Obtener todos los restaurantes activos
router.get("/", restaurantController.getAllRestaurants);

// GET /api/restaurants/:id - Obtener información de un restaurante específico
router.get("/:id", restaurantController.getRestaurantById);

// GET /api/restaurants/:id/menu - Obtener menú completo de un restaurante
router.get("/:id/menu", restaurantController.getRestaurantMenu);

// GET /api/restaurants/:id/complete - Obtener restaurante con su menú completo (todo en una petición)
router.get("/:id/complete", restaurantController.getRestaurantWithMenu);

// GET /api/restaurants/:id/branches - Obtener sucursales de un restaurante
router.get("/:id/branches", restaurantController.getRestaurantBranches);

// GET /api/restaurants/:restaurantId/validate - Validar restaurante (Pick & Go)
router.get("/:restaurantId/validate", restaurantController.validateRestaurant);

// GET /api/restaurants/:restaurantId/branches/:branchNumber/validate - Validar restaurante y sucursal (Pick & Go)
router.get("/:restaurantId/branches/:branchNumber/validate", restaurantController.validateRestaurantAndBranch);

// GET /api/restaurants/:restaurantId/:branchNumber/:tableNumber/validate - Validar restaurante, sucursal y mesa (Tap Order & Pay)
router.get("/:restaurantId/:branchNumber/:tableNumber/validate", restaurantController.validateRestaurantBranchTable);

// GET /api/restaurants/:id/:branchNumber/menu - Obtener menú de un restaurante específico por sucursal
router.get("/:id/:branchNumber/menu", restaurantController.getRestaurantMenuByBranch);

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

// ===============================================
// RUTAS DE REVIEWS DE RESTAURANTES
// ===============================================

// POST /api/restaurants/restaurant-reviews - Crear una review de restaurante
router.post(
  "/restaurant-reviews",
  restaurantReviewController.createRestaurantReview
);

// GET /api/restaurants/:restaurantId/restaurant-reviews - Obtener reviews de un restaurante
router.get(
  "/:restaurantId/restaurant-reviews",
  restaurantReviewController.getReviewsByRestaurant
);

// GET /api/restaurants/:restaurantId/restaurant-reviews/stats - Obtener estadísticas de un restaurante
router.get(
  "/:restaurantId/restaurant-reviews/stats",
  restaurantReviewController.getRestaurantStats
);

module.exports = router;
