const supabase = require("../config/supabase");
const socketEmitter = require("./socketEmitter");
const { enrichItemsWithClasificacion } = require("./printerEnrichService");
const agentConnectionManager = require("../socket/agentConnectionManager");

// Punto de entrada principal. Decide si el trabajo va al agente o al crew.
function emitPrintJob({
  restaurantId,
  branchNumber,
  items,
  identifier,
  folio = null,
  tableOrderId = null,
  orderedBy = null,
}) {
  (async () => {
    try {
      // Resolver folio desde table_order si no viene explícito (FlexBill)
      if (folio === null && tableOrderId) {
        const { data: to } = await supabase
          .from("table_order")
          .select("folio")
          .eq("id", tableOrderId)
          .single();
        folio = to?.folio ?? null;
      }

      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("branch_number", branchNumber)
        .single();

      if (!branch) return;

      const hasMenuItemIds = items.some((i) => i.menu_item_id);
      const enriched = hasMenuItemIds
        ? await enrichItemsWithClasificacion(branch.id, items)
        : items.map((i) => ({ ...i, clasificacion: null }));

      const printData = {
        branchId: branch.id,
        items: enriched.map((i) => ({
          name: i.name ?? i.item ?? i.item_name,
          quantity: i.quantity,
          clasificacion: i.clasificacion ?? null,
          custom_fields: i.custom_fields ?? null,
        })),
        orderInfo: { identifier, folio, orderedBy: orderedBy || null },
      };

      console.log("[PRINT_JOB] printData:", JSON.stringify(printData, null, 2));

      if (agentConnectionManager.isConnected(branch.id)) {
        if (skipAgent) {
          // El agente imprimirá via new_order (con folio real de SR) — omitir print_job
          console.log(
            `[PRINT_JOB] agente conectado + skipAgent — omitido (branch ${branch.id})`,
          );
          return;
        }
        // Agente conectado → él imprime (tiene acceso directo a las impresoras)
        agentConnectionManager.send(branch.id, "print_job", printData);
        console.log(`[PRINT_JOB] → agente (branch ${branch.id})`);
      } else {
        // Sin agente → crew imprime via WebSocket
        socketEmitter.emitPrintJob(restaurantId, printData);
        console.log(`[PRINT_JOB] → crew (restaurant ${restaurantId})`);
      }
    } catch (e) {
      console.error("[PRINT_JOB] Error:", e.message);
    }
  })();
}

// Versión para cuando solo se tiene tapOrderId
async function emitPrintJobForTapOrder(tapOrderId, items) {
  (async () => {
    try {
      const { data: order } = await supabase
        .from("tap_orders")
        .select("restaurant_id, branch_number, table_number, folio")
        .eq("id", tapOrderId)
        .single();

      if (!order) return;

      emitPrintJob({
        restaurantId: order.restaurant_id,
        branchNumber: order.branch_number,
        items,
        identifier: `Mesa ${order.table_number}`,
        folio: order.folio ?? null,
      });
    } catch (e) {
      console.error("[PRINT_JOB] emitPrintJobForTapOrder error:", e.message);
    }
  })();
}

// Versión para cuando solo se tiene roomOrderId.
async function emitPrintJobForRoomOrder(roomOrderId, items) {
  (async () => {
    try {
      const { data: order } = await supabase
        .from("room_orders")
        .select("restaurant_id, branch_number, room_number, folio")
        .eq("id", roomOrderId)
        .single();

      if (!order) return;

      emitPrintJob({
        restaurantId: order.restaurant_id,
        branchNumber: order.branch_number,
        items,
        identifier: `Habitación ${order.room_number}`,
        folio: order.folio ?? null,
      });
    } catch (e) {
      console.error("[PRINT_JOB] emitPrintJobForRoomOrder error:", e.message);
    }
  })();
}

// Versión para cuando solo se tiene pickAndGoOrderId.
async function emitPrintJobForPickAndGoOrder(orderId, items) {
  (async () => {
    try {
      const { data: order } = await supabase
        .from("pick_and_go_orders")
        .select("restaurant_id, branch_number, customer_name, folio")
        .eq("id", orderId)
        .single();

      if (!order) return;

      emitPrintJob({
        restaurantId: order.restaurant_id,
        branchNumber: order.branch_number,
        items,
        identifier: "Pick & Go",
        folio: order.folio ?? null,
        orderedBy: order.customer_name || null,
      });
    } catch (e) {
      console.error(
        "[PRINT_JOB] emitPrintJobForPickAndGoOrder error:",
        e.message,
      );
    }
  })();
}

module.exports = {
  emitPrintJob,
  emitPrintJobForTapOrder,
  emitPrintJobForRoomOrder,
  emitPrintJobForPickAndGoOrder,
};
