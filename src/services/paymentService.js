const supabase = require('../config/supabase');
const ecartPayService = require('./ecartpayService');

class PaymentService {
  async addPaymentMethod(userId, paymentData, context = {}) {
    try {
      // Validate input data
      const validation = this.validatePaymentData(paymentData);
      if (!validation.isValid) {
        return {
          success: false,
          error: {
            type: 'validation_error',
            message: validation.errors.join(', ')
          }
        };
      }

      // Check if user exists and get their info
      let user;
      const { isGuest, userEmail } = context;
      
      if (isGuest) {
        // For guest users, create a temporary user object with valid email format
        const cleanGuestId = userId.replace(/[^a-zA-Z0-9]/g, ''); // Remove special chars
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substr(2, 9);
        
        // Use provided email but make it unique for eCartpay to avoid conflicts
        const uniqueGuestEmail = userEmail ? 
          `${userEmail.split('@')[0]}+${cleanGuestId}${timestamp}${randomSuffix}@${userEmail.split('@')[1]}` : 
          `guest${cleanGuestId}${timestamp}${randomSuffix}@xquisito.com`;
        
        user = {
          user: {
            email: uniqueGuestEmail,
            id: userId,
            originalEmail: userEmail // Store original email for reference
          }
        };
        console.log(`Processing guest user: ${userId} with unique email: ${uniqueGuestEmail} (original: ${userEmail})`);
      } else {
        // For authenticated users (Clerk), get from public.users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('clerk_user_id', userId)
          .single();

        if (userError || !userData) {
          return {
            success: false,
            error: {
              type: 'user_error',
              message: 'Registered user not found'
            }
          };
        }

        // Format userData to match expected structure
        user = {
          user: {
            email: userData.email,
            id: userData.clerk_user_id,
            phone: userData.phone
          }
        };
        console.log(`Processing authenticated user (Clerk): ${userId}`);
      }

      // Check if user already has an EcartPay customer
      let ecartPayCustomerId;
      const tableName = isGuest ? 'guest_payment_methods' : 'user_payment_methods';
      const userFieldName = isGuest ? 'guest_id' : 'clerk_user_id';
      
      const { data: existingMethods } = await supabase
        .from(tableName)
        .select('ecartpay_customer_id')
        .eq(userFieldName, userId)
        .limit(1);

      if (existingMethods && existingMethods.length > 0 && existingMethods[0].ecartpay_customer_id) {
        ecartPayCustomerId = existingMethods[0].ecartpay_customer_id;
        console.log('🔄 Using existing eCartpay customer:', ecartPayCustomerId);
      } else {
        // First, try to find if customer already exists in eCartpay by user_id
        console.log('🔍 Checking if customer already exists in eCartpay...');
        const existingCustomer = await ecartPayService.findCustomerByUserId(userId);
        
        if (existingCustomer.success) {
          // Customer exists, use it
          ecartPayCustomerId = existingCustomer.customer.id;
          console.log('✅ Found existing eCartpay customer:', ecartPayCustomerId);
        } else {
          // Create new customer
          console.log('👤 Creating new EcartPay customer for:', { name: paymentData.cardholderName, userId });
          
          // Generate a unique phone number for testing to avoid eCartPay conflicts
          // Revisar 
          const phone = user.user.phone || `1${Date.now().toString().slice(-9)}`; // Unique 10-digit phone
          
          const customerResult = await ecartPayService.createCustomer({
            name: paymentData.cardholderName,
            userId: userId, // Use the original userId, not modified
            phone: phone
          });

          console.log('👤 EcartPay customer creation result:', {
            success: customerResult.success,
            error: customerResult.error?.type,
            message: customerResult.error?.message
          });

          if (!customerResult.success) {
            console.error('❌ Failed to create EcartPay customer:', customerResult.error);
            return {
              success: false,
              error: customerResult.error
            };
          }

          ecartPayCustomerId = customerResult.customer.id;
          console.log('✅ EcartPay customer created:', ecartPayCustomerId);
        }
      }

      // Create payment method in EcartPay
      const paymentMethodResult = await ecartPayService.createPaymentMethod({
        cardNumber: paymentData.cardNumber,
        expMonth: paymentData.expMonth,
        expYear: paymentData.expYear,
        cvv: paymentData.cvv,
        cardholderName: paymentData.cardholderName,
        country: paymentData?.country,
        postalCode: paymentData?.postalCode,
        customerId: ecartPayCustomerId
      });

      if (!paymentMethodResult.success) {
        return {
          success: false,
          error: paymentMethodResult.error
        };
      }

      const ecartPayPaymentMethod = paymentMethodResult.paymentMethod;
      
      // Log the actual structure from eCartpay
      console.log('📋 eCartpay payment method structure:', JSON.stringify(ecartPayPaymentMethod, null, 2));

      // Determine if this should be the default payment method
      const { data: existingDefault } = await supabase
        .from(tableName)
        .select('id')
        .eq(userFieldName, userId)
        .eq('is_default', true)
        .limit(1);

      const isDefault = !existingDefault || existingDefault.length === 0;

      // Prepare the data object for insertion with proper structure mapping
      const insertData = {
        ecartpay_token: ecartPayPaymentMethod.id,
        ecartpay_customer_id: ecartPayCustomerId,
        // Map fields based on actual eCartpay response structure
        last_four_digits: (ecartPayPaymentMethod.last || ecartPayPaymentMethod.last4 || ecartPayPaymentMethod.last_four || paymentData.cardNumber.slice(-4)).slice(-4).substring(0, 3),
        card_type: this.normalizeCardType(ecartPayPaymentMethod.type || ecartPayPaymentMethod.brand || 'unknown', paymentData.cardNumber),
        card_brand: ecartPayPaymentMethod.brand || ecartPayPaymentMethod.type || 'unknown',
        expiry_month: paymentData.expMonth, // Use original data as eCartpay may not return it
        expiry_year: paymentData.expYear,   // Use original data as eCartpay may not return it
        cardholder_name: (paymentData.cardholderName || '').substring(0, 50), // Limit length to avoid database error
        billing_country: (paymentData.country || '').substring(0, 3), // Limit to 3 chars for VARCHAR(3)
        billing_postal_code: (paymentData.postalCode || '').substring(0, 20), // Limit length
        is_default: isDefault,
        is_active: true
      };

      // Add user/guest specific fields
      if (isGuest) {
        insertData.guest_id = userId;
        // Add guest-specific data
        if (context.tableNumber) {
          insertData.table_number = context.tableNumber;
        }
        if (context.sessionData) {
          insertData.session_data = context.sessionData;
        }
      } else {
        insertData.clerk_user_id = userId;
      }

      // Store payment method metadata in our database
      const { data: savedMethod, error: saveError } = await supabase
        .from(tableName)
        .insert(insertData)
        .select()
        .single();

      if (saveError) {
        console.error('Database save error:', saveError);
        
        // Note: We don't detach from eCartpay here because:
        // 1. The payment method was successfully created in eCartpay
        // 2. The user might retry and we can reuse it
        // 3. Detach endpoint seems to have different URL structure
        
        return {
          success: false,
          error: {
            type: 'database_error',
            message: 'Failed to save payment method',
            details: saveError.message || saveError
          }
        };
      }

      return {
        success: true,
        paymentMethod: {
          id: savedMethod.id,
          lastFourDigits: savedMethod.last_four_digits,
          cardType: savedMethod.card_type,
          expiryMonth: savedMethod.expiry_month,
          expiryYear: savedMethod.expiry_year,
          cardholderName: savedMethod.cardholder_name,
          isDefault: savedMethod.is_default,
          createdAt: savedMethod.created_at
        }
      };

    } catch (error) {
      console.error('Error in addPaymentMethod:', error);
      return {
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error',
          details: error.message
        }
      };
    }
  }

  async getUserPaymentMethods(userId, context = {}) {
    try {
      const { isGuest } = context;
      const tableName = isGuest ? 'guest_payment_methods' : 'user_payment_methods';
      const userFieldName = isGuest ? 'guest_id' : 'clerk_user_id';

      // For guest users, also filter by non-expired records
      let query = supabase
        .from(tableName)
        .select(`
          id,
          last_four_digits,
          card_type,
          card_brand,
          expiry_month,
          expiry_year,
          cardholder_name,
          billing_country,
          is_default,
          is_active,
          created_at
        `)
        .eq(userFieldName, userId)
        .eq('is_active', true);

      // For guests, only return non-expired payment methods
      if (isGuest) {
        query = query.gt('expires_at', new Date().toISOString());
      }

      const { data: methods, error } = await query
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        return {
          success: false,
          error: {
            type: 'database_error',
            message: 'Failed to retrieve payment methods',
            details: error
          }
        };
      }

      // Transform the data to match frontend expectations (camelCase)
      const transformedMethods = (methods || []).map(method => ({
        id: method.id,
        lastFourDigits: method.last_four_digits,
        cardType: method.card_type,
        cardBrand: method.card_brand,
        expiryMonth: method.expiry_month,
        expiryYear: method.expiry_year,
        cardholderName: method.cardholder_name,
        billingCountry: method.billing_country,
        isDefault: method.is_default,
        isActive: method.is_active,
        createdAt: method.created_at
      }));

      return {
        success: true,
        paymentMethods: transformedMethods
      };

    } catch (error) {
      console.error('Error in getUserPaymentMethods:', error);
      return {
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      };
    }
  }

  async deletePaymentMethod(userId, paymentMethodId) {
    try {
      // Get the payment method to delete
      const { data: method, error: fetchError } = await supabase
        .from('user_payment_methods')
        .select('ecartpay_token, is_default')
        .eq('clerk_user_id', userId)
        .eq('id', paymentMethodId)
        .single();

      if (fetchError || !method) {
        return {
          success: false,
          error: {
            type: 'not_found',
            message: 'Payment method not found'
          }
        };
      }

      // Detach from EcartPay first
      console.log(`🗑️ Attempting to delete from EcartPay: ${method.ecartpay_token}`);
      const detachResult = await ecartPayService.detachPaymentMethod(method.ecartpay_token);

      if (!detachResult.success) {
        console.error('❌ Failed to delete payment method from EcartPay:', detachResult.error);
        return {
          success: false,
          error: {
            type: 'external_service_error',
            message: 'Failed to delete payment method from payment processor',
            details: detachResult.error
          }
        };
      }

      console.log('✅ Successfully deleted from EcartPay, now deleting from database');

      // Delete completely from our database after successful EcartPay deletion
      const { error: deleteError } = await supabase
        .from('user_payment_methods')
        .delete()
        .eq('clerk_user_id', userId)
        .eq('id', paymentMethodId);

      if (deleteError) {
        console.error('❌ Database deletion failed after EcartPay deletion:', deleteError);
        return {
          success: false,
          error: {
            type: 'database_error',
            message: 'Failed to delete payment method from database',
            details: deleteError
          }
        };
      }

      // If this was the default method, set another one as default
      if (method.is_default) {
        const { data: otherMethods } = await supabase
          .from('user_payment_methods')
          .select('id')
          .eq('clerk_user_id', userId)
          .eq('is_active', true)
          .limit(1);

        if (otherMethods && otherMethods.length > 0) {
          await supabase
            .from('user_payment_methods')
            .update({ is_default: true })
            .eq('id', otherMethods[0].id);
        }
      }

      return {
        success: true,
        message: 'Payment method deleted successfully'
      };

    } catch (error) {
      console.error('Error in deletePaymentMethod:', error);
      return {
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      };
    }
  }

  async setDefaultPaymentMethod(userId, paymentMethodId) {
    try {
      // Verify the payment method belongs to the user
      const { data: method, error: fetchError } = await supabase
        .from('user_payment_methods')
        .select('id')
        .eq('clerk_user_id', userId)
        .eq('id', paymentMethodId)
        .eq('is_active', true)
        .single();

      if (fetchError || !method) {
        return {
          success: false,
          error: {
            type: 'not_found',
            message: 'Payment method not found'
          }
        };
      }

      // Update all payment methods for this user to not be default
      await supabase
        .from('user_payment_methods')
        .update({ is_default: false })
        .eq('clerk_user_id', userId);

      // Set the selected one as default
      const { error: updateError } = await supabase
        .from('user_payment_methods')
        .update({ is_default: true })
        .eq('id', paymentMethodId);

      if (updateError) {
        return {
          success: false,
          error: {
            type: 'database_error',
            message: 'Failed to set default payment method',
            details: updateError
          }
        };
      }

      return {
        success: true,
        message: 'Default payment method updated successfully'
      };

    } catch (error) {
      console.error('Error in setDefaultPaymentMethod:', error);
      return {
        success: false,
        error: {
          type: 'internal_error',
          message: 'Internal server error'
        }
      };
    }
  }

  async cleanupTestData(userId, context = {}) {
    try {
      const { isGuest } = context;
      const tableName = isGuest ? 'guest_payment_methods' : 'user_payment_methods';
      const userFieldName = isGuest ? 'guest_id' : 'clerk_user_id';

      // Get all payment methods for this user/guest
      const { data: methods, error } = await supabase
        .from(tableName)
        .select('ecartpay_token, id')
        .eq(userFieldName, userId);

      if (error) {
        console.error('Error fetching methods for cleanup:', error);
        return { success: false, error };
      }

      console.log(`🧹 Cleaning up ${methods?.length || 0} payment methods for ${isGuest ? 'guest' : 'user'}: ${userId}`);

      // Detach each from eCartPay
      for (const method of methods || []) {
        try {
          await ecartPayService.detachPaymentMethod(method.ecartpay_token);
          console.log(`✅ Detached ${method.ecartpay_token} from eCartPay`);
        } catch (error) {
          console.warn(`⚠️ Failed to detach ${method.ecartpay_token}:`, error);
        }
      }

      // Delete from our database
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq(userFieldName, userId);

      if (deleteError) {
        console.error('Error deleting from database:', deleteError);
        return { success: false, error: deleteError };
      }

      console.log('🎉 Cleanup completed successfully');
      return { success: true, cleaned: methods?.length || 0 };
    } catch (error) {
      console.error('Error in cleanupTestData:', error);
      return { success: false, error };
    }
  }

  validatePaymentData(data) {
    const errors = [];

    if (!data.cardNumber || !ecartPayService.validateCardNumber(data.cardNumber)) {
      errors.push('Invalid card number');
    }

    if (!data.expMonth || !data.expYear || !ecartPayService.validateExpiry(data.expMonth, data.expYear)) {
      errors.push('Invalid expiry date');
    }

    if (!data.cvv || data.cvv.length < 3 || data.cvv.length > 4) {
      errors.push('Invalid CVV');
    }

    if (!data.cardholderName || data.cardholderName.trim().length < 2) {
      errors.push('Invalid cardholder name');
    }

    if (!data.country || data.country.length < 2) {
      errors.push('Invalid country');
    }

    if (!data.postalCode || data.postalCode.trim().length < 3) {
      errors.push('Invalid postal code');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Normalize card type from EcartPay to standard values
  normalizeCardType(ecartPayType, cardNumber) {
    // First try to determine from card number if ecartPayType is generic
    if (ecartPayType === 'credit' || ecartPayType === 'card' || ecartPayType === 'unknown') {
      return this.detectCardTypeFromNumber(cardNumber);
    }

    // Normalize EcartPay types to standard values
    const typeMap = {
      'visa': 'visa',
      'mastercard': 'mastercard',
      'master': 'mastercard',
      'amex': 'amex',
      'american-express': 'amex',
      'american_express': 'amex',
      'discover': 'discover',
      'credit': this.detectCardTypeFromNumber(cardNumber), // fallback to number detection
      'debit': this.detectCardTypeFromNumber(cardNumber)   // fallback to number detection
    };

    return typeMap[ecartPayType.toLowerCase()] || this.detectCardTypeFromNumber(cardNumber);
  }

  // Detect card type from card number patterns
  detectCardTypeFromNumber(cardNumber) {
    if (!cardNumber) return 'unknown';

    const cleaned = cardNumber.replace(/\s/g, '');

    const patterns = {
      visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
      mastercard: /^5[1-5][0-9]{14}$/,
      amex: /^3[47][0-9]{13}$/,
      discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(cleaned)) {
        return type;
      }
    }

    return 'unknown';
  }
}

module.exports = new PaymentService();