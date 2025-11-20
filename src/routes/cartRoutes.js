const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");

router.post("/", cartController.addToCart);
router.get("/", cartController.getCart);
router.get("/totals", cartController.getCartTotals);
router.post("/migrate", cartController.migrateGuestCart);
router.patch("/items/:cart_item_id", cartController.updateCartItemQuantity);
router.delete("/items/:cart_item_id", cartController.removeFromCart);
router.delete("/", cartController.clearCart);

router.use((error, req, res, next) => {
  console.error("❌ Cart route error:", error);

  // Errores de validación de PostgreSQL
  if (error.code === "23505") {
    // unique_violation
    return res.status(400).json({
      success: false,
      error: "duplicate_error",
      message: "Item already exists in cart",
    });
  }

  if (error.code === "23503") {
    // foreign_key_violation
    return res.status(400).json({
      success: false,
      error: "reference_error",
      message: "Referenced menu item does not exist",
    });
  }

  if (error.code === "23514") {
    // check_violation
    return res.status(400).json({
      success: false,
      error: "validation_error",
      message: "Invalid data provided",
    });
  }

  // Error genérico
  res.status(500).json({
    success: false,
    error: "server_error",
    message: "An unexpected error occurred",
  });
});

module.exports = router;
