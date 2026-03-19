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
    // Buscar items en dish_order (columnas correctas según la tabla)
    const { data: dishOrders, error } = await supabaseAdmin
      .from("dish_order")
      .select("id, item, quantity, price, menu_item_id")
      .or(
        `tap_order_id.eq.${orderId},room_order_id.eq.${orderId},pick_and_go_order_id.eq.${orderId},tap_pay_order_id.eq.${orderId}`,
      );

    if (error || !dishOrders || dishOrders.length === 0) {
      console.warn(`No se encontraron items para la orden ${orderId}`);
      return [];
    }

    console.log(
      `📋 Encontrados ${dishOrders.length} items para orden ${orderId}`,
    );

    // Mapear items con sus códigos POS
    const itemsWithMapping = await Promise.all(
      dishOrders.map(async (dishOrder) => {
        let menuItemId = dishOrder.menu_item_id;

        // Si no tiene menu_item_id, intentar buscar por nombre
        if (!menuItemId) {
          const { data: menuItem } = await supabaseAdmin
            .from("menu_items")
            .select("id")
            .eq("name", dishOrder.item)
            .single();

          menuItemId = menuItem?.id;
        }

        if (!menuItemId) {
          console.warn(
            `Item "${dishOrder.item}" no tiene menu_item_id y no se encontró por nombre`,
          );
          return null;
        }

        // Buscar mapeo POS para este item
        const { data: mapping } = await supabaseAdmin
          .from("pos_menu_mapping")
          .select("pos_item_id, pos_item_code")
          .eq("integration_id", integrationId)
          .eq("menu_item_id", menuItemId)
          .single();

        if (!mapping) {
          console.warn(
            `Item ${menuItemId} (${dishOrder.item}) no tiene mapeo POS`,
          );
          return null;
        }

        return {
          pos_item_id: mapping.pos_item_id,
          pos_item_code: mapping.pos_item_code,
          quantity: dishOrder.quantity,
          price: dishOrder.price,
          name: dishOrder.item,
        };
      }),
    );

    // Filtrar items sin mapeo
    const mappedItems = itemsWithMapping.filter((item) => item !== null);
    console.log(
      `✅ ${mappedItems.length}/${dishOrders.length} items mapeados a POS`,
    );
    return mappedItems;
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

  // Actualizar registro de sincronización existente
  static async updateOrderSync(syncId, updateData) {
    const { error } = await supabaseAdmin
      .from("pos_order_sync")
      .update({
        ...updateData,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", syncId);

    if (error) {
      console.error("Error actualizando registro de sincronización:", error);
    }
  }

  /**
   * Sincronizar un platillo individual de FlexBill con el POS
   * - Si no existe check en POS → crear uno nuevo
   * - Si ya existe check → agregar ronda con el nuevo item
   */
  static async syncFlexBillDish(dishOrderId, tableOrderId) {
    try {
      console.log(
        `🔄 Sincronizando dish ${dishOrderId} de table_order ${tableOrderId}...`,
      );

      // 1. Obtener el dish_order con su info
      const { data: dishOrder, error: dishError } = await supabaseAdmin
        .from("dish_order")
        .select(
          `
          *,
          user_order!inner(
            table_order!inner(
              id,
              tables!inner(
                table_number,
                branch_id,
                branches!inner(restaurant_id, branch_number)
              )
            )
          )
        `,
        )
        .eq("id", dishOrderId)
        .single();

      if (dishError || !dishOrder) {
        console.warn(`⚠️ Dish order ${dishOrderId} no encontrado`);
        return null;
      }

      const tableOrder = dishOrder.user_order.table_order;
      const table = tableOrder.tables;
      const branchId = table.branch_id;

      // 2. Verificar si la sucursal tiene POS integrado
      const { data: integration, error: intError } = await supabaseAdmin
        .from("pos_integrations")
        .select(
          `
          *,
          provider:pos_providers!inner(code, name, sync_mode)
        `,
        )
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (intError || !integration) {
        console.log(`❌ Sucursal sin POS integrado, saltando sincronización`);
        return null;
      }

      // 3. Buscar si ya existe un check en POS para esta table_order
      const { data: existingSync } = await supabaseAdmin
        .from("pos_order_sync")
        .select("*")
        .eq("integration_id", integration.id)
        .eq("local_order_id", tableOrderId)
        .eq("local_order_type", "table_order")
        .in("sync_status", ["synced", "pending"])
        .single();

      // 4. Obtener mapeo POS para el item
      const itemMapping = await this.getDishItemMapping(
        dishOrder,
        integration.id,
      );
      if (!itemMapping) {
        console.warn(`⚠️ Item ${dishOrder.item} no tiene mapeo POS`);
        return null;
      }

      // 5. Crear instancia del servicio POS
      const posService = POSFactory.createPOSService(
        integration,
        integration.provider.code,
      );

      try {
        let posResponse;

        if (existingSync && existingSync.pos_order_id) {
          // Ya existe check → agregar ronda
          console.log(
            `➕ Agregando ronda al check existente ${existingSync.pos_order_id}...`,
          );

          posResponse = await posService.addRound(existingSync.pos_order_id, [
            itemMapping,
          ]);

          // Actualizar registro de sync
          await this.updateOrderSync(existingSync.id, {
            sync_status: "synced",
            response_payload: posResponse,
          });

          console.log(
            `✅ Ronda agregada al check ${existingSync.pos_order_id}`,
          );
        } else {
          // No existe check → crear nuevo
          console.log(
            `🆕 Creando nuevo check en POS para table_order ${tableOrderId}...`,
          );

          const posOrderData = {
            check_name: `Mesa ${table.table_number}`,
            table_number: table.table_number,
            guest_count: 1,
            items: [itemMapping],
          };

          posResponse = await posService.createOrder(posOrderData);

          // Crear registro de sync
          await this.createOrderSync({
            integration_id: integration.id,
            local_order_id: tableOrderId,
            local_order_type: "table_order",
            pos_order_id: posResponse.posOrderId,
            pos_table_id: posResponse.posTableId,
            sync_status: "synced",
            sync_direction: "push",
            last_synced_at: new Date().toISOString(),
            response_payload: posResponse,
          });

          console.log(`✅ Check creado en POS: ${posResponse.posOrderId}`);
        }

        return {
          success: true,
          posOrderId: posResponse.posOrderId,
          provider: integration.provider.code,
          action: existingSync ? "round_added" : "check_created",
        };
      } catch (error) {
        console.error(`❌ Error sincronizando con POS:`, error.message);

        // Registrar error si no había sync previo
        if (!existingSync) {
          await this.createOrderSync({
            integration_id: integration.id,
            local_order_id: tableOrderId,
            local_order_type: "table_order",
            sync_status: "failed",
            sync_direction: "push",
            sync_error: error.message,
          });
        }

        return {
          success: false,
          error: error.message,
          provider: integration.provider.code,
        };
      }
    } catch (error) {
      console.error(`❌ Error en POSSyncService.syncFlexBillDish:`, error);
      return null;
    }
  }

  // Obtener mapeo POS para un dish_order individual
  static async getDishItemMapping(dishOrder, integrationId) {
    // Buscar el menu_item_id basado en el nombre del item
    const { data: menuItem } = await supabaseAdmin
      .from("menu_items")
      .select("id, name, price")
      .eq("name", dishOrder.item)
      .single();

    if (!menuItem) {
      return null;
    }

    // Buscar mapeo POS
    const { data: mapping } = await supabaseAdmin
      .from("pos_menu_mapping")
      .select("pos_item_id, pos_item_code")
      .eq("integration_id", integrationId)
      .eq("menu_item_id", menuItem.id)
      .single();

    if (!mapping) {
      return null;
    }

    return {
      pos_item_id: mapping.pos_item_id,
      pos_item_code: mapping.pos_item_code,
      quantity: dishOrder.quantity,
      price: dishOrder.price,
      name: dishOrder.item,
    };
  }

  // Sincronizar un pago/abono de FlexBill con el POS
  static async syncFlexBillPayment(tableOrderId, amount) {
    try {
      console.log(
        `💳 Sincronizando pago de $${amount} para table_order ${tableOrderId}...`,
      );

      // Buscar sync existente - buscar cualquier registro con folio válido
      const { data: sync } = await supabaseAdmin
        .from("pos_order_sync")
        .select(
          `
          *,
          pos_integrations!inner(
            *,
            pos_providers!inner(code, name)
          )
        `,
        )
        .eq("local_order_id", tableOrderId)
        .eq("local_order_type", "table_order")
        .not("pos_order_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!sync || !sync.pos_order_id) {
        console.log(
          `❌ No hay check POS para aplicar pago de table_order ${tableOrderId}`,
        );
        console.log(
          `   Posible causa: La orden nunca se sincronizó correctamente con el POS`,
        );
        return null;
      }

      console.log(`📋 Encontrado folio ${sync.pos_order_id} para aplicar pago`);

      const integration = sync.pos_integrations;
      const posService = POSFactory.createPOSService(
        integration,
        integration.pos_providers.code,
      );

      // Aplicar tender con el monto específico (abono parcial)
      const result = await posService.applyTender(sync.pos_order_id, {
        amount,
      });

      // Actualizar registro de sync
      const newStatus = result.status === "closed" ? "closed" : "synced";
      await this.updateOrderSync(sync.id, {
        sync_status: newStatus,
        response_payload: result,
      });

      console.log(
        `✅ Pago aplicado. Check ${sync.pos_order_id} status: ${result.status}`,
      );

      return {
        success: true,
        posOrderId: sync.pos_order_id,
        status: result.status,
        isClosed: result.status === "closed",
      };
    } catch (error) {
      console.error(`❌ Error sincronizando pago en POS:`, error);
      return null;
    }
  }

  /**
   * Cerrar check de FlexBill en el POS (aplicar tender completo)
   * Llamar cuando la mesa se cierra (todo pagado)
   */
  static async closeFlexBillCheck(tableOrderId) {
    try {
      console.log(`🔒 Cerrando check de table_order ${tableOrderId} en POS...`);

      // Buscar sync existente
      const { data: sync } = await supabaseAdmin
        .from("pos_order_sync")
        .select(
          `
          *,
          pos_integrations!inner(
            *,
            pos_providers!inner(code, name)
          )
        `,
        )
        .eq("local_order_id", tableOrderId)
        .eq("local_order_type", "table_order")
        .eq("sync_status", "synced")
        .single();

      if (!sync || !sync.pos_order_id) {
        console.log(`❌ No hay check POS para cerrar`);
        return null;
      }

      const integration = sync.pos_integrations;
      const posService = POSFactory.createPOSService(
        integration,
        integration.pos_providers.code,
      );

      const result = await posService.closeOrder(sync.pos_order_id);

      // Actualizar estado de sync a cerrado
      await this.updateOrderSync(sync.id, {
        sync_status: "closed",
        response_payload: result,
      });

      console.log(`✅ Check ${sync.pos_order_id} cerrado en POS`);

      return {
        success: true,
        posOrderId: sync.pos_order_id,
        status: result.status,
      };
    } catch (error) {
      console.error(`❌ Error cerrando check en POS:`, error);
      return null;
    }
  }
  // ==================== TAP & PAY (POS → Xquisito) ====================

  // Obtener check abierto de una mesa desde el POS
  static async getTapPayCheckByTable(branchId, tableNumber) {
    try {
      console.log(
        `🔍 Buscando check en POS para mesa ${tableNumber}, branch ${branchId}...`,
      );

      // 1. Verificar si la sucursal tiene POS integrado
      const { data: integration, error: intError } = await supabaseAdmin
        .from("pos_integrations")
        .select(
          `
          *,
          provider:pos_providers!inner(code, name, sync_mode)
        `,
        )
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (intError || !integration) {
        console.log(`❌ Sucursal sin POS integrado`);
        return { success: false, error: "Sucursal sin POS integrado" };
      }

      // 2. Crear instancia del servicio POS
      const posService = POSFactory.createPOSService(
        integration,
        integration.provider.code,
      );

      // 3. Obtener check abierto de la mesa
      const result = await posService.getOpenCheckByTable(tableNumber);

      if (!result.success) {
        return result;
      }

      const check = result.check;

      // 4. Mapear items del POS a Xquisito (mapeo inverso)
      const mappedItems = await this.mapPOSItemsToXquisito(
        check.menuItems,
        integration.id,
      );

      // 5. NO crear registro de sync aquí - se crea en createOrderFromPOS
      // cuando tengamos el local_order_id (NOT NULL constraint en DB)

      console.log(
        `✅ Check ${check.checkRef} recuperado con ${mappedItems.length} items`,
      );

      return {
        success: true,
        check: {
          posOrderId: check.checkRef,
          checkNumber: check.checkNumber,
          tableName: check.tableName,
          status: check.status,
          totals: check.totals,
          items: mappedItems,
          rawPOSItems: check.menuItems,
        },
        provider: integration.provider.code,
      };
    } catch (error) {
      console.error(`❌ Error obteniendo check de POS:`, error);
      return { success: false, error: error.message };
    }
  }

  // Mapeo inverso: POS items → Xquisito menu_items
  static async mapPOSItemsToXquisito(posItems, integrationId) {
    if (!posItems || posItems.length === 0) {
      return [];
    }

    const mappedItems = await Promise.all(
      posItems.map(async (posItem) => {
        // pos_item_id puede venir como número (1001) o string con padding ("01001")
        // Intentar ambos formatos
        const posItemIdNum = String(posItem.menuItemId);
        const posItemIdPadded = String(posItem.menuItemId).padStart(5, "0");

        console.log(
          `🔍 Buscando mapeo para POS item: ${posItemIdNum} / ${posItemIdPadded}`,
        );

        // Buscar mapeo por pos_item_id (intentar ambos formatos)
        let mapping = null;
        const { data: mapping1 } = await supabaseAdmin
          .from("pos_menu_mapping")
          .select(
            `
            menu_item_id,
            pos_item_id,
            pos_item_code,
            menu_items!inner(id, name, description, price, image_url)
          `,
          )
          .eq("integration_id", integrationId)
          .eq("pos_item_id", posItemIdNum)
          .single();

        if (mapping1) {
          mapping = mapping1;
        } else {
          // Intentar con padding
          const { data: mapping2 } = await supabaseAdmin
            .from("pos_menu_mapping")
            .select(
              `
              menu_item_id,
              pos_item_id,
              pos_item_code,
              menu_items!inner(id, name, description, price, image_url)
            `,
            )
            .eq("integration_id", integrationId)
            .eq("pos_item_id", posItemIdPadded)
            .single();

          mapping = mapping2;
        }

        if (mapping && mapping.menu_items) {
          // Item mapeado - usar datos de Xquisito
          console.log(
            `✅ Mapeo encontrado: ${posItem.menuItemId} → ${mapping.menu_items.name}`,
          );
          return {
            pos_item_id: posItem.menuItemId,
            menu_item_id: mapping.menu_item_id,
            name: mapping.menu_items.name,
            description: mapping.menu_items.description,
            price: posItem.unitPrice || posItem.total / posItem.quantity,
            quantity: posItem.quantity,
            total: posItem.total,
            images: mapping.menu_items.image_url
              ? [mapping.menu_items.image_url]
              : [],
            mapped: true,
          };
        } else {
          // Item no mapeado - usar datos del POS
          console.log(`⚠️ Sin mapeo para POS item: ${posItem.menuItemId}`);
          return {
            pos_item_id: posItem.menuItemId,
            menu_item_id: null,
            name: posItem.name || `Item POS #${posItem.menuItemId}`,
            description: null,
            price: posItem.unitPrice || posItem.total / posItem.quantity,
            quantity: posItem.quantity,
            total: posItem.total,
            images: [],
            mapped: false,
          };
        }
      }),
    );

    const mappedCount = mappedItems.filter((i) => i.mapped).length;
    console.log(
      `📋 ${mappedCount}/${mappedItems.length} items mapeados a Xquisito`,
    );

    return mappedItems;
  }

  /**
   * Sincronizar orden prepagada con el POS
   * Crea la orden en POS y aplica el pago en una sola operación
   * Usado por: Tap Order & Pay, Pick & Go, Room Service
   */
  static async syncPaidOrder(orderId, orderType, paymentAmount) {
    try {
      console.log(
        `🔄 Sincronizando orden prepagada: ${orderId} ($${paymentAmount})...`,
      );

      // 1. Primero sincronizar la orden
      const orderResult = await this.syncOrder(orderId, orderType);

      if (!orderResult || !orderResult.success) {
        console.warn(`⚠️ No se pudo sincronizar orden ${orderId}`);
        return orderResult;
      }

      const posOrderId = orderResult.posOrderId;
      console.log(`✅ Orden creada en POS: ${posOrderId}`);

      // 2. Obtener la integración para aplicar el pago
      const order = await this.getLocalOrder(orderId, orderType);
      const integration = await this.getPOSIntegration(order);

      if (!integration) {
        return orderResult; // Ya se creó la orden, solo retornar
      }

      // 3. Crear instancia del POS service y aplicar pago
      const posService = POSFactory.createPOSService(
        integration,
        integration.provider_code,
      );

      try {
        // Aplicar pago completo (amount = 0 significa pagar todo)
        const paymentResult = await posService.applyTender(posOrderId, {
          amount: paymentAmount || 0,
          reference: `XQ-${orderId.substring(0, 8)}`,
        });

        console.log(
          `✅ Pago aplicado. Check ${posOrderId} status: ${paymentResult.status}`,
        );

        // 4. Actualizar registro de sync con estado cerrado
        const { data: sync } = await supabaseAdmin
          .from("pos_order_sync")
          .select("id")
          .eq("local_order_id", orderId)
          .eq("local_order_type", orderType)
          .single();

        if (sync) {
          const newStatus = paymentResult.isClosed ? "closed" : "synced";
          await this.updateOrderSync(sync.id, {
            sync_status: newStatus,
            response_payload: {
              order: orderResult,
              payment: paymentResult,
            },
          });
        }

        return {
          success: true,
          posOrderId,
          provider: integration.provider_code,
          orderCreated: true,
          paymentApplied: true,
          isClosed: paymentResult.isClosed,
        };
      } catch (paymentError) {
        console.error(
          `⚠️ Orden creada pero error aplicando pago: ${paymentError.message}`,
        );

        return {
          success: true,
          posOrderId,
          provider: integration.provider_code,
          orderCreated: true,
          paymentApplied: false,
          paymentError: paymentError.message,
        };
      }
    } catch (error) {
      console.error(`❌ Error en syncPaidOrder:`, error);
      return null;
    }
  }

  // Sincronizar pago de Tap & Pay con el POS
  static async syncTapPayPayment(posOrderId, branchId, amount) {
    try {
      console.log(
        `💳 Sincronizando pago Tap&Pay de $${amount} para check ${posOrderId}...`,
      );

      // Obtener integración
      const { data: integration } = await supabaseAdmin
        .from("pos_integrations")
        .select(
          `
          *,
          pos_providers!inner(code, name)
        `,
        )
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      if (!integration) {
        console.log(`❌ No hay integración POS activa`);
        return null;
      }

      const posService = POSFactory.createPOSService(
        integration,
        integration.pos_providers.code,
      );

      // Aplicar tender
      const result = await posService.applyTender(posOrderId, { amount });

      // Actualizar registro de sync
      const { data: sync } = await supabaseAdmin
        .from("pos_order_sync")
        .select("id")
        .eq("pos_order_id", posOrderId)
        .single();

      if (sync) {
        const newStatus = result.status === "closed" ? "closed" : "synced";
        await this.updateOrderSync(sync.id, {
          sync_status: newStatus,
          response_payload: result,
        });
      }

      console.log(
        `✅ Pago aplicado. Check ${posOrderId} status: ${result.status}`,
      );

      return {
        success: true,
        posOrderId,
        status: result.status,
        isClosed: result.status === "closed",
      };
    } catch (error) {
      console.error(`❌ Error sincronizando pago Tap&Pay:`, error);
      return null;
    }
  }
}

module.exports = POSSyncService;
