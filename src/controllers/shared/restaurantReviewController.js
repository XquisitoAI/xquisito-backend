const restaurantReviewsService = require("../../services/shared/restaurantReviewsService");

// Crear una review de restaurante
const createRestaurantReview = async (req, res) => {
  try {
    const { restaurant_id, rating } = req.body;

    console.log("🔍 Creating restaurant review:", {
      restaurant_id,
      rating,
    });

    if (!restaurant_id || !rating) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "restaurant_id and rating are required",
      });
    }

    const review = await restaurantReviewsService.createRestaurantReview({
      restaurant_id,
      rating,
    });

    console.log("✅ Restaurant review created successfully:", review.id);
    res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("❌ Error creating restaurant review:", error.message);

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener reviews de un restaurante
const getReviewsByRestaurant = async (req, res) => {
  try {
    const restaurantId = parseInt(req.params.restaurantId);

    console.log("🔍 Getting reviews for restaurant:", restaurantId);

    const reviews =
      await restaurantReviewsService.getReviewsByRestaurant(restaurantId);

    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error("❌ Error getting restaurant reviews:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener estadísticas de un restaurante
const getRestaurantStats = async (req, res) => {
  try {
    const restaurantId = parseInt(req.params.restaurantId);

    console.log("🔍 Getting stats for restaurant:", restaurantId);

    const stats =
      await restaurantReviewsService.getRestaurantStats(restaurantId);

    console.log("✅ Stats retrieved successfully");
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ Error getting restaurant stats:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

module.exports = {
  createRestaurantReview,
  getReviewsByRestaurant,
  getRestaurantStats,
};
