const supabase = require('../config/supabase');
const tapOrderService = require('./tapOrderService');

class TapDishOrderService {
  // Crear dish order para tap order existente
  async createDishOrder(tap_order_id, dishData) {
    try {
      const {
        item,
        quantity = 1,
        price,
        images = [],
        custom_fields = null,
        extra_price = 0
      } = dishData;

      // Usar función SQL para agregar platillo a tap order existente
      const { data, error } = await supabase
        .rpc('add_dish_to_existing_tap_order', {
          p_tap_order_id: tap_order_id,
          p_item: item,
          p_price: price,
          p_quantity: quantity,
          p_images: images,
          p_custom_fields: custom_fields,
          p_extra_price: extra_price
        });

      if (error) throw error;

      return {
        success: true,
        data: {
          dish_order_id: data.dish_order_id,
          tap_order_id: data.tap_order_id,
          table_id: data.table_id,
          item: data.item,
          quantity: data.quantity,
          price: data.price
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Crear orden Y primer dish order (para el flujo de primer item)
  async createOrderWithFirstDish(restaurant_id, branch_number, table_number, dishData, customerData = {}) {
    try {
      // Usar función SQL que crea tap_order + primer dish en una transacción
      const result = await tapOrderService.createTapOrderWithFirstDish(
        restaurant_id,
        branch_number,
        table_number,
        dishData,
        customerData
      );

      if (!result.success) {
        return result;
      }

      return {
        success: true,
        data: result.data,
        isNew: result.isNew
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener todos los dish orders de un tap order
  async getDishOrdersByTapOrder(tap_order_id) {
    try {
      const { data, error } = await supabase
        .from('dish_order')
        .select('*')
        .eq('tap_order_id', tap_order_id);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar dish order
  async updateDishOrder(dish_order_id, updateData) {
    try {
      const allowedFields = ['quantity', 'status', 'payment_status', 'custom_fields', 'extra_price'];
      const filteredData = {};

      Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key)) {
          filteredData[key] = updateData[key];
        }
      });

      const { data, error } = await supabase
        .from('dish_order')
        .update(filteredData)
        .eq('id', dish_order_id)
        .select()
        .single();

      if (error) throw error;

      // Si hay tap_order_id, recalcular el total
      if (data.tap_order_id) {
        await tapOrderService.updateTotal(data.tap_order_id);
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Eliminar dish order
  async deleteDishOrder(dish_order_id) {
    try {
      // Primero obtener el dish order para saber el tap_order_id
      const { data: dishOrder, error: fetchError } = await supabase
        .from('dish_order')
        .select('tap_order_id')
        .eq('id', dish_order_id)
        .single();

      if (fetchError) throw fetchError;

      // Eliminar el dish order
      const { error } = await supabase
        .from('dish_order')
        .delete()
        .eq('id', dish_order_id);

      if (error) throw error;

      // Recalcular el total del tap order si existe
      if (dishOrder.tap_order_id) {
        await tapOrderService.updateTotal(dishOrder.tap_order_id);
      }

      return { success: true, message: 'Dish order deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar cantidad de un dish order
  async updateQuantity(dish_order_id, quantity) {
    try {
      if (quantity <= 0) {
        // Si la cantidad es 0 o negativa, eliminar el dish order
        return await this.deleteDishOrder(dish_order_id);
      }

      return await this.updateDishOrder(dish_order_id, { quantity });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Marcar dish order como pagado
  async markAsPaid(dish_order_id) {
    try {
      return await this.updateDishOrder(dish_order_id, {
        payment_status: 'paid'
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Actualizar estado de preparación
  async updateStatus(dish_order_id, status) {
    try {
      const validStatuses = ['pending', 'cooking', 'delivered'];
      if (!validStatuses.includes(status)) {
        return { success: false, error: 'Invalid status' };
      }

      return await this.updateDishOrder(dish_order_id, { status });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Obtener resumen de dish orders por estado
  async getDishOrdersSummary(tap_order_id) {
    try {
      const { data, error } = await supabase
        .from('dish_order')
        .select('status, payment_status, quantity, price, extra_price')
        .eq('tap_order_id', tap_order_id);

      if (error) throw error;

      const summary = {
        total_items: 0,
        total_amount: 0,
        by_status: {
          pending: 0,
          cooking: 0,
          delivered: 0
        },
        by_payment: {
          not_paid: 0,
          paid: 0
        }
      };

      data.forEach(dish => {
        const dishTotal = (dish.price + (dish.extra_price || 0)) * dish.quantity;
        summary.total_items += dish.quantity;
        summary.total_amount += dishTotal;
        summary.by_status[dish.status] += dish.quantity;
        summary.by_payment[dish.payment_status] += dish.quantity;
      });

      return { success: true, data: summary };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Agregar múltiples dish orders de una vez (carrito)
  async addMultipleDishOrders(tap_order_id, dishOrders) {
    try {
      const dishOrdersToInsert = dishOrders.map(dish => ({
        user_order_id: null,
        tap_order_id,
        item: dish.item,
        quantity: dish.quantity || 1,
        price: dish.price,
        status: 'pending',
        payment_status: 'not_paid',
        images: dish.images || [],
        custom_fields: dish.custom_fields || null,
        extra_price: dish.extra_price || 0
      }));

      const { data, error } = await supabase
        .from('dish_order')
        .insert(dishOrdersToInsert)
        .select();

      if (error) throw error;

      // Recalcular el total del tap order
      await tapOrderService.updateTotal(tap_order_id);

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TapDishOrderService();