const roomOrderService = require("../services/roomOrderService");

// Obtener orden activa de una habitación
exports.getOrderByRoom = async (req, res) => {
  try {
    const { restaurantId, branchNumber, roomNumber } = req.params;

    const order = await roomOrderService.getActiveRoomOrder(
      restaurantId,
      branchNumber,
      roomNumber,
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "No active order found for this room",
      });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error("Error getting room order:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Obtener orden por ID
exports.getRoomOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await roomOrderService.getRoomOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Room order not found",
      });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error("Error getting room order by ID:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Actualizar estado de pago
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status } = req.body;

    if (
      !payment_status ||
      !["pending", "paid", "failed"].includes(payment_status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment_status. Must be: pending, paid, or failed",
      });
    }

    const updated = await roomOrderService.updatePaymentStatus(
      id,
      payment_status,
    );

    res.json({
      success: true,
      data: updated,
      message: "Payment status updated successfully",
    });
  } catch (error) {
    console.error("Error updating payment status:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Actualizar estado de orden
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["pending", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: pending, completed, or cancelled",
      });
    }

    const updated = await roomOrderService.updateOrderStatus(id, status);

    res.json({
      success: true,
      data: updated,
      message: "Order status updated successfully",
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Obtener orden activa por clientId y restaurantId
exports.getActiveOrderByUser = async (req, res) => {
  try {
    const { clientId, restaurantId } = req.params;

    if (!clientId) {
      return res
        .status(400)
        .json({ success: false, message: "Client ID is required" });
    }

    if (!restaurantId) {
      return res
        .status(400)
        .json({ success: false, message: "Restaurant ID is required" });
    }

    const result = await roomOrderService.getActiveOrderByClientId(
      clientId,
      parseInt(restaurantId),
    );

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.status(200).json({
      success: true,
      hasActiveOrder: result.hasActiveOrder,
      data: result.data,
    });
  } catch (error) {
    console.error("Error getting active order by user:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Recalcular total de orden
exports.recalculateTotal = async (req, res) => {
  try {
    const { id } = req.params;

    const newTotal = await roomOrderService.recalculateTotal(id);

    res.json({
      success: true,
      data: { total_amount: newTotal },
      message: "Total recalculated successfully",
    });
  } catch (error) {
    console.error("Error recalculating total:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
