const express = require('express');
const mainPortalController = require('../controllers/mainPortalController');

const router = express.Router();

// ===============================================
// RUTAS PARA CLIENTES
// ===============================================

// GET /api/main-portal/clients - Obtener todos los clientes
router.get('/clients', mainPortalController.getAllClients);

// GET /api/main-portal/clients/:id - Obtener cliente por ID
router.get('/clients/:id', mainPortalController.getClientById);

// POST /api/main-portal/clients - Crear nuevo cliente
router.post('/clients', mainPortalController.createClient);

// PUT /api/main-portal/clients/:id - Actualizar cliente
router.put('/clients/:id', mainPortalController.updateClient);

// DELETE /api/main-portal/clients/:id - Eliminar cliente
router.delete('/clients/:id', mainPortalController.deleteClient);

// ===============================================
// RUTAS PARA SUCURSALES
// ===============================================

// GET /api/main-portal/branches - Obtener todas las sucursales o filtrar por cliente
// Query params: ?client_id=uuid (opcional)
router.get('/branches', mainPortalController.getAllBranches);

// GET /api/main-portal/branches/:id - Obtener sucursal por ID
router.get('/branches/:id', mainPortalController.getBranchById);

// POST /api/main-portal/branches - Crear nueva sucursal
router.post('/branches', mainPortalController.createBranch);

// PUT /api/main-portal/branches/:id - Actualizar sucursal
router.put('/branches/:id', mainPortalController.updateBranch);

// DELETE /api/main-portal/branches/:id - Eliminar sucursal
router.delete('/branches/:id', mainPortalController.deleteBranch);

// ===============================================
// RUTAS DE ESTADÍSTICAS Y UTILIDADES
// ===============================================

// GET /api/main-portal/stats - Obtener estadísticas generales
router.get('/stats', mainPortalController.getMainPortalStats);

// ===============================================
// DOCUMENTACIÓN DE LA API
// ===============================================

// GET /api/main-portal/info - Información de la API
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Main Portal API',
      version: '1.0.0',
      description: 'API for managing clients and branches in the main portal',
      endpoints: {
        clients: {
          'GET /clients': 'Get all clients',
          'GET /clients/:id': 'Get client by ID',
          'POST /clients': 'Create new client',
          'PUT /clients/:id': 'Update client',
          'DELETE /clients/:id': 'Delete client'
        },
        branches: {
          'GET /branches': 'Get all branches (optional: ?client_id=uuid)',
          'GET /branches/:id': 'Get branch by ID',
          'POST /branches': 'Create new branch',
          'PUT /branches/:id': 'Update branch',
          'DELETE /branches/:id': 'Delete branch'
        },
        utilities: {
          'GET /stats': 'Get general statistics',
          'GET /info': 'Get API information'
        }
      },
      dataModels: {
        client: {
          id: 'UUID (auto-generated)',
          name: 'string (required)',
          owner_name: 'string (required)',
          phone: 'string (required)',
          email: 'string (required, unique)',
          services: 'array of strings',
          active: 'boolean (default: true)',
          created_at: 'timestamp (auto-generated)',
          updated_at: 'timestamp (auto-updated)'
        },
        branch: {
          id: 'UUID (auto-generated)',
          client_id: 'UUID (required, FK to clients)',
          name: 'string (required)',
          address: 'string (required)',
          tables: 'integer (default: 1)',
          active: 'boolean (default: true)',
          created_at: 'timestamp (auto-generated)',
          updated_at: 'timestamp (auto-updated)'
        }
      },
      availableServices: [
        'tap-order-pay',
        'flex-bill',
        'food-hall',
        'tap-pay',
        'pick-n-go'
      ]
    }
  });
});

module.exports = router;