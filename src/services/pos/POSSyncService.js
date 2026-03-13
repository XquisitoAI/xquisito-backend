const POSFactory = require("./POSFactory");
const { supabaseAdmin } = require("../../config/supabaseAuth");

class POSSyncService {
  /**
   * Sincronizar una orden con el POS
   * Resultado de la sincronización o null si no hay POS
   */
  static async syncOrder(orderId, orderType) {
    try {
      console.log(
        `🔄 Intentando sincronizar orden ${orderId} - (${orderType})...`,
      );

      // 1. Obtener la orden local
      const order = await this.getLocalOrder(orderId, orderType);
      if (!order) {
        console.warn(`⚠️ Orden ${orderId} no encontrada en ${orderType}`);
        return null;
      }

      // 2. Verificar si la sucursal tiene POS integrado
      const integration = await this.getPOSIntegration(order);
      if (!integration) {
        console.log(`❌ Sucursal sin POS integrado, saltando sincronización`);
        return null;
      }

      // 3. Verificar que el proveedor esté activo
      if (!integration.is_active) {
        console.log(`❌ Integración POS está inactiva para esta sucursal`);
        return null;
      }

      // 4. Crear instancia del servicio POS
      const posService = POSFactory.createPOSService(
        integration,
        integration.provider_code,
      );

      // 5. Transformar orden al formato POS
      const posOrderData = await this.transformOrderToPOS(order, integration);

      // 6. Enviar a POS
      try {
        const posResponse = await posService.createOrder(posOrderData);

        // 7. Registrar sincronización exitosa
        await this.createOrderSync({
          integration_id: integration.id,
          local_order_id: orderId,
          local_order_type: orderType,
          pos_order_id: posResponse.posOrderId,
          pos_table_id: posResponse.posTableId,
          sync_status: "synced",
          sync_direction: "push",
          last_synced_at: new Date().toISOString(),
          response_payload: posResponse,
        });

        console.log(
          `✅ Orden sincronizada exitosamente con POS. ID: ${posResponse.posOrderId}`,
        );

        return {
          success: true,
          posOrderId: posResponse.posOrderId,
          provider: integration.provider_code,
        };
      } catch (error) {
        // 8. Registrar error de sincronización
        await this.createOrderSync({
          integration_id: integration.id,
          local_order_id: orderId,
          local_order_type: orderType,
          sync_status: "failed",
          sync_direction: "push",
          sync_error: error.message,
          request_payload: posOrderData,
        });

        // No lanzar error para no bloquear el flujo principal de Xquisito
        console.error(`❌ Error sincronizando con POS:`, error.message);

        return {
          success: false,
          error: error.message,
          provider: integration.provider_code,
        };
      }
    } catch (error) {
      console.error(`❌ Error en POSSyncService.syncOrder:`, error);
      // No lanzar error para no bloquear el flujo principal
      return null;
    }
  }

  // Obtener la orden local de la tabla correspondiente
  static async getLocalOrder(orderId, orderType) {
    const { data, error } = await supabaseAdmin
      .from(orderType)
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      console.error(`Error obteniendo orden ${orderId}:`, error);
      return null;
    }

    return data;
  }

  // Obtener la integración POS para una sucursal
  static async getPOSIntegration(order) {
    let branchId;

    if (order.table_id) {
      // Para órdenes de mesa, obtener branch_id de la tabla
      const { data: table } = await supabaseAdmin
        .from("tables")
        .select("branch_id")
        .eq("id", order.table_id)
        .single();

      branchId = table?.branch_id;
    } else if (order.room_id) {
      // Para órdenes de habitación, obtener branch_id de la habitación
      const { data: room } = await supabaseAdmin
        .from("rooms")
        .select("branch_id")
        .eq("id", order.room_id)
        .single();

      branchId = room?.branch_id;
    } else {
      // Para pick-and-go, usar branch_id directo
      branchId = order.branch_id;
    }

    if (!branchId) {
      console.warn(`No se pudo determinar branch_id para la orden`);
      return null;
    }

    // Buscar integración POS activa para esta sucursal
    const { data, error } = await supabaseAdmin
      .from("pos_integrations")
      .select(
        `*,provider:pos_providers
        !inner(code, name, sync_mode)`,
      )
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .single();

    if (error) {
      return null;
    }

    // Agregar provider_code al objeto
    return {
      ...data,
      provider_code: data.provider.code,
    };
  }

  // Transformar orden de Xquisito a formato POS
  static async transformOrderToPOS(order, integration) {
    // Obtener items de la orden con mapeo POS
    const items = await this.getOrderItemsWithMapping(order.id, integration.id);

    // Generar check number único
    const checkNumber = `XQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return {
      check_number: checkNumber,
      table_number: order.table_number || null,
      guest_count: 1,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      items: items,
    };
  }

  // Obtener items de la orden con su mapeo POS
  static async getOrderItemsWithMapping(orderId, integrationId) {
    // Buscar items en dish_order (relación muchos a muchos)
    const { data: dishOrders, error } = await supabaseAdmin
      .from("dish_order")
      .select(
        `quantity,
        menu_item:menu_items!inner(
          id,
          name,
          price
        )`,
      )
      .or(
        `table_order_id.eq.${orderId},tap_order_id.eq.${orderId},room_order_id.eq.${orderId},pick_and_go_order_id.eq.${orderId}`,
      );

    if (error || !dishOrders || dishOrders.length === 0) {
      console.warn(`No se encontraron items para la orden ${orderId}`);
      return [];
    }

    // Mapear items con sus códigos POS
    const itemsWithMapping = await Promise.all(
      dishOrders.map(async (dishOrder) => {
        const menuItemId = dishOrder.menu_item.id;

        // Buscar mapeo POS para este item
        const { data: mapping } = await supabaseAdmin
          .from("pos_menu_mapping")
          .select("pos_item_id, pos_item_code")
          .eq("integration_id", integrationId)
          .eq("menu_item_id", menuItemId)
          .single();

        if (!mapping) {
          console.warn(
            `Item ${menuItemId} (${dishOrder.menu_item.name}) no tiene mapeo POS`,
          );
          return null;
        }

        return {
          pos_item_id: mapping.pos_item_id,
          pos_item_code: mapping.pos_item_code,
          quantity: dishOrder.quantity,
          price: dishOrder.menu_item.price,
          name: dishOrder.menu_item.name,
        };
      }),
    );

    // Filtrar items sin mapeo
    return itemsWithMapping.filter((item) => item !== null);
  }

  // Crear registro de sincronización
  static async createOrderSync(syncData) {
    const { error } = await supabaseAdmin
      .from("pos_order_sync")
      .insert(syncData);

    if (error) {
      console.error("Error creando registro de sincronización:", error);
    }
  }
}

module.exports = POSSyncService;
