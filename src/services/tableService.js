const supabase = require('../config/supabase');

class TableService {
  // Obtener información de una mesa específica
  async getTableInfo(tableNumber) {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('table_number', tableNumber)
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener todas las órdenes activas (no pagadas) de una mesa específica
  async getTableOrders(tableNumber) {
    try {
      const { data, error } = await supabase
        .from('user_orders')
        .select('*')
        .eq('table_number', tableNumber)
        .eq('payment_status', 'unpaid') // Solo órdenes con pago pendiente
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener TODAS las órdenes de una mesa (incluyendo pagadas) - para reportes/histórico
  async getAllTableOrders(tableNumber) {
    try {
      const { data, error } = await supabase
        .from('user_orders')
        .select('*')
        .eq('table_number', tableNumber)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Marcar órdenes como pagadas
  async markOrdersAsPaid(tableNumber, orderIds = null) {
    try {
      console.log('🔍 Backend markOrdersAsPaid called with:');
      console.log('   tableNumber:', tableNumber);
      console.log('   orderIds:', orderIds);
      console.log('   orderIds type:', typeof orderIds);
      console.log('   orderIds length:', orderIds ? orderIds.length : 'null');

      let query = supabase
        .from('user_orders')
        .update({
          paid_at: new Date().toISOString(),
          payment_status: 'paid',
          status: 'delivered' // Opcional: cambiar estado a entregado
        })
        .eq('table_number', tableNumber)
        .eq('payment_status', 'unpaid'); // Solo actualizar órdenes no pagadas

      // Si se especifican IDs específicos, filtrar por ellos
      if (orderIds && orderIds.length > 0) {
        console.log('🎯 Adding .in() filter for specific orderIds:', orderIds);
        query = query.in('id', orderIds);
      } else {
        console.log('🌍 No orderIds filter - will update ALL pending orders for table');
      }

      const { data, error } = await query.select();

      if (error) throw error;

      console.log(`✅ Backend: Marked ${data?.length || 0} orders as paid for table ${tableNumber}`);
      if (data && data.length > 0) {
        console.log('✅ Updated orders:', data.map(o => ({ id: o.id, user_name: o.user_name, payment_status: o.payment_status })));
      }

      return {
        success: true,
        data: data || [],
        count: data?.length || 0
      };
    } catch (error) {
      console.error('❌ Error marking orders as paid:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Crear una nueva orden de usuario
  async createUserOrder(orderData) {
    try {
      // Validar que la mesa existe
      const tableCheck = await this.getTableInfo(orderData.table_number);
      if (!tableCheck.success) {
        throw new Error(`Table ${orderData.table_number} does not exist`);
      }

      const { data, error } = await supabase
        .from('user_orders')
        .insert({
          table_number: orderData.table_number,
          user_name: orderData.user_name,
          items: orderData.items,
          total_items: orderData.total_items,
          total_price: orderData.total_price,
          status: 'pending',
          payment_status: 'unpaid'
        })
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar el estado de una orden
  async updateOrderStatus(orderId, status) {
    try {
      const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const { data, error } = await supabase
        .from('user_orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener estadísticas de una mesa
  async getTableStats(tableNumber) {
    try {
      const { data, error } = await supabase
        .from('user_orders')
        .select('total_items, total_price, status')
        .eq('table_number', tableNumber);
      
      if (error) throw error;

      const stats = {
        total_orders: data.length,
        total_items: data.reduce((sum, order) => sum + order.total_items, 0),
        total_amount: data.reduce((sum, order) => sum + parseFloat(order.total_price), 0),
        status_breakdown: data.reduce((acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {})
      };

      return { success: true, data: stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Limpiar órdenes de una mesa (útil para testing o reset)
  async clearTableOrders(tableNumber) {
    try {
      const { error } = await supabase
        .from('user_orders')
        .delete()
        .eq('table_number', tableNumber);
      
      if (error) throw error;
      return { success: true, message: `All orders cleared for table ${tableNumber}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener órdenes en tiempo real (para subscripciones)
  subscribeToTableOrders(tableNumber, callback) {
    const subscription = supabase
      .channel(`table_${tableNumber}_orders`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_orders',
          filter: `table_number=eq.${tableNumber}`
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }

  // Desuscribirse de updates en tiempo real
  unsubscribe(subscription) {
    if (subscription) {
      supabase.removeChannel(subscription);
    }
  }
}

module.exports = new TableService();