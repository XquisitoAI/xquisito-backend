const BasePOSService = require("./BasePOSService");
const agentConnectionManager = require("../../socket/agentConnectionManager");

class SoftRestaurantPOSService extends BasePOSService {
  constructor(integration) {
    super(integration);
    this.branchId = integration.branch_id;
    this.providerCode = "soft_restaurant";
  }

  // Verificar si el agente está conectado
  isAgentConnected() {
    return agentConnectionManager.isConnected(this.branchId);
  }

  // Helper para enviar comando al agente
  async sendToAgent(event, data, timeout = 30000) {
    if (!this.isAgentConnected()) {
      throw new Error(`Agente SR no conectado para branch ${this.branchId}`);
    }
    return agentConnectionManager.sendAndWait(
      this.branchId,
      event,
      data,
      timeout,
    );
  }

  // ==================== ÓRDENES ====================

  // Crear orden en Soft Restaurant
  async createOrder(orderData) {
    console.log(`📝 Creando orden en SR: branch=${this.branchId}`);

    try {
      const response = await this.sendToAgent("new_order", {
        id: orderData.order_id || orderData.id,
        tableNumber: orderData.table_number,
        orderType: orderData.order_type || "dine_in",
        guests: orderData.guest_count || 1,
        items: orderData.items.map((item) => ({
          productId: item.pos_item_id,
          sku: item.sku || item.pos_item_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          modifiers: item.modifiers || [],
          notes: item.notes || "",
        })),
        notes: orderData.notes || "",
        prepaid: orderData.prepagado || false,
        paymentMethod: orderData.forma_pago || null,
      });

      console.log(`✅ Orden creada en SR: folio=${response.folio}`);
      if (response.totals?.descuento > 0) {
        console.log(`🏷️ Descuento aplicado: $${response.totals.descuento}`);
      }

      const isPrepaid = orderData.prepagado || false;

      return {
        success: true,
        posOrderId: String(response.folio),
        posCheckNumber: response.folio,
        posTableId: orderData.table_number,
        status: isPrepaid ? "closed" : "open",
        isClosed: isPrepaid,
        totals: {
          subtotal: response.totals?.subtotal || 0,
          tax: response.totals?.tax || 0,
          total: response.totals?.total || 0,
          descuento: response.totals?.descuento || 0,
          totalSinDescuento:
            response.totals?.totalSinDescuento || response.totals?.total || 0,
        },
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error creando orden en SR:`, error.message);
      throw error;
    }
  }

  // Actualizar orden existente (agregar/modificar items)
  async updateOrder(posOrderId, orderData) {
    console.log(`📝 Actualizando orden ${posOrderId} en SR`);

    try {
      const response = await this.sendToAgent("update_order", {
        folio: parseInt(posOrderId, 10),
        items: orderData.items.map((item) => ({
          productId: item.pos_item_id,
          sku: item.sku || item.pos_item_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          modifiers: item.modifiers || [],
          notes: item.notes || "",
        })),
      });

      console.log(`✅ Orden ${posOrderId} actualizada`);

      return {
        success: true,
        posOrderId: posOrderId,
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error actualizando orden en SR:`, error.message);
      throw error;
    }
  }

  // Agregar items a orden existente (round)
  async addRound(posOrderId, items) {
    console.log(`➕ Agregando ${items.length} items a folio ${posOrderId}`);

    try {
      const response = await this.sendToAgent("add_items", {
        folio: parseInt(posOrderId, 10),
        items: items.map((item) => ({
          productId: item.pos_item_id,
          sku: item.sku || item.pos_item_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          modifiers: item.modifiers || [],
          notes: item.notes || "",
        })),
      });

      console.log(`✅ Items agregados a folio ${posOrderId}`);

      return {
        success: true,
        posOrderId: posOrderId,
        status: "open",
        totals: {
          subtotal: response.totals?.subtotal || 0,
          tax: response.totals?.tax || 0,
          total: response.totals?.total || 0,
        },
        menuItems: response.items || [],
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error agregando items:`, error.message);
      throw error;
    }
  }

  // Obtener estado de una orden
  async getOrderStatus(posOrderId) {
    console.log(`📊 Consultando estado de folio ${posOrderId}`);

    try {
      const response = await this.sendToAgent("get_order_status", {
        folio: parseInt(posOrderId, 10),
      });

      return {
        success: true,
        posOrderId: posOrderId,
        checkNumber: response.folio,
        status: response.pagado ? "closed" : "open",
        preparationStatus: response.impreso ? "printed" : "pending",
        totals: {
          subtotal: response.subtotal,
          tax: response.totalimpuesto1,
          total: response.total,
        },
        menuItems: response.items || [],
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error consultando estado:`, error.message);
      throw error;
    }
  }

  // ==================== PAGOS (TENDERS) ====================

  // Obtener formas de pago disponibles
  async getTenders() {
    console.log(`💳 Obteniendo formas de pago de SR`);

    try {
      const response = await this.sendToAgent("get_tenders", {});

      console.log(
        `✅ ${response.tenders?.length || 0} formas de pago encontradas`,
      );

      return {
        success: true,
        tenders: (response.tenders || []).map((t) => ({
          id: t.idformadepago,
          name: t.descripcion,
          type: t.tipo,
          requiresReference: t.requierereferencia || false,
        })),
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error obteniendo formas de pago:`, error.message);
      throw error;
    }
  }

  // Aplicar pago a una orden
  async applyTender(posOrderId, tenderData = {}) {
    const amount = tenderData.amount || 0;
    console.log(`💳 Aplicando pago de $${amount} a folio ${posOrderId}`);
    console.log(
      `💳 Branch ID: ${this.branchId}, Agent connected: ${this.isAgentConnected()}`,
    );

    try {
      const response = await this.sendToAgent("apply_payment", {
        folio: parseInt(posOrderId, 10),
        amount: amount,
        tenderId: tenderData.tender_id || tenderData.forma_pago || null,
        reference: tenderData.reference || "XQUISITO",
        tip: tenderData.tip || 0,
      });

      console.log(`✅ Pago aplicado a folio ${posOrderId}`);

      const isClosed = response.status === "closed" || response.pagado;

      return {
        success: true,
        posOrderId: posOrderId,
        status: isClosed ? "closed" : "open",
        isClosed: isClosed,
        totals: response.totals || {},
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error aplicando pago:`, error.message);
      throw error;
    }
  }

  // Cerrar orden (pagar todo lo pendiente)
  async closeOrder(posOrderId) {
    console.log(`🔒 Cerrando folio ${posOrderId}`);
    return this.applyTender(posOrderId, { amount: 0 });
  }

  // ==================== CONSULTAS ====================

  // Obtener checks por mesa
  async getChecksByTable(tableNumber, options = {}) {
    console.log(`🔍 Buscando cheques para mesa ${tableNumber}`);

    try {
      const response = await this.sendToAgent("get_checks_by_table", {
        table: String(tableNumber),
        includeClosed: options.includeClosed || false,
      });

      const checks = response.checks || [];
      console.log(`✅ ${checks.length} cheque(s) encontrado(s)`);

      return {
        success: true,
        checks: checks.map((check) => ({
          checkRef: check.folio,
          checkNumber: check.folio,
          tableName: check.mesa,
          status: check.pagado ? "closed" : "open",
          guestCount: check.nopersonas,
          totals: {
            subtotal: check.subtotal,
            tax: check.totalimpuesto1,
            total: check.total,
          },
          menuItems: check.items || [],
          rawResponse: check,
        })),
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error buscando cheques:`, error.message);
      throw error;
    }
  }

  // Obtener check abierto de una mesa
  async getOpenCheckByTable(tableNumber) {
    try {
      const result = await this.getChecksByTable(tableNumber, {
        includeClosed: false,
      });

      if (!result.success || result.checks.length === 0) {
        return {
          success: false,
          error: `No hay cheques abiertos para mesa ${tableNumber}`,
        };
      }

      const check = result.checks[0];
      console.log(`✅ Cheque abierto: folio ${check.checkRef}`);

      return {
        success: true,
        check,
      };
    } catch (error) {
      console.error(`❌ Error buscando cheque abierto:`, error.message);
      throw error;
    }
  }

  // ==================== MENÚ ====================

  // Obtener lista de menús/categorías
  async getMenuList() {
    console.log(`📋 Obteniendo categorías de SR`);

    try {
      const response = await this.sendToAgent("get_menu_list", {});

      console.log(
        `✅ ${response.categories?.length || 0} categorías encontradas`,
      );

      return {
        success: true,
        menus: (response.categories || []).map((cat) => ({
          menuId: cat.idgrupo,
          name: cat.descripcion,
          itemCount: cat.productos || 0,
        })),
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error obteniendo categorías:`, error.message);
      throw error;
    }
  }

  // Obtener menú completo o por categoría
  async getMenu(menuId = null) {
    console.log(
      `📋 Obteniendo menú de SR${menuId ? ` (grupo ${menuId})` : ""}`,
    );

    try {
      const response = await this.sendToAgent("get_menu", {
        groupId: menuId,
      });

      console.log(`✅ ${response.items?.length || 0} productos encontrados`);

      return {
        success: true,
        menuId: menuId,
        name: response.groupName || "Menú",
        menuItems: (response.items || []).map((item) => ({
          id: item.idproducto,
          name: item.descripcion,
          price: item.precio1,
          category: item.idgrupo,
          taxRate: item.impuesto1 || 16,
          available: item.activo !== false,
          sku: item.idproducto,
        })),
        familyGroups: response.groups || [],
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error obteniendo menú:`, error.message);
      throw error;
    }
  }

  // ==================== CANCELACIÓN ====================

  // Cancelar orden
  async cancelOrder(posOrderId) {
    console.log(`🚫 Cancelando folio ${posOrderId}`);

    try {
      const response = await this.sendToAgent("cancel_order", {
        folio: parseInt(posOrderId, 10),
      });

      console.log(`✅ Folio ${posOrderId} cancelado`);

      return {
        success: true,
        posOrderId: posOrderId,
        rawResponse: response,
      };
    } catch (error) {
      console.error(`❌ Error cancelando orden:`, error.message);
      throw error;
    }
  }
}

module.exports = SoftRestaurantPOSService;
