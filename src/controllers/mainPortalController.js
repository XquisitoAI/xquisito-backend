const mainPortalService = require('../services/mainPortalService');

// ===============================================
// CONTROLADORES PARA CLIENTES
// ===============================================

// GET /api/main-portal/clients
const getAllClients = async (req, res) => {
  try {
    console.log('🔍 Getting all clients for main-portal');

    const clients = await mainPortalService.getAllClients();

    console.log(`✅ Found ${clients.length} clients`);
    res.json({
      success: true,
      data: clients,
      total: clients.length
    });
  } catch (error) {
    console.error('❌ Error getting clients:', error.message);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// GET /api/main-portal/clients/:id
const getClientById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Getting client by ID:', id);

    const client = await mainPortalService.getClientById(id);

    console.log('✅ Client found:', client.name);
    res.json({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('❌ Error getting client:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Client not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// POST /api/main-portal/clients
const createClient = async (req, res) => {
  try {
    const clientData = req.body;
    console.log('🆕 Creating new client:', clientData.name);

    // Validaciones básicas
    if (!clientData.name || !clientData.owner_name || !clientData.email || !clientData.phone) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Missing required fields: name, owner_name, email, phone'
      });
    }

    const client = await mainPortalService.createClient(clientData);

    console.log('✅ Client created successfully:', client.id);
    res.status(201).json({
      success: true,
      data: client,
      message: 'Client created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating client:', error.message);

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: 'conflict',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// PUT /api/main-portal/clients/:id
const updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const clientData = req.body;
    console.log('🔄 Updating client:', id);

    const client = await mainPortalService.updateClient(id, clientData);

    console.log('✅ Client updated successfully:', client.name);
    res.json({
      success: true,
      data: client,
      message: 'Client updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating client:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Client not found'
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: 'conflict',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// DELETE /api/main-portal/clients/:id
const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Deleting client:', id);

    const client = await mainPortalService.deleteClient(id);

    console.log('✅ Client deleted successfully:', client.name);
    res.json({
      success: true,
      data: client,
      message: 'Client and all associated branches deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting client:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Client not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// ===============================================
// CONTROLADORES PARA SUCURSALES
// ===============================================

// GET /api/main-portal/branches
const getAllBranches = async (req, res) => {
  try {
    const { client_id } = req.query;
    console.log('🔍 Getting branches', client_id ? `for client: ${client_id}` : '(all)');

    const branches = client_id
      ? await mainPortalService.getBranchesByClient(client_id)
      : await mainPortalService.getAllBranches();

    console.log(`✅ Found ${branches.length} branches`);
    res.json({
      success: true,
      data: branches,
      total: branches.length
    });
  } catch (error) {
    console.error('❌ Error getting branches:', error.message);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// GET /api/main-portal/branches/:id
const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Getting branch by ID:', id);

    const branch = await mainPortalService.getBranchById(id);

    console.log('✅ Branch found:', branch.name);
    res.json({
      success: true,
      data: branch
    });
  } catch (error) {
    console.error('❌ Error getting branch:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Branch not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// POST /api/main-portal/branches
const createBranch = async (req, res) => {
  try {
    const branchData = req.body;
    console.log('🆕 Creating new branch:', branchData.name);

    // Validaciones básicas
    if (!branchData.client_id || !branchData.name || !branchData.address) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Missing required fields: client_id, name, address'
      });
    }

    const branch = await mainPortalService.createBranch(branchData);

    console.log('✅ Branch created successfully:', branch.id);
    res.status(201).json({
      success: true,
      data: branch,
      message: 'Branch created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating branch:', error.message);

    if (error.message.includes('Client not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Client not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// PUT /api/main-portal/branches/:id
const updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const branchData = req.body;
    console.log('🔄 Updating branch:', id);

    const branch = await mainPortalService.updateBranch(id, branchData);

    console.log('✅ Branch updated successfully:', branch.name);
    res.json({
      success: true,
      data: branch,
      message: 'Branch updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating branch:', error.message);

    if (error.message.includes('Branch not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Branch not found'
      });
    }

    if (error.message.includes('Client not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Client not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// DELETE /api/main-portal/branches/:id
const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Deleting branch:', id);

    const branch = await mainPortalService.deleteBranch(id);

    console.log('✅ Branch deleted successfully:', branch.name);
    res.json({
      success: true,
      data: branch,
      message: 'Branch deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting branch:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Branch not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// ===============================================
// CONTROLADORES DE ESTADÍSTICAS
// ===============================================

// GET /api/main-portal/stats
const getMainPortalStats = async (req, res) => {
  try {
    console.log('📊 Getting main portal statistics');

    const stats = await mainPortalService.getMainPortalStats();

    console.log('✅ Stats retrieved successfully');
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

module.exports = {
  // Clientes
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  // Sucursales
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  // Estadísticas
  getMainPortalStats
};