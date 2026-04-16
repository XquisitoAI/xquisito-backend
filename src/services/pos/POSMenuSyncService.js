const { supabaseAdmin } = require("../../config/supabaseAuth");
const agentConnectionManager = require("../../socket/agentConnectionManager");
const { getIO, isSocketInitialized } = require("../../socket/socketServer");

/**
 * POSMenuSyncService
 * Sincronización bidireccional de menú entre Xquisito y POS (Soft Restaurant)
 *
 * Tablas Xquisito: menu_sections, menu_items, item_branch_availability
 * Tablas POS: grupos, productos, productosdetalle
 */
class POSMenuSyncService {
  // Emite evento de progreso de sincronización al frontend
  static emitSyncProgress(branchId, restaurantId, step, status, details = {}) {
    if (!isSocketInitialized()) return;

    try {
      const io = getIO();
      const roomName = `restaurant:${restaurantId}`;

      io.to(roomName).emit("sync:progress", {
        branchId,
        step,
        status, // 'started' | 'in_progress' | 'completed' | 'error'
        details,
        timestamp: new Date().toISOString(),
      });

      console.log(`📡 Sync progress emitted: ${step} - ${status}`);
    } catch (error) {
      console.error("Error emitting sync progress:", error);
    }
  }

  /**
   * Sincronización completa bidireccional
   * 1. PULL: Trae grupos y productos del POS
   * 2. PUSH: Envía secciones e items sin mapeo al POS
   */
  static async syncMenu(branchId) {
    console.log(`🔄 Iniciando sync de menú para branch ${branchId}...`);

    const result = {
      success: false,
      pulled: {
        sections: { created: 0, updated: 0 },
        items: { created: 0, updated: 0 },
      },
      pushed: { sections: { created: 0 }, items: { created: 0 } },
      errors: [],
    };

    // Obtener restaurantId para emitir eventos
    const restaurantId = await this.getRestaurantId(branchId);

    try {
      // Emitir inicio de sincronización
      this.emitSyncProgress(branchId, restaurantId, "connecting", "started", {
        message: "Conectando con el agente POS...",
      });

      // Verificar integración activa
      const integration = await this.getIntegration(branchId);
      if (!integration) {
        throw new Error("No hay integración POS activa para esta sucursal");
      }

      // Verificar agente conectado
      if (!agentConnectionManager.isConnected(branchId)) {
        throw new Error("El agente POS no está conectado");
      }

      this.emitSyncProgress(branchId, restaurantId, "connecting", "completed", {
        message: "Conexión establecida",
      });

      // 1. PULL: POS → Xquisito
      this.emitSyncProgress(branchId, restaurantId, "pulling", "started", {
        message: "Obteniendo datos del POS...",
      });

      console.log("📥 Fase PULL: Obteniendo datos del POS...");
      const pullResult = await this.pullFromPOS(
        branchId,
        integration,
        restaurantId,
      );
      result.pulled = pullResult;

      this.emitSyncProgress(branchId, restaurantId, "pulling", "completed", {
        message: "Datos obtenidos del POS",
        sections: pullResult.sections,
        items: pullResult.items,
      });

      // 2. PUSH: Xquisito → POS
      this.emitSyncProgress(branchId, restaurantId, "pushing", "started", {
        message: "Enviando cambios al POS...",
      });

      console.log("📤 Fase PUSH: Enviando datos al POS...");
      const pushResult = await this.pushToPOS(
        branchId,
        integration,
        restaurantId,
      );
      result.pushed = pushResult;

      this.emitSyncProgress(branchId, restaurantId, "pushing", "completed", {
        message: "Cambios enviados al POS",
        sections: pushResult.sections,
        items: pushResult.items,
      });

      // Finalización
      this.emitSyncProgress(branchId, restaurantId, "finalizing", "started", {
        message: "Finalizando sincronización...",
      });

      result.success = true;
      console.log(`✅ Sync completado:`, result);

      this.emitSyncProgress(branchId, restaurantId, "finalizing", "completed", {
        message: "Sincronización completada",
        result,
      });

      return result;
    } catch (error) {
      console.error(`❌ Error en sync de menú:`, error);
      result.errors.push(error.message);

      this.emitSyncProgress(branchId, restaurantId, "error", "error", {
        message: error.message,
        errors: result.errors,
      });

      return result;
    }
  }

  // PULL: Obtener menú del POS y sincronizar a Xquisito (OPTIMIZADO con batch)
  static async pullFromPOS(branchId, integration, restaurantId) {
    const result = {
      sections: { created: 0, updated: 0, skipped: 0 },
      items: { created: 0, updated: 0, skipped: 0 },
    };

    // 1. Solicitar menú completo al agente
    this.emitSyncProgress(branchId, restaurantId, "pulling", "in_progress", {
      message: "Solicitando menú al agente POS...",
    });

    const posData = await agentConnectionManager.sendAndWait(
      branchId,
      "sync_menu_pull",
      {},
      60000,
    );

    if (!posData.groups || !posData.products) {
      console.warn("⚠️ Respuesta del agente incompleta");
      return result;
    }

    console.log(
      `📦 Recibido: ${posData.groups.length} grupos, ${posData.products.length} productos`,
    );

    if (!restaurantId) {
      throw new Error("No se pudo determinar el restaurant_id de la sucursal");
    }

    // 2. BATCH: Cargar todos los mapeos existentes en memoria (2 queries total)
    this.emitSyncProgress(branchId, restaurantId, "pulling", "in_progress", {
      message: "Cargando mapeos existentes...",
    });

    const { data: existingSectionMappings } = await supabaseAdmin
      .from("pos_section_mapping")
      .select(
        "id, menu_section_id, pos_group_id, pos_group_name, menu_sections(name, display_order, clasificacion)",
      )
      .eq("integration_id", integration.id);

    const { data: existingItemMappings } = await supabaseAdmin
      .from("pos_menu_mapping")
      .select(
        "id, menu_item_id, pos_item_id, pos_item_name, menu_items(name, description, price, section_id)",
      )
      .eq("integration_id", integration.id);

    // Crear mapas para búsqueda rápida O(1)
    const sectionMapByPosId = new Map(
      (existingSectionMappings || []).map((m) => [m.pos_group_id, m]),
    );
    const itemMapByPosId = new Map(
      (existingItemMappings || []).map((m) => [String(m.pos_item_id), m]),
    );

    console.log(
      `📋 Mapeos existentes: ${sectionMapByPosId.size} secciones, ${itemMapByPosId.size} items`,
    );

    // 3. Procesar SECCIONES - comparar en memoria, solo escribir cambios
    this.emitSyncProgress(branchId, restaurantId, "pulling", "in_progress", {
      message: `Procesando ${posData.groups.length} secciones...`,
    });

    const sectionsToCreate = [];
    const sectionsToUpdate = [];
    const newSectionMappings = [];

    for (const group of posData.groups) {
      const existing = sectionMapByPosId.get(group.idgrupo);

      if (existing) {
        // Verificar si cambió algo
        const currentName = existing.menu_sections?.name;
        const currentOrder = existing.menu_sections?.display_order;
        const currentClasificacion = existing.menu_sections?.clasificacion;
        if (
          currentName !== group.descripcion ||
          currentOrder !== (group.prioridad || 0) ||
          currentClasificacion !== group.clasificacion
        ) {
          sectionsToUpdate.push({
            id: existing.menu_section_id,
            name: group.descripcion,
            display_order: group.prioridad || 0,
            clasificacion: group.clasificacion || null,
            updated_at: new Date().toISOString(),
          });
          result.sections.updated++;
        } else {
          result.sections.skipped++;
        }
      } else {
        // Nueva sección
        sectionsToCreate.push({
          restaurant_id: restaurantId,
          name: group.descripcion,
          display_order: group.prioridad || 0,
          clasificacion: group.clasificacion || null,
          is_active: true,
          _pos_group_id: group.idgrupo, // temporal para mapeo
        });
      }
    }

    // Batch INSERT nuevas secciones
    if (sectionsToCreate.length > 0) {
      const insertData = sectionsToCreate.map(
        ({ _pos_group_id, ...rest }) => rest,
      );
      const { data: newSections, error } = await supabaseAdmin
        .from("menu_sections")
        .insert(insertData)
        .select("id, name");

      if (!error && newSections) {
        // Crear mapeos para las nuevas secciones
        for (let i = 0; i < newSections.length; i++) {
          newSectionMappings.push({
            integration_id: integration.id,
            menu_section_id: newSections[i].id,
            pos_group_id: sectionsToCreate[i]._pos_group_id,
            pos_group_name: sectionsToCreate[i].name,
            sync_direction: "both",
            last_synced_at: new Date().toISOString(),
          });
          // Agregar al mapa para uso en items
          sectionMapByPosId.set(sectionsToCreate[i]._pos_group_id, {
            menu_section_id: newSections[i].id,
            pos_group_id: sectionsToCreate[i]._pos_group_id,
          });
        }
        result.sections.created = newSections.length;

        // Batch INSERT mapeos de secciones con upsert para tolerar race conditions
        await supabaseAdmin
          .from("pos_section_mapping")
          .upsert(newSectionMappings, {
            onConflict: "integration_id,pos_group_id",
            ignoreDuplicates: true,
          });
      }
    }

    // Batch UPDATE secciones existentes
    for (const section of sectionsToUpdate) {
      await supabaseAdmin
        .from("menu_sections")
        .update({
          name: section.name,
          display_order: section.display_order,
          clasificacion: section.clasificacion,
          updated_at: section.updated_at,
        })
        .eq("id", section.id);
    }

    console.log(
      `✅ Secciones: ${result.sections.created} creadas, ${result.sections.updated} actualizadas, ${result.sections.skipped} sin cambios`,
    );

    // 4. Procesar ITEMS - comparar en memoria, solo escribir cambios
    this.emitSyncProgress(branchId, restaurantId, "pulling", "in_progress", {
      message: `Procesando ${posData.products.length} productos...`,
    });

    const itemsToCreate = [];
    const itemsToUpdate = [];
    const newItemMappings = [];

    for (const product of posData.products) {
      const sectionMapping = sectionMapByPosId.get(product.idgrupo);
      if (!sectionMapping) {
        console.warn(
          `⚠️ Producto ${product.descripcion} sin sección mapeada (grupo ${product.idgrupo})`,
        );
        continue;
      }

      const existing = itemMapByPosId.get(String(product.idproducto));
      // POS: precio = CON IVA, preciosinimpuestos = SIN IVA
      const priceWithTax = product.precio || 0;
      const priceWithoutTax = product.preciosinimpuestos || priceWithTax / 1.16;

      if (existing) {
        // Solo verificar si cambió el nombre (POS gana en nombre)
        // NO se actualiza description ni price - Xquisito mantiene los suyos
        const current = existing.menu_items;
        if (current?.name !== product.descripcion) {
          itemsToUpdate.push({
            id: existing.menu_item_id,
            name: product.descripcion,
            updated_at: new Date().toISOString(),
          });
          result.items.updated++;
        } else {
          result.items.skipped++;
        }
      } else {
        // Nuevo item - usar precios del POS
        itemsToCreate.push({
          section_id: sectionMapping.menu_section_id,
          name: product.descripcion,
          description: product.descripcionmenuelectronico || null,
          price: priceWithTax, // CON IVA (lo que ve el cliente)
          base_price: priceWithoutTax, // SIN IVA (para cálculos)
          is_available: true,
          display_order: 0,
          _pos_item_id: product.idproducto,
        });
      }
    }

    // Batch INSERT nuevos items
    if (itemsToCreate.length > 0) {
      // Re-verificar contra DB para evitar race conditions (dos syncs simultáneos)
      const { data: freshMappings } = await supabaseAdmin
        .from("pos_menu_mapping")
        .select("pos_item_id")
        .eq("integration_id", integration.id)
        .in(
          "pos_item_id",
          itemsToCreate.map((i) => String(i._pos_item_id)),
        );

      const alreadyMapped = new Set(
        (freshMappings || []).map((m) => String(m.pos_item_id)),
      );

      const trulyNew = itemsToCreate.filter(
        (i) => !alreadyMapped.has(String(i._pos_item_id)),
      );

      if (trulyNew.length > 0) {
        const insertData = trulyNew.map(({ _pos_item_id, ...rest }) => rest);
        const { data: newItems, error } = await supabaseAdmin
          .from("menu_items")
          .insert(insertData)
          .select("id, name");

        if (!error && newItems) {
          // Crear mapeos y disponibilidad para los nuevos items
          const availabilityData = [];
          for (let i = 0; i < newItems.length; i++) {
            newItemMappings.push({
              integration_id: integration.id,
              menu_item_id: newItems[i].id,
              pos_item_id: trulyNew[i]._pos_item_id,
              pos_item_name: trulyNew[i].name,
              sync_direction: "both",
              is_synced: true,
              last_synced_at: new Date().toISOString(),
            });
            availabilityData.push({
              item_id: newItems[i].id,
              branch_id: branchId,
              is_available: true,
            });
          }
          result.items.created = newItems.length;

          // Batch INSERT mapeos con upsert para tolerar race conditions
          await supabaseAdmin.from("pos_menu_mapping").upsert(newItemMappings, {
            onConflict: "integration_id,pos_item_id",
            ignoreDuplicates: true,
          });
          // Batch INSERT disponibilidad con upsert
          await supabaseAdmin
            .from("item_branch_availability")
            .upsert(availabilityData, {
              onConflict: "item_id,branch_id",
              ignoreDuplicates: true,
            });
        }
      } else {
        console.log(
          `   ℹ️ Todos los items nuevos ya fueron insertados por sync concurrente, saltando`,
        );
      }
    }

    // Batch UPDATE items existentes (en lotes de 50 para no sobrecargar)
    // Solo actualiza name — description y price los mantiene Xquisito
    const BATCH_SIZE = 50;
    for (let i = 0; i < itemsToUpdate.length; i += BATCH_SIZE) {
      const batch = itemsToUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((item) =>
          supabaseAdmin
            .from("menu_items")
            .update({
              name: item.name,
              updated_at: item.updated_at,
            })
            .eq("id", item.id),
        ),
      );
    }

    console.log(
      `✅ Items: ${result.items.created} creados, ${result.items.updated} actualizados, ${result.items.skipped} sin cambios`,
    );

    this.emitSyncProgress(branchId, restaurantId, "pulling", "in_progress", {
      message: `Completado: ${result.sections.created + result.sections.updated} secciones, ${result.items.created + result.items.updated} items procesados`,
    });

    return result;
  }

  // PUSH: Enviar items sin mapeo de Xquisito al POS
  static async pushToPOS(branchId, integration, restaurantId) {
    const result = {
      sections: { created: 0 },
      items: { created: 0 },
    };

    // 1. Buscar secciones sin mapeo
    const unmappedSections = await this.getUnmappedSections(
      integration.id,
      restaurantId,
    );
    console.log(
      `📤 ${unmappedSections.length} secciones sin mapeo para enviar al POS`,
    );

    this.emitSyncProgress(branchId, restaurantId, "pushing", "in_progress", {
      message: `Encontradas ${unmappedSections.length} secciones para enviar al POS...`,
      totalSections: unmappedSections.length,
    });

    for (let i = 0; i < unmappedSections.length; i++) {
      const section = unmappedSections[i];
      try {
        const posGroup = await agentConnectionManager.sendAndWait(
          branchId,
          "sync_menu_push_group",
          {
            name: section.name,
            displayOrder: section.display_order || 0,
          },
          30000,
        );

        if (posGroup.idgrupo) {
          // Crear mapeo
          await this.createSectionMapping(
            integration.id,
            section.id,
            posGroup.idgrupo,
            section.name,
          );
          result.sections.created++;
        }
        // Emitir progreso
        this.emitSyncProgress(
          branchId,
          restaurantId,
          "pushing",
          "in_progress",
          {
            message: `Enviando secciones al POS... (${i + 1}/${unmappedSections.length})`,
            progress: {
              current: i + 1,
              total: unmappedSections.length,
              type: "sections",
            },
          },
        );
      } catch (error) {
        console.error(
          `❌ Error enviando sección ${section.name}:`,
          error.message,
        );
      }
    }

    // 2. Buscar items sin mapeo
    const unmappedItems = await this.getUnmappedItems(
      integration.id,
      restaurantId,
    );
    console.log(
      `📤 ${unmappedItems.length} items sin mapeo para enviar al POS`,
    );

    this.emitSyncProgress(branchId, restaurantId, "pushing", "in_progress", {
      message: `Encontrados ${unmappedItems.length} items para enviar al POS...`,
      totalItems: unmappedItems.length,
    });

    for (let i = 0; i < unmappedItems.length; i++) {
      const item = unmappedItems[i];
      try {
        // Primero verificar que la sección tenga mapeo
        const sectionMapping = await this.getSectionMapping(
          integration.id,
          item.section_id,
        );
        if (!sectionMapping) {
          console.warn(
            `⚠️ Item ${item.name} no tiene sección mapeada, saltando...`,
          );
          continue;
        }

        const posProduct = await agentConnectionManager.sendAndWait(
          branchId,
          "sync_menu_push_product",
          {
            name: item.name,
            description: item.description || "",
            price: parseFloat(item.price) || 0,
            groupId: sectionMapping.pos_group_id,
          },
          30000,
        );

        if (posProduct.idproducto) {
          // Crear mapeo
          await this.createItemMapping(
            integration.id,
            item.id,
            posProduct.idproducto,
            item.name,
          );
          result.items.created++;
        }

        // Emitir progreso cada 5 items o al final
        if ((i + 1) % 5 === 0 || i === unmappedItems.length - 1) {
          this.emitSyncProgress(
            branchId,
            restaurantId,
            "pushing",
            "in_progress",
            {
              message: `Enviando items al POS... (${i + 1}/${unmappedItems.length})`,
              progress: {
                current: i + 1,
                total: unmappedItems.length,
                type: "items",
              },
            },
          );
        }
      } catch (error) {
        console.error(`❌ Error enviando item ${item.name}:`, error.message);
      }
    }

    return result;
  }

  // ==================== HELPERS ====================

  // Obtener integración POS activa para una sucursal
  static async getIntegration(branchId) {
    const { data, error } = await supabaseAdmin
      .from("pos_integrations")
      .select("*, pos_providers!inner(code, name)")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .single();

    if (error) return null;
    return data;
  }

  // Obtener restaurant_id de una sucursal
  static async getRestaurantId(branchId) {
    const { data, error } = await supabaseAdmin
      .from("branches")
      .select("restaurant_id")
      .eq("id", branchId)
      .single();

    if (error || !data) return null;
    return data.restaurant_id;
  }

  // Sincronizar un grupo del POS a menu_sections
  static async syncSection(integrationId, restaurantId, posGroup) {
    const result = { created: false, updated: false };

    // Buscar mapeo existente
    const { data: existingMapping } = await supabaseAdmin
      .from("pos_section_mapping")
      .select("id, menu_section_id")
      .eq("integration_id", integrationId)
      .eq("pos_group_id", posGroup.idgrupo)
      .single();

    if (existingMapping) {
      // Actualizar sección existente (POS gana)
      const { error } = await supabaseAdmin
        .from("menu_sections")
        .update({
          name: posGroup.descripcion,
          display_order: posGroup.prioridad || 0,
          clasificacion: posGroup.clasificacion || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMapping.menu_section_id);

      if (!error) {
        // Actualizar timestamp del mapeo
        await supabaseAdmin
          .from("pos_section_mapping")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", existingMapping.id);
        result.updated = true;
      }
    } else {
      // Crear nueva sección
      const { data: newSection, error: sectionError } = await supabaseAdmin
        .from("menu_sections")
        .insert({
          restaurant_id: restaurantId,
          name: posGroup.descripcion,
          display_order: posGroup.prioridad || 0,
          clasificacion: posGroup.clasificacion || null,
          is_active: true,
        })
        .select("id")
        .single();

      if (!sectionError && newSection) {
        // Crear mapeo
        await this.createSectionMapping(
          integrationId,
          newSection.id,
          posGroup.idgrupo,
          posGroup.descripcion,
        );
        result.created = true;
      }
    }

    return result;
  }

  // Sincronizar un producto del POS a menu_items
  static async syncItem(integrationId, branchId, posProduct) {
    const result = { created: false, updated: false };

    // Buscar mapeo de sección
    const sectionMapping = await this.getSectionMappingByPosGroupId(
      integrationId,
      posProduct.idgrupo,
    );
    if (!sectionMapping) {
      console.warn(
        `⚠️ Producto ${posProduct.descripcion} sin sección mapeada (grupo ${posProduct.idgrupo})`,
      );
      return result;
    }

    // Usar precio del POS (descuentos se aplican en órdenes, no en sync)
    const price = posProduct.precio || 0;

    // Buscar mapeo existente del item
    const { data: existingMapping, error: mappingError } = await supabaseAdmin
      .from("pos_menu_mapping")
      .select("id, menu_item_id")
      .eq("integration_id", integrationId)
      .eq("pos_item_id", String(posProduct.idproducto))
      .maybeSingle();

    if (mappingError) {
      console.error(
        `❌ Error buscando mapeo para ${posProduct.idproducto}:`,
        mappingError.message,
      );
    }

    if (existingMapping) {
      // Actualizar item existente (POS gana)
      const { error } = await supabaseAdmin
        .from("menu_items")
        .update({
          name: posProduct.descripcion,
          description: posProduct.descripcionmenuelectronico || null,
          price: price,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMapping.menu_item_id);

      if (!error) {
        // Actualizar timestamp del mapeo
        await supabaseAdmin
          .from("pos_menu_mapping")
          .update({
            last_synced_at: new Date().toISOString(),
            pos_item_name: posProduct.descripcion,
          })
          .eq("id", existingMapping.id);
        result.updated = true;
      }
    } else {
      // Crear nuevo item
      const { data: newItem, error: itemError } = await supabaseAdmin
        .from("menu_items")
        .insert({
          section_id: sectionMapping.menu_section_id,
          name: posProduct.descripcion,
          description: posProduct.descripcionmenuelectronico || null,
          price: price,
          is_available: true,
          display_order: 0,
        })
        .select("id")
        .single();

      if (!itemError && newItem) {
        // Crear mapeo
        await this.createItemMapping(
          integrationId,
          newItem.id,
          posProduct.idproducto,
          posProduct.descripcion,
        );

        // Crear disponibilidad para la sucursal
        await this.createBranchAvailability(newItem.id, branchId);

        result.created = true;
      }
    }

    return result;
  }

  // Crear mapeo de sección
  static async createSectionMapping(
    integrationId,
    menuSectionId,
    posGroupId,
    posGroupName,
  ) {
    const { error } = await supabaseAdmin.from("pos_section_mapping").insert({
      integration_id: integrationId,
      menu_section_id: menuSectionId,
      pos_group_id: posGroupId,
      pos_group_name: posGroupName,
      sync_direction: "both",
      last_synced_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error creando mapeo de sección:", error);
    }
  }

  // Crear mapeo de item
  static async createItemMapping(
    integrationId,
    menuItemId,
    posItemId,
    posItemName,
  ) {
    const { error } = await supabaseAdmin.from("pos_menu_mapping").insert({
      integration_id: integrationId,
      menu_item_id: menuItemId,
      pos_item_id: posItemId,
      pos_item_name: posItemName,
      sync_direction: "both",
      is_synced: true,
      last_synced_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error creando mapeo de item:", error);
    }
  }

  // Crear disponibilidad de item para sucursal
  static async createBranchAvailability(itemId, branchId) {
    // Verificar si ya existe
    const { data: existing } = await supabaseAdmin
      .from("item_branch_availability")
      .select("id")
      .eq("item_id", itemId)
      .eq("branch_id", branchId)
      .single();

    if (existing) return;

    const { error } = await supabaseAdmin
      .from("item_branch_availability")
      .insert({
        item_id: itemId,
        branch_id: branchId,
        is_available: true,
      });

    if (error) {
      console.error("Error creando disponibilidad de branch:", error);
    }
  }

  // Obtener mapeo de sección por pos_group_id
  static async getSectionMappingByPosGroupId(integrationId, posGroupId) {
    const { data } = await supabaseAdmin
      .from("pos_section_mapping")
      .select("*")
      .eq("integration_id", integrationId)
      .eq("pos_group_id", posGroupId)
      .single();

    return data;
  }

  // Obtener mapeo de sección por menu_section_id
  static async getSectionMapping(integrationId, menuSectionId) {
    const { data } = await supabaseAdmin
      .from("pos_section_mapping")
      .select("*")
      .eq("integration_id", integrationId)
      .eq("menu_section_id", menuSectionId)
      .single();

    return data;
  }

  // Obtener secciones sin mapeo POS
  static async getUnmappedSections(integrationId, restaurantId) {
    // Obtener todas las secciones del restaurante
    const { data: sections } = await supabaseAdmin
      .from("menu_sections")
      .select("id, name, display_order")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true);

    if (!sections) return [];

    // Obtener secciones ya mapeadas
    const { data: mappings } = await supabaseAdmin
      .from("pos_section_mapping")
      .select("menu_section_id")
      .eq("integration_id", integrationId);

    const mappedIds = new Set(mappings?.map((m) => m.menu_section_id) || []);

    // Filtrar las que no tienen mapeo
    return sections.filter((s) => !mappedIds.has(s.id));
  }

  // Obtener items sin mapeo POS
  static async getUnmappedItems(integrationId, restaurantId) {
    // Obtener todas las secciones del restaurante
    const { data: sections } = await supabaseAdmin
      .from("menu_sections")
      .select("id")
      .eq("restaurant_id", restaurantId);

    if (!sections || sections.length === 0) return [];

    const sectionIds = sections.map((s) => s.id);

    // Obtener todos los items de esas secciones
    const { data: items } = await supabaseAdmin
      .from("menu_items")
      .select("id, section_id, name, description, price")
      .in("section_id", sectionIds)
      .eq("is_available", true);

    if (!items) return [];

    // Obtener items ya mapeados
    const { data: mappings } = await supabaseAdmin
      .from("pos_menu_mapping")
      .select("menu_item_id")
      .eq("integration_id", integrationId);

    const mappedIds = new Set(mappings?.map((m) => m.menu_item_id) || []);

    // Filtrar los que no tienen mapeo
    return items.filter((i) => !mappedIds.has(i.id));
  }

  // Verificar estado de conexión del agente
  static async getAgentStatus(branchId) {
    const isConnected = agentConnectionManager.isConnected(branchId);
    const integration = await this.getIntegration(branchId);

    return {
      hasIntegration: !!integration,
      isActive: integration?.is_active || false,
      isAgentConnected: isConnected,
      providerName: integration?.pos_providers?.name || null,
    };
  }
}

module.exports = POSMenuSyncService;
