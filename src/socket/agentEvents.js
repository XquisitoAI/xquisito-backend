/**
 * Agent Events - Handlers para agentes Soft Restaurant
 * Namespace: /sync
 */

const agentConnectionManager = require("./agentConnectionManager");
const { supabaseAdmin } = require("../config/supabaseAuth");

// Configurar namespace /sync para agentes
function setupAgentNamespace(io) {
  const syncNamespace = io.of("/sync");

  // No usar el middleware de auth normal, los agentes usan syncToken
  syncNamespace.on("connection", (socket) => {
    console.log(`🔌 [/sync] Nueva conexión: ${socket.id}`);

    let registeredBranchId = null;

    // === REGISTRO ===
    socket.on("register", async (data) => {
      try {
        const { branchId, syncToken, agentVersion } = data;

        if (!branchId || !syncToken) {
          socket.emit("register_error", {
            error: "branchId y syncToken son requeridos",
          });
          socket.disconnect(true);
          return;
        }

        // Validar token
        const isValid = await agentConnectionManager.validateToken(
          branchId,
          syncToken,
        );

        if (!isValid) {
          console.warn(`❌ Token inválido para branch ${branchId}`);
          socket.emit("register_error", {
            error: "Token inválido o integración no activa",
          });
          socket.disconnect(true);
          return;
        }

        // Registrar agente
        agentConnectionManager.register(socket, branchId);
        registeredBranchId = branchId;

        socket.emit("register_ack", {
          success: true,
          message: "Agente registrado exitosamente",
          branchId,
          timestamp: new Date().toISOString(),
        });

        // Enviar configuración de impresoras activas
        try {
          const { data: printers } = await supabaseAdmin
            .from("branch_printers")
            .select("id, ip, port, role, name, is_active")
            .eq("branch_id", branchId)
            .eq("is_active", true);

          if (printers && printers.length > 0) {
            socket.emit("printers_config", { printers });
            console.log(
              `🖨️ [/sync] Enviadas ${printers.length} impresora(s) a branch ${branchId}`,
            );
          }
        } catch (err) {
          console.warn(
            `⚠️ [/sync] No se pudo enviar printers_config: ${err.message}`,
          );
        }

        console.log(
          `✅ [/sync] Agente registrado: branch=${branchId}, version=${agentVersion}`,
        );
      } catch (error) {
        console.error("Error en registro de agente:", error);
        socket.emit("register_error", { error: "Error interno del servidor" });
      }
    });

    // === ACK DE ORDEN ===
    socket.on("order_ack", (data) => {
      console.log(
        `✅ [/sync] Orden ACK: orderId=${data.orderId}, folio=${data.folio}`,
      );

      // Manejar como respuesta a request pendiente
      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: true,
        folio: data.folio,
        orderId: data.orderId,
      });

      // TODO: Actualizar pos_order_sync con el folio
    });

    // === ERROR DE ORDEN ===
    socket.on("order_error", (data) => {
      console.error(
        `❌ [/sync] Orden ERROR: orderId=${data.orderId}, error=${data.error}`,
      );

      // Manejar como respuesta a request pendiente
      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        error: data.error,
        orderId: data.orderId,
      });

      // TODO: Registrar error en pos_order_sync
    });

    // === ACK DE PAGO (apply_payment_ack) ===
    socket.on("apply_payment_ack", (data) => {
      console.log(
        `✅ [/sync] Pago ACK: folio=${data.folio}, status=${data.status}`,
      );

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        folio: data.folio,
        status: data.status,
        pagado: data.pagado,
        totalPagado: data.totalPagado,
        totalCheque: data.totalCheque,
        error: data.error,
      });
    });

    // === ACK DE AGREGAR ITEMS ===
    socket.on("add_items_ack", (data) => {
      console.log(`✅ [/sync] Add Items ACK: folio=${data.folio}`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        folio: data.folio,
        itemsAdded: data.itemsAdded,
        error: data.error,
      });
    });

    // === ACK DE ESTADO DE ORDEN ===
    socket.on("get_order_status_ack", (data) => {
      console.log(`✅ [/sync] Order Status ACK: folio=${data.folio}`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        ...data,
      });
    });

    // === ACK DE CHEQUES POR MESA ===
    socket.on("get_checks_by_table_ack", (data) => {
      console.log(`✅ [/sync] Checks by Table ACK`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        checks: data.checks,
        error: data.error,
      });
    });

    // === ACK DE CANCELAR ORDEN ===
    socket.on("cancel_order_ack", (data) => {
      console.log(`✅ [/sync] Cancel Order ACK: folio=${data.folio}`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        error: data.error,
      });
    });

    // === ACK DE FORMAS DE PAGO ===
    socket.on("get_tenders_ack", (data) => {
      console.log(`✅ [/sync] Tenders ACK`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        tenders: data.tenders,
        error: data.error,
      });
    });

    // === ACK DE LISTA DE MENÚ ===
    socket.on("get_menu_list_ack", (data) => {
      console.log(`✅ [/sync] Menu List ACK`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        categories: data.categories,
        error: data.error,
      });
    });

    // === ACK DE MENÚ ===
    socket.on("get_menu_ack", (data) => {
      console.log(`✅ [/sync] Menu ACK`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        items: data.items,
        groups: data.groups,
        groupName: data.groupName,
        error: data.error,
      });
    });

    // === ACK DE SYNC MENU PULL ===
    socket.on("sync_menu_pull_ack", (data) => {
      console.log(
        `✅ [/sync] Sync Menu Pull ACK: ${data.groups?.length || 0} grupos, ${data.products?.length || 0} productos`,
      );

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        groups: data.groups,
        products: data.products,
        error: data.error,
      });
    });

    // === ACK DE SYNC MENU PUSH GROUP ===
    socket.on("sync_menu_push_group_ack", (data) => {
      console.log(`✅ [/sync] Sync Menu Push Group ACK: ${data.idgrupo}`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        idgrupo: data.idgrupo,
        descripcion: data.descripcion,
        error: data.error,
      });
    });

    // === ACK DE SYNC MENU PUSH PRODUCT ===
    socket.on("sync_menu_push_product_ack", (data) => {
      console.log(`✅ [/sync] Sync Menu Push Product ACK: ${data.idproducto}`);

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        idproducto: data.idproducto,
        descripcion: data.descripcion,
        precio: data.precio,
        error: data.error,
      });
    });

    // === REPORTE DE IMPRESORAS (iniciado desde el agente) ===
    socket.on("printers_report", async (data) => {
      const branchId = registeredBranchId || data?.branchId;
      const printers = data?.printers || [];
      console.log(
        `🖨️ [/sync] Printers report: branch=${branchId}, ${printers.length} impresora(s)`,
      );

      if (!branchId || printers.length === 0) return;

      try {
        const rows = printers.map(({ ip, port }) => ({
          branch_id: branchId,
          ip,
          port,
          last_seen_at: new Date().toISOString(),
        }));

        await supabaseAdmin
          .from("branch_printers")
          .upsert(rows, {
            onConflict: "branch_id,ip",
            ignoreDuplicates: false,
          });

        console.log(
          `✅ [/sync] ${printers.length} impresora(s) guardada(s) para branch ${branchId}`,
        );

        // Re-enviar configuración actualizada al agente
        const { data: updated } = await supabaseAdmin
          .from("branch_printers")
          .select("id, ip, port, role, name, is_active")
          .eq("branch_id", branchId)
          .eq("is_active", true);
        if (updated) socket.emit("printers_config", { printers: updated });
      } catch (error) {
        console.error("❌ [/sync] Error guardando impresoras:", error.message);
      }
    });

    // === ACK DE TICKET DE PRUEBA ===
    socket.on("print_test_ack", (data) => {
      console.log(
        `🖨️ [/sync] Print test ACK: ip=${data.ip}, success=${data.success}`,
      );
      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        ip: data.ip,
        error: data.error,
      });
    });

    // === ACK DE SCAN DE IMPRESORAS ===
    socket.on("scan_printers_ack", (data) => {
      console.log(
        `✅ [/sync] Scan Printers ACK: ${data.printers?.length || 0} impresora(s)`,
      );

      agentConnectionManager.handleResponse(socket.id, {
        requestId: data.requestId,
        success: data.success !== false,
        subnet: data.subnet,
        printers: data.printers,
        error: data.error,
      });
    });

    // === PING/PONG ===
    socket.on("ping", () => {
      if (registeredBranchId) {
        agentConnectionManager.updatePing(registeredBranchId);
      }
      socket.emit("pong");
    });

    socket.on("pong", () => {
      if (registeredBranchId) {
        agentConnectionManager.updatePing(registeredBranchId);
      }
    });

    // === DESCONEXIÓN ===
    socket.on("disconnect", (reason) => {
      console.log(`❌ [/sync] Desconectado: ${socket.id}, reason=${reason}`);
      agentConnectionManager.unregister(socket.id);
    });

    // === ERROR ===
    socket.on("error", (error) => {
      console.error(`⚠️ [/sync] Error en socket ${socket.id}:`, error);
    });
  });

  console.log("✅ Namespace /sync configurado para agentes SR");
  return syncNamespace;
}

module.exports = { setupAgentNamespace };
