const { createClerkClient } = require("@clerk/clerk-sdk-node");
const { getClerkConfig } = require("../config/clerkConfig");
const supabase = require("../config/supabase");

// Middleware de autenticación para Socket.IO usando Clerk
async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.log("⚠️ Socket connection rejected: No token provided");
      return next(new Error("Authentication token required"));
    }

    // Verificar token con Clerk (Admin Portal)
    const adminPortalConfig = getClerkConfig("adminPortal");
    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    const verifiedToken = await adminPortalClerk.verifyToken(token);

    if (!verifiedToken || !verifiedToken.sub) {
      console.log("⚠️ Socket connection rejected: Invalid token");
      return next(new Error("Invalid token"));
    }

    // Obtener información del usuario de Clerk
    const clerkUser = await adminPortalClerk.users.getUser(verifiedToken.sub);

    // Obtener usuario de user_admin_portal
    const { data: adminUser, error: userError } = await supabase
      .from("user_admin_portal")
      .select("id")
      .eq("clerk_user_id", clerkUser.id)
      .eq("is_active", true)
      .single();

    if (userError || !adminUser) {
      console.log("⚠️ Socket connection rejected: Admin user not found");
      return next(new Error("User not found in admin portal"));
    }

    // Obtener el primer restaurante activo del usuario
    const { data: restaurants, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("user_id", adminUser.id)
      .eq("is_active", true)
      .limit(1);

    if (restaurantError) {
      console.error("❌ Socket auth DB error:", restaurantError);
      return next(new Error("Database error"));
    }

    const restaurant = restaurants?.[0] || null;

    // Adjuntar información del usuario al socket
    socket.user = {
      id: clerkUser.id,
      email: clerkUser.emailAddresses?.[0]?.emailAddress,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      adminUserId: adminUser.id,
      restaurantId: restaurant?.id || null,
      restaurantName: restaurant?.name || null,
    };

    console.log(
      `✅ Socket authenticated: User ${socket.user.id}, Restaurant: ${socket.user.restaurantId}`,
    );
    next();
  } catch (error) {
    console.error("❌ Socket authentication error:", error.message);
    next(new Error("Authentication failed"));
  }
}

module.exports = { authenticateSocket };
