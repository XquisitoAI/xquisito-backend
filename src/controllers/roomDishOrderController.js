const roomOrderService = require("../services/roomOrderService");
const kitchenService = require("../services/kitchenService");
const socketEmitter = require("../services/socketEmitter");
const {
  emitPrintJob,
  emitPrintJobForRoomOrder,
} = require("../services/printJobService");

// Crear orden con primer platillo
exports.createOrderWithFirstDish = async (req, res) => {
  try {
    const { restaurantId, branchNumber, roomNumber } = req.params;
    const {
      user_id,
      item_name,
      quantity,
      price,
      extra_price = 0,
      customer_name,
      customer_phone,
      images = [],
      custom_fields = {},
      menu_item_id = null,
    } = req.body;

    // Validaciones
    if (!item_name || !quantity || !price) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: item_name, quantity, price",
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than 0",
      });
    }

    if (price < 0) {
      return res.status(400).json({
        success: false,
        message: "Price cannot be negative",
      });
    }

    const result = await roomOrderService.createOrderWithFirstDish({
      restaurantId,
      branchNumber,
      roomNumber,
      userId: user_id,
      itemName: item_name,
      quantity,
      price,
      extraPrice: extra_price,
      customerName: customer_name,
      customerPhone: customer_phone,
      images,
      customFields: custom_fields,
      menuItemId: menu_item_id,
    });

    // result es un JSON con room_order_id, dish_order_id, etc.
    // Obtener la orden completa usando room_order_id
    const order = await roomOrderService.getRoomOrderById(result.room_order_id);

    // Imprimir en xquisito-crew (fire-and-forget)
    // skipAgent: true → syncOrder dispara el print al agente con folio SR al momento del pago
    emitPrintJob({
      restaurantId: parseInt(restaurantId),
      branchNumber: parseInt(branchNumber),
      items: [
        {
          name: item_name,
          quantity,
          menu_item_id: menu_item_id,
          custom_fields: custom_fields ?? null,
        },
      ],
      identifier: `Habitación ${roomNumber}`,
      orderedBy: customer_name || null,
      skipAgent: true,
    });

    res.status(201).json({
      success: true,
      data: order,
      result: result,
      message: "Dish order created successfully",
    });
  } catch (error) {
    console.error("Error creating dish order:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Agregar platillo a orden existente
exports.addDishToOrder = async (req, res) => {
  try {
    const { roomOrderId } = req.params;
    const {
      item_name,
      quantity,
      price,
      extra_price = 0,
      images = [],
      custom_fields = {},
      menu_item_id = null,
    } = req.body;

    // Validaciones
    if (!item_name || !quantity || !price) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: item_name, quantity, price",
      });
    }

    const dish = await roomOrderService.addDishToOrder(roomOrderId, {
      itemName: item_name,
      quantity,
      price,
      extraPrice: extra_price,
      images,
      customFields: custom_fields,
      menuItemId: menu_item_id,
    });

    // Imprimir en xquisito-crew (fire-and-forget)
    emitPrintJobForRoomOrder(roomOrderId, [
      { name: item_name, quantity, menu_item_id: menu_item_id },
    ]);

    res.status(201).json({
      success: true,
      data: dish,
      message: "Dish added to order successfully",
    });
  } catch (error) {
    console.error("Error adding dish to order:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Marcar platillo como pagado
exports.markAsPaid = async (req, res) => {
  try {
    const { dishOrderId } = req.params;

    const updated = await roomOrderService.markDishAsPaid(dishOrderId);

    res.json({
      success: true,
      data: updated,
      message: "Dish order marked as paid",
    });
  } catch (error) {
    console.error("Error marking dish as paid:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Actualizar estado de un platillo (para cocina)
exports.updateDishStatus = async (req, res) => {
  try {
    const { dishOrderId } = req.params;
    const { status } = req.body;

    if (
      !status ||
      !["pending", "in_progress", "ready", "delivered"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Must be: pending, in_progress, ready, or delivered",
      });
    }

    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const { data, error } = await supabase
      .from("dish_order")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", dishOrderId)
      .select()
      .single();

    if (error) throw error;

    // Notificar a todos los Crew del restaurante
    try {
      const restaurantId = await kitchenService.getRestaurantIdForUser(
        req.auth.userId,
      );
      socketEmitter.emitKitchenDishStatusChanged(
        restaurantId,
        dishOrderId,
        status,
      );
    } catch (_) {}

    res.json({
      success: true,
      data,
      message: "Dish status updated successfully",
    });
  } catch (error) {
    console.error("Error updating dish status:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
