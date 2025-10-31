const supabase = require('../config/supabase');

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

// Eliminar cliente (y todas sus sucursales por CASCADE)
const deleteClient = async (id) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Client not found');
      }
      throw new Error(`Error deleting client: ${error.message}`);
    }

    return data;
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
        *,
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
      .select('*')
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
    const { data, error } = await supabase
      .from('branches')
      .insert([{
        client_id: branchData.client_id,
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
        throw new Error('Client not found');
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

    if (branchData.client_id !== undefined) updateData.client_id = branchData.client_id;
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