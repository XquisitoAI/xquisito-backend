const { createClerkClient } = require("@clerk/clerk-sdk-node");
const { getClerkConfig } = require("../config/clerkConfig");
const supabase = require("../config/supabase");

/**
 * Middleware de autenticación para Socket.IO
 * Soporta:
 * 1. Token de Clerk (Admin Portal)
 * 2. Guest ID (FlexBill - usuarios invitados)
 * 3. Token de Supabase (FlexBill - usuarios autenticados)
 */
async function authenticateSocket(socket, next) {
  try {
    const { token, guestId, guestName, clientType } = socket.handshake.auth;

    // Caso 1: Guest de FlexBill (sin autenticación, solo guest_id)
    if (guestId && clientType === "flexbill") {
      socket.user = {
        id: guestId,
        guestId: guestId,
        guestName: guestName || "Invitado",
        isGuest: true,
        clientType: "flexbill",
      };

      console.log(`✅ Socket authenticated (FlexBill Guest): ${guestId}`);
      return next();
    }

    // Caso 2: Usuario autenticado de FlexBill (Supabase token)
    if (token && clientType === "flexbill") {
      try {
        // Verificar token con Supabase
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(token);

        if (error || !user) {
          // Si falla Supabase, permitir como guest si tiene guestId
          if (guestId) {
            socket.user = {
              id: guestId,
              guestId: guestId,
              guestName: guestName || "Invitado",
              isGuest: true,
              clientType: "flexbill",
            };
            console.log(
              `✅ Socket authenticated (FlexBill Guest Fallback): ${guestId}`,
            );
            return next();
          }
          console.log("⚠️ Socket connection rejected: Invalid Supabase token");
          return next(new Error("Invalid token"));
        }

        socket.user = {
          id: user.id,
          email: user.email,
          isGuest: false,
          clientType: "flexbill",
        };

        console.log(`✅ Socket authenticated (FlexBill User): ${user.id}`);
        return next();
      } catch (supabaseError) {
        // Si hay error, permitir como guest
        if (guestId) {
          socket.user = {
            id: guestId,
            guestId: guestId,
            guestName: guestName || "Invitado",
            isGuest: true,
            clientType: "flexbill",
          };
          console.log(
            `✅ Socket authenticated (FlexBill Guest after error): ${guestId}`,
          );
          return next();
        }
        throw supabaseError;
      }
    }

    // Caso 3: Admin Portal (Clerk token) - comportamiento original
    if (token && (!clientType || clientType === "admin-portal")) {
      const adminPortalConfig = getClerkConfig("adminPortal");
      const adminPortalClerk = createClerkClient({
        secretKey: adminPortalConfig.secretKey,
      });

      const verifiedToken = await adminPortalClerk.verifyToken(token);

      if (!verifiedToken || !verifiedToken.sub) {
        console.log("⚠️ Socket connection rejected: Invalid Clerk token");
        return next(new Error("Invalid token"));
      }

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

      socket.user = {
        id: clerkUser.id,
        email: clerkUser.emailAddresses?.[0]?.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        adminUserId: adminUser.id,
        restaurantId: restaurant?.id || null,
        restaurantName: restaurant?.name || null,
        isGuest: false,
        clientType: "admin-portal",
      };

      console.log(
        `✅ Socket authenticated (Admin Portal): User ${socket.user.id}, Restaurant: ${socket.user.restaurantId}`,
      );
      return next();
    }

    // Si no hay token ni guestId, rechazar
    console.log("⚠️ Socket connection rejected: No credentials provided");
    return next(new Error("Authentication required"));
  } catch (error) {
    console.error("❌ Socket authentication error:", error.message);
    next(new Error("Authentication failed"));
  }
}

module.exports = { authenticateSocket };
