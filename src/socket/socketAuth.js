const { createClerkClient } = require("@clerk/clerk-sdk-node");
const { getClerkConfig } = require("../config/clerkConfig");
const supabase = require("../config/supabase");

/**
 * Middleware de autenticación para Socket.IO
 * Soporta:
 * 1. Token de Clerk (Admin Portal)
 * 2. Guest ID (FlexBill y Tap&Pay - usuarios invitados)
 * 3. Token de Supabase (FlexBill y Tap&Pay - usuarios autenticados)
 */
async function authenticateSocket(socket, next) {
  try {
    const { token, guestId, guestName, clientType } = socket.handshake.auth;

    // Caso 1: Guest de FlexBill o Tap&Pay (sin autenticación, solo guest_id)
    if (guestId && (clientType === "flexbill" || clientType === "tap-pay")) {
      socket.user = {
        id: guestId,
        guestId: guestId,
        guestName: guestName || "Invitado",
        isGuest: true,
        clientType: clientType,
      };

      console.log(`✅ Socket authenticated (${clientType} Guest): ${guestId}`);
      return next();
    }

    // Caso 2: Usuario autenticado de FlexBill o Tap&Pay (Supabase token)
    if (token && (clientType === "flexbill" || clientType === "tap-pay")) {
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
              clientType: clientType,
            };
            console.log(
              `✅ Socket authenticated (${clientType} Guest Fallback): ${guestId}`,
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
          clientType: clientType,
        };

        console.log(`✅ Socket authenticated (${clientType} User): ${user.id}`);
        return next();
      } catch (supabaseError) {
        // Si hay error, permitir como guest
        if (guestId) {
          socket.user = {
            id: guestId,
            guestId: guestId,
            guestName: guestName || "Invitado",
            isGuest: true,
            clientType: clientType,
          };
          console.log(
            `✅ Socket authenticated (${clientType} Guest after error): ${guestId}`,
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

    // Caso 4: Main Portal (Clerk token con proyecto separado)
    if (token && clientType === "main-portal") {
      const mainPortalConfig = getClerkConfig("mainPortal");
      const mainPortalClerk = createClerkClient({
        secretKey: mainPortalConfig.secretKey,
      });

      const verifiedToken = await mainPortalClerk.verifyToken(token);

      if (!verifiedToken || !verifiedToken.sub) {
        console.log(
          "⚠️ Socket connection rejected: Invalid Main Portal Clerk token",
        );
        return next(new Error("Invalid token"));
      }

      const clerkUser = await mainPortalClerk.users.getUser(verifiedToken.sub);

      // Main Portal: Solo autenticación con Clerk (super admins sin registro en BD)
      socket.user = {
        id: clerkUser.id,
        email: clerkUser.emailAddresses?.[0]?.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        adminUserId: null, // Super admins no requieren ID de BD
        restaurantId: null, // Super admins ven todos los restaurantes
        restaurantName: null,
        isGuest: false,
        clientType: "main-portal",
        isSuperAdmin: true, // Flag para identificar super admins
      };

      console.log(
        `✅ Socket authenticated (Main Portal - Super Admin): User ${socket.user.id}`,
      );
      return next();
    }

    // Caso 5: Xquisito Crew (shared secret + branchId, sin Clerk)
    if (clientType === "crew") {
      const { branchId, secret } = socket.handshake.auth;
      const CREW_SECRET =
        process.env.CREW_SOCKET_SECRET || "xquisito-crew-secret";

      if (secret !== CREW_SECRET || !branchId) {
        console.log("⚠️ Socket connection rejected: Invalid crew credentials");
        return next(new Error("Invalid crew credentials"));
      }

      // Buscar el restaurante al que pertenece esta sucursal
      const { data: branch, error: branchError } = await supabase
        .from("branches")
        .select("id, restaurant_id")
        .eq("id", branchId)
        .single();

      if (branchError || !branch) {
        console.log("⚠️ Socket connection rejected: Branch not found");
        return next(new Error("Branch not found"));
      }

      socket.user = {
        id: `crew-${branchId}`,
        branchId: branch.id,
        restaurantId: branch.restaurant_id,
        isGuest: false,
        clientType: "crew",
      };

      console.log(
        `✅ Socket authenticated (Crew): branch=${branchId} restaurant=${branch.restaurant_id}`,
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
