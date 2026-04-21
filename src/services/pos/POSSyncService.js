const POSFactory = require("./POSFactory");
const { supabaseAdmin } = require("../../config/supabaseAuth");
const agentConnectionManager = require("../../socket/agentConnectionManager");
const { enrichItemsWithClasificacion } = require("../printerEnrichService");

// Helper: log de simulación de ticket para depuración
function logTicketSimulation({ identifier, folio, orderedBy, items }) {
  const SEP = "─".repeat(44);
  const itemLines = items
    .map((i) => {
      let line = `  ${String(i.quantity).padStart(2)}x  ${i.name}`;
      if (i.clasificacion) line += `  [${i.clasificacion}]`;
      if (Array.isArray(i.custom_fields) && i.custom_fields.length > 0) {
        const opts = i.custom_fields.flatMap(
          (f) =>
            f.selectedOptions?.map((o) => o.optionName).filter(Boolean) ?? [],
        );
        if (opts.length) line += `\n        ↳ ${opts.join(", ")}`;
      }
      return line;
    })
    .join("\n");
  console.log(
    `\n[TICKET] ${SEP}\n` +
      `  ${identifier}` +
      (folio ? `  |  Folio: ${folio}` : "") +
      (orderedBy ? `\n  Cliente: ${orderedBy}` : "") +
      `\n  ${SEP}\n` +
      `${itemLines}\n` +
      `  ${SEP}\n` +
      `  → AGENTE (con folio SR real)\n` +
      `[/TICKET]\n`,
  );
}

// Helper: envía print_job al agente para órdenes FlexBill después del sync con SR
async function sendFlexBillPrintToAgent(
  branchId,
  tableNumber,
  dishOrder,
  srFolio,
) {
  try {
    const items = [
      {
        menu_item_id: dishOrder.menu_item_id,
        name: dishOrder.item,
        quantity: dishOrder.quantity,
      },
    ];
    const enriched = dishOrder.menu_item_id
      ? await enrichItemsWithClasificacion(branchId, items)
      : [{ ...items[0], clasificacion: null }];

    const printItems = enriched.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      clasificacion: i.clasificacion ?? null,
      custom_fields: dishOrder.custom_fields ?? null,
    }));

    logTicketSimulation({
      identifier: `Mesa ${tableNumber}`,
      folio: srFolio ?? null,
      orderedBy: null,
      items: printItems,
    });

    agentConnectionManager.send(branchId, "print_job", {
      branchId,
      items: printItems,
      orderInfo: {
        identifier: `Mesa ${tableNumber}`,
        folio: srFolio ?? null,
        orderedBy: null,
      },
    });
    console.log(
      `[PRINT_JOB] → agente FlexBill folio=${srFolio} (branch ${branchId})`,
    );
  } catch (e) {
    console.error("[PRINT_JOB] sendFlexBillPrintToAgent error:", e.message);
  }
}

class POSSyncService {
  /**
   * Sincronizar una orden con el POS
   * Resultado de la sincronización o null si no hay POS
   */
  static async syncOrder(orderId, orderType) {
    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🔄 [syncOrder] INICIO`);
      console.log(`   orderId: ${orderId}`);
      console.log(`   orderType: ${orderType}`);
      console.log(`${"=".repeat(60)}`);

      // 1. Obtener la orden local
      console.log(`\n📋 [syncOrder] Obteniendo orden local...`);
      const order = await this.getLocalOrder(orderId, orderType);
      if (!order) {
        console.warn(
          `\n❌ [syncOrder] Orden ${orderId} no encontrada en ${orderType}`,
        );
        console.log(`${"=".repeat(60)}\n`);
        return null;
      }
      console.log(`   ✅ Orden encontrada`);
      console.log(`   table_id: ${order.table_id || "N/A"}`);
      console.log(`   room_id: ${order.room_id || "N/A"}`);
      console.log(`   branch_id: ${order.branch_id || "N/A"}`);

      // 1.1 Verificar si ya fue sincronizada (evitar duplicados)
      console.log(`\n🔍 [syncOrder] Verificando si ya fue sincronizada...`);
      const { data: existingSync, error: existingSyncError } =
        await supabaseAdmin
          .from("pos_order_sync")
          .select("id, pos_order_id, sync_status")
          .eq("local_order_id", orderId)
          .eq("local_order_type", orderType)
          .in("sync_status", ["synced", "closed"])
          .single();

      console.log(`   existingSync: ${JSON.stringify(existingSync)}`);
      if (existingSyncError && existingSyncError.code !== "PGRST116") {
        console.log(`   existingSyncError: ${existingSyncError.message}`);
      }

      if (existingSync && existingSync.pos_order_id) {
        console.log(
          `\n⏭️ [syncOrder] Ya sincronizada, retornando folio existente`,
        );
        console.log(`   folio: ${existingSync.pos_order_id}`);
        console.log(`${"=".repeat(60)}\n`);
        return {
          success: true,
          posOrderId: existingSync.pos_order_id,
          alreadySynced: true,
        };
      }

      // 2. Verificar si la sucursal tiene POS integrado
      console.log(`\n🔌 [syncOrder] Obteniendo integración POS...`);
      const integration = await this.getPOSIntegration(order);
      if (!integration) {
        console.log(`\n❌ [syncOrder] Sucursal sin POS integrado`);
        console.log(`${"=".repeat(60)}\n`);
        return null;
      }
      console.log(`   ✅ Integración encontrada`);
      console.log(`   integration.id: ${integration.id}`);
      console.log(`   provider_code: ${integration.provider_code}`);
      console.log(`   branch_id: ${integration.branch_id}`);

      // 3. Verificar que el proveedor esté activo
      if (!integration.is_active) {
        console.log(`\n❌ [syncOrder] Integración inactiva`);
        console.log(`${"=".repeat(60)}\n`);
        return null;
      }
      console.log(`   is_active: true`);

      // 4. Crear instancia del servicio POS
      console.log(`\n🏭 [syncOrder] Creando servicio POS...`);
      const posService = POSFactory.createPOSService(
        integration,
        integration.provider_code,
      );
      console.log(`   ✅ Servicio POS creado`);

      // 5. Transformar orden al formato POS
      console.log(`\n🔄 [syncOrder] Transformando orden a formato POS...`);
      const posOrderData = await this.transformOrderToPOS(order, integration);
      console.log(`   order_id: ${posOrderData.order_id}`);
      console.log(`   check_number: ${posOrderData.check_number}`);
      console.log(`   table_number: ${posOrderData.table_number}`);
      console.log(`   items count: ${posOrderData.items?.length || 0}`);

      // 5.1 Verificar que hay items mapeados antes de enviar
      if (!posOrderData.items || posOrderData.items.length === 0) {
        console.log(`\n⚠️ [syncOrder] Sin items mapeados, saltando sync`);
        console.log(`${"=".repeat(60)}\n`);
        return null;
      }

      // Log de cada item
      console.log(`   Items a enviar:`);
      posOrderData.items.forEach((item, idx) => {
        console.log(
          `     [${idx}] ${item.name} x${item.quantity} @ $${item.price} (pos_id: ${item.pos_item_id})`,
        );
      });

      // 6. Enviar a POS
      console.log(`\n📤 [syncOrder] Enviando a POS...`);
      try {
        const posResponse = await posService.createOrder(posOrderData);
        console.log(`\n✅ [syncOrder] Respuesta del POS:`);
        console.log(`   posOrderId: ${posResponse.posOrderId}`);
        console.log(`   posCheckNumber: ${posResponse.posCheckNumber}`);
        console.log(`   status: ${posResponse.status}`);
        console.log(`   totals: ${JSON.stringify(posResponse.totals)}`);

        // 7. Registrar sincronización exitosa
        console.log(`\n📝 [syncOrder] Creando registro en pos_order_sync...`);
        await this.createOrderSync({
          integration_id: integration.id,
          local_order_id: orderId,
          local_order_type: orderType,
          pos_order_id: posResponse.posOrderId,
          pos_check_number: posResponse.posCheckNumber || null,
          pos_table_id: posResponse.posTableId,
          sync_status: "synced",
          sync_direction: "push",
          last_synced_at: new Date().toISOString(),
          response_payload: posResponse,
        });
        console.log(`   ✅ Registro creado`);

        // 7.1 Actualizar folio en la tabla de la orden
        if (posResponse.posOrderId) {
          console.log(`\n📝 [syncOrder] Guardando folio en ${orderType}...`);
          const { error: folioError } = await supabaseAdmin
            .from(orderType)
            .update({
              folio: posResponse.posCheckNumber || posResponse.posOrderId,
            })
            .eq("id", orderId);

          if (folioError) {
            console.warn(`   ⚠️ Error: ${folioError.message}`);
          } else {
            console.log(`   ✅ Folio ${posResponse.posOrderId} guardado`);
          }

          // Disparar print_job al agente con folio SR real
          if (agentConnectionManager.isConnected(integration.branch_id)) {
            try {
              const { data: dishItems } = await supabaseAdmin
                .from("dish_order")
                .select("item, quantity, menu_item_id, custom_fields")
                .or(
                  `tap_order_id.eq.${orderId},room_order_id.eq.${orderId},pick_and_go_order_id.eq.${orderId},tap_pay_order_id.eq.${orderId}`,
                );

              if (dishItems && dishItems.length > 0) {
                const srFolio =
                  posResponse.posCheckNumber || posResponse.posOrderId;

                let identifier = "Orden";
                if (orderType === "tap_orders_and_pay")
                  identifier = `Mesa ${order.table_number || ""}`.trim();
                else if (orderType === "room_orders")
                  identifier = `Habitación ${order.room_number || ""}`.trim();
                else if (orderType === "pick_and_go_orders")
                  identifier = "Pick & Go";

                const hasMenuIds = dishItems.some((i) => i.menu_item_id);
                const enriched = hasMenuIds
                  ? await enrichItemsWithClasificacion(
                      integration.branch_id,
                      dishItems.map((i) => ({
                        menu_item_id: i.menu_item_id,
                        name: i.item,
                        quantity: i.quantity,
                      })),
                    )
                  : dishItems.map((i) => ({
                      name: i.item,
                      quantity: i.quantity,
                      clasificacion: null,
                    }));

                const printItems = enriched.map((i, idx) => ({
                  name: i.name,
                  quantity: i.quantity,
                  clasificacion: i.clasificacion ?? null,
                  custom_fields: dishItems[idx]?.custom_fields ?? null,
                }));

                logTicketSimulation({
                  identifier,
                  folio: srFolio,
                  orderedBy: order.customer_name || null,
                  items: printItems,
                });

                agentConnectionManager.send(
                  integration.branch_id,
                  "print_job",
                  {
                    branchId: integration.branch_id,
                    items: printItems,
                    orderInfo: {
                      identifier,
                      folio: srFolio,
                      orderedBy: order.customer_name || null,
                    },
                  },
                );
                console.log(
                  `[PRINT_JOB] → agente ${orderType} folio=${srFolio} (branch ${integration.branch_id})`,
                );
              }
            } catch (printErr) {
              console.error(
                "[PRINT_JOB] syncOrder print error:",
                printErr.message,
              );
            }
          }
        }

        console.log(`\n${"=".repeat(60)}`);
        console.log(`🔄 [syncOrder] FIN - ÉXITO`);
        console.log(`   posOrderId: ${posResponse.posOrderId}`);
        console.log(`${"=".repeat(60)}\n`);

        return {
          success: true,
          posOrderId: posResponse.posOrderId,
          provider: integration.provider_code,
        };
      } catch (error) {
        // 8. Registrar error de sincronización
        console.error(`\n❌ [syncOrder] Error creando orden en POS:`);
        console.error(`   mensaje: ${error.message}`);

        await this.createOrderSync({
          integration_id: integration.id,
          local_order_id: orderId,
          local_order_type: orderType,
          sync_status: "failed",
          sync_direction: "push",
          sync_error: error.message,
          request_payload: posOrderData,
        });

        console.log(`${"=".repeat(60)}\n`);
        return {
          success: false,
          error: error.message,
          provider: integration.provider_code,
        };
      }
    } catch (error) {
      console.error(`\n❌ [syncOrder] Error general:`);
      console.error(`   mensaje: ${error.message}`);
      console.error(`   stack: ${error.stack}`);
      console.log(`${"=".repeat(60)}\n`);
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
      // Para pick-and-go, resolver branch_id desde branches
      const { data: branch } = await supabaseAdmin
        .from("branches")
        .select("id")
        .eq("restaurant_id", order.restaurant_id)
        .eq("branch_number", order.branch_number)
        .single();

      branchId = branch?.id;
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

    // Obtener table_number o room_number según el tipo de orden
    let tableNumber = null;
    if (order.table_id) {
      // Orden de mesa - obtener table_number
      const { data: table } = await supabaseAdmin
        .from("tables")
        .select("table_number")
        .eq("id", order.table_id)
        .single();

      tableNumber = table?.table_number || null;
    } else if (order.room_id) {
      // Orden de room service - obtener room_number
      const { data: room } = await supabaseAdmin
        .from("rooms")
        .select("room_number")
        .eq("id", order.room_id)
        .single();

      tableNumber = room?.room_number || null;
    }

    return {
      order_id: order.id,
      check_number: checkNumber,
      table_number: tableNumber,
      guest_count: 1,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      items: items,
    };
  }

  // Obtener items de la orden con su mapeo POS
  static async getOrderItemsWithMapping(orderId, integrationId) {
    console.log(
      `\n📦 [getOrderItemsWithMapping] Buscando items para orden ${orderId}`,
    );

    // Buscar items en dish_order (columnas correctas según la tabla)
    const { data: dishOrders, error } = await supabaseAdmin
      .from("dish_order")
      .select(
        "id, item, quantity, price, extra_price, menu_item_id, custom_fields",
      )
      .or(
        `tap_order_id.eq.${orderId},room_order_id.eq.${orderId},pick_and_go_order_id.eq.${orderId},tap_pay_order_id.eq.${orderId}`,
      );

    if (error || !dishOrders || dishOrders.length === 0) {
      console.warn(`   ⚠️ No se encontraron items para la orden ${orderId}`);
      if (error) console.warn(`   Error: ${error.message}`);
      return [];
    }

    console.log(`   ✅ Encontrados ${dishOrders.length} items en dish_order`);

    // Mapear items con sus códigos POS
    const itemsWithMapping = await Promise.all(
      dishOrders.map(async (dishOrder, idx) => {
        console.log(`\n   [Item ${idx}] "${dishOrder.item}"`);
        console.log(`      quantity: ${dishOrder.quantity}`);
        console.log(`      price: $${dishOrder.price}`);
        console.log(`      extra_price: $${dishOrder.extra_price || 0}`);
        console.log(`      menu_item_id: ${dishOrder.menu_item_id || "N/A"}`);

        let menuItemId = dishOrder.menu_item_id;

        // Si no tiene menu_item_id, buscar por nombre filtrando por integración
        // para evitar falsos matches de items con el mismo nombre en otro restaurante
        if (!menuItemId) {
          console.log(`      Buscando menu_item por nombre en integración...`);
          const { data: mappingByName } = await supabaseAdmin
            .from("pos_menu_mapping")
            .select("menu_item_id, menu_items!inner(name)")
            .eq("integration_id", integrationId)
            .eq("menu_items.name", dishOrder.item)
            .maybeSingle();

          menuItemId = mappingByName?.menu_item_id;
          if (menuItemId) {
            console.log(`      ✅ Encontrado: ${menuItemId}`);
          }
        }

        if (!menuItemId) {
          console.warn(`      ❌ Sin menu_item_id, saltando`);
          return null;
        }

        // Buscar mapeo POS para este item
        const { data: mapping } = await supabaseAdmin
          .from("pos_menu_mapping")
          .select("pos_item_id")
          .eq("integration_id", integrationId)
          .eq("menu_item_id", menuItemId)
          .single();

        if (!mapping) {
          console.warn(`      ❌ Sin mapeo POS, saltando`);
          return null;
        }

        console.log(`      ✅ Mapeo POS: ${mapping.pos_item_id}`);

        // Formatear custom_fields como comentario
        const comment = this.formatCustomFieldsAsComment(
          dishOrder.custom_fields,
        );
        if (comment) {
          console.log(`      📝 Comentario: ${comment}`);
        }

        return {
          pos_item_id: mapping.pos_item_id,
          quantity: dishOrder.quantity,
          price: dishOrder.price,
          extraPrice: dishOrder.extra_price || 0,
          name: dishOrder.item,
          comment: comment,
        };
      }),
    );

    // Filtrar items sin mapeo
    const mappedItems = itemsWithMapping.filter((item) => item !== null);
    console.log(
      `\n   📊 Resumen: ${mappedItems.length}/${dishOrders.length} items mapeados a POS`,
    );
    return mappedItems;
  }

  // Formatear custom_fields a string legible para comentario en POS
  static formatCustomFieldsAsComment(customFields) {
    if (
      !customFields ||
      !Array.isArray(customFields) ||
      customFields.length === 0
    ) {
      return "";
    }

    const parts = [];
    for (const field of customFields) {
      if (!field.selectedOptions || field.selectedOptions.length === 0)
        continue;

      for (const option of field.selectedOptions) {
        let text = "";

        // Nombre del campo + opción seleccionada
        if (field.fieldName && option.optionName) {
          text = `${field.fieldName}: ${option.optionName}`;
        } else if (option.optionName) {
          text = option.optionName;
        }

        // Agregar cantidad si existe y es > 1
        if (option.quantity && option.quantity > 1) {
          text += ` x${option.quantity}`;
        }

        // Agregar precio si es > 0
        if (option.price && option.price > 0) {
          text += ` (+$${option.price})`;
        }

        if (text) parts.push(text);
      }
    }

    return parts.join(", ");
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
        if (agentConnectionManager.isConnected(branchId)) {
          sendFlexBillPrintToAgent(
            branchId,
            table.table_number,
            dishOrder,
            null,
          );
        }
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
        if (agentConnectionManager.isConnected(branchId)) {
          sendFlexBillPrintToAgent(
            branchId,
            table.table_number,
            dishOrder,
            null,
          );
        }
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

          if (agentConnectionManager.isConnected(branchId)) {
            sendFlexBillPrintToAgent(
              branchId,
              table.table_number,
              dishOrder,
              existingSync.pos_order_id,
            );
          }
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
            pos_check_number: posResponse.posCheckNumber || null,
            pos_table_id: posResponse.posTableId,
            sync_status: "synced",
            sync_direction: "push",
            last_synced_at: new Date().toISOString(),
            response_payload: posResponse,
          });

          // Actualizar folio en table_order
          if (posResponse.posOrderId) {
            const { error: folioError } = await supabaseAdmin
              .from("table_order")
              .update({
                folio: posResponse.posCheckNumber || posResponse.posOrderId,
              })
              .eq("id", tableOrderId);

            if (folioError) {
              console.warn(
                `⚠️ No se pudo actualizar folio en table_order:`,
                folioError.message,
              );
            } else {
              console.log(
                `✅ Folio ${posResponse.posOrderId} guardado en table_order`,
              );
            }
          }

          console.log(`✅ Check creado en POS: ${posResponse.posOrderId}`);

          if (agentConnectionManager.isConnected(branchId)) {
            sendFlexBillPrintToAgent(
              branchId,
              table.table_number,
              dishOrder,
              posResponse.posCheckNumber || posResponse.posOrderId,
            );
          }
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
    if (!dishOrder.menu_item_id) {
      console.warn(
        `      ❌ dish_order sin menu_item_id para "${dishOrder.item}"`,
      );
      return null;
    }

    // Buscar mapeo POS directamente por menu_item_id
    const { data: mapping } = await supabaseAdmin
      .from("pos_menu_mapping")
      .select("pos_item_id")
      .eq("integration_id", integrationId)
      .eq("menu_item_id", dishOrder.menu_item_id)
      .single();

    if (!mapping) {
      return null;
    }

    // Formatear custom_fields como comentario
    const comment = this.formatCustomFieldsAsComment(dishOrder.custom_fields);

    return {
      pos_item_id: mapping.pos_item_id,
      quantity: dishOrder.quantity,
      price: dishOrder.price,
      extraPrice: dishOrder.extra_price || 0,
      comment: comment,
      name: dishOrder.item,
    };
  }

  // Sincronizar un pago/abono de FlexBill con el POS
  static async syncFlexBillPayment(tableOrderId, amount, tip = 0) {
    try {
      console.log(
        `💳 Sincronizando pago de $${amount} (propina: $${tip}) para table_order ${tableOrderId}...`,
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
        tip,
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
              menu_items!inner(id, name, description, price, image_url)
            `,
            )
            .eq("integration_id", integrationId)
            .eq("pos_item_id", posItemIdPadded)
            .single();

          mapping = mapping2;
        }

        if (mapping && mapping.menu_items) {
          // Item mapeado - usar datos de Xquisito (nombre, descripción, precio, imagen)
          const price =
            parseFloat(mapping.menu_items.price) ||
            posItem.unitPrice ||
            posItem.total / posItem.quantity;
          console.log(
            `✅ Mapeo encontrado: ${posItem.menuItemId} → ${mapping.menu_items.name} ($${price})`,
          );
          return {
            pos_item_id: posItem.menuItemId,
            menu_item_id: mapping.menu_item_id,
            name: mapping.menu_items.name,
            description: mapping.menu_items.description,
            price: price,
            quantity: posItem.quantity,
            total: price * posItem.quantity,
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
   * @param {string} orderId - ID de la orden
   * @param {string} orderType - Tipo de orden (tap_pay_orders, pick_and_go_orders, room_orders)
   * @param {number} paymentAmount - Monto del pago
   * @param {number} tip - Propina (default 0)
   */
  static async syncPaidOrder(orderId, orderType, paymentAmount, tip = 0) {
    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🔄 [syncPaidOrder] INICIO`);
      console.log(`   orderId: ${orderId}`);
      console.log(`   orderType: ${orderType}`);
      console.log(`   paymentAmount: $${paymentAmount}`);
      console.log(`   tip: $${tip}`);

      // El tip ahora viene directamente desde PaymentTransactionService.createTransaction
      const tipAmount = tip || 0;
      console.log(`${"=".repeat(60)}`);

      let posOrderId = null;

      // 0. Verificar si ya fue sincronizada
      console.log(`\n📋 [syncPaidOrder] Buscando sync existente...`);
      const { data: existingSync, error: syncError } = await supabaseAdmin
        .from("pos_order_sync")
        .select("id, pos_order_id, sync_status")
        .eq("local_order_id", orderId)
        .eq("local_order_type", orderType)
        .not("pos_order_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      console.log(`   existingSync: ${JSON.stringify(existingSync)}`);
      if (syncError) console.log(`   syncError: ${syncError.message}`);

      if (existingSync && existingSync.pos_order_id) {
        // Orden ya existe en POS, usar el folio existente para aplicar pago
        posOrderId = existingSync.pos_order_id;
        console.log(`\n✅ [syncPaidOrder] Orden YA EXISTE en POS`);
        console.log(`   Usando folio existente: ${posOrderId}`);
      } else {
        // 1. Crear la orden en POS primero
        console.log(`\n🆕 [syncPaidOrder] Orden NO existe, creando en POS...`);
        const orderResult = await this.syncOrder(orderId, orderType);

        console.log(`   syncOrder resultado: ${JSON.stringify(orderResult)}`);

        if (!orderResult || !orderResult.success) {
          console.warn(`\n❌ [syncPaidOrder] syncOrder FALLÓ`);
          return orderResult;
        }

        posOrderId = orderResult.posOrderId;
        console.log(`   Nuevo folio: ${posOrderId}`);
      }

      if (!posOrderId) {
        console.warn(`\n❌ [syncPaidOrder] No se obtuvo posOrderId`);
        console.log(`${"=".repeat(60)}\n`);
        return { success: false, error: "No se pudo obtener folio POS" };
      }
      console.log(`\n✅ [syncPaidOrder] Folio POS listo: ${posOrderId}`);

      // 2. Obtener la integración para aplicar el pago
      console.log(`\n📋 [syncPaidOrder] Obteniendo orden e integración...`);
      const order = await this.getLocalOrder(orderId, orderType);
      console.log(`   order encontrada: ${order ? "SI" : "NO"}`);

      const integration = await this.getPOSIntegration(order);
      console.log(`   integration encontrada: ${integration ? "SI" : "NO"}`);

      if (!integration) {
        console.warn(
          `\n⚠️ [syncPaidOrder] Sin integración, no se puede aplicar pago`,
        );
        console.log(`${"=".repeat(60)}\n`);
        return {
          success: true,
          posOrderId,
          orderCreated: true,
          paymentApplied: false,
        };
      }

      console.log(`   provider_code: ${integration.provider_code}`);
      console.log(`   branch_id: ${integration.branch_id}`);

      // 3. Crear instancia del POS service y aplicar pago
      console.log(`\n💳 [syncPaidOrder] Aplicando pago al POS...`);
      console.log(`   folio: ${posOrderId}`);
      console.log(`   amount: $${paymentAmount || 0}`);
      console.log(`   tip: $${tipAmount}`);
      console.log(`   reference: XQ-${orderId.substring(0, 8)}`);

      const posService = POSFactory.createPOSService(
        integration,
        integration.provider_code,
      );

      try {
        // Aplicar pago completo (amount = 0 significa pagar todo) con propina
        const paymentResult = await posService.applyTender(posOrderId, {
          amount: paymentAmount || 0,
          tip: tipAmount,
          reference: `XQ-${orderId.substring(0, 8)}`,
        });

        console.log(`\n✅ [syncPaidOrder] Pago aplicado exitosamente`);
        console.log(`   status: ${paymentResult.status}`);
        console.log(`   isClosed: ${paymentResult.isClosed}`);
        console.log(`   totals: ${JSON.stringify(paymentResult.totals)}`);

        // 4. Actualizar registro de sync con estado cerrado
        console.log(`\n📝 [syncPaidOrder] Actualizando pos_order_sync...`);
        const { data: sync } = await supabaseAdmin
          .from("pos_order_sync")
          .select("id")
          .eq("local_order_id", orderId)
          .eq("local_order_type", orderType)
          .single();

        if (sync) {
          const newStatus = paymentResult.isClosed ? "closed" : "synced";
          console.log(`   sync.id: ${sync.id}`);
          console.log(`   newStatus: ${newStatus}`);
          await this.updateOrderSync(sync.id, {
            sync_status: newStatus,
            response_payload: {
              posOrderId,
              payment: paymentResult,
            },
          });
          console.log(`   ✅ Sync actualizado`);
        } else {
          console.log(`   ⚠️ No se encontró sync para actualizar`);
        }

        console.log(`\n${"=".repeat(60)}`);
        console.log(`🔄 [syncPaidOrder] FIN - ÉXITO`);
        console.log(`${"=".repeat(60)}\n`);

        return {
          success: true,
          posOrderId,
          provider: integration.provider_code,
          orderCreated: true,
          paymentApplied: true,
          isClosed: paymentResult.isClosed,
        };
      } catch (paymentError) {
        console.error(`\n❌ [syncPaidOrder] Error aplicando pago:`);
        console.error(`   mensaje: ${paymentError.message}`);
        console.error(`   stack: ${paymentError.stack}`);
        console.log(`${"=".repeat(60)}\n`);

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
      console.error(`\n❌ [syncPaidOrder] Error general:`);
      console.error(`   mensaje: ${error.message}`);
      console.error(`   stack: ${error.stack}`);
      console.log(`${"=".repeat(60)}\n`);
      return null;
    }
  }

  // Sincronizar pago de Tap & Pay con el POS
  static async syncTapPayPayment(posOrderId, branchId, amount, tip = 0) {
    try {
      console.log(
        `💳 Sincronizando pago Tap&Pay de $${amount} (propina: $${tip}) para check ${posOrderId}...`,
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
      const result = await posService.applyTender(posOrderId, { amount, tip });

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
