const { createClient } = require("@supabase/supabase-js");
const segmentsService = require("./segmentsService");

class CampaignsService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Obtener todas las campañas de un restaurante
   * @param {number} restaurantId - ID del restaurante
   * @returns {Promise<Array>} Lista de campañas con información de segmentos
   */
  async getCampaignsByRestaurant(restaurantId) {
    try {
      const { data, error } = await this.supabase
        .from("campaigns")
        .select(
          `
                    *,
                    customer_segments (
                        id,
                        segment_name,
                        active_filters_count,
                        estimated_customers
                    )
                `
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Agregar información de templates asociados
      const campaignsWithTemplates = await Promise.all(
        data.map(async (campaign) => {
          const templates = await this.getCampaignTemplates(campaign.id);
          return {
            ...campaign,
            templates,
          };
        })
      );

      return campaignsWithTemplates;
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      throw new Error("Error al obtener campañas: " + error.message);
    }
  }

  /**
   * Obtener una campaña específica por ID
   * @param {string} campaignId - UUID de la campaña
   * @param {number} restaurantId - ID del restaurante (para validación)
   * @returns {Promise<Object>} Campaña con templates y estadísticas
   */
  async getCampaignById(campaignId, restaurantId) {
    try {
      const { data, error } = await this.supabase
        .from("campaigns")
        .select(
          `
                    *,
                    customer_segments (
                        id,
                        segment_name,
                        active_filters_count,
                        estimated_customers,
                        filters
                    )
                `
        )
        .eq("id", campaignId)
        .eq("restaurant_id", restaurantId)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Campaña no encontrada");

      // Agregar templates asociados
      const templates = await this.getCampaignTemplates(campaignId);

      // Agregar estadísticas de envíos
      const sendStats = await this.getCampaignSendStats(campaignId);

      return {
        ...data,
        templates,
        send_stats: sendStats,
      };
    } catch (error) {
      console.error("Error fetching campaign:", error);
      throw new Error("Error al obtener campaña: " + error.message);
    }
  }

  /**
   * Crear una nueva campaña
   * @param {Object} campaignData - Datos de la campaña
   * @param {string} userId - Clerk user ID del creador
   * @returns {Promise<Object>} Campaña creada
   */
  async createCampaign(campaignData, userId) {
    try {
      // Validar datos requeridos
      this.validateCampaignData(campaignData);

      // Validar que el segmento existe y pertenece al restaurant
      await this.validateSegmentOwnership(
        campaignData.segment_id,
        campaignData.restaurant_id
      );

      // Crear la campaña
      const { data: campaign, error } = await this.supabase
        .from("campaigns")
        .insert({
          ...campaignData,
          created_by: userId,
          // Calcular total_targeted basado en el segmento
          total_targeted: await this.calculateTargetedCustomers(
            campaignData.segment_id
          ),
        })
        .select()
        .single();

      if (error) throw error;

      console.log("Campaign created successfully:", campaign.id);
      return campaign;
    } catch (error) {
      console.error("Error creating campaign:", error);
      throw new Error("Error al crear campaña: " + error.message);
    }
  }

  /**
   * Actualizar una campaña existente
   * @param {string} campaignId - UUID de la campaña
   * @param {Object} updateData - Datos a actualizar
   * @param {number} restaurantId - ID del restaurante (para validación)
   * @returns {Promise<Object>} Campaña actualizada
   */
  async updateCampaign(campaignId, updateData, restaurantId) {
    try {
      // Validar que la campaña existe y pertenece al restaurant
      await this.validateCampaignOwnership(campaignId, restaurantId);

      // No permitir actualizar campañas que ya han sido enviadas
      const campaign = await this.getCampaignById(campaignId, restaurantId);
      /*if (['running', 'completed'].includes(campaign.status)) {
                throw new Error('No se puede editar una campaña que ya ha sido enviada');
            }*/

      // Si se cambia el segmento, recalcular total_targeted
      if (
        updateData.segment_id &&
        updateData.segment_id !== campaign.segment_id
      ) {
        updateData.total_targeted = await this.calculateTargetedCustomers(
          updateData.segment_id
        );
      }

      const { data, error } = await this.supabase
        .from("campaigns")
        .update(updateData)
        .eq("id", campaignId)
        .eq("restaurant_id", restaurantId)
        .select()
        .single();

      if (error) throw error;

      console.log("Campaign updated successfully:", campaignId);
      return data;
    } catch (error) {
      console.error("Error updating campaign:", error);
      throw new Error("Error al actualizar campaña: " + error.message);
    }
  }

  /**
   * Eliminar una campaña
   * @param {string} campaignId - UUID de la campaña
   * @param {number} restaurantId - ID del restaurante (para validación)
   * @returns {Promise<boolean>} True si se eliminó correctamente
   */
  async deleteCampaign(campaignId, restaurantId) {
    try {
      // Validar que la campaña existe y pertenece al restaurant
      await this.validateCampaignOwnership(campaignId, restaurantId);

      // No permitir eliminar campañas que están en ejecución
      const campaign = await this.getCampaignById(campaignId, restaurantId);
      if (campaign.status === "running") {
        throw new Error(
          "No se puede eliminar una campaña que está en ejecución"
        );
      }

      const { error } = await this.supabase
        .from("campaigns")
        .delete()
        .eq("id", campaignId)
        .eq("restaurant_id", restaurantId);

      if (error) throw error;

      console.log("Campaign deleted successfully:", campaignId);
      return true;
    } catch (error) {
      console.error("Error deleting campaign:", error);
      throw new Error("Error al eliminar campaña: " + error.message);
    }
  }

  /**
   * Asociar templates a una campaña
   * @param {string} campaignId - UUID de la campaña
   * @param {Array} templates - Array de templates { template_id OR template_whatsapp_id, template_type, is_primary }
   * @param {number} restaurantId - ID del restaurante (para validación)
   * @returns {Promise<Array>} Templates asociados
   */
  async associateTemplates(campaignId, templates, restaurantId) {
    try {
      // Validar que la campaña existe y pertenece al restaurant
      await this.validateCampaignOwnership(campaignId, restaurantId);

      // Eliminar templates existentes para esta campaña
      await this.supabase
        .from("campaign_templates")
        .delete()
        .eq("campaign_id", campaignId);

      // Insertar nuevos templates
      const templatesToInsert = templates.map((template) => {
        const templateRecord = {
          campaign_id: campaignId,
          is_primary: template.is_primary || false,
          custom_variables: template.custom_variables || {},
        };

        // Determinar si es SMS o WhatsApp basado en template_type
        if (template.template_type === 'sms') {
          templateRecord.template_id = template.template_id;
        } else if (template.template_type === 'whatsapp') {
          templateRecord.template_whatsapp_id = template.template_id; // El ID viene en template_id pero va a template_whatsapp_id
        } else {
          throw new Error(`Tipo de template no soportado: ${template.template_type}`);
        }

        return templateRecord;
      });

      const { data, error } = await this.supabase
        .from("campaign_templates")
        .insert(templatesToInsert)
        .select();

      if (error) throw error;

      console.log("Templates associated successfully:", campaignId);
      return data;
    } catch (error) {
      console.error("Error associating templates:", error);
      throw new Error("Error al asociar templates: " + error.message);
    }
  }

  /**
   * Obtener templates asociados a una campaña
   * @param {string} campaignId - UUID de la campaña
   * @returns {Promise<Array>} Templates asociados
   */
  async getCampaignTemplates(campaignId) {
    try {
      const { data, error } = await this.supabase
        .from("campaign_templates")
        .select("*")
        .eq("campaign_id", campaignId);

      if (error) throw error;

      // Para cada template, obtener detalles según el tipo
      const templatesWithDetails = await Promise.all(
        data.map(async (ct) => {
          let template_data = null;
          let template_type = null;
          let template_id_to_return = null;

          try {
            // Determinar el tipo basado en qué columna tiene valor
            if (ct.template_id) {
              // Es un template de SMS
              template_type = 'sms';
              template_id_to_return = ct.template_id;

              const { data: smsTemplate } = await this.supabase
                .from("sms_templates")
                .select("id, name, blocks")
                .eq("id", ct.template_id)
                .single();
              template_data = smsTemplate;
            } else if (ct.template_whatsapp_id) {
              // Es un template de WhatsApp
              template_type = 'whatsapp';
              template_id_to_return = ct.template_whatsapp_id;

              // Para WhatsApp, el template_data contendrá solo el ID
              // ya que los templates de WhatsApp no están en la BD
              template_data = {
                id: ct.template_whatsapp_id,
                name: ct.template_whatsapp_id, // Usar el ID como nombre por defecto
              };
            }
          } catch (err) {
            console.warn(
              `Template not found: ${ct.template_id || ct.template_whatsapp_id}`,
              err
            );
          }

          return {
            id: ct.id,
            template_id: template_id_to_return,
            template_type: template_type,
            is_primary: ct.is_primary,
            custom_variables: ct.custom_variables,
            template_data: template_data,
            created_at: ct.created_at,
          };
        })
      );

      return templatesWithDetails;
    } catch (error) {
      console.error("Error fetching campaign templates:", error);
      return [];
    }
  }

  /**
   * Obtener estadísticas de envíos de una campaña
   * @param {string} campaignId - UUID de la campaña
   * @returns {Promise<Object>} Estadísticas de envíos
   */
  async getCampaignSendStats(campaignId) {
    try {
      const { data, error } = await this.supabase
        .from("campaign_sends")
        .select("status, delivery_method")
        .eq("campaign_id", campaignId);

      if (error) throw error;

      // Calcular estadísticas
      const stats = {
        total: data.length,
        by_status: {},
        by_delivery_method: {},
      };

      data.forEach((send) => {
        // Estadísticas por estado
        stats.by_status[send.status] = (stats.by_status[send.status] || 0) + 1;

        // Estadísticas por método de entrega
        stats.by_delivery_method[send.delivery_method] =
          (stats.by_delivery_method[send.delivery_method] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error("Error fetching send stats:", error);
      return { total: 0, by_status: {}, by_delivery_method: {} };
    }
  }

  // =====================================================
  // MÉTODOS DE VALIDACIÓN Y UTILIDADES
  // =====================================================

  /**
   * Validar datos de campaña
   * @param {Object} campaignData - Datos a validar
   */
  validateCampaignData(campaignData) {
    // Validar campos requeridos (reward_value y reward_code son opcionales)
    const required = [
      "restaurant_id",
      "name",
      "segment_id",
      "reward_type",
      "start_date",
      "end_date",
    ];

    for (const field of required) {
      if (
        campaignData[field] === undefined ||
        campaignData[field] === null ||
        campaignData[field] === ""
      ) {
        throw new Error(`Campo requerido: ${field}`);
      }
    }

    // Validar fechas
    const startDate = new Date(campaignData.start_date);
    const endDate = new Date(campaignData.end_date);

    if (endDate <= startDate) {
      throw new Error(
        "La fecha de fin debe ser posterior a la fecha de inicio"
      );
    }

    // Validar reward_value solo si se proporciona (es opcional)
    if (
      campaignData.reward_value !== undefined &&
      campaignData.reward_value !== null
    ) {
      const rewardValue = Number(campaignData.reward_value);
      if (isNaN(rewardValue) || rewardValue <= 0) {
        throw new Error(
          "El valor de la recompensa debe ser mayor a 0 si se proporciona"
        );
      }
    }

    // Validar delivery_methods
    if (campaignData.delivery_methods) {
      const validMethods = ["email", "sms", "whatsapp", "push"];
      const invalidMethods = campaignData.delivery_methods.filter(
        (method) => !validMethods.includes(method)
      );

      if (invalidMethods.length > 0) {
        throw new Error(
          `Métodos de entrega inválidos: ${invalidMethods.join(", ")}`
        );
      }
    }
  }

  /**
   * Validar que un segmento pertenece al restaurant
   * @param {string} segmentId - UUID del segmento
   * @param {number} restaurantId - ID del restaurante
   */
  async validateSegmentOwnership(segmentId, restaurantId) {
    const { data, error } = await this.supabase
      .from("customer_segments")
      .select("id")
      .eq("id", segmentId)
      .eq("restaurant_id", restaurantId)
      .single();

    if (error || !data) {
      throw new Error(
        "El segmento no existe o no pertenece a este restaurante"
      );
    }
  }

  /**
   * Validar que una campaña pertenece al restaurant
   * @param {string} campaignId - UUID de la campaña
   * @param {number} restaurantId - ID del restaurante
   */
  async validateCampaignOwnership(campaignId, restaurantId) {
    const { data, error } = await this.supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("restaurant_id", restaurantId)
      .single();

    if (error || !data) {
      throw new Error("La campaña no existe o no pertenece a este restaurante");
    }
  }

  /**
   * Calcular número de clientes objetivo basado en el segmento
   * @param {string} segmentId - UUID del segmento
   * @returns {Promise<number>} Número de clientes objetivo
   */
  async calculateTargetedCustomers(segmentId) {
    try {
      // Obtener información del segmento
      const { data, error } = await this.supabase
        .from("customer_segments")
        .select("estimated_customers")
        .eq("id", segmentId)
        .single();

      if (error || !data) {
        console.warn(
          "Could not calculate targeted customers for segment:",
          segmentId
        );
        return 0;
      }

      return data.estimated_customers || 0;
    } catch (error) {
      console.error("Error calculating targeted customers:", error);
      return 0;
    }
  }

  /**
   * Obtener analytics de performance de campañas
   * @param {number} restaurantId - ID del restaurante
   * @returns {Promise<Object>} Analytics de campañas
   */
  async getCampaignAnalytics(restaurantId) {
    try {
      const { data, error } = await this.supabase
        .from("campaign_performance")
        .select("*")
        .eq("restaurant_id", restaurantId);

      if (error) throw error;

      // Calcular métricas agregadas
      const analytics = {
        total_campaigns: data.length,
        active_campaigns: data.filter((c) => c.status === "running").length,
        total_customers_reached: data.reduce(
          (sum, c) => sum + (c.total_sent || 0),
          0
        ),
        total_redemptions: data.reduce(
          (sum, c) => sum + (c.total_redeemed || 0),
          0
        ),
        average_open_rate:
          data.length > 0
            ? data.reduce((sum, c) => sum + (c.open_rate || 0), 0) / data.length
            : 0,
        average_redemption_rate:
          data.length > 0
            ? data.reduce((sum, c) => sum + (c.redemption_rate || 0), 0) /
              data.length
            : 0,
        campaigns: data,
      };

      return analytics;
    } catch (error) {
      console.error("Error fetching campaign analytics:", error);
      throw new Error("Error al obtener analytics: " + error.message);
    }
  }
}

module.exports = new CampaignsService();
