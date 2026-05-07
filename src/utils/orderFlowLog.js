"use strict";

const { supabaseAdmin } = require("../config/supabaseAuth");

async function logOrderFlowStep({
  order_id = null,
  order_type = null,
  restaurant_id = null,
  step,
  status,
  error_message = null,
  metadata = null,
}) {
  try {
    const { error } = await supabaseAdmin.from("order_flow_logs").insert({
      order_id,
      order_type,
      restaurant_id,
      step,
      status,
      error_message,
      metadata,
    });
    if (error) {
      console.warn(`[orderFlowLog] Insert failed step=${step}:`, error.message);
    }
  } catch (err) {
    console.warn(`[orderFlowLog] Unexpected error step=${step}:`, err.message);
  }
}

module.exports = { logOrderFlowStep };
