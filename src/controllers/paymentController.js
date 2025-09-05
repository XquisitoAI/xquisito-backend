const paymentService = require('../services/paymentService');
const ecartPayService = require('../services/ecartpayService');

class PaymentController {
  async addPaymentMethod(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'authentication_error',
            message: 'User not authenticated'
          }
        });
      }

      console.log(`Processing payment method for ${isGuest ? 'guest' : 'authenticated'} user: ${userId}`);

      const {
        fullName,
        email,
        cardNumber,
        expDate,
        cvv,
        country,
        postalCode
      } = req.body;

      // Validate required fields
      if (!fullName || !email || !cardNumber || !expDate || !cvv || !country || !postalCode) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: 'All fields are required'
          }
        });
      }

      // Parse expiry date (MM/YY format)
      const [expMonth, expYear] = expDate.split('/');
      const fullYear = parseInt(`20${expYear}`);
      const monthInt = parseInt(expMonth);

      // Prepare payment data
      const paymentData = {
        cardholderName: fullName.trim(),
        cardNumber: cardNumber.replace(/\s/g, ''), // Remove spaces
        expMonth: monthInt,
        expYear: fullYear,
        cvv: cvv.trim(),
        country: country.trim(),
        postalCode: postalCode.trim()
      };

      console.log('💳 About to call paymentService.addPaymentMethod with:', {
        userId,
        isGuest,
        paymentData: { ...paymentData, cardNumber: '****' + paymentData.cardNumber.slice(-4), cvv: '***' }
      });

      // Add payment method with guest context
      const result = await paymentService.addPaymentMethod(userId, paymentData, {
        isGuest,
        userEmail: email // Use the email from the form
      });

      console.log('💳 PaymentService result:', {
        success: result.success,
        error: result.error?.type,
        message: result.error?.message
      });

      if (!result.success) {
        console.error('❌ Payment method creation failed:', result.error);
        const statusCode = result.error.type === 'validation_error' ? 400 : 
                          result.error.type === 'user_error' ? 404 : 500;
        
        return res.status(statusCode).json(result);
      }

      // Don't return sensitive data
      res.status(201).json({
        success: true,
        message: 'Payment method added successfully',
        paymentMethod: result.paymentMethod
      });

    } catch (error) {
      console.error('Error in addPaymentMethod controller:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      });
    }
  }

  async getUserPaymentMethods(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'authentication_error',
            message: 'User not authenticated'
          }
        });
      }

      const result = await paymentService.getUserPaymentMethods(userId, { isGuest });

      if (!result.success) {
        const statusCode = result.error.type === 'database_error' ? 500 : 400;
        return res.status(statusCode).json(result);
      }

      res.json({
        success: true,
        paymentMethods: result.paymentMethods
      });

    } catch (error) {
      console.error('Error in getUserPaymentMethods controller:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      });
    }
  }

  async deletePaymentMethod(req, res) {
    try {
      const userId = req.user?.id;
      const { paymentMethodId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'authentication_error',
            message: 'User not authenticated'
          }
        });
      }

      if (!paymentMethodId) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: 'Payment method ID is required'
          }
        });
      }

      const result = await paymentService.deletePaymentMethod(userId, paymentMethodId);

      if (!result.success) {
        const statusCode = result.error.type === 'not_found' ? 404 : 
                          result.error.type === 'database_error' ? 500 : 400;
        
        return res.status(statusCode).json(result);
      }

      res.json({
        success: true,
        message: result.message
      });

    } catch (error) {
      console.error('Error in deletePaymentMethod controller:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      });
    }
  }

  async setDefaultPaymentMethod(req, res) {
    try {
      const userId = req.user?.id;
      const { paymentMethodId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'authentication_error',
            message: 'User not authenticated'
          }
        });
      }

      if (!paymentMethodId) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: 'Payment method ID is required'
          }
        });
      }

      const result = await paymentService.setDefaultPaymentMethod(userId, paymentMethodId);

      if (!result.success) {
        const statusCode = result.error.type === 'not_found' ? 404 : 
                          result.error.type === 'database_error' ? 500 : 400;
        
        return res.status(statusCode).json(result);
      }

      res.json({
        success: true,
        message: result.message
      });

    } catch (error) {
      console.error('Error in setDefaultPaymentMethod controller:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      });
    }
  }

  async processPayment(req, res) {
    try {
      const userId = req.user?.id;
      const isGuest = req.isGuest || req.user?.isGuest;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'authentication_error',
            message: 'User not authenticated'
          }
        });
      }

      const {
        paymentMethodId,
        amount,
        currency = 'USD',
        description,
        orderId,
        tableNumber,
        restaurantId
      } = req.body;

      // Validate required fields
      if (!paymentMethodId || !amount) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: 'Payment method ID and amount are required'
          }
        });
      }

      // Validate amount
      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: 'Invalid amount'
          }
        });
      }

      console.log(`💰 Processing payment for ${isGuest ? 'guest' : 'authenticated'} user: ${userId}`);
      console.log(`💰 Payment details:`, {
        paymentMethodId,
        amount,
        currency,
        orderId,
        tableNumber
      });

      // Get the payment method from database
      const tableName = isGuest ? 'guest_payment_methods' : 'user_payment_methods';
      const userFieldName = isGuest ? 'guest_id' : 'user_id';
      
      const { data: paymentMethod, error: fetchError } = await require('../config/supabase')
        .from(tableName)
        .select('ecartpay_token, ecartpay_customer_id, last_four_digits, card_type')
        .eq(userFieldName, userId)
        .eq('id', paymentMethodId)
        .eq('is_active', true)
        .single();

      if (fetchError || !paymentMethod) {
        return res.status(404).json({
          success: false,
          error: {
            type: 'not_found',
            message: 'Payment method not found'
          }
        });
      }

      // Create payment with EcartPay
      const paymentResult = await ecartPayService.createPayment({
        amount: amount,
        currency: currency,
        paymentMethodId: paymentMethod.ecartpay_token,
        customerId: paymentMethod.ecartpay_customer_id,
        description: description || `Xquisito Restaurant Payment - Order ${orderId}`,
        orderId: orderId,
        tableNumber: tableNumber,
        restaurantId: restaurantId
      });

      if (!paymentResult.success) {
        console.error('❌ Payment creation failed:', paymentResult.error);
        return res.status(400).json({
          success: false,
          error: paymentResult.error
        });
      }

      console.log('✅ Payment created successfully:', paymentResult.payment.id);

      res.status(200).json({
        success: true,
        payment: {
          id: paymentResult.payment.id,
          amount: amount,
          currency: currency,
          status: paymentResult.payment.status,
          paymentMethod: {
            lastFourDigits: paymentMethod.last_four_digits,
            cardType: paymentMethod.card_type
          },
          createdAt: paymentResult.payment.created
        }
      });

    } catch (error) {
      console.error('Error in processPayment controller:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      });
    }
  }

  async getPaymentHistory(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'authentication_error',
            message: 'User not authenticated'
          }
        });
      }

      // TODO: Implement payment history retrieval
      // This would query payment transactions for the user
      
      res.status(501).json({
        success: false,
        error: {
          type: 'not_implemented',
          message: 'Payment history will be implemented in next phase'
        }
      });

    } catch (error) {
      console.error('Error in getPaymentHistory controller:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      });
    }
  }

  async handleWebhook(req, res) {
    try {
      const webhookData = req.body;
      console.log('🔗 EcartPay webhook received:', {
        type: webhookData.type,
        id: webhookData.data?.object?.id
      });

      // Verify webhook signature if needed
      // const signature = req.headers['ecartpay-signature'];
      // const isValid = ecartPayService.verifyWebhookSignature(req.body, signature);
      
      switch (webhookData.type) {
        case 'payment_intent.succeeded':
          console.log('✅ Payment succeeded:', webhookData.data.object.id);
          // Update payment status in database
          break;
          
        case 'payment_intent.payment_failed':
          console.log('❌ Payment failed:', webhookData.data.object.id);
          // Update payment status in database
          break;
          
        case 'payment_method.attached':
          console.log('🔗 Payment method attached:', webhookData.data.object.id);
          break;
          
        default:
          console.log('📥 Unhandled webhook type:', webhookData.type);
      }
      
      res.status(200).json({
        success: true,
        message: 'Webhook processed'
      });

    } catch (error) {
      console.error('Error in handleWebhook controller:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      });
    }
  }
}

module.exports = new PaymentController();