const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Generate a unique random QR code string
 * Format: XQ-AI-XXXXXX (6 random alphanumeric characters)
 * Example: XQ-AI-A3B7K9
 */
function generateQRCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Sin caracteres ambiguos (I, O, 0, 1)
  let randomCode = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomCode += characters[randomIndex];
  }

  return `XQ-AI-${randomCode}`;
}

/**
 * GET /api/main-portal/qr-codes
 * Get all QR codes with optional filtering
 * Query params: ?client_id, ?restaurant_id, ?branch_id, ?service, ?is_active
 */
exports.getAllQRCodes = async (req, res) => {
  try {
    const { client_id, restaurant_id, branch_id, service, is_active } =
      req.query;

    let query = supabase
      .from("qr_codes")
      .select(
        `
        *,
        clients:client_id(id, name),
        restaurants:restaurant_id(id, name),
        branches:branch_id(id, name, branch_number)
      `
      )
      .order("created_at", { ascending: false });

    // Apply filters
    if (client_id) query = query.eq("client_id", client_id);
    if (restaurant_id) query = query.eq("restaurant_id", restaurant_id);
    if (branch_id) query = query.eq("branch_id", branch_id);
    if (service) query = query.eq("service", service);
    if (is_active !== undefined)
      query = query.eq("is_active", is_active === "true");

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Error getting QR codes:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching QR codes",
      error: error.message,
    });
  }
};

/**
 * GET /api/main-portal/qr-codes/:id
 * Get a specific QR code by ID
 */
exports.getQRCodeById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("qr_codes")
      .select(
        `
        *,
        clients:client_id(id, name),
        restaurants:restaurant_id(id, name),
        branches:branch_id(id, name, branch_number)
      `
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "QR code not found",
      });
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error getting QR code:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching QR code",
      error: error.message,
    });
  }
};

/**
 * GET /api/qr/:code
 * Resolve QR code and return redirection info (PUBLIC endpoint)
 */
exports.resolveQRCode = async (req, res) => {
  try {
    const { code } = req.params;

    const { data, error } = await supabase
      .from("qr_codes")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: "QR code not found or inactive",
      });
    }

    // Build the redirect URL based on service
    let redirectUrl;
    const { service, restaurant_id, branch_number, table_number, room_number } =
      data;

    // Get service base URLs from environment variables
    const serviceUrls = {
      "flex-bill": process.env.FLEX_BILL_URL || "https://flexbill.xquisito.ai",
      "tap-order-pay":
        process.env.TAP_ORDER_PAY_URL || "https://taporderpay.xquisito.ai",
      "room-service":
        process.env.ROOM_SERVICE_URL || "https://room-service.xquisito.ai",
      "pick-and-go":
        process.env.PICK_AND_GO_URL || "https://pickandgo.xquisito.ai",
    };

    const baseUrl = serviceUrls[service];

    switch (service) {
      case "flex-bill":
      case "tap-order-pay":
        redirectUrl = `${baseUrl}/${restaurant_id}/${branch_number}/menu?table=${table_number}`;
        break;
      case "room-service":
        redirectUrl = `${baseUrl}/${restaurant_id}/${branch_number}/menu?room=${room_number}`;
        break;
      case "pick-and-go":
        redirectUrl = `${baseUrl}/${restaurant_id}/menu?branch=${branch_number}`;
        break;
      default:
        throw new Error(`Invalid service: ${service}`);
    }

    res.status(200).json({
      success: true,
      data: {
        code: data.code,
        service: data.service,
        qr_type: data.qr_type,
        redirect_url: redirectUrl,
      },
    });
  } catch (error) {
    console.error("Error resolving QR code:", error);
    res.status(500).json({
      success: false,
      message: "Error resolving QR code",
      error: error.message,
    });
  }
};

/**
 * POST /api/main-portal/qr-codes
 * Create a new QR code
 * Body: { client_id, restaurant_id, branch_id, branch_number, service, qr_type, table_number?, room_number? }
 */
exports.createQRCode = async (req, res) => {
  try {
    const {
      client_id,
      restaurant_id,
      branch_id,
      branch_number,
      service,
      qr_type,
      table_number,
      room_number,
    } = req.body;

    // Validate required fields
    if (
      !client_id ||
      !restaurant_id ||
      !branch_id ||
      !branch_number ||
      !service ||
      !qr_type
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: client_id, restaurant_id, branch_id, branch_number, service, qr_type",
      });
    }

    // Validate service type
    const validServices = [
      "flex-bill",
      "tap-order-pay",
      "room-service",
      "pick-and-go",
    ];
    if (!validServices.includes(service)) {
      return res.status(400).json({
        success: false,
        message: `Invalid service. Must be one of: ${validServices.join(", ")}`,
      });
    }

    // Validate qr_type and corresponding number
    const validTypes = ["table", "room", "pickup"];
    if (!validTypes.includes(qr_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid qr_type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate number fields based on type
    if (qr_type === "table" && !table_number) {
      return res.status(400).json({
        success: false,
        message: "table_number is required for qr_type=table",
      });
    }

    if (qr_type === "room" && !room_number) {
      return res.status(400).json({
        success: false,
        message: "room_number is required for qr_type=room",
      });
    }

    // Generate unique code with retry logic
    let code;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      code = generateQRCode();

      // Check if code already exists
      const { data: existing } = await supabase
        .from("qr_codes")
        .select("id")
        .eq("code", code)
        .single();

      if (!existing) {
        break; // Code is unique, exit loop
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate unique QR code after multiple attempts",
      });
    }

    // Insert new QR code
    const { data, error } = await supabase
      .from("qr_codes")
      .insert([
        {
          code,
          client_id,
          restaurant_id,
          branch_id,
          branch_number,
          service,
          qr_type,
          table_number: qr_type === "table" ? table_number : null,
          room_number: qr_type === "room" ? room_number : null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "QR code created successfully",
      data,
    });
  } catch (error) {
    console.error("Error creating QR code:", error);
    res.status(500).json({
      success: false,
      message: "Error creating QR code",
      error: error.message,
    });
  }
};

/**
 * POST /api/main-portal/qr-codes/batch
 * Create multiple QR codes at once
 * Body: { client_id, restaurant_id, branch_id, branch_number, service, qr_type, count, start_number }
 */
exports.createBatchQRCodes = async (req, res) => {
  try {
    const {
      client_id,
      restaurant_id,
      branch_id,
      branch_number,
      service,
      qr_type,
      count,
      start_number = 1,
    } = req.body;

    // Validate required fields
    if (
      !client_id ||
      !restaurant_id ||
      !branch_id ||
      !branch_number ||
      !service ||
      !qr_type ||
      !count
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: client_id, restaurant_id, branch_id, branch_number, service, qr_type, count",
      });
    }

    if (count < 1 || count > 500) {
      return res.status(400).json({
        success: false,
        message: "Count must be between 1 and 500",
      });
    }

    // Generate QR codes with unique codes
    const qrCodes = [];
    const usedCodes = new Set();

    for (let i = 0; i < count; i++) {
      const number = start_number + i;
      let code;
      let attempts = 0;
      const maxAttempts = 50;

      // Generate unique code not in current batch or database
      while (attempts < maxAttempts) {
        code = generateQRCode();

        if (!usedCodes.has(code)) {
          // Check database
          const { data: existing } = await supabase
            .from("qr_codes")
            .select("id")
            .eq("code", code)
            .single();

          if (!existing) {
            usedCodes.add(code);
            break;
          }
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        return res.status(500).json({
          success: false,
          message: `Failed to generate unique codes. Created ${qrCodes.length} out of ${count} requested.`,
        });
      }

      qrCodes.push({
        code,
        client_id,
        restaurant_id,
        branch_id,
        branch_number,
        service,
        qr_type,
        table_number: qr_type === "table" ? number : null,
        room_number: qr_type === "room" ? number : null,
      });
    }

    // Insert all QR codes
    const { data, error } = await supabase
      .from("qr_codes")
      .insert(qrCodes)
      .select();

    if (error) {
      // Check if it's a duplicate key error
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "Some QR codes already exist. Please check existing codes.",
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: `${data.length} QR codes created successfully`,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Error creating batch QR codes:", error);
    res.status(500).json({
      success: false,
      message: "Error creating batch QR codes",
      error: error.message,
    });
  }
};

/**
 * PUT /api/main-portal/qr-codes/:id
 * Update QR code configuration (change service, table/room number, etc.)
 */
exports.updateQRCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { service, qr_type, table_number, room_number, is_active } = req.body;

    // Build update object with only provided fields
    const updates = {};
    if (service !== undefined) updates.service = service;
    if (qr_type !== undefined) updates.qr_type = qr_type;
    if (table_number !== undefined) updates.table_number = table_number;
    if (room_number !== undefined) updates.room_number = room_number;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    const { data, error } = await supabase
      .from("qr_codes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "QR code not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "QR code updated successfully",
      data,
    });
  } catch (error) {
    console.error("Error updating QR code:", error);
    res.status(500).json({
      success: false,
      message: "Error updating QR code",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/main-portal/qr-codes/:id
 * Delete a QR code
 */
exports.deleteQRCode = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("qr_codes")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "QR code not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "QR code deleted successfully",
      data,
    });
  } catch (error) {
    console.error("Error deleting QR code:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting QR code",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/main-portal/qr-codes/:id/toggle
 * Toggle QR code active status
 */
exports.toggleQRCodeStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const { data: current } = await supabase
      .from("qr_codes")
      .select("is_active")
      .eq("id", id)
      .single();

    if (!current) {
      return res.status(404).json({
        success: false,
        message: "QR code not found",
      });
    }

    // Toggle status
    const { data, error } = await supabase
      .from("qr_codes")
      .update({ is_active: !current.is_active })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: `QR code ${data.is_active ? "activated" : "deactivated"} successfully`,
      data,
    });
  } catch (error) {
    console.error("Error toggling QR code status:", error);
    res.status(500).json({
      success: false,
      message: "Error toggling QR code status",
      error: error.message,
    });
  }
};
