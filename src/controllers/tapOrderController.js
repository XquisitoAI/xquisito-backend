const tapOrderService = require('../services/tapOrderService');

class TapOrderController {
  // POST /api/tap-orders - Crear nueva orden de tap
  async createTapOrder(req, res) {
    try {
      const { table_id, customer_name, customer_phone } = req.body;

      // Validaciones básicas
      if (!table_id) {
        return res.status(400).json({
          success: false,
          message: 'Table ID is required'
        });
      }

      // Obtener clerk_user_id del middleware de autenticación si existe
      const clerk_user_id = req.user?.id || null;

      const orderData = {
        table_id,
        clerk_user_id,
        customer_name,
        customer_phone
      };

      const result = await tapOrderService.createTapOrder(orderData);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Tap order created successfully'
      });
    } catch (error) {
      console.error('Error creating tap order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // GET /api/tap-orders/restaurant/:restaurantId/table/:tableNumber - Obtener orden existente (NO crear)
  async getOrderByTable(req, res) {
    try {
      const { restaurantId, tableNumber } = req.params;

      if (!restaurantId || !tableNumber) {
        return res.status(400).json({
          success: false,
          message: 'Restaurant ID and table number are required'
        });
      }

      const result = await tapOrderService.getTapOrderByTable(
        parseInt(restaurantId),
        parseInt(tableNumber)
      );

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        hasOrder: result.hasOrder,
        message: result.hasOrder ? 'Active order found' : 'No active order for this table'
      });
    } catch (error) {
      console.error('Error getting tap order by table:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // GET /api/tap-orders/:id - Obtener orden por ID
  async getTapOrderById(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      const result = await tapOrderService.getTapOrderById(id);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: 'Tap order not found'
        });
      }

      res.status(200).json({
        success: true,
        data: result.data
      });
    } catch (error) {
      console.error('Error getting tap order by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // PATCH /api/tap-orders/:id/customer - Actualizar información del cliente
  async updateCustomerInfo(req, res) {
    try {
      const { id } = req.params;
      const { customer_name, customer_phone } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      // Obtener clerk_user_id del middleware si el usuario se registra
      const clerk_user_id = req.user?.id || null;

      const customerData = {
        customer_name,
        customer_phone,
        clerk_user_id
      };

      const result = await tapOrderService.updateCustomerInfo(id, customerData);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Customer information updated successfully'
      });
    } catch (error) {
      console.error('Error updating customer info:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // PATCH /api/tap-orders/:id/status - Actualizar estado de la orden
  async updateOrderStatus(req, res) {
    console.log(req.params);
    
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!id || !status) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and status are required'
        });
      }

      const result = await tapOrderService.updateOrderStatus(id, status);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Order status updated successfully'
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // PATCH /api/tap-orders/:id/payment-status - Actualizar estado de pago
  async updatePaymentStatus(req, res) {
    try {
      const { id } = req.params;
      const { payment_status } = req.body;

      if (!id || !payment_status) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and payment status are required'
        });
      }

      const result = await tapOrderService.updatePaymentStatus(id, payment_status);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Payment status updated successfully'
      });
    } catch (error) {
      console.error('Error updating payment status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // POST /api/tap-orders/:id/calculate-total - Recalcular total de la orden
  async calculateTotal(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      const result = await tapOrderService.updateTotal(id);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        total: result.total,
        message: 'Total calculated successfully'
      });
    } catch (error) {
      console.error('Error calculating total:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // GET /api/tap-orders/table/:tableId/history - Obtener historial de una mesa
  async getTableOrderHistory(req, res) {
    try {
      const { tableId } = req.params;
      const { limit = 10 } = req.query;

      if (!tableId) {
        return res.status(400).json({
          success: false,
          message: 'Table ID is required'
        });
      }

      const result = await tapOrderService.getTableOrderHistory(tableId, parseInt(limit));

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
      console.error('Error getting table history:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // DELETE /api/tap-orders/:id - Abandonar orden
  async abandonOrder(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      const result = await tapOrderService.abandonOrder(id);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Order abandoned successfully'
      });
    } catch (error) {
      console.error('Error abandoning order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new TapOrderController();