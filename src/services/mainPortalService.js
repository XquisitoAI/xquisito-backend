const supabase = require("../config/supabase");
const { createClerkClient } = require("@clerk/clerk-sdk-node");
const { getClerkConfig } = require("../config/clerkConfig");

const findClerkUserIdByEmail = async (email) => {
  try {
    const { data: user, error } = await supabase
      .from("user_admin_portal")
      .select("clerk_user_id")
      .eq("email", email)
      .single();

    if (error || !user) {
      return null;
    }

    return user.clerk_user_id;
  } catch (error) {
    console.error("❌ Error finding clerk_user_id:", error.message);
    return null;
  }
};

const deleteUserFromClerk = async (clerkUserId) => {
  try {
    const adminPortalConfig = getClerkConfig("adminPortal");

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    await adminPortalClerk.users.deleteUser(clerkUserId);
    console.log(`✅ Usuario eliminado de Clerk: ${clerkUserId}`);
    return true;
  } catch (error) {
    console.error("❌ Error eliminando usuario de Clerk:", error.message);
    return false;
  }
};

const deletePendingInvitationsFromClerk = async (email) => {
  try {
    const adminPortalConfig = getClerkConfig("adminPortal");

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    console.log(`🔍 Buscando invitaciones pendientes para: ${email}`);

    // Obtener todas las invitaciones
    const invitationsList =
      await adminPortalClerk.invitations.getInvitationList();

    // Verificar diferentes formatos de respuesta posibles
    let invitationsArray = [];

    if (Array.isArray(invitationsList)) {
      // Si la respuesta es directamente un array
      invitationsArray = invitationsList;
    } else if (invitationsList && Array.isArray(invitationsList.data)) {
      // Si la respuesta tiene estructura { data: [...] }
      invitationsArray = invitationsList.data;
    } else if (
      invitationsList &&
      invitationsList.invitations &&
      Array.isArray(invitationsList.invitations)
    ) {
      // Si la respuesta tiene estructura { invitations: [...] }
      invitationsArray = invitationsList.invitations;
    } else {
      console.warn(
        "⚠️ Formato inesperado de respuesta de invitations:",
        invitationsList,
      );
      return 0;
    }

    console.log(
      `📊 Total invitaciones encontradas: ${invitationsArray.length}`,
    );

    // Buscar invitaciones para este email
    const pendingInvitations = invitationsArray.filter((inv) => {
      const emailMatch = inv.emailAddress === email;
      const isPending = inv.status === "pending";

      if (emailMatch) {
        console.log(
          `🔍 Invitación encontrada para ${email}: status=${inv.status}, id=${inv.id}`,
        );
      }

      return emailMatch && isPending;
    });

    console.log(
      `📧 Invitaciones pendientes para ${email}: ${pendingInvitations.length}`,
    );

    let deletedCount = 0;
    for (const invitation of pendingInvitations) {
      try {
        console.log(`🗑️ Revocando invitación: ${invitation.id}`);
        await adminPortalClerk.invitations.revokeInvitation(invitation.id);
        console.log(`✅ Invitación revocada para ${email}: ${invitation.id}`);
        deletedCount++;
      } catch (revokeError) {
        console.error(
          `❌ Error revocando invitación ${invitation.id}:`,
          revokeError.message,
        );
      }
    }

    console.log(
      `✅ ${deletedCount} invitaciones pendientes eliminadas para ${email}`,
    );
    return deletedCount;
  } catch (error) {
    console.error(
      "❌ Error eliminando invitaciones pendientes de Clerk:",
      error.message,
    );
    console.error("Stack trace:", error.stack);
    return 0;
  }
};

// ===============================================
// SERVICIOS PARA CLIENTES
// ===============================================

// Obtener todos los clientes
const getAllClients = async () => {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select(
        `
        *,
        branches:branches(count)
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Error getting clients: ${error.message}`);
    }

    // Formatear datos para incluir conteo de sucursales
    const formattedData = data.map((client) => ({
      ...client,
      branchCount: client.branches?.[0]?.count || 0,
    }));

    return formattedData;
  } catch (error) {
    console.error("❌ Error in getAllClients:", error.message);
    throw error;
  }
};

// Obtener cliente por ID
const getClientById = async (id) => {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select(
        `
        *,
        branches:branches(*)
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Client not found");
      }
      throw new Error(`Error getting client: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error("❌ Error in getClientById:", error.message);
    throw error;
  }
};

// Crear nuevo cliente
const createNewClient = async (clientData) => {
  try {
    const { data, error } = await supabase
      .from("clients")
      .insert([
        {
          name: clientData.name,
          owner_name: clientData.owner_name,
          phone: clientData.phone,
          email: clientData.email,
          services: clientData.services || [],
          table_count: clientData.table_count || 0,
          room_count: clientData.room_count || 0,
          active: clientData.active !== undefined ? clientData.active : true,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation
        throw new Error("A client with this email already exists");
      }
      throw new Error(`Error creating client: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error("❌ Error in createClient:", error.message);
    throw error;
  }
};

// Actualizar cliente
const updateClient = async (id, clientData) => {
  try {
    console.log(`🔄 Starting client update for ID: ${id}`);

    // 1. Obtener datos actuales del cliente para detectar cambio de email
    let oldClientData = null;
    const emailChanged = clientData.email !== undefined;

    if (emailChanged) {
      const { data: currentClient, error: fetchError } = await supabase
        .from("clients")
        .select("email")
        .eq("id", id)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          throw new Error("Client not found");
        }
        throw new Error(`Error fetching current client: ${fetchError.message}`);
      }

      oldClientData = currentClient;
      console.log(
        `📧 Email change detected: ${oldClientData.email} → ${clientData.email}`,
      );
    }

    // 2. Preparar datos de actualización
    const updateData = {};
    if (clientData.name !== undefined) updateData.name = clientData.name;
    if (clientData.owner_name !== undefined)
      updateData.owner_name = clientData.owner_name;
    if (clientData.phone !== undefined) updateData.phone = clientData.phone;
    if (clientData.email !== undefined) updateData.email = clientData.email;
    if (clientData.services !== undefined)
      updateData.services = clientData.services;
    if (clientData.table_count !== undefined)
      updateData.table_count = clientData.table_count;
    if (clientData.room_count !== undefined)
      updateData.room_count = clientData.room_count;
    if (clientData.active !== undefined) updateData.active = clientData.active;
    if (clientData.deleted !== undefined)
      updateData.deleted = clientData.deleted;

    // 3. Actualizar cliente en base de datos
    const { data, error } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Client not found");
      }
      if (error.code === "23505") {
        throw new Error("A client with this email already exists");
      }
      throw new Error(`Error updating client: ${error.message}`);
    }

    // 4. Si hubo cambio de email, sincronizar con admin-portal
    if (
      emailChanged &&
      oldClientData &&
      oldClientData.email !== clientData.email
    ) {
      try {
        console.log(`🔄 Syncing email change with admin-portal...`);
        const syncResult = await syncEmailWithAdminPortal(
          oldClientData.email,
          clientData.email,
        );

        if (syncResult.synced) {
          console.log(
            `✅ Email sync successful for user: ${syncResult.clerkUserId}`,
          );
          // Agregar información de sincronización al resultado
          data._emailSyncResult = syncResult;
        } else {
          console.log(`ℹ️ Email sync not needed: ${syncResult.reason}`);
          data._emailSyncResult = syncResult;
        }
      } catch (syncError) {
        console.error("❌ Email sync failed:", syncError.message);
        // No fallar la actualización del cliente si la sincronización falla
        // pero agregar la información del error
        data._emailSyncError = syncError.message;
        console.warn(
          "⚠️ Client updated successfully but email sync failed - user may need to update login email manually",
        );
      }
    }

    console.log(`✅ Client updated successfully: ${data.name}`);
    return data;
  } catch (error) {
    console.error("❌ Error in updateClient:", error.message);
    throw error;
  }
};

const deleteClient = async (id) => {
  try {
    console.log(`🗑️ Iniciando eliminación del cliente: ${id}`);

    // 1. Primero obtener datos del cliente antes de eliminarlo
    const { data: clientToDelete, error: getError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (getError) {
      if (getError.code === "PGRST116") {
        throw new Error("Client not found");
      }
      throw new Error(`Error finding client: ${getError.message}`);
    }

    console.log(
      `📧 Cliente a eliminar: ${clientToDelete.name} (${clientToDelete.email})`,
    );

    // 2. Eliminar invitaciones pendientes de la whitelist de Supabase
    try {
      const { data: deletedInvitations, error: invitationError } =
        await supabase
          .from("pending_invitations")
          .delete()
          .eq("client_id", id)
          .select();

      if (deletedInvitations && deletedInvitations.length > 0) {
        console.log(
          `✅ ${deletedInvitations.length} invitaciones eliminadas de la whitelist`,
        );
      }
    } catch (invitationError) {
      console.warn(
        `⚠️ Error eliminando de whitelist de invitaciones:`,
        invitationError.message,
      );
    }

    // 3. Eliminar invitaciones pendientes de Clerk
    const deletedClerkInvitations = await deletePendingInvitationsFromClerk(
      clientToDelete.email,
    );

    // 4. Buscar y eliminar usuario registrado de Clerk
    const clerkUserId = await findClerkUserIdByEmail(clientToDelete.email);

    if (clerkUserId) {
      console.log(`🔍 Usuario de Clerk encontrado: ${clerkUserId}`);

      const clerkDeleteSuccess = await deleteUserFromClerk(clerkUserId);

      if (clerkDeleteSuccess) {
        console.log(`✅ Usuario eliminado exitosamente de Clerk`);
      } else {
        console.warn(
          `⚠️ No se pudo eliminar usuario de Clerk, continuando con Supabase`,
        );
      }
    } else {
      console.log(
        `ℹ️ No se encontró usuario registrado en admin-portal para: ${clientToDelete.email}`,
      );
    }

    const { data, error } = await supabase
      .from("clients")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Error deleting client from database: ${error.message}`);
    }

    console.log(`✅ Cliente eliminado completamente: ${data.name}`);

    // Retornar información detallada de la eliminación
    return {
      ...data,
      deletionSummary: {
        clerkInvitationsRevoked: deletedClerkInvitations,
        clerkUserDeleted: clerkUserId ? true : false,
        supabaseDeleted: true,
        whitelistCleaned: true,
      },
    };
  } catch (error) {
    console.error("❌ Error in deleteClient:", error.message);
    throw error;
  }
};

// ===============================================
// SERVICIOS PARA SUCURSALES
// ===============================================

// Función auxiliar para sincronizar tablas (tables) de una sucursal
const syncBranchTables = async (branchId, restaurantId, desiredTableCount) => {
  try {
    console.log(
      `🔄 Syncing tables for branch ${branchId}: target count = ${desiredTableCount}`,
    );

    // 1. Obtener las tablas existentes para esta sucursal
    const { data: existingTables, error: fetchError } = await supabase
      .from("tables")
      .select("id, table_number")
      .eq("branch_id", branchId)
      .order("table_number", { ascending: true });

    if (fetchError) {
      console.error("❌ Error fetching existing tables:", fetchError.message);
      throw new Error(`Error fetching tables: ${fetchError.message}`);
    }

    const existingTableNumbers = existingTables.map((t) => t.table_number);
    const maxExisting =
      existingTableNumbers.length > 0 ? Math.max(...existingTableNumbers) : 0;

    console.log(
      `📊 Existing tables: ${existingTableNumbers.join(", ") || "none"}`,
    );

    // 2. Si necesitamos crear tablas nuevas
    if (desiredTableCount > maxExisting) {
      const tablesToCreate = [];
      for (let i = maxExisting + 1; i <= desiredTableCount; i++) {
        tablesToCreate.push({
          branch_id: branchId,
          restaurant_id: restaurantId,
          table_number: i,
          is_occupied: false,
        });
      }

      if (tablesToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("tables")
          .insert(tablesToCreate);

        if (insertError) {
          console.error("❌ Error creating tables:", insertError.message);
          throw new Error(`Error creating tables: ${insertError.message}`);
        }

        console.log(
          `✅ Created ${tablesToCreate.length} new tables (${maxExisting + 1} to ${desiredTableCount})`,
        );
      }
    }

    // 3. Si necesitamos eliminar tablas sobrantes
    if (desiredTableCount < maxExisting) {
      const { error: deleteError } = await supabase
        .from("tables")
        .delete()
        .eq("branch_id", branchId)
        .gt("table_number", desiredTableCount);

      if (deleteError) {
        console.error("❌ Error deleting tables:", deleteError.message);
        throw new Error(`Error deleting tables: ${deleteError.message}`);
      }

      const deletedCount = maxExisting - desiredTableCount;
      console.log(
        `🗑️ Deleted ${deletedCount} tables (${desiredTableCount + 1} to ${maxExisting})`,
      );
    }

    console.log(`✅ Tables synced successfully for branch ${branchId}`);
  } catch (error) {
    console.error("❌ Error in syncBranchTables:", error.message);
    throw error;
  }
};

// Función auxiliar para sincronizar habitaciones (rooms) de una sucursal con rangos
const syncBranchRooms = async (branchId, restaurantId, roomRanges) => {
  try {
    console.log(`🔄 Syncing rooms for branch ${branchId}`);
    console.log(`📋 Room ranges:`, JSON.stringify(roomRanges));

    // Si no hay rangos de habitaciones, eliminar todas las existentes
    if (!roomRanges || roomRanges.length === 0) {
      const { error: deleteError } = await supabase
        .from("rooms")
        .delete()
        .eq("branch_id", branchId);

      if (deleteError) {
        console.error("❌ Error deleting all rooms:", deleteError.message);
        throw new Error(`Error deleting rooms: ${deleteError.message}`);
      }

      console.log(`🗑️ Deleted all rooms for branch ${branchId}`);
      return;
    }

    // 1. Calcular todos los números de habitación deseados desde los rangos
    const desiredRoomNumbers = [];
    for (const range of roomRanges) {
      for (let i = range.start; i <= range.end; i++) {
        desiredRoomNumbers.push(i);
      }
    }

    console.log(
      `📊 Desired room numbers (${desiredRoomNumbers.length} total): ${desiredRoomNumbers.slice(0, 10).join(", ")}${desiredRoomNumbers.length > 10 ? "..." : ""}`,
    );

    // 2. Obtener las habitaciones existentes para esta sucursal
    const { data: existingRooms, error: fetchError } = await supabase
      .from("rooms")
      .select("id, room_number")
      .eq("branch_id", branchId)
      .order("room_number", { ascending: true });

    if (fetchError) {
      console.error("❌ Error fetching existing rooms:", fetchError.message);
      throw new Error(`Error fetching rooms: ${fetchError.message}`);
    }

    const existingRoomNumbers = existingRooms.map((r) => r.room_number);
    console.log(
      `📊 Existing room numbers (${existingRoomNumbers.length} total): ${existingRoomNumbers.slice(0, 10).join(", ")}${existingRoomNumbers.length > 10 ? "..." : ""}`,
    );

    // 3. Determinar qué habitaciones crear y cuáles eliminar
    const roomsToCreate = desiredRoomNumbers.filter(
      (num) => !existingRoomNumbers.includes(num),
    );
    const roomsToDelete = existingRoomNumbers.filter(
      (num) => !desiredRoomNumbers.includes(num),
    );

    // 4. Crear habitaciones nuevas
    if (roomsToCreate.length > 0) {
      const roomRecords = roomsToCreate.map((roomNum) => ({
        branch_id: branchId,
        restaurant_id: restaurantId,
        room_number: roomNum,
        status: "available",
      }));

      const { error: insertError } = await supabase
        .from("rooms")
        .insert(roomRecords);

      if (insertError) {
        console.error("❌ Error creating rooms:", insertError.message);
        throw new Error(`Error creating rooms: ${insertError.message}`);
      }

      console.log(
        `✅ Created ${roomsToCreate.length} new rooms: ${roomsToCreate.slice(0, 10).join(", ")}${roomsToCreate.length > 10 ? "..." : ""}`,
      );
    }

    // 5. Eliminar habitaciones sobrantes
    if (roomsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("rooms")
        .delete()
        .eq("branch_id", branchId)
        .in("room_number", roomsToDelete);

      if (deleteError) {
        console.error("❌ Error deleting rooms:", deleteError.message);
        throw new Error(`Error deleting rooms: ${deleteError.message}`);
      }

      console.log(
        `🗑️ Deleted ${roomsToDelete.length} rooms: ${roomsToDelete.slice(0, 10).join(", ")}${roomsToDelete.length > 10 ? "..." : ""}`,
      );
    }

    console.log(
      `✅ Rooms synced successfully for branch ${branchId} - Total: ${desiredRoomNumbers.length} rooms`,
    );
  } catch (error) {
    console.error("❌ Error in syncBranchRooms:", error.message);
    throw error;
  }
};

// Obtener todas las sucursales
const getAllBranches = async () => {
  try {
    const { data, error } = await supabase
      .from("branches")
      .select(
        `
        id,
        client_id,
        restaurant_id,
        name,
        address,
        tables,
        rooms,
        room_ranges,
        branch_number,
        active,
        deleted,
        created_at,
        updated_at,
        client:clients(id, name, owner_name, email, phone),
        pos_integrations!pos_integrations_branch_id_fkey(
          provider_id,
          is_active
        )
      `,
      )
      .neq("deleted", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Error getting branches: ${error.message}`);
    }

    // Transformar para incluir pos_provider_id en el nivel superior
    const transformedData = data.map((branch) => {
      const posIntegration = branch.pos_integrations?.[0];
      const { pos_integrations, ...branchData } = branch;
      return {
        ...branchData,
        pos_provider_id: posIntegration?.is_active
          ? posIntegration.provider_id
          : null,
      };
    });

    return transformedData;
  } catch (error) {
    console.error("❌ Error in getAllBranches:", error.message);
    throw error;
  }
};

// Obtener sucursales por cliente
const getBranchesByClient = async (clientId) => {
  console.log(clientId);

  try {
    const { data, error } = await supabase
      .from("branches")
      .select(
        `
        id,
        client_id,
        restaurant_id,
        name,
        address,
        tables,
        rooms,
        room_ranges,
        branch_number,
        active,
        deleted,
        created_at,
        updated_at,
        pos_integrations!pos_integrations_branch_id_fkey(
          provider_id,
          is_active
        )
      `,
      )
      .eq("client_id", clientId)
      .neq("deleted", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Error getting branches for client: ${error.message}`);
    }

    // Transformar para incluir pos_provider_id en el nivel superior
    const transformedData = data.map((branch) => {
      const posIntegration = branch.pos_integrations?.[0];
      const { pos_integrations, ...branchData } = branch;
      return {
        ...branchData,
        pos_provider_id: posIntegration?.is_active
          ? posIntegration.provider_id
          : null,
      };
    });

    return transformedData;
  } catch (error) {
    console.error("❌ Error in getBranchesByClient:", error.message);
    throw error;
  }
};

// Obtener sucursal por ID
const getBranchById = async (id) => {
  try {
    const { data, error } = await supabase
      .from("branches")
      .select(
        `
        *,
        client:clients(id, name, owner_name, email, phone)
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Branch not found");
      }
      throw new Error(`Error getting branch: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error("❌ Error in getBranchById:", error.message);
    throw error;
  }
};

// Crear nueva sucursal
const createBranch = async (branchData) => {
  try {
    // Primero encontrar el restaurant_id asociado al client_id
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id")
      .eq("client_id", branchData.client_id)
      .eq("is_active", true)
      .single();

    if (restaurantError || !restaurant) {
      console.error(
        "❌ No restaurant found for client_id:",
        branchData.client_id,
      );
      throw new Error(
        "No active restaurant found for this client. Please create a restaurant first.",
      );
    }

    console.log(
      "✅ Found restaurant_id:",
      restaurant.id,
      "for client_id:",
      branchData.client_id,
    );

    // Calcular el número total de habitaciones desde los rangos
    const roomRanges = branchData.room_ranges || [];
    const totalRooms = roomRanges.reduce((total, range) => {
      return total + (range.end - range.start + 1);
    }, 0);

    // Si no hay rangos, usar el valor legacy de rooms
    const finalRooms = totalRooms > 0 ? totalRooms : branchData.rooms || 0;

    const { data, error } = await supabase
      .from("branches")
      .insert([
        {
          client_id: branchData.client_id,
          restaurant_id: restaurant.id, // ← AGREGADO: campo requerido
          name: branchData.name,
          address: branchData.address,
          tables: branchData.tables !== undefined ? branchData.tables : 0,
          rooms: finalRooms,
          room_ranges: roomRanges,
          active: branchData.active !== undefined ? branchData.active : true,
        },
      ])
      .select(
        `
        *,
        client:clients(id, name, owner_name, email, phone)
      `,
      )
      .single();

    if (error) {
      if (error.code === "23503") {
        // Foreign key violation
        throw new Error("Client or restaurant not found");
      }
      throw new Error(`Error creating branch: ${error.message}`);
    }

    // Sincronizar tablas y habitaciones después de crear la sucursal
    await syncBranchTables(data.id, restaurant.id, data.tables);

    // Sincronizar habitaciones usando rangos (si existen) o el conteo legacy
    if (data.room_ranges && data.room_ranges.length > 0) {
      await syncBranchRooms(data.id, restaurant.id, data.room_ranges);
    } else if (data.rooms > 0) {
      // Backward compatibility: convertir rooms a un solo rango [1, rooms]
      await syncBranchRooms(data.id, restaurant.id, [
        { start: 1, end: data.rooms },
      ]);
    }

    return data;
  } catch (error) {
    console.error("❌ Error in createBranch:", error.message);
    throw error;
  }
};

// Actualizar sucursal
const updateBranch = async (id, branchData) => {
  try {
    const updateData = {};

    // Si se está cambiando el client_id, también necesitamos actualizar restaurant_id
    if (branchData.client_id !== undefined) {
      updateData.client_id = branchData.client_id;

      // Encontrar el restaurant_id asociado al nuevo client_id
      const { data: restaurant, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id")
        .eq("client_id", branchData.client_id)
        .eq("is_active", true)
        .single();

      if (restaurantError || !restaurant) {
        console.error(
          "❌ No restaurant found for client_id:",
          branchData.client_id,
        );
        throw new Error("No active restaurant found for this client.");
      }

      updateData.restaurant_id = restaurant.id;
      console.log(
        "✅ Updated restaurant_id to:",
        restaurant.id,
        "for client_id:",
        branchData.client_id,
      );
    }

    if (branchData.name !== undefined) updateData.name = branchData.name;
    if (branchData.address !== undefined)
      updateData.address = branchData.address;
    if (branchData.tables !== undefined) updateData.tables = branchData.tables;

    // Manejar room_ranges y calcular rooms automáticamente
    if (branchData.room_ranges !== undefined) {
      updateData.room_ranges = branchData.room_ranges;

      // Calcular el número total de habitaciones desde los rangos
      const totalRooms = branchData.room_ranges.reduce((total, range) => {
        return total + (range.end - range.start + 1);
      }, 0);

      updateData.rooms = totalRooms;
    } else if (branchData.rooms !== undefined) {
      // Si se envía rooms directamente (legacy), usarlo
      updateData.rooms = branchData.rooms;
    }

    if (branchData.active !== undefined) updateData.active = branchData.active;
    if (branchData.deleted !== undefined)
      updateData.deleted = branchData.deleted;

    console.log(
      "🔍 updateData antes de guardar:",
      JSON.stringify(updateData, null, 2),
    );
    console.log("🔍 room_ranges en updateData:", updateData.room_ranges);
    console.log("🔍 rooms calculado:", updateData.rooms);

    const { data, error } = await supabase
      .from("branches")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        *,
        client:clients(id, name, owner_name, email, phone)
      `,
      )
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Branch not found");
      }
      if (error.code === "23503") {
        throw new Error("Client not found");
      }
      throw new Error(`Error updating branch: ${error.message}`);
    }

    // Sincronizar tablas si se modificaron
    if (branchData.tables !== undefined) {
      await syncBranchTables(data.id, data.restaurant_id, data.tables);
    }

    // Sincronizar habitaciones si se modificaron room_ranges o rooms
    if (branchData.room_ranges !== undefined) {
      // Prioridad a room_ranges
      await syncBranchRooms(data.id, data.restaurant_id, data.room_ranges);
    } else if (branchData.rooms !== undefined) {
      // Backward compatibility: convertir rooms a un solo rango [1, rooms]
      if (data.rooms > 0) {
        await syncBranchRooms(data.id, data.restaurant_id, [
          { start: 1, end: data.rooms },
        ]);
      } else {
        await syncBranchRooms(data.id, data.restaurant_id, []);
      }
    }

    return data;
  } catch (error) {
    console.error("❌ Error in updateBranch:", error.message);
    throw error;
  }
};

// Eliminar sucursal
const deleteBranch = async (id) => {
  try {
    const { data, error } = await supabase
      .from("branches")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Branch not found");
      }
      throw new Error(`Error deleting branch: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error("❌ Error in deleteBranch:", error.message);
    throw error;
  }
};

// ===============================================
// SERVICIOS DE ESTADÍSTICAS
// ===============================================

// Obtener estadísticas generales
const getMainPortalStats = async () => {
  try {
    const { data: clientStats, error: clientError } = await supabase
      .from("clients")
      .select("id, active, deleted")
      .neq("deleted", true);

    const { data: branchStats, error: branchError } = await supabase
      .from("branches")
      .select("id, active, tables, rooms, deleted")
      .neq("deleted", true);

    if (clientError || branchError) {
      throw new Error(
        `Error getting stats: ${clientError?.message || branchError?.message}`,
      );
    }

    const totalClients = clientStats.length;
    const activeClients = clientStats.filter((c) => c.active).length;
    const totalBranches = branchStats.length;
    const activeBranches = branchStats.filter((b) => b.active).length;
    const totalTables = branchStats.reduce(
      (sum, branch) => sum + (branch.tables || 0),
      0,
    );
    const totalRooms = branchStats.reduce(
      (sum, branch) => sum + (branch.rooms || 0),
      0,
    );

    return {
      clients: {
        total: totalClients,
        active: activeClients,
        inactive: totalClients - activeClients,
      },
      branches: {
        total: totalBranches,
        active: activeBranches,
        inactive: totalBranches - activeBranches,
      },
      tables: {
        total: totalTables,
      },
      rooms: {
        total: totalRooms,
      },
    };
  } catch (error) {
    console.error("❌ Error in getMainPortalStats:", error.message);
    throw error;
  }
};

// ===============================================
// FUNCIONES DE SINCRONIZACIÓN EMAIL CON ADMIN-PORTAL
// ===============================================

/**
 * Buscar usuario en admin-portal por email
 */
const findAdminPortalUserByEmail = async (email) => {
  try {
    const { data: user, error } = await supabase
      .from("user_admin_portal")
      .select("id, clerk_user_id, email, first_name, last_name")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found
      throw error;
    }

    return user || null;
  } catch (error) {
    console.error(
      "❌ Error finding admin portal user by email:",
      error.message,
    );
    return null;
  }
};

/**
 * Buscar y limpiar invitaciones revocadas en Clerk por email
 */
const findAndCleanRevokedInvitations = async (email) => {
  try {
    const adminPortalConfig = getClerkConfig("adminPortal");

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    console.log(`🔍 Searching for revoked invitations for email: ${email}`);

    // Buscar invitaciones en estado "revoked"
    const invitations = await adminPortalClerk.invitations.getInvitationList({
      status: "revoked",
    });

    const revokedInvitation = invitations.find(
      (inv) => inv.emailAddress === email && inv.status === "revoked",
    );

    if (revokedInvitation) {
      console.log(
        `🗑️ Found revoked invitation for ${email}, attempting to delete...`,
      );

      try {
        // Para invitaciones revocadas, no necesitamos llamar API - simplemente las ignoramos
        // Ya que están revocadas, no bloquean el email
        console.log(
          `✅ Revoked invitation found and ignored for ${email} (ID: ${revokedInvitation.id})`,
        );
        return true;
      } catch (deleteError) {
        console.warn(
          `⚠️ Could not process revoked invitation: ${deleteError.message}`,
        );
        return false;
      }
    } else {
      console.log(`ℹ️ No revoked invitation found for ${email}`);
      return false;
    }
  } catch (error) {
    console.warn(
      `⚠️ Error searching for revoked invitations: ${error.message}`,
    );
    return false;
  }
};

/**
 * Investigar estado actual del usuario en Clerk
 */
const debugClerkUser = async (clerkUserId) => {
  try {
    const adminPortalConfig = getClerkConfig("adminPortal");

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    const user = await adminPortalClerk.users.getUser(clerkUserId);

    console.log(`🔍 DEBUG - Current user state in Clerk:`);
    console.log(`  - User ID: ${user.id}`);
    console.log(
      `  - Email addresses:`,
      user.emailAddresses.map((e) => ({
        id: e.id,
        emailAddress: e.emailAddress,
        verification: e.verification?.status,
        primary: e.id === user.primaryEmailAddressId,
      })),
    );
    console.log(`  - Primary email ID: ${user.primaryEmailAddressId}`);

    return user;
  } catch (error) {
    console.error(`❌ Error debugging user: ${error.message}`);
    return null;
  }
};

/**
 * Actualizar email en Clerk admin-portal usando método que realmente funciona
 */
const updateEmailInClerkAdminPortal = async (clerkUserId, newEmail) => {
  try {
    const adminPortalConfig = getClerkConfig("adminPortal");

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    console.log(
      `🔄 Updating email in Clerk admin-portal for user: ${clerkUserId}`,
    );
    console.log(`📧 New email: ${newEmail}`);

    // 1. Investigar estado actual
    const currentUser = await debugClerkUser(clerkUserId);

    if (!currentUser) {
      throw new Error("User not found in Clerk");
    }

    // 2. Verificar si el email ya existe para este usuario
    const existingEmail = currentUser.emailAddresses.find(
      (e) => e.emailAddress === newEmail,
    );

    if (existingEmail) {
      console.log(
        `📧 Email ${newEmail} already exists with ID: ${existingEmail.id}`,
      );
      console.log(
        `📧 Current verification status: ${existingEmail.verification?.status || "unverified"}`,
      );

      // Si ya está verificado, intentar hacerlo primario
      if (existingEmail.verification?.status === "verified") {
        console.log(`📧 Email is verified, attempting to set as primary...`);
        try {
          await adminPortalClerk.emailAddresses.updateEmailAddress(
            existingEmail.id,
            {
              primary: true,
            },
          );
          console.log("✅ Verified email set as primary successfully");
        } catch (primaryError) {
          console.warn(`⚠️ Failed to set as primary: ${primaryError.message}`);
        }
      } else {
        // Si no está verificado, VERIFICARLO Y HACERLO PRIMARIO AUTOMÁTICAMENTE
        console.log(
          `📧 Email not verified, setting as verified and primary automatically...`,
        );
        console.log(`🔍 Email address ID: ${existingEmail.id}`);

        try {
          // Verificar
          await adminPortalClerk.emailAddresses.updateEmailAddress(
            existingEmail.id,
            {
              verified: true,
              primary: true,
            },
          );

          console.log("✅ Email verified and set as primary automatically!");

          console.log(`🎯 SYNCHRONIZATION COMPLETE!`);
          console.log(`📧 Email ${newEmail} is now verified and primary`);
        } catch (updateError) {
          console.warn(
            `⚠️ Failed to update email as verified/primary: ${updateError.message}`,
          );
          console.log(
            `📧 User needs manual verification to complete the process`,
          );
        }
      }

      // Verificar el resultado
      console.log(`🔍 Verifying final state...`);
      const finalUser = await debugClerkUser(clerkUserId);
      return finalUser;
    }

    // 3. Si no existe, crear nueva dirección de email como VERIFICADO Y PRIMARIO
    try {
      console.log(
        `📧 Creating new email address ${newEmail} as verified and primary...`,
      );

      // Crear email como VERIFICADO y PRIMARIO automáticamente
      const newEmailAddress =
        await adminPortalClerk.emailAddresses.createEmailAddress({
          userId: clerkUserId,
          emailAddress: newEmail,
          verified: true,
          primary: true,
        });

      console.log(`✅ Email address created with ID: ${newEmailAddress.id}`);
      console.log(`🎯 Email created as VERIFIED and PRIMARY automatically!`);

      console.log(`🎯 SYNCHRONIZATION COMPLETE!`);
      console.log(`📧 Email ${newEmail} is now the primary verified email`);

      // Verificar el resultado
      console.log(`🔍 Verifying final state...`);
      const updatedUser = await debugClerkUser(clerkUserId);
      return updatedUser;
    } catch (createError) {
      console.warn(`⚠️ Email creation failed: ${createError.message}`);

      // Si el email ya existe, intentar encontrarlo y hacerlo primario
      if (
        createError.message.includes("already exists") ||
        createError.message.includes("unique")
      ) {
        console.log(
          `🔄 Email might already exist, trying to find and set as primary...`,
        );

        try {
          const currentUser = await adminPortalClerk.users.getUser(clerkUserId);
          const existingEmail = currentUser.emailAddresses.find(
            (e) => e.emailAddress === newEmail,
          );

          if (existingEmail) {
            console.log(
              `📧 Found existing email with verification status: ${existingEmail.verification?.status}`,
            );

            // Si el email ya está verificado, hacerlo primario
            if (existingEmail.verification?.status === "verified") {
              console.log(`📧 Email is verified, setting as primary...`);
              await adminPortalClerk.emailAddresses.updateEmailAddress(
                existingEmail.id,
                {
                  primary: true,
                },
              );
              console.log("✅ Existing verified email set as primary");
            } else {
              // Si no está verificado, enviar verificación
              console.log(
                `📧 Email not verified, sending verification email...`,
              );
              try {
                await adminPortalClerk.emailAddresses.createEmailAddressVerification(
                  existingEmail.id,
                );
                console.log(
                  "✅ Verification email sent to existing email address",
                );
                console.log(
                  `📧 User must verify ${newEmail} before it can be used for login`,
                );
              } catch (verifyExistingError) {
                console.warn(
                  `⚠️ Failed to send verification to existing email: ${verifyExistingError.message}`,
                );
              }
            }

            return await debugClerkUser(clerkUserId);
          } else {
            throw new Error("Email not found even though it allegedly exists");
          }
        } catch (setPrimaryError) {
          console.error(
            `❌ Failed to set existing email as primary: ${setPrimaryError.message}`,
          );
        }
      }

      // Último intento: actualización directa del usuario (aunque no parece funcionar)
      try {
        console.log(`🔄 Trying direct user update as last resort...`);

        await adminPortalClerk.users.updateUser(clerkUserId, {
          emailAddress: newEmail,
        });

        const finalUser = await debugClerkUser(clerkUserId);
        console.log(
          "📧 Direct update completed (check debug info above for actual result)",
        );
        return finalUser;
      } catch (directError) {
        console.error(`❌ Direct update also failed: ${directError.message}`);
        throw new Error(
          `All update methods failed: ${createError.message} | ${directError.message}`,
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ Error updating email in Clerk admin-portal:",
      error.message,
    );
    console.error("❌ Full error:", error);
    throw error;
  }
};

/**
 * Actualizar email en tabla user_admin_portal
 */
const updateEmailInSupabaseAdminPortal = async (clerkUserId, newEmail) => {
  try {
    console.log(
      `🔄 Updating email in Supabase user_admin_portal for user: ${clerkUserId}`,
    );

    const { data, error } = await supabase
      .from("user_admin_portal")
      .update({
        email: newEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("clerk_user_id", clerkUserId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log("✅ Email updated in Supabase user_admin_portal successfully");
    return data;
  } catch (error) {
    console.error(
      "❌ Error updating email in Supabase user_admin_portal:",
      error.message,
    );
    throw new Error(`Error updating email in Supabase: ${error.message}`);
  }
};

/**
 * Actualizar email en tabla pending_invitations (solo registros con status 'registered')
 * Esto es necesario para mantener la asociación usuario-cliente cuando se cambia el email
 */
const updateEmailInPendingInvitations = async (oldEmail, newEmail) => {
  try {
    console.log(
      `🔄 Updating email in pending_invitations from ${oldEmail} to ${newEmail}`,
    );

    const { data, error } = await supabase
      .from("pending_invitations")
      .update({
        email: newEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("email", oldEmail)
      .eq("status", "registered")
      .select();

    if (error) {
      throw error;
    }

    const updatedCount = data ? data.length : 0;
    console.log(`✅ Updated ${updatedCount} record(s) in pending_invitations`);
    return data;
  } catch (error) {
    console.error(
      "❌ Error updating email in pending_invitations:",
      error.message,
    );
    throw new Error(
      `Error updating email in pending_invitations: ${error.message}`,
    );
  }
};

/**
 * Verificar si email está disponible en Clerk (considerando invitaciones revocadas)
 */
const isEmailAvailableInClerk = async (email, excludeClerkUserId = null) => {
  try {
    const adminPortalConfig = getClerkConfig("adminPortal");

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    console.log(
      `🔍 Checking if email ${email} is available in Clerk admin-portal`,
    );

    // 1. Verificar si hay usuario activo con este email (excepto el que estamos actualizando)
    const existingUser = await findAdminPortalUserByEmail(email);
    if (existingUser && existingUser.clerk_user_id !== excludeClerkUserId) {
      console.log(
        `❌ Email ${email} is already in use by active user: ${existingUser.clerk_user_id}`,
      );
      return false;
    }

    // 2. Si no hay usuario activo, verificar y limpiar invitaciones revocadas
    const cleanedRevoked = await findAndCleanRevokedInvitations(email);
    if (cleanedRevoked) {
      console.log(
        `✅ Cleaned revoked invitation for ${email}, email is now available`,
      );
    }

    return true;
  } catch (error) {
    console.warn(`⚠️ Error checking email availability: ${error.message}`);
    // En caso de error, ser conservadores y asumir que no está disponible
    return false;
  }
};

/**
 * Limpiar registro huérfano en Supabase (usuario que ya no existe en Clerk)
 */
const cleanOrphanedSupabaseRecord = async (clerkUserId, email) => {
  try {
    console.log(
      `🧹 Cleaning orphaned Supabase record for Clerk user: ${clerkUserId} (email: ${email})`,
    );

    // 1. Marcar como inactivo en lugar de eliminar (para mantener auditoría)
    const { data, error } = await supabase
      .from("user_admin_portal")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        deactivation_reason: `Orphaned record - Clerk user ${clerkUserId} no longer exists`,
      })
      .eq("clerk_user_id", clerkUserId)
      .select();

    if (error) {
      throw error;
    }

    console.log(`✅ Successfully cleaned orphaned record for ${email}`);
    return data;
  } catch (error) {
    console.error(`❌ Error cleaning orphaned record: ${error.message}`);
    throw error;
  }
};

/**
 * Verificar si usuario de Clerk realmente existe
 */
const verifyClerkUserExists = async (clerkUserId) => {
  try {
    const adminPortalConfig = getClerkConfig("adminPortal");

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey,
    });

    await adminPortalClerk.users.getUser(clerkUserId);
    return true;
  } catch (error) {
    if (error.status === 404 || error.message.includes("not found")) {
      return false;
    }
    throw error; // Re-throw si es otro tipo de error
  }
};

/**
 * Sincronizar cambio de email entre main-portal y admin-portal
 */
const syncEmailWithAdminPortal = async (oldEmail, newEmail) => {
  try {
    console.log(`🔄 Starting email sync: ${oldEmail} → ${newEmail}`);

    // 1. Buscar si existe usuario en admin-portal con el email anterior
    const adminUser = await findAdminPortalUserByEmail(oldEmail);

    if (!adminUser) {
      console.log(
        "ℹ️ No admin-portal user found with old email, no sync needed",
      );
      return { synced: false, reason: "No admin-portal user found" };
    }

    console.log(`🔍 Found admin-portal user: ${adminUser.clerk_user_id}`);

    // 2. Verificar si hay conflictos con el nuevo email
    const conflictUser = await findAdminPortalUserByEmail(newEmail);

    if (
      conflictUser &&
      conflictUser.clerk_user_id !== adminUser.clerk_user_id
    ) {
      console.log(
        `⚠️ Email ${newEmail} is in use by user: ${conflictUser.clerk_user_id}`,
      );

      // Verificar si el usuario conflictivo realmente existe en Clerk
      const clerkUserExists = await verifyClerkUserExists(
        conflictUser.clerk_user_id,
      );

      if (!clerkUserExists) {
        console.log(
          `🧹 User ${conflictUser.clerk_user_id} not found in Clerk - cleaning orphaned record`,
        );
        await cleanOrphanedSupabaseRecord(conflictUser.clerk_user_id, newEmail);
        console.log(`✅ Orphaned record cleaned, proceeding with sync`);
      } else {
        throw new Error(
          `Email ${newEmail} is already in use by another active admin-portal user (${conflictUser.clerk_user_id})`,
        );
      }
    }

    console.log(`✅ Email ${newEmail} is available, proceeding with sync`);

    // 3. Actualizar email en Clerk admin-portal
    await updateEmailInClerkAdminPortal(adminUser.clerk_user_id, newEmail);

    // 4. Actualizar email en Supabase user_admin_portal
    await updateEmailInSupabaseAdminPortal(adminUser.clerk_user_id, newEmail);

    // 5. Actualizar email en pending_invitations (para mantener asociación usuario-cliente)
    await updateEmailInPendingInvitations(oldEmail, newEmail);

    console.log("✅ Email sync completed successfully");
    return {
      synced: true,
      clerkUserId: adminUser.clerk_user_id,
      oldEmail,
      newEmail,
    };
  } catch (error) {
    console.error("❌ Error in email sync:", error.message);
    throw error;
  }
};

module.exports = {
  // Clientes
  getAllClients,
  getClientById,
  createClient: createNewClient,
  updateClient,
  deleteClient,
  // Sincronización admin-portal
  findAdminPortalUserByEmail,
  syncEmailWithAdminPortal,
  isEmailAvailableInClerk,
  findAndCleanRevokedInvitations,
  cleanOrphanedSupabaseRecord,
  verifyClerkUserExists,
  debugClerkUser,
  // Sucursales
  getAllBranches,
  getBranchesByClient,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  // Estadísticas
  getMainPortalStats,
};
