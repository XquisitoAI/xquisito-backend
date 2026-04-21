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
  skipAgent = false,
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

      // ── Simulación de ticket ──────────────────────────────────────
      const agentConnected = agentConnectionManager.isConnected(branch.id);
      const dest = agentConnected
        ? skipAgent
          ? "OMITIDO (syncPOS imprimirá con folio SR)"
          : `→ AGENTE  branch=${branch.id}`
        : `→ CREW   restaurant=${restaurantId}`;
      const SEP = "─".repeat(44);
      const itemLines = printData.items
        .map((i) => {
          let line = `  ${String(i.quantity).padStart(2)}x  ${i.name}`;
          if (i.clasificacion) line += `  [${i.clasificacion}]`;
          if (Array.isArray(i.custom_fields) && i.custom_fields.length > 0) {
            const opts = i.custom_fields.flatMap(
              (f) =>
                f.selectedOptions?.map((o) => o.optionName).filter(Boolean) ??
                [],
            );
            if (opts.length) line += `\n        ↳ ${opts.join(", ")}`;
          }
          return line;
        })
        .join("\n");
      console.log(
        `\n[TICKET] ${SEP}\n` +
          `  ${printData.orderInfo.identifier}` +
          (printData.orderInfo.folio
            ? `  |  Folio: ${printData.orderInfo.folio}`
            : "") +
          (printData.orderInfo.orderedBy
            ? `\n  Cliente: ${printData.orderInfo.orderedBy}`
            : "") +
          `\n  ${SEP}\n` +
          `${itemLines}\n` +
          `  ${SEP}\n` +
          `  ${dest}\n` +
          `[/TICKET]\n`,
      );
      // ─────────────────────────────────────────────────────────────

      if (agentConnected) {
        if (skipAgent) {
          return;
        }
        // Agente conectado → él imprime (tiene acceso directo a las impresoras)
        agentConnectionManager.send(branch.id, "print_job", printData);
      } else {
        // Sin agente → crew imprime via WebSocket
        socketEmitter.emitPrintJob(restaurantId, printData);
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
        .from("tap_orders_and_pay")
        .select(
          "restaurant_id, branch_number, table_number, customer_name, folio",
        )
        .eq("id", tapOrderId)
        .single();

      if (!order) return;

      emitPrintJob({
        restaurantId: order.restaurant_id,
        branchNumber: order.branch_number,
        items,
        identifier: `Mesa ${order.table_number}`,
        folio: order.folio ?? null,
        orderedBy: order.customer_name,
        skipAgent: true, // syncOrder dispara el print al agente con folio SR al momento del pago
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
        .select(
          "restaurant_id, branch_number, room_number, customer_name folio",
        )
        .eq("id", roomOrderId)
        .single();

      if (!order) return;

      emitPrintJob({
        restaurantId: order.restaurant_id,
        branchNumber: order.branch_number,
        items,
        identifier: `Habitación ${order.room_number}`,
        folio: order.folio ?? null,
        orderedBy: order.customer_name,
        skipAgent: true, // syncOrder dispara el print al agente con folio SR al momento del pago
      });
    } catch (e) {
      console.error("[PRINT_JOB] emitPrintJobForRoomOrder error:", e.message);
    }
  })();
}

// Versión para órdenes FlexBill (mesa) — busca folio y sucursal desde table_order.
async function emitPrintJobForFlexBill(tableOrderId, items, orderedBy = null) {
  (async () => {
    try {
      const { data: order } = await supabase
        .from("table_order")
        .select(
          "folio, tables!inner(table_number, branches!inner(restaurant_id, branch_number))",
        )
        .eq("id", tableOrderId)
        .single();

      if (!order) return;

      const { table_number } = order.tables;
      const { restaurant_id, branch_number } = order.tables.branches;

      emitPrintJob({
        restaurantId: restaurant_id,
        branchNumber: branch_number,
        items,
        identifier: `Mesa ${table_number}`,
        folio: order.folio ?? null,
        orderedBy: orderedBy || null,
        skipAgent: true, // syncFlexBillDish maneja el print al agente con folio SR real
      });
    } catch (e) {
      console.error("[PRINT_JOB] emitPrintJobForFlexBill error:", e.message);
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
        skipAgent: true, // syncOrder dispara el print al agente con folio SR al momento del pago
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
  emitPrintJobForFlexBill,
  emitPrintJobForTapOrder,
  emitPrintJobForRoomOrder,
  emitPrintJobForPickAndGoOrder,
};
