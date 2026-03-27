const { supabaseAdmin } = require("../../config/supabaseAuth");
const agentConnectionManager = require("../../socket/agentConnectionManager");

/**
 * POSMenuSyncService
 * Sincronización bidireccional de menú entre Xquisito y POS (Soft Restaurant)
 *
 * Tablas Xquisito: menu_sections, menu_items, item_branch_availability
 * Tablas POS: grupos, productos, productosdetalle
 */
class POSMenuSyncService {
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

    try {
      // Verificar integración activa
      const integration = await this.getIntegration(branchId);
      if (!integration) {
        throw new Error("No hay integración POS activa para esta sucursal");
      }

      // Verificar agente conectado
      if (!agentConnectionManager.isConnected(branchId)) {
        throw new Error("El agente POS no está conectado");
      }

      // 1. PULL: POS → Xquisito
      console.log("📥 Fase PULL: Obteniendo datos del POS...");
      const pullResult = await this.pullFromPOS(branchId, integration);
      result.pulled = pullResult;

      // 2. PUSH: Xquisito → POS
      console.log("📤 Fase PUSH: Enviando datos al POS...");
      const pushResult = await this.pushToPOS(branchId, integration);
      result.pushed = pushResult;

      result.success = true;
      console.log(`✅ Sync completado:`, result);

      return result;
    } catch (error) {
      console.error(`❌ Error en sync de menú:`, error);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * PULL: Obtener menú del POS y sincronizar a Xquisito
   */
  static async pullFromPOS(branchId, integration) {
    const result = {
      sections: { created: 0, updated: 0 },
      items: { created: 0, updated: 0 },
    };

    // 1. Solicitar menú completo al agente
    const posData = await agentConnectionManager.sendAndWait(
      branchId,
      "sync_menu_pull",
      {},
      60000, // 60 segundos timeout para menús grandes
    );

    if (!posData.groups || !posData.products) {
      console.warn("⚠️ Respuesta del agente incompleta");
      return result;
    }

    console.log(
      `📦 Recibido: ${posData.groups.length} grupos, ${posData.products.length} productos`,
    );

    // 2. Obtener restaurant_id de la sucursal
    const restaurantId = await this.getRestaurantId(branchId);
    if (!restaurantId) {
      throw new Error("No se pudo determinar el restaurant_id de la sucursal");
    }

    // 3. Sincronizar grupos → menu_sections
    for (const group of posData.groups) {
      const sectionResult = await this.syncSection(
        integration.id,
        restaurantId,
        group,
      );
      if (sectionResult.created) result.sections.created++;
      if (sectionResult.updated) result.sections.updated++;
    }

    // 4. Sincronizar productos → menu_items
    for (const product of posData.products) {
      const itemResult = await this.syncItem(integration.id, branchId, product);
      if (itemResult.created) result.items.created++;
      if (itemResult.updated) result.items.updated++;
    }

    return result;
  }

  // PUSH: Enviar items sin mapeo de Xquisito al POS
  static async pushToPOS(branchId, integration) {
    const result = {
      sections: { created: 0 },
      items: { created: 0 },
    };

    // Obtener restaurant_id
    const restaurantId = await this.getRestaurantId(branchId);

    // 1. Buscar secciones sin mapeo
    const unmappedSections = await this.getUnmappedSections(
      integration.id,
      restaurantId,
    );
    console.log(
      `📤 ${unmappedSections.length} secciones sin mapeo para enviar al POS`,
    );

    for (const section of unmappedSections) {
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

    for (const item of unmappedItems) {
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

    // Calcular precios considerando promociones del POS
    // Si tiene_promo, usar precio_promo como precio final y precio_original como base
    const finalPrice = posProduct.tiene_promo && posProduct.precio_promo
      ? posProduct.precio_promo
      : posProduct.precio || 0;
    const basePrice = posProduct.precio_original || posProduct.preciosinimpuestos || posProduct.precio || 0;
    const discountPercent = posProduct.descuento_porcentaje || 0;

    if (posProduct.tiene_promo) {
      console.log(`🏷️ Producto con promo: ${posProduct.descripcion} - Original: $${basePrice}, Promo: $${finalPrice} (${discountPercent}% desc)`);
    }

    // Buscar mapeo existente del item
    const { data: existingMapping, error: mappingError } = await supabaseAdmin
      .from("pos_menu_mapping")
      .select("id, menu_item_id")
      .eq("integration_id", integrationId)
      .eq("pos_item_id", String(posProduct.idproducto))
      .maybeSingle();

    if (mappingError) {
      console.error(`❌ Error buscando mapeo para ${posProduct.idproducto}:`, mappingError.message);
    }

    if (existingMapping) {
      // Actualizar item existente (POS gana)
      const { error } = await supabaseAdmin
        .from("menu_items")
        .update({
          name: posProduct.descripcion,
          description: posProduct.descripcionmenuelectronico || null,
          price: finalPrice,
          base_price: basePrice,
          discount: discountPercent,
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
          price: finalPrice,
          base_price: basePrice,
          discount: discountPercent,
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
