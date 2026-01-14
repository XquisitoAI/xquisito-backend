const mainPortalService = require('../services/mainPortalService');
const { createClerkClient } = require('@clerk/clerk-sdk-node');
const { getClerkConfig } = require('../config/clerkConfig');
const supabase = require('../config/supabase');

// ===============================================
// CONTROLADORES PARA CLIENTES
// ===============================================

// GET /api/main-portal/clients
const getAllClients = async (req, res) => {
  try {
    console.log('🔍 Getting all clients for main-portal');

    const clients = await mainPortalService.getAllClients();

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

    const client = await mainPortalService.getClientById(id);

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
    const { sendInvitation = true, ...clientData } = req.body;

    if (!clientData.name || !clientData.owner_name || !clientData.email || !clientData.phone) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Missing required fields: name, owner_name, email, phone'
      });
    }

    // 1. Crear cliente normal
    const client = await mainPortalService.createClient(clientData);
    console.log('✅ Client created successfully:', client.id);

    let invitationSent = false;

    // 2. Solo procesar invitación si está habilitada
    if (sendInvitation) {
      // 2a. Agregar email a whitelist de invitaciones
      try {
        await supabase.from('pending_invitations').insert({
          client_id: client.id,
          email: client.email,
          client_name: client.name,
          invited_by: req.auth.userId // del token de Clerk del super admin
        });
      } catch (invitationError) {
        console.error('⚠️ Error adding to invitation whitelist:', invitationError.message);
        // No fallar si no se puede agregar a la whitelist
      }

      // 2b. Enviar invitación por email usando Clerk
      try {
        // Obtener configuración específica del admin portal para enviar invitaciones
        const adminPortalConfig = getClerkConfig('adminPortal');        

        const adminPortalClerk = createClerkClient({
          secretKey: adminPortalConfig.secretKey
        });

        const invitationUrl = `${process.env.ADMIN_PORTAL_URL}/sign-up?invited=true&email=${encodeURIComponent(client.email)}`;

        const invitationData = {
          emailAddress: client.email,
          redirectUrl: invitationUrl,
          templateSlug: 'invitation',
          expiresInDays: 7, // 7 días de validez (vs 30 por defecto)
          notify: true, 
          publicMetadata: {
            client_id: client.id,
            client_name: client.name,
            source: 'main-portal'
          }
        };

        const invitation = await adminPortalClerk.invitations.createInvitation(invitationData);

        console.log(`📧 Invitation sent successfully to ${client.email}`);
        console.log('✅ Clerk invitation response:', invitation.id);
        invitationSent = true;
      } catch (clerkError) {
        console.error('⚠️ Error sending Clerk invitation:');
        console.error('   Message:', clerkError.message);
        console.error('   Status:', clerkError.status);
        console.error('   Error details:', JSON.stringify(clerkError, null, 2));
        // No fallar si no se puede enviar la invitación por email
      }
    } else {
      console.log('⏭️ Skipping invitation process - sendInvitation = false');
    }

    res.status(201).json({
      success: true,
      data: client,
      message: invitationSent
        ? 'Client created successfully and invitation sent'
        : 'Client created successfully'
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

    const result = await mainPortalService.deleteClient(id);

    console.log('✅ Client deleted successfully:', result.name);

    // Construir mensaje detallado
    let message = `Client '${result.name}' deleted successfully`;

    if (result.deletionSummary) {
      const summary = result.deletionSummary;
      let details = [];

      if (summary.clerkUserDeleted) {
        details.push('Clerk user deleted');
      }

      if (summary.clerkInvitationsRevoked > 0) {
        details.push(`${summary.clerkInvitationsRevoked} pending invitations revoked`);
      }

      if (summary.whitelistCleaned) {
        details.push('invitation whitelist cleaned');
      }

      if (details.length > 0) {
        message += ` (${details.join(', ')})`;
      }
    }

    res.json({
      success: true,
      data: result,
      message
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
    console.log('📥 Branch data received:', JSON.stringify(branchData, null, 2));
    console.log('📥 room_ranges received:', branchData.room_ranges);

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

// GET /api/main-portal/invitations/status
const getInvitationStatuses = async (req, res) => {
  try {
    console.log('📧 Getting invitation statuses');

    const { data, error } = await supabase
      .from('pending_invitations')
      .select('client_id, email, status, invited_at, used_at');

    if (error) {
      throw new Error(`Error getting invitation statuses: ${error.message}`);
    }

    // Crear un mapa de client_id -> status de invitación
    const invitationMap = {};
    data.forEach(invitation => {
      invitationMap[invitation.client_id] = {
        status: invitation.status,
        email: invitation.email,
        invitedAt: invitation.invited_at,
        usedAt: invitation.used_at
      };
    });

    console.log(`✅ Found invitation statuses for ${data.length} clients`);
    res.json({
      success: true,
      data: invitationMap
    });
  } catch (error) {
    console.error('❌ Error getting invitation statuses:', error.message);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

// GET /api/main-portal/clients/:email/admin-portal-status
const checkClientAdminPortalStatus = async (req, res) => {
  try {
    const { email } = req.params;
    console.log(`🔍 Checking admin-portal status for email: ${email}`);

    // Usar la función del servicio para buscar usuario en admin-portal
    const adminUser = await mainPortalService.findAdminPortalUserByEmail(email);

    if (adminUser) {
      console.log(`✅ Found admin-portal user: ${adminUser.clerk_user_id}`);
      res.json({
        success: true,
        data: {
          hasAdminPortalAccount: true,
          clerkUserId: adminUser.clerk_user_id,
          adminUserEmail: adminUser.email,
          adminUserName: `${adminUser.first_name || ''} ${adminUser.last_name || ''}`.trim()
        }
      });
    } else {
      console.log(`ℹ️ No admin-portal user found for email: ${email}`);
      res.json({
        success: true,
        data: {
          hasAdminPortalAccount: false
        }
      });
    }
  } catch (error) {
    console.error('❌ Error checking admin-portal status:', error.message);
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
  checkClientAdminPortalStatus,
  // Sucursales
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  // Estadísticas
  getMainPortalStats,
  getInvitationStatuses
};