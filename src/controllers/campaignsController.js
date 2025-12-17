const campaignsService = require('../services/campaignsService');

class CampaignsController {
    /**
     * Obtener todas las campañas de un restaurante
     * GET /api/campaigns?restaurant_id=X
     */
    async getCampaigns(req, res) {
        try {
            const { restaurant_id } = req.query;

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            const campaigns = await campaignsService.getCampaignsByRestaurant(parseInt(restaurant_id));

            res.json({
                success: true,
                data: campaigns,
                count: campaigns.length,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getCampaigns controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtener una campaña específica por ID
     * GET /api/campaigns/:id?restaurant_id=X
     */
    async getCampaignById(req, res) {
        try {
            const { id } = req.params;
            const { restaurant_id } = req.query;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de campaña es requerido'
                });
            }

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            const campaign = await campaignsService.getCampaignById(id, parseInt(restaurant_id));

            res.json({
                success: true,
                data: campaign,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getCampaignById controller:', error);
            const status = error.message.includes('no encontrada') ? 404 : 500;

            res.status(status).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Crear una nueva campaña
     * POST /api/campaigns
     */
    async createCampaign(req, res) {
        try {
            const campaignData = req.body;
            const userId = req.userId; // Viene del middleware de autenticación

            // Validaciones básicas
            if (!campaignData || Object.keys(campaignData).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos de campaña son requeridos'
                });
            }

            // Validar campos requeridos
            const requiredFields = [
                'restaurant_id', 'name', 'segment_id', 'reward_type',
                'reward_value', 'start_date', 'end_date'
            ];

            for (const field of requiredFields) {
                if (!campaignData[field]) {
                    return res.status(400).json({
                        success: false,
                        error: `Campo requerido: ${field}`
                    });
                }
            }

            // Validar tipos de datos
            if (typeof campaignData.restaurant_id !== 'number' || isNaN(campaignData.restaurant_id)) {
                return res.status(400).json({
                    success: false,
                    error: 'restaurant_id debe ser un número válido'
                });
            }

            if (typeof campaignData.name !== 'string' || campaignData.name.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'name debe ser un texto de al menos 2 caracteres'
                });
            }

            const campaign = await campaignsService.createCampaign(campaignData, userId);

            res.status(201).json({
                success: true,
                data: campaign,
                message: 'Campaña creada exitosamente',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in createCampaign controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Actualizar una campaña existente
     * PUT /api/campaigns/:id
     */
    async updateCampaign(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const { restaurant_id } = req.query;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de campaña es requerido'
                });
            }

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            if (!updateData || Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos para actualizar son requeridos'
                });
            }

            // Validar que no se modifiquen campos protegidos
            const protectedFields = ['id', 'created_at', 'created_by'];
            for (const field of protectedFields) {
                if (updateData[field]) {
                    delete updateData[field];
                }
            }

            const campaign = await campaignsService.updateCampaign(id, updateData, parseInt(restaurant_id));

            res.json({
                success: true,
                data: campaign,
                message: 'Campaña actualizada exitosamente',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in updateCampaign controller:', error);
            const status = error.message.includes('no encontrada') ? 404 : 500;

            res.status(status).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Eliminar una campaña
     * DELETE /api/campaigns/:id?restaurant_id=X
     */
    async deleteCampaign(req, res) {
        try {
            const { id } = req.params;
            const { restaurant_id } = req.query;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de campaña es requerido'
                });
            }

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            const deleted = await campaignsService.deleteCampaign(id, parseInt(restaurant_id));

            res.json({
                success: true,
                data: { deleted: true },
                message: 'Campaña eliminada exitosamente',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in deleteCampaign controller:', error);
            const status = error.message.includes('no encontrada') ? 404 : 500;

            res.status(status).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Asociar templates a una campaña
     * POST /api/campaigns/:id/templates
     */
    async associateTemplates(req, res) {
        try {
            const { id } = req.params;
            const { templates, restaurant_id } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de campaña es requerido'
                });
            }

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            if (!templates || !Array.isArray(templates) || templates.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Templates son requeridos y debe ser un array no vacío'
                });
            }

            // Validar estructura de templates
            for (const template of templates) {
                if (!template.template_id || !template.template_type) {
                    return res.status(400).json({
                        success: false,
                        error: 'Cada template debe tener template_id y template_type'
                    });
                }

                const validTypes = ['sms', 'email', 'whatsapp', 'push'];
                if (!validTypes.includes(template.template_type)) {
                    return res.status(400).json({
                        success: false,
                        error: `template_type debe ser uno de: ${validTypes.join(', ')}`
                    });
                }
            }

            const associatedTemplates = await campaignsService.associateTemplates(id, templates, parseInt(restaurant_id));

            res.json({
                success: true,
                data: associatedTemplates,
                message: 'Templates asociados exitosamente',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in associateTemplates controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtener templates asociados a una campaña
     * GET /api/campaigns/:id/templates
     */
    async getCampaignTemplates(req, res) {
        try {
            const { id } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de campaña es requerido'
                });
            }

            const templates = await campaignsService.getCampaignTemplates(id);

            res.json({
                success: true,
                data: templates,
                count: templates.length,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getCampaignTemplates controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtener analytics de campañas
     * GET /api/campaigns/analytics?restaurant_id=X
     */
    async getCampaignAnalytics(req, res) {
        try {
            const { restaurant_id } = req.query;

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            const analytics = await campaignsService.getCampaignAnalytics(parseInt(restaurant_id));

            res.json({
                success: true,
                data: analytics,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getCampaignAnalytics controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Cambiar estado de una campaña
     * PATCH /api/campaigns/:id/status
     */
    async updateCampaignStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, restaurant_id } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de campaña es requerido'
                });
            }

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            if (!status) {
                return res.status(400).json({
                    success: false,
                    error: 'Nuevo status es requerido'
                });
            }

            const validStatuses = ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: `Status debe ser uno de: ${validStatuses.join(', ')}`
                });
            }

            const campaign = await campaignsService.updateCampaign(id, { status }, parseInt(restaurant_id));

            res.json({
                success: true,
                data: campaign,
                message: `Campaña ${status === 'running' ? 'iniciada' : status === 'paused' ? 'pausada' : 'actualizada'} exitosamente`,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in updateCampaignStatus controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtener estadísticas de envíos de una campaña
     * GET /api/campaigns/:id/stats
     */
    async getCampaignStats(req, res) {
        try {
            const { id } = req.params;
            const { restaurant_id } = req.query;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de campaña es requerido'
                });
            }

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            // Validar que la campaña pertenece al restaurant
            await campaignsService.validateCampaignOwnership(id, parseInt(restaurant_id));

            const stats = await campaignsService.getCampaignSendStats(id);

            res.json({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getCampaignStats controller:', error);
            const status = error.message.includes('no encontrada') ? 404 : 500;

            res.status(status).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new CampaignsController();