const tableService = require('../services/tableService');

class TableController {
  // GET /api/tables/:tableNumber - Obtener información de una mesa
  async getTableInfo(req, res) {
    try {
      const { tableNumber } = req.params;
      
      if (!tableNumber || isNaN(tableNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Valid table number is required'
        });
      }

      const result = await tableService.getTableInfo(parseInt(tableNumber));
      
      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: `Table ${tableNumber} not found`
        });
      }

      res.status(200).json({
        success: true,
        data: result.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // GET /api/tables/:tableNumber/orders - Obtener todas las órdenes de una mesa
  async getTableOrders(req, res) {
    try {
      const { tableNumber } = req.params;
      
      if (!tableNumber || isNaN(tableNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Valid table number is required'
        });
      }

      const result = await tableService.getTableOrders(parseInt(tableNumber));
      
      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch orders',
          error: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // POST /api/tables/:tableNumber/orders - Crear nueva orden
  async createUserOrder(req, res) {
    try {
      const { tableNumber } = req.params;
      const { user_name, items, total_items, total_price } = req.body;

      // Validaciones
      if (!tableNumber || isNaN(tableNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Valid table number is required'
        });
      }

      if (!user_name || !items || !total_items || total_price === undefined) {
        return res.status(400).json({
          success: false,
          message: 'user_name, items, total_items, and total_price are required'
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'items must be a non-empty array'
        });
      }

      const orderData = {
        table_number: parseInt(tableNumber),
        user_name: user_name.trim(),
        items,
        total_items: parseInt(total_items),
        total_price: parseFloat(total_price)
      };

      const result = await tableService.createUserOrder(orderData);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to create order',
          error: result.error
        });
      }

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: result.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // PUT /api/orders/:orderId/status - Actualizar estado de orden
  async updateOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const result = await tableService.updateOrderStatus(orderId, status);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to update order status',
          error: result.error
        });
      }

      res.status(200).json({
        success: true,
        message: 'Order status updated successfully',
        data: result.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // GET /api/tables/:tableNumber/stats - Obtener estadísticas de una mesa
  async getTableStats(req, res) {
    try {
      const { tableNumber } = req.params;
      
      if (!tableNumber || isNaN(tableNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Valid table number is required'
        });
      }

      const result = await tableService.getTableStats(parseInt(tableNumber));
      
      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch table stats',
          error: result.error
        });
      }

      res.status(200).json({
        success: true,
        data: result.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // DELETE /api/tables/:tableNumber/orders - Limpiar órdenes de una mesa
  async clearTableOrders(req, res) {
    try {
      const { tableNumber } = req.params;
      
      if (!tableNumber || isNaN(tableNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Valid table number is required'
        });
      }

      const result = await tableService.clearTableOrders(parseInt(tableNumber));
      
      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to clear orders',
          error: result.error
        });
      }

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = new TableController();