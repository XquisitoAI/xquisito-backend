const { supabaseAdmin } = require("../config/supabaseAuth");

// Helper function to get restaurant_id from clerk_user_id
const getRestaurantIdFromClerkUser = async (clerkUserId) => {
  // Get user from user_admin_portal
  const { data: adminUser, error: userError } = await supabaseAdmin
    .from("user_admin_portal")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (userError || !adminUser) {
    throw new Error("User not found");
  }

  // Get restaurant from restaurants table
  const { data: restaurant, error: restaurantError } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("user_id", adminUser.id)
    .single();

  if (restaurantError || !restaurant) {
    throw new Error("Restaurant not found for this user");
  }

  return restaurant.id;
};

// Obtener todos los templates de un restaurante
const getTemplatesByRestaurant = async (req, res) => {
  try {
    const clerkUserId = req.auth?.userId;

    if (!clerkUserId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get restaurant_id from authenticated user
    const restaurantId = await getRestaurantIdFromClerkUser(clerkUserId);

    // Obtener templates del restaurante
    const { data: templates, error } = await supabaseAdmin
      .from("sms_templates")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching SMS templates:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching SMS templates",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error("Error in getTemplatesByRestaurant:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Obtener un template por ID
const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: template, error } = await supabaseAdmin
      .from("sms_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching SMS template:", error);
      return res.status(404).json({
        success: false,
        message: "Template not found",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Error in getTemplateById:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Crear un nuevo template
const createTemplate = async (req, res) => {
  try {
    const clerkUserId = req.auth?.userId;
    const { name, blocks } = req.body;

    if (!clerkUserId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Validaciones
    if (!name || !blocks) {
      return res.status(400).json({
        success: false,
        message: "name and blocks are required",
      });
    }

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "blocks must be a non-empty array",
      });
    }

    // Get restaurant_id from authenticated user
    const restaurantId = await getRestaurantIdFromClerkUser(clerkUserId);

    // Crear template
    const { data: newTemplate, error } = await supabaseAdmin
      .from("sms_templates")
      .insert([
        {
          restaurant_id: restaurantId,
          name,
          blocks,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating SMS template:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating SMS template",
        error: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "SMS template created successfully",
      data: newTemplate,
    });
  } catch (error) {
    console.error("Error in createTemplate:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Actualizar un template
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, blocks } = req.body;

    // Validaciones
    if (!name && !blocks) {
      return res.status(400).json({
        success: false,
        message: "At least one field (name or blocks) is required to update",
      });
    }

    if (blocks && (!Array.isArray(blocks) || blocks.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "blocks must be a non-empty array",
      });
    }

    // Preparar datos para actualizar
    const updateData = {};
    if (name) updateData.name = name;
    if (blocks) updateData.blocks = blocks;

    // Actualizar template
    const { data: updatedTemplate, error } = await supabaseAdmin
      .from("sms_templates")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating SMS template:", error);
      return res.status(500).json({
        success: false,
        message: "Error updating SMS template",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "SMS template updated successfully",
      data: updatedTemplate,
    });
  } catch (error) {
    console.error("Error in updateTemplate:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Eliminar un template
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("sms_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting SMS template:", error);
      return res.status(500).json({
        success: false,
        message: "Error deleting SMS template",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "SMS template deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteTemplate:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getTemplatesByRestaurant,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
