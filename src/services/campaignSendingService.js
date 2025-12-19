const { createClient } = require("@supabase/supabase-js");

class CampaignSendingService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  // Send campaign to all customers in the segment
  async sendCampaign(campaignId) {
    try {
      console.log(`📤 Starting campaign send: ${campaignId}`);

      // 1. Get campaign details with segment and templates
      const campaign = await this.getCampaignDetails(campaignId);

      // 2. Validate campaign can be sent
      this.validateCampaignForSending(campaign);

      // 3. Get customers from the segment
      const customers = await this.getSegmentCustomers(
        campaign.segment_id,
        campaign.restaurant_id
      );

      console.log(`👥 Found ${customers.length} customers in segment`);

      if (customers.length === 0) {
        throw new Error("No customers found in segment. Cannot send campaign.");
      }

      // 4. Send messages to each customer
      const sendResults = await this.sendToCustomers(campaign, customers);

      // 5. Update campaign metrics and mark as sent
      await this.updateCampaignAfterSend(campaign.id, sendResults);

      console.log(
        `✅ Campaign sent successfully. Success: ${sendResults.success}, Failed: ${sendResults.failed}`
      );

      return {
        success: true,
        campaign_id: campaignId,
        total_customers: customers.length,
        sent_successfully: sendResults.success,
        failed: sendResults.failed,
        details: sendResults.details,
      };
    } catch (error) {
      console.error(`❌ Error sending campaign ${campaignId}:`, error);
      throw error;
    }
  }

  // Get full campaign details including templates
  async getCampaignDetails(campaignId) {
    const { data: campaign, error } = await this.supabase
      .from("campaigns")
      .select(
        `
        *,
        customer_segments (
          id,
          segment_name,
          filters
        )
      `
      )
      .eq("id", campaignId)
      .single();

    if (error || !campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Get campaign templates
    const { data: templates, error: templatesError } = await this.supabase
      .from("campaign_templates")
      .select("*")
      .eq("campaign_id", campaignId);

    if (templatesError) {
      throw new Error(
        `Error fetching campaign templates: ${templatesError.message}`
      );
    }

    campaign.templates = templates || [];
    return campaign;
  }

  // Validate campaign can be sent
  validateCampaignForSending(campaign) {
    // Check if campaign has already been sent
    if (campaign.first_sent_at) {
      throw new Error(
        "Campaign has already been sent. Cannot send again to prevent duplicate messages."
      );
    }

    // Check if campaign is active
    if (campaign.status !== "running") {
      throw new Error(
        `Campaign must be in 'running' status to send. Current status: ${campaign.status}`
      );
    }

    // Check if campaign has templates
    if (!campaign.templates || campaign.templates.length === 0) {
      throw new Error("Campaign has no templates. Cannot send.");
    }

    // Check delivery methods
    if (!campaign.delivery_methods || campaign.delivery_methods.length === 0) {
      throw new Error("Campaign has no delivery methods configured.");
    }
  }

  // Get customers from segment using segment filters
  async getSegmentCustomers(segmentId, restaurantId) {
    try {
      // Get segment filters
      const { data: segment, error } = await this.supabase
        .from("customer_segments")
        .select("filters")
        .eq("id", segmentId)
        .eq("restaurant_id", restaurantId)
        .single();

      if (error || !segment) {
        throw new Error(`Segment not found: ${segmentId}`);
      }

      const filters =
        typeof segment.filters === "string"
          ? JSON.parse(segment.filters)
          : segment.filters || {};

      console.log(`🔍 Getting customers for segment with filters:`, filters);

      // Call RPC function to get customers matching the segment filters
      const { data: customers, error: customersError } =
        await this.supabase.rpc("get_segment_customers", {
          p_restaurant_id: restaurantId,
          p_filters: filters,
        });

      if (customersError) {
        console.error("Error from get_segment_customers RPC:", customersError);
        throw new Error(
          `Error fetching segment customers: ${customersError.message}`
        );
      }

      if (!customers || customers.length === 0) {
        console.warn(`⚠️ No customers found for segment ${segmentId}`);
        return [];
      }

      console.log(`✅ Found ${customers.length} customers in segment`);
      return customers;
    } catch (error) {
      console.error("Error getting segment customers:", error);
      throw error;
    }
  }

  // Send messages to all customers
  async sendToCustomers(campaign, customers) {
    const results = {
      success: 0,
      failed: 0,
      details: [],
    };

    // Process each customer
    for (const customer of customers) {
      try {
        // Send via each delivery method
        for (const method of campaign.delivery_methods) {
          await this.sendToCustomer(campaign, customer, method);
        }

        results.success++;
        results.details.push({
          customer_id: customer.user_id,
          status: "sent",
        });
      } catch (error) {
        console.error(`Error sending to customer ${customer.user_id}:`, error);
        results.failed++;
        results.details.push({
          customer_id: customer.user_id,
          status: "failed",
          error: error.message,
        });
      }
    }

    return results;
  }

  // Send message to a single customer via specified delivery method
  async sendToCustomer(campaign, customer, deliveryMethod) {
    try {
      // Get template for this delivery method
      const template = campaign.templates.find(
        (t) =>
          (deliveryMethod === "sms" && t.template_id) ||
          (deliveryMethod === "whatsapp" && t.template_whatsapp_id)
      );

      if (!template) {
        console.warn(
          `No ${deliveryMethod} template found for campaign ${campaign.id}`
        );
        return;
      }

      // Get message content from custom_variables
      const messageContent = this.getMessageContent(template, deliveryMethod);

      // Get recipient contact info
      const recipientContact = this.getRecipientContact(
        customer,
        deliveryMethod
      );

      if (!recipientContact) {
        console.warn(
          `No ${deliveryMethod} contact info for customer ${customer.user_id}`
        );
        return;
      }

      // TODO: Implement actual SMS/WhatsApp sending via API (Twilio, etc.)
      // For now, we'll just log and record in database
      console.log(
        `📨 [${deliveryMethod.toUpperCase()}] Sending to +${recipientContact}`
      );

      // Record the send in campaign_sends table
      const sendRecord = {
        campaign_id: campaign.id,
        user_id: customer.user_id,
        delivery_method: deliveryMethod,
        recipient_phone:
          deliveryMethod === "sms" || deliveryMethod === "whatsapp"
            ? customer.phone
            : null,
        recipient_email: deliveryMethod === "email" ? customer.email : null,
        status: "sent", // In real implementation, this would be 'pending' initially
      };

      // Add template_id and message_content for SMS or template_whatsapp_id and message_content_whatsapp for WhatsApp
      if (deliveryMethod === "sms") {
        sendRecord.template_id = template.template_id;
        sendRecord.message_content = messageContent;
      } else if (deliveryMethod === "whatsapp") {
        sendRecord.template_whatsapp_id = template.template_whatsapp_id;
        sendRecord.message_content_whatsapp = messageContent;
      }

      await this.recordCampaignSend(sendRecord);

      // Send via actual API
      if (deliveryMethod === "sms") {
        await this.sendViaTwilio(recipientContact, messageContent);
      } else if (deliveryMethod === "whatsapp") {
        await this.sendViaWhatsApp(recipientContact, messageContent);
      }
    } catch (error) {
      console.error(`Error in sendToCustomer for ${customer.user_id}:`, error);
      throw error;
    }
  }

  // Get message content from template
  getMessageContent(template, deliveryMethod) {
    if (!template.custom_variables) {
      return "";
    }

    // For SMS templates, use the rendered template_text
    if (deliveryMethod === "sms" && template.custom_variables.template_text) {
      return template.custom_variables.template_text;
    }

    // For WhatsApp templates, use the rendered template_text
    if (
      deliveryMethod === "whatsapp" &&
      template.custom_variables.template_text
    ) {
      return template.custom_variables.template_text;
    }

    return "";
  }

  // Get recipient contact info based on delivery method
  getRecipientContact(customer, deliveryMethod) {
    switch (deliveryMethod) {
      case "sms":
      case "whatsapp":
        return customer.phone;
      case "email":
        return customer.email;
      default:
        return null;
    }
  }

  // Record campaign send in database
  async recordCampaignSend(sendData) {
    const { error } = await this.supabase.from("campaign_sends").insert({
      ...sendData,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error recording campaign send:", error);
      throw error;
    }
  }

  // Update campaign after sending
  async updateCampaignAfterSend(campaignId, sendResults) {
    const { error } = await this.supabase
      .from("campaigns")
      .update({
        first_sent_at: new Date().toISOString(),
        total_sent: sendResults.success,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    if (error) {
      console.error("Error updating campaign after send:", error);
      throw error;
    }
  }

  // =====================================================
  // MÉTODOS DE ENVÍO REAL (TWILIO/WHATSAPP)
  // =====================================================

  // Send SMS via Twilio
  async sendViaTwilio(phoneNumber, messageBody) {
    try {
      // TODO: Install Twilio SDK: npm install twilio
      // Uncomment the code below when ready to use Twilio

      /*
      const twilio = require('twilio');
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const message = await client.messages.create({
        body: messageBody,
        from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio phone number
        to: phoneNumber // Customer phone number (must be in E.164 format: +52XXXXXXXXXX)
      });

      console.log(`✅ SMS sent via Twilio. SID: ${message.sid}`);
      return message;
      */

      // Placeholder while Twilio is not configured
      console.log(`📱 [TWILIO SMS] Would send to ${phoneNumber}:`);
      return { sid: "placeholder-sid" };
    } catch (error) {
      console.error("❌ Error sending SMS via Twilio:", error);
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  // Send WhatsApp message via Twilio WhatsApp API
  async sendViaWhatsApp(phoneNumber, messageBody) {
    try {
      // TODO: Install Twilio SDK: npm install twilio
      // Uncomment the code below when ready to use Twilio WhatsApp

      /*
      const twilio = require('twilio');
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const message = await client.messages.create({
        body: messageBody,
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, // Your Twilio WhatsApp number
        to: `whatsapp:${phoneNumber}` // Customer WhatsApp number (E.164 format: +52XXXXXXXXXX)
      });

      console.log(`✅ WhatsApp sent via Twilio. SID: ${message.sid}`);
      return message;
      */

      // Placeholder while Twilio WhatsApp is not configured
      console.log(`💬 [TWILIO WHATSAPP] Would send to ${phoneNumber}:`);
      return { sid: "placeholder-whatsapp-sid" };
    } catch (error) {
      console.error("❌ Error sending WhatsApp via Twilio:", error);
      throw new Error(`Failed to send WhatsApp: ${error.message}`);
    }
  }
}

module.exports = new CampaignSendingService();
