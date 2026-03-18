const reviewsService = require("../services/reviewsService");

// Crear una review
const createReview = async (req, res) => {
  try {
    const { menu_item_id, rating, user_id = null, guest_id = null } = req.body;

    /* console.log("🔍 Creating review:", {
      menu_item_id,
      rating,
      user_id,
      guest_id,
    });
*/
    if (!menu_item_id || !rating) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "menu_item_id and rating are required",
      });
    }

    // Obtener reviewer_identifier del body
    let reviewerIdentifier = user_id || guest_id;

    const review = await reviewsService.createReview({
      menu_item_id,
      reviewer_identifier: reviewerIdentifier,
      rating,
    });

    //console.log("✅ Review created successfully:", review.id);
    res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("❌ Error creating review:", error.message);

    if (error.message.includes("already reviewed")) {
      return res.status(400).json({
        success: false,
        error: "duplicate_error",
        message: "You have already reviewed this item",
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener reviews de un platillo
const getReviewsByMenuItem = async (req, res) => {
  try {
    const menuItemId = parseInt(req.params.menuItemId);

    //console.log("🔍 Getting reviews for menu item:", menuItemId);

    const reviews = await reviewsService.getReviewsByMenuItem(menuItemId);

    //console.log(`✅ Found ${reviews.length} reviews`);
    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error("❌ Error getting reviews:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener estadísticas de un platillo
const getMenuItemStats = async (req, res) => {
  try {
    const menuItemId = parseInt(req.params.menuItemId);

    //console.log("🔍 Getting stats for menu item:", menuItemId);

    const stats = await reviewsService.getMenuItemStats(menuItemId);

    //console.log("✅ Stats retrieved successfully");
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ Error getting stats:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener review del usuario actual
const getMyReview = async (req, res) => {
  try {
    const menuItemId = parseInt(req.params.menuItemId);

    // Obtener reviewer_identifier de query params
    const reviewerIdentifier = req.params.id;

    /*console.log("🔍 Query params received:", {
      reviewerIdentifier,
      menuItemId,
    });*/

    // Si no hay identifier, devolver null (no hay review del usuario)
    if (!reviewerIdentifier) {
      //console.log("⚠️ No reviewer identifier in query params, returning null");
      return res.json({
        success: true,
        data: null,
      });
    }

    //console.log("🔍 Getting user review:", { menuItemId, reviewerIdentifier });

    const review = await reviewsService.getUserReviewForMenuItem(
      menuItemId,
      reviewerIdentifier,
    );

    //console.log("✅ User review retrieved");
    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("❌ Error getting user review:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Actualizar una review
const updateReview = async (req, res) => {
  try {
    const reviewId = parseInt(req.params.reviewId);
    const { rating, user_id = null, guest_id = null } = req.body;

    // console.log("🔍 Updating review:", { reviewId, rating, user_id, guest_id });

    if (!rating) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "rating is required",
      });
    }

    // Obtener reviewer_identifier del body - solo convertir a string si no es null
    const reviewerIdentifier = user_id || guest_id;

    if (!reviewerIdentifier) {
      return res.status(401).json({
        success: false,
        error: "authentication_error",
        message: "No reviewer identifier found. Cannot update review.",
      });
    }

    //console.log(reviewId, reviewerIdentifier, rating);

    const review = await reviewsService.updateReview(
      reviewId,
      reviewerIdentifier,
      rating,
    );

    //console.log("✅ Review updated successfully");
    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("❌ Error updating review:", error.message);

    if (
      error.message.includes("not found") ||
      error.message.includes("unauthorized")
    ) {
      return res.status(404).json({
        success: false,
        error: "not_found_error",
        message: "Review not found or unauthorized",
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

module.exports = {
  createReview,
  getReviewsByMenuItem,
  getMenuItemStats,
  getMyReview,
  updateReview,
};
