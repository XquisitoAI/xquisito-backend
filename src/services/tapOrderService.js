const supabase = require('../config/supabase');

class TapOrderService {
  // Ya no necesitamos generar QR tokens para el flujo de URL directa

  // Crear nueva sesión de tap order
  async createTapOrder(orderData) {
    try {
      const {
        table_id,
        clerk_user_id = null,
        customer_name = null,
        customer_phone = null,
        customer_email = null
      } = orderData;

      // Validar que la mesa existe
      const { data: table, error: tableError } = await supabase
        .from('tables')
        .select('id, table_number, status')
        .eq('id', table_id)
        .single();

      if (tableError || !table) {
        return { success: false, error: 'Table not found' };
      }

      // Ya no necesitamos qr_token

      // Crear el tap order
      const { data, error } = await supabase
        .from('tap_orders_and_pay')
        .insert({
          table_id,
          clerk_user_id,
          customer_name,
          customer_phone,
          customer_email,
          // qr_token ya no es necesario
          total_amount: 0,
          payment_status: 'pending',
          order_status: 'active'
        })
        .select(`
          *,
          tables(id, table_number, status)
        `)
        .single();

      if (error) throw error;

      return {
        success: true,
        data
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // SOLO buscar tap order existente por restaurant_id y table_number (NO auto-crear)
  async getTapOrderByTable(restaurant_id, table_number) {
    try {
      // Usar función SQL para verificar orden activa
      const { data, error } = await supabase
        .rpc('check_active_tap_order_by_table', {
          p_table_number: table_number,
          p_restaurant_id: restaurant_id
        });

      if (error) throw error;

      return {
        success: true,
        data: data.data || data.table_info,
        hasOrder: data.hasOrder,
        message: data.hasOrder ? 'Active order found' : 'No active order found for this table'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Crear tap order al agregar primer item con platillo
  async createTapOrderWithFirstDish(restaurant_id, table_number, dishData, customerData = {}) {
    try {
      const {
        item,
        price,
        quantity = 1,
        images = [],
        custom_fields = null,
        extra_price = 0
      } = dishData;

      // Usar función SQL para crear orden completa con primer platillo
      const { data, error } = await supabase
        .rpc('create_tap_order_with_first_dish', {
          p_table_number: table_number,
          p_restaurant_id: restaurant_id,
          p_item: item,
          p_price: price,
          p_quantity: quantity,
          p_customer_name: customerData.customer_name || null,
          p_customer_phone: customerData.customer_phone || null,
          p_customer_email: customerData.customer_email || null,
          p_clerk_user_id: customerData.clerk_user_id || null,
          p_images: images,
          p_custom_fields: custom_fields,
          p_extra_price: extra_price
        });

      if (error) throw error;

      // Obtener resumen completo de la orden creada
      const orderSummary = await this.getTapOrderById(data.tap_order_id);

      return {
        success: true,
        data: {
          ...orderSummary.data,
          action: data.action,
          dish_order_id: data.dish_order_id
        },
        isNew: data.action === 'new_order_created_with_first_dish'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener tap order por ID con resumen completo
  async getTapOrderById(id) {
    try {
      // Usar función SQL para obtener resumen completo
      const { data, error } = await supabase
        .rpc('get_tap_order_complete_summary', {
          p_tap_order_id: id
        });

      if (error) throw error;

      if (!data) {
        return { success: false, error: 'Tap order not found' };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar información del cliente
  async updateCustomerInfo(tap_order_id, customerData) {
    try {
      const { customer_name, customer_phone, customer_email, clerk_user_id } = customerData;

      const { data, error } = await supabase
        .from('tap_orders_and_pay')
        .update({
          customer_name,
          customer_phone,
          customer_email,
          clerk_user_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar estado de la orden
  async updateOrderStatus(tap_order_id, status) {
    try {
      const validStatuses = ['active', 'confirmed', 'preparing', 'completed', 'abandoned'];
      if (!validStatuses.includes(status)) {
        return { success: false, error: 'Invalid order status' };
      }

      const updateData = {
        order_status: status,
        updated_at: new Date().toISOString()
      };

      // Si se completa, agregar timestamp
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('tap_orders_and_pay')
        .update(updateData)
        .eq('id', tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar estado de pago
  async updatePaymentStatus(tap_order_id, payment_status) {
    try {
      const validStatuses = ['pending', 'paid'];
      if (!validStatuses.includes(payment_status)) {
        return { success: false, error: 'Invalid payment status' };
      }

      const { data, error } = await supabase
        .from('tap_orders_and_pay')
        .update({
          payment_status,
          updated_at: new Date().toISOString()
        })
        .eq('id', tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Calcular total y actualizar
  async updateTotal(tap_order_id) {
    try {
      // Obtener todos los dish_orders de este tap_order
      const { data: dishOrders, error: dishError } = await supabase
        .from('dish_order')
        .select('price, quantity, extra_price')
        .eq('tap_order_id', tap_order_id);

      if (dishError) throw dishError;

      // Calcular total
      const total = dishOrders.reduce((sum, dish) => {
        const dishTotal = (dish.price + (dish.extra_price || 0)) * dish.quantity;
        return sum + dishTotal;
      }, 0);

      // Actualizar el total en tap_orders_and_pay
      const { data, error } = await supabase
        .from('tap_orders_and_pay')
        .update({
          total_amount: total,
          updated_at: new Date().toISOString()
        })
        .eq('id', tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data, total };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener historial de órdenes de una mesa
  async getTableOrderHistory(table_id, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('tap_orders_and_pay')
        .select(`
          *,
          tables(table_number)
        `)
        .eq('table_id', table_id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Abandonar orden (cleanup)
  async abandonOrder(tap_order_id) {
    try {
      // Primero eliminar los dish_orders asociados
      await supabase
        .from('dish_order')
        .delete()
        .eq('tap_order_id', tap_order_id);

      // Luego marcar como abandonada
      const { data, error } = await supabase
        .from('tap_orders_and_pay')
        .update({
          order_status: 'abandoned',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', tap_order_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TapOrderService();