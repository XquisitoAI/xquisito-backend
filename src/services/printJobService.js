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
  dishOrderId = null,
}) {
  (async () => {
    try {
      // Resolver folio desde table_order via dish_order si no viene explícito
      if (folio === null && dishOrderId) {
        const { data: dod } = await supabase
          .from("dish_order")
          .select("user_order!inner(table_order!inner(folio))")
          .eq("id", dishOrderId)
          .single();
        folio = dod?.user_order?.table_order?.folio ?? null;
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
        })),
        orderInfo: { identifier, folio },
      };

      if (agentConnectionManager.isConnected(branch.id)) {
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
        identifier: `Pick & Go${order.customer_name ? ` — ${order.customer_name}` : ""}`,
        folio: order.folio ?? null,
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
