const cartService = require("../services/cartService");

// Agregar item al carrito
const addToCart = async (req, res) => {
  try {
    const {
      clerk_user_id,
      guest_id,
      menu_item_id,
      quantity,
      custom_fields,
      extra_price,
      restaurant_id,
    } = req.body;

    console.log("🛒 Adding item to cart:", {
      clerk_user_id,
      guest_id,
      menu_item_id,
      quantity,
      restaurant_id,
    });

    // Validaciones
    if (!clerk_user_id && !guest_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Either clerk_user_id or guest_id is required",
      });
    }

    if (clerk_user_id && guest_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Cannot provide both clerk_user_id and guest_id",
      });
    }

    if (!menu_item_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "menu_item_id is required",
      });
    }

    const userId = { clerk_user_id, guest_id };
    const cartItemId = await cartService.addToCart(
      userId,
      menu_item_id,
      quantity || 1,
      custom_fields || [],
      extra_price || 0,
      restaurant_id || null
    );

    console.log("✅ Item added to cart successfully:", cartItemId);
    res.status(200).json({
      success: true,
      data: {
        cart_item_id: cartItemId,
      },
    });
  } catch (error) {
    console.error("❌ Error adding to cart:", error.message);

    if (error.message.includes("no disponible")) {
      return res.status(400).json({
        success: false,
        error: "item_not_available",
        message: "Menu item is not available",
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener carrito del usuario
const getCart = async (req, res) => {
  try {
    const { clerk_user_id, guest_id, restaurant_id } = req.query;

    console.log("🛒 Getting cart:", { clerk_user_id, guest_id, restaurant_id });

    // Validaciones
    if (!clerk_user_id && !guest_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Either clerk_user_id or guest_id is required",
      });
    }

    const userId = { clerk_user_id, guest_id };
    const cart = await cartService.getCart(userId, restaurant_id || null);

    console.log(`✅ Cart retrieved: ${cart.items.length} items`);
    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("❌ Error getting cart:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Actualizar cantidad de un item
const updateCartItemQuantity = async (req, res) => {
  try {
    const { cart_item_id } = req.params;
    const { quantity } = req.body;

    console.log("🛒 Updating cart item quantity:", { cart_item_id, quantity });

    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Valid quantity is required",
      });
    }

    await cartService.updateCartItemQuantity(cart_item_id, quantity);

    console.log("✅ Cart item quantity updated successfully");
    res.json({
      success: true,
      message:
        quantity === 0
          ? "Item removed from cart"
          : "Quantity updated successfully",
    });
  } catch (error) {
    console.error("❌ Error updating cart item quantity:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Eliminar item del carrito
const removeFromCart = async (req, res) => {
  try {
    const { cart_item_id } = req.params;

    console.log("🛒 Removing item from cart:", cart_item_id);

    await cartService.removeFromCart(cart_item_id);

    console.log("✅ Item removed from cart successfully");
    res.json({
      success: true,
      message: "Item removed from cart successfully",
    });
  } catch (error) {
    console.error("❌ Error removing from cart:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Limpiar carrito completo
const clearCart = async (req, res) => {
  try {
    const { clerk_user_id, guest_id, restaurant_id } = req.body;

    console.log("🛒 Clearing cart:", { clerk_user_id, guest_id, restaurant_id });

    // Validaciones
    if (!clerk_user_id && !guest_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Either clerk_user_id or guest_id is required",
      });
    }

    const userId = { clerk_user_id, guest_id };
    await cartService.clearCart(userId, restaurant_id || null);

    console.log("✅ Cart cleared successfully");
    res.json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("❌ Error clearing cart:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener solo totales del carrito (rápido)
const getCartTotals = async (req, res) => {
  try {
    const { clerk_user_id, guest_id, restaurant_id } = req.query;

    console.log("🛒 Getting cart totals:", { clerk_user_id, guest_id, restaurant_id });

    // Validaciones
    if (!clerk_user_id && !guest_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Either clerk_user_id or guest_id is required",
      });
    }

    const userId = { clerk_user_id, guest_id };
    const totals = await cartService.getCartTotals(userId, restaurant_id || null);

    console.log("✅ Cart totals retrieved");
    res.json({
      success: true,
      data: totals,
    });
  } catch (error) {
    console.error("❌ Error getting cart totals:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Migrar carrito de invitado a usuario autenticado
const migrateGuestCart = async (req, res) => {
  try {
    const { guest_id, clerk_user_id, restaurant_id } = req.body;

    console.log("🔄 Migrating guest cart to user:", { guest_id, clerk_user_id, restaurant_id });

    // Validaciones
    if (!guest_id || !clerk_user_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Both guest_id and clerk_user_id are required",
      });
    }

    const result = await cartService.migrateGuestCartToUser(
      guest_id,
      clerk_user_id,
      restaurant_id || null
    );

    console.log("✅ Cart migrated successfully:", result);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error migrating cart:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

module.exports = {
  addToCart,
  getCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
  getCartTotals,
  migrateGuestCart,
};
