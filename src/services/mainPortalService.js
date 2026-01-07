const supabase = require('../config/supabase');
const { createClerkClient } = require('@clerk/clerk-sdk-node');
const { getClerkConfig } = require('../config/clerkConfig');

const findClerkUserIdByEmail = async (email) => {
  try {
    const { data: user, error } = await supabase
      .from('user_admin_portal')
      .select('clerk_user_id')
      .eq('email', email)
      .single();

    if (error || !user) {
      return null;
    }

    return user.clerk_user_id;
  } catch (error) {
    console.error('❌ Error finding clerk_user_id:', error.message);
    return null;
  }
};

const deleteUserFromClerk = async (clerkUserId) => {
  try {
    const adminPortalConfig = getClerkConfig('adminPortal');

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey
    });

    await adminPortalClerk.users.deleteUser(clerkUserId);
    console.log(`✅ Usuario eliminado de Clerk: ${clerkUserId}`);
    return true;
  } catch (error) {
    console.error('❌ Error eliminando usuario de Clerk:', error.message);
    return false;
  }
};

const deletePendingInvitationsFromClerk = async (email) => {
  try {
    const adminPortalConfig = getClerkConfig('adminPortal');

    const adminPortalClerk = createClerkClient({
      secretKey: adminPortalConfig.secretKey
    });

    console.log(`🔍 Buscando invitaciones pendientes para: ${email}`);

    // Obtener todas las invitaciones
    const invitationsList = await adminPortalClerk.invitations.getInvitationList();

    // Verificar diferentes formatos de respuesta posibles
    let invitationsArray = [];

    if (Array.isArray(invitationsList)) {
      // Si la respuesta es directamente un array
      invitationsArray = invitationsList;
    } else if (invitationsList && Array.isArray(invitationsList.data)) {
      // Si la respuesta tiene estructura { data: [...] }
      invitationsArray = invitationsList.data;
    } else if (invitationsList && invitationsList.invitations && Array.isArray(invitationsList.invitations)) {
      // Si la respuesta tiene estructura { invitations: [...] }
      invitationsArray = invitationsList.invitations;
    } else {
      console.warn('⚠️ Formato inesperado de respuesta de invitations:', invitationsList);
      return 0;
    }

    console.log(`📊 Total invitaciones encontradas: ${invitationsArray.length}`);

    // Buscar invitaciones para este email
    const pendingInvitations = invitationsArray.filter(inv => {
      const emailMatch = inv.emailAddress === email;
      const isPending = inv.status === 'pending';

      if (emailMatch) {
        console.log(`🔍 Invitación encontrada para ${email}: status=${inv.status}, id=${inv.id}`);
      }

      return emailMatch && isPending;
    });

    console.log(`📧 Invitaciones pendientes para ${email}: ${pendingInvitations.length}`);

    let deletedCount = 0;
    for (const invitation of pendingInvitations) {
      try {
        console.log(`🗑️ Revocando invitación: ${invitation.id}`);
        await adminPortalClerk.invitations.revokeInvitation(invitation.id);
        console.log(`✅ Invitación revocada para ${email}: ${invitation.id}`);
        deletedCount++;
      } catch (revokeError) {
        console.error(`❌ Error revocando invitación ${invitation.id}:`, revokeError.message);
      }
    }

    console.log(`✅ ${deletedCount} invitaciones pendientes eliminadas para ${email}`);
    return deletedCount;
  } catch (error) {
    console.error('❌ Error eliminando invitaciones pendientes de Clerk:', error.message);
    console.error('Stack trace:', error.stack);
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
      .from('clients')
      .select(`
        *,
        branches:branches(count)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Error getting clients: ${error.message}`);
    }

    // Formatear datos para incluir conteo de sucursales
    const formattedData = data.map(client => ({
      ...client,
      branchCount: client.branches?.[0]?.count || 0
    }));

    return formattedData;
  } catch (error) {
    console.error('❌ Error in getAllClients:', error.message);
    throw error;
  }
};

// Obtener cliente por ID
const getClientById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        branches:branches(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Client not found');
      }
      throw new Error(`Error getting client: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in getClientById:', error.message);
    throw error;
  }
};

// Crear nuevo cliente
const createNewClient = async (clientData) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert([{
        name: clientData.name,
        owner_name: clientData.owner_name,
        phone: clientData.phone,
        email: clientData.email,
        services: clientData.services || [],
        table_count: clientData.table_count || 0,
        room_count: clientData.room_count || 0,
        active: clientData.active !== undefined ? clientData.active : true
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('A client with this email already exists');
      }
      throw new Error(`Error creating client: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in createClient:', error.message);
    throw error;
  }
};

// Actualizar cliente
const updateClient = async (id, clientData) => {
  try {
    const updateData = {};

    if (clientData.name !== undefined) updateData.name = clientData.name;
    if (clientData.owner_name !== undefined) updateData.owner_name = clientData.owner_name;
    if (clientData.phone !== undefined) updateData.phone = clientData.phone;
    if (clientData.email !== undefined) updateData.email = clientData.email;
    if (clientData.services !== undefined) updateData.services = clientData.services;
    if (clientData.table_count !== undefined) updateData.table_count = clientData.table_count;
    if (clientData.room_count !== undefined) updateData.room_count = clientData.room_count;
    if (clientData.active !== undefined) updateData.active = clientData.active;

    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Client not found');
      }
      if (error.code === '23505') {
        throw new Error('A client with this email already exists');
      }
      throw new Error(`Error updating client: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in updateClient:', error.message);
    throw error;
  }
};

const deleteClient = async (id) => {
  try {
    console.log(`🗑️ Iniciando eliminación del cliente: ${id}`);

    // 1. Primero obtener datos del cliente antes de eliminarlo
    const { data: clientToDelete, error: getError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (getError) {
      if (getError.code === 'PGRST116') {
        throw new Error('Client not found');
      }
      throw new Error(`Error finding client: ${getError.message}`);
    }

    console.log(`📧 Cliente a eliminar: ${clientToDelete.name} (${clientToDelete.email})`);

    // 2. Eliminar invitaciones pendientes de la whitelist de Supabase
    try {
      const { data: deletedInvitations, error: invitationError } = await supabase
        .from('pending_invitations')
        .delete()
        .eq('client_id', id)
        .select();

      if (deletedInvitations && deletedInvitations.length > 0) {
        console.log(`✅ ${deletedInvitations.length} invitaciones eliminadas de la whitelist`);
      }
    } catch (invitationError) {
      console.warn(`⚠️ Error eliminando de whitelist de invitaciones:`, invitationError.message);
    }

    // 3. Eliminar invitaciones pendientes de Clerk
    const deletedClerkInvitations = await deletePendingInvitationsFromClerk(clientToDelete.email);

    // 4. Buscar y eliminar usuario registrado de Clerk
    const clerkUserId = await findClerkUserIdByEmail(clientToDelete.email);

    if (clerkUserId) {
      console.log(`🔍 Usuario de Clerk encontrado: ${clerkUserId}`);

      const clerkDeleteSuccess = await deleteUserFromClerk(clerkUserId);

      if (clerkDeleteSuccess) {
        console.log(`✅ Usuario eliminado exitosamente de Clerk`);
      } else {
        console.warn(`⚠️ No se pudo eliminar usuario de Clerk, continuando con Supabase`);
      }
    } else {
      console.log(`ℹ️ No se encontró usuario registrado en admin-portal para: ${clientToDelete.email}`);
    }

    const { data, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
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
        whitelistCleaned: true
      }
    };
  } catch (error) {
    console.error('❌ Error in deleteClient:', error.message);
    throw error;
  }
};

// ===============================================
// SERVICIOS PARA SUCURSALES
// ===============================================

// Obtener todas las sucursales
const getAllBranches = async () => {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select(`
        id,
        client_id,
        restaurant_id,
        name,
        address,
        tables,
        branch_number,
        active,
        created_at,
        updated_at,
        client:clients(id, name, owner_name, email, phone)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Error getting branches: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in getAllBranches:', error.message);
    throw error;
  }
};

// Obtener sucursales por cliente
const getBranchesByClient = async (clientId) => {
  console.log(clientId);

  try {
    const { data, error } = await supabase
      .from('branches')
      .select(`
        id,
        client_id,
        restaurant_id,
        name,
        address,
        tables,
        branch_number,
        active,
        created_at,
        updated_at
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Error getting branches for client: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in getBranchesByClient:', error.message);
    throw error;
  }
};

// Obtener sucursal por ID
const getBranchById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select(`
        *,
        client:clients(id, name, owner_name, email, phone)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Branch not found');
      }
      throw new Error(`Error getting branch: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in getBranchById:', error.message);
    throw error;
  }
};

// Crear nueva sucursal
const createBranch = async (branchData) => {
  try {
    // Primero encontrar el restaurant_id asociado al client_id
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id')
      .eq('client_id', branchData.client_id)
      .eq('is_active', true)
      .single();

    if (restaurantError || !restaurant) {
      console.error('❌ No restaurant found for client_id:', branchData.client_id);
      throw new Error('No active restaurant found for this client. Please create a restaurant first.');
    }

    console.log('✅ Found restaurant_id:', restaurant.id, 'for client_id:', branchData.client_id);

    const { data, error } = await supabase
      .from('branches')
      .insert([{
        client_id: branchData.client_id,
        restaurant_id: restaurant.id, // ← AGREGADO: campo requerido
        name: branchData.name,
        address: branchData.address,
        tables: branchData.tables || 1,
        active: branchData.active !== undefined ? branchData.active : true
      }])
      .select(`
        *,
        client:clients(id, name, owner_name, email, phone)
      `)
      .single();

    if (error) {
      if (error.code === '23503') { // Foreign key violation
        throw new Error('Client or restaurant not found');
      }
      throw new Error(`Error creating branch: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in createBranch:', error.message);
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
        .from('restaurants')
        .select('id')
        .eq('client_id', branchData.client_id)
        .eq('is_active', true)
        .single();

      if (restaurantError || !restaurant) {
        console.error('❌ No restaurant found for client_id:', branchData.client_id);
        throw new Error('No active restaurant found for this client.');
      }

      updateData.restaurant_id = restaurant.id;
      console.log('✅ Updated restaurant_id to:', restaurant.id, 'for client_id:', branchData.client_id);
    }

    if (branchData.name !== undefined) updateData.name = branchData.name;
    if (branchData.address !== undefined) updateData.address = branchData.address;
    if (branchData.tables !== undefined) updateData.tables = branchData.tables;
    if (branchData.active !== undefined) updateData.active = branchData.active;

    const { data, error } = await supabase
      .from('branches')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        client:clients(id, name, owner_name, email, phone)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Branch not found');
      }
      if (error.code === '23503') {
        throw new Error('Client not found');
      }
      throw new Error(`Error updating branch: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in updateBranch:', error.message);
    throw error;
  }
};

// Eliminar sucursal
const deleteBranch = async (id) => {
  try {
    const { data, error } = await supabase
      .from('branches')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Branch not found');
      }
      throw new Error(`Error deleting branch: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('❌ Error in deleteBranch:', error.message);
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
      .from('clients')
      .select('id, active');

    const { data: branchStats, error: branchError } = await supabase
      .from('branches')
      .select('id, active, tables');

    if (clientError || branchError) {
      throw new Error(`Error getting stats: ${clientError?.message || branchError?.message}`);
    }

    const totalClients = clientStats.length;
    const activeClients = clientStats.filter(c => c.active).length;
    const totalBranches = branchStats.length;
    const activeBranches = branchStats.filter(b => b.active).length;
    const totalTables = branchStats.reduce((sum, branch) => sum + (branch.tables || 0), 0);

    return {
      clients: {
        total: totalClients,
        active: activeClients,
        inactive: totalClients - activeClients
      },
      branches: {
        total: totalBranches,
        active: activeBranches,
        inactive: totalBranches - activeBranches
      },
      tables: {
        total: totalTables
      }
    };
  } catch (error) {
    console.error('❌ Error in getMainPortalStats:', error.message);
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
  // Sucursales
  getAllBranches,
  getBranchesByClient,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  // Estadísticas
  getMainPortalStats
};