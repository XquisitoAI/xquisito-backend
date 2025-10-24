const tapDishOrderService = require('../services/tapDishOrderService');

// Helper function para calcular extra_price desde custom_fields
// customFields estructura: Array<{ fieldId: string, fieldName: string, selectedOptions: Array<{ optionId: string, optionName: string, price: number }> }>
function calculateExtraPriceFromCustomFields(customFields) {
  if (!Array.isArray(customFields)) return 0;

  return customFields.reduce((total, field) => {
    // Validar que el field tiene la estructura correcta
    if (!field || !Array.isArray(field.selectedOptions)) return total;

    const fieldTotal = field.selectedOptions.reduce((fieldSum, option) => {
      // Validar que option tiene price válido
      if (!option || typeof option.price !== 'number') return fieldSum;
      return fieldSum + option.price;
    }, 0);

    return total + fieldTotal;
  }, 0);
}

class TapDishOrderController {
  // POST /api/tap-orders/restaurant/:restaurantId/table/:tableNumber/dishes - Crear orden y primer dish
  async createOrderWithFirstDish(req, res) {
    try {
      const { restaurantId, tableNumber } = req.params;
      const dishData = req.body;

      if (!restaurantId || !tableNumber) {
        return res.status(400).json({
          success: false,
          message: 'Restaurant ID and table number are required'
        });
      }

      // Validaciones básicas del dish
      if (!dishData.item || !dishData.price) {
        return res.status(400).json({
          success: false,
          message: 'Item and price are required'
        });
      }

      // Validar y procesar campos opcionales
      if (dishData.images && !Array.isArray(dishData.images)) {
        return res.status(400).json({
          success: false,
          message: 'Images must be an array'
        });
      }

      // Validar estructura de custom_fields
      if (dishData.custom_fields && !Array.isArray(dishData.custom_fields)) {
        return res.status(400).json({
          success: false,
          message: 'Custom fields must be an array'
        });
      }

      // Calcular extra_price desde custom_fields si no se proporciona explícitamente
      let extraPrice = 0;
      if (dishData.custom_fields) {
        extraPrice = calculateExtraPriceFromCustomFields(dishData.custom_fields);
      }

      // Si se proporciona extra_price explícito, usarlo en su lugar
      if (dishData.extra_price !== undefined) {
        if (isNaN(parseFloat(dishData.extra_price))) {
          return res.status(400).json({
            success: false,
            message: 'Extra price must be a valid number'
          });
        }
        extraPrice = parseFloat(dishData.extra_price);
      }

      // Agregar el extra_price calculado a dishData
      dishData.extra_price = extraPrice;

      // Obtener datos del cliente si está autenticado
      const customerData = {
        clerk_user_id: req.user?.id || null,
        customer_name: dishData.customer_name || null,
        customer_phone: dishData.customer_phone || null,
        customer_email: dishData.customer_email || null
      };

      const result = await tapDishOrderService.createOrderWithFirstDish(
        parseInt(restaurantId),
        parseInt(tableNumber),
        dishData,
        customerData
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(201).json({
        success: true,
        data: result.data,
        isNew: result.isNew,
        message: 'Order created with first dish successfully'
      });
    } catch (error) {
      console.error('Error creating order with first dish:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // POST /api/tap-orders/:tapOrderId/dishes - Agregar dish order
  async createDishOrder(req, res) {
    try {
      const { tapOrderId } = req.params;
      const dishData = req.body;

      // Validaciones básicas
      if (!dishData.item || !dishData.price) {
        return res.status(400).json({
          success: false,
          message: 'Item and price are required'
        });
      }

      // Validar y procesar campos opcionales
      if (dishData.images && !Array.isArray(dishData.images)) {
        return res.status(400).json({
          success: false,
          message: 'Images must be an array'
        });
      }

      // Validar estructura de custom_fields
      if (dishData.custom_fields && !Array.isArray(dishData.custom_fields)) {
        return res.status(400).json({
          success: false,
          message: 'Custom fields must be an array'
        });
      }

      // Calcular extra_price desde custom_fields si no se proporciona explícitamente
      let extraPrice = 0;
      if (dishData.custom_fields) {
        extraPrice = calculateExtraPriceFromCustomFields(dishData.custom_fields);
      }

      // Si se proporciona extra_price explícito, usarlo en su lugar
      if (dishData.extra_price !== undefined) {
        if (isNaN(parseFloat(dishData.extra_price))) {
          return res.status(400).json({
            success: false,
            message: 'Extra price must be a valid number'
          });
        }
        extraPrice = parseFloat(dishData.extra_price);
      }

      // Agregar el extra_price calculado a dishData
      dishData.extra_price = extraPrice;

      const result = await tapDishOrderService.createDishOrder(tapOrderId, dishData);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Dish order created successfully'
      });
    } catch (error) {
      console.error('Error creating dish order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // POST /api/tap-orders/:tapOrderId/dishes/bulk - Agregar múltiples dish orders
  async createMultipleDishOrders(req, res) {
    try {
      const { tapOrderId } = req.params;
      const { dishes } = req.body;

      if (!Array.isArray(dishes) || dishes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Dishes array is required and must not be empty'
        });
      }

      // Validar cada dish
      for (const dish of dishes) {
        if (!dish.item || !dish.price) {
          return res.status(400).json({
            success: false,
            message: 'Each dish must have item and price'
          });
        }
      }

      const result = await tapDishOrderService.addMultipleDishOrders(tapOrderId, dishes);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Dish orders created successfully'
      });
    } catch (error) {
      console.error('Error creating multiple dish orders:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // GET /api/tap-orders/:tapOrderId/dishes - Obtener todos los dish orders
  async getDishOrders(req, res) {
    try {
      const { tapOrderId } = req.params;

      const result = await tapDishOrderService.getDishOrdersByTapOrder(tapOrderId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data
      });
    } catch (error) {
      console.error('Error getting dish orders:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // PATCH /api/dish-orders/:dishOrderId - Actualizar dish order
  async updateDishOrder(req, res) {
    try {
      const { dishOrderId } = req.params;
      const updateData = req.body;

      const result = await tapDishOrderService.updateDishOrder(dishOrderId, updateData);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Dish order updated successfully'
      });
    } catch (error) {
      console.error('Error updating dish order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // PATCH /api/dish-orders/:dishOrderId/quantity - Actualizar cantidad
  async updateQuantity(req, res) {
    try {
      const { dishOrderId } = req.params;
      const { quantity } = req.body;

      if (quantity === undefined || quantity < 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid quantity is required'
        });
      }

      const result = await tapDishOrderService.updateQuantity(dishOrderId, quantity);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Quantity updated successfully'
      });
    } catch (error) {
      console.error('Error updating quantity:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // PATCH /api/dish-orders/:dishOrderId/status - Actualizar estado
  async updateStatus(req, res) {
    try {
      const { dishOrderId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const result = await tapDishOrderService.updateStatus(dishOrderId, status);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Status updated successfully'
      });
    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // POST /api/dish-orders/:dishOrderId/mark-paid - Marcar como pagado
  async markAsPaid(req, res) {
    try {
      const { dishOrderId } = req.params;

      const result = await tapDishOrderService.markAsPaid(dishOrderId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Dish order marked as paid'
      });
    } catch (error) {
      console.error('Error marking as paid:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // DELETE /api/dish-orders/:dishOrderId - Eliminar dish order
  async deleteDishOrder(req, res) {
    try {
      const { dishOrderId } = req.params;

      const result = await tapDishOrderService.deleteDishOrder(dishOrderId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Error deleting dish order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // GET /api/tap-orders/:tapOrderId/summary - Obtener resumen
  async getDishOrdersSummary(req, res) {
    try {
      const { tapOrderId } = req.params;

      const result = await tapDishOrderService.getDishOrdersSummary(tapOrderId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data
      });
    } catch (error) {
      console.error('Error getting summary:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new TapDishOrderController();