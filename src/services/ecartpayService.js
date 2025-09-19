const axios = require('axios');

class EcartPayService {
  constructor() {
    this.publicKey = process.env.ECARTPAY_PUBLIC_KEY;
    this.secretKey = process.env.ECARTPAY_SECRET_KEY;
    this.environment = process.env.ECARTPAY_ENVIRONMENT || 'sandbox';
    this.authToken = null; // Will store the generated token
    this.tokenExpiry = null; // Track token expiration
    
    // Set base URL based on environment (from official docs)
    this.baseURL = this.environment === 'production' 
      ? 'https://ecartpay.com/api'  // Assuming production follows similar pattern
      : 'https://sandbox.ecartpay.com/api';
      
    console.log(`🔧 EcartPay Environment: ${this.environment}`);
    console.log(`🔧 EcartPay Base URL: ${this.baseURL}`);
    console.log(`🔧 EcartPay Public Key: ${this.publicKey?.substring(0, 15)}...`);
    console.log(`🔧 EcartPay Secret Key: ${this.secretKey?.substring(0, 15)}...`);
    
    // Create axios instance with default config (no auth header yet)
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Xquisito-Backend/1.0.0'
      }
    });

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log(`🌐 EcartPay API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
        console.log(`🔑 Authorization: ${config.headers.Authorization ? config.headers.Authorization.substring(0, 20) + '...' : 'None'}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('EcartPay API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  async generateToken() {
    try {
      console.log('🔐 Generating EcartPay token...');
      console.log(`🔐 Request URL: ${this.baseURL}/authorizations/token`);
      console.log(`🔐 Public Key: ${this.publicKey}`);
      console.log(`🔐 Private Key: ${this.secretKey}`);
      
      // Try with Basic Authentication using public and private keys
      const credentials = Buffer.from(`${this.publicKey}:${this.secretKey}`).toString('base64');
      
      const response = await axios.post(`${this.baseURL}/authorizations/token`, {
        public_key: this.publicKey,
        private_key: this.secretKey
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        }
      });

      this.authToken = response.data.token;
      this.tokenExpiry = Date.now() + (55 * 60 * 1000); // 55 minutes (5 min buffer)
      
      console.log('✅ EcartPay token generated successfully');
      
      return this.authToken;
    } catch (error) {
      console.error('❌ Failed to generate EcartPay token:', error.response?.data || error.message);
      throw new Error(`Token generation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async ensureValidToken() {
    // Check if we need a new token
    if (!this.authToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry) {
      await this.generateToken();
    }
    return this.authToken;
  }

  async makeAuthenticatedRequest(method, url, data = null) {
    const token = await this.ensureValidToken();
    
    const config = {
      method,
      url,
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    return this.axiosInstance(config);
  }

  async createCustomer(customerData) {
    try {
      // EcartPay customer creation format based on official documentation
      const nameParts = customerData.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      console.log('📋 Creating eCartpay customer with data:', {
        phone: customerData.phone || "0000000000",
        first_name: firstName,
        last_name: lastName,
        user_id: customerData.userId
      });
      
      const response = await this.makeAuthenticatedRequest('post', '/customers', {
        phone: customerData.phone || "0000000000",  // Phone is required
        first_name: firstName,
        last_name: lastName,
        user_id: customerData.userId
        // Note: email is NOT sent in customer creation according to docs
      });

      console.log('✅ eCartpay customer created successfully:', response.data);
      
      return {
        success: true,
        customer: response.data
      };
    } catch (error) {
      console.error('❌ eCartpay customer creation failed:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async getCustomers() {
    try {
      console.log('📋 Fetching customers from eCartpay...');
      const response = await this.makeAuthenticatedRequest('get', '/customers');

      return {
        success: true,
        customers: response.data
      };
    } catch (error) {
      console.error('❌ Failed to fetch customers:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async findCustomerByUserId(userId) {
    try {
      console.log('🔍 Looking for customer with user_id:', userId);
      const customersResult = await this.getCustomers();
      
      if (!customersResult.success) {
        return customersResult;
      }

      // eCartpay returns data in { docs: [...], count: n, pages: n } format
      const customers = customersResult.customers?.docs || [];
      const customer = customers.find(c => c.user_id === userId);
      
      if (customer) {
        console.log('✅ Found existing customer:', customer.id);
        return {
          success: true,
          customer: customer
        };
      }

      return {
        success: false,
        error: {
          type: 'not_found',
          message: 'Customer not found'
        }
      };
    } catch (error) {
      console.error('❌ Error searching customer:', error);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }


  async createPaymentMethod(paymentMethodData) {
    try {
      console.log('💳 Creating payment method with data:', {
        cardNumber: '****' + paymentMethodData.cardNumber.slice(-4),
        cardholderName: paymentMethodData.cardholderName,
        customerId: paymentMethodData.customerId
      });

      // Use customer-specific endpoint based on documentation
      const response = await this.makeAuthenticatedRequest('post', `/customers/${paymentMethodData.customerId}/cards`, {
        name: paymentMethodData.cardholderName,
        number: paymentMethodData.cardNumber,
        exp_month: paymentMethodData.expMonth,
        exp_year: paymentMethodData.expYear,
        cvc: paymentMethodData.cvv
      });

      console.log('✅ Payment method created successfully:', response.data?.id);

      return {
        success: true,
        paymentMethod: response.data
      };
    } catch (error) {
      console.error('❌ Payment method creation failed:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async attachPaymentMethodToCustomer(paymentMethodId, customerId) {
    try {
      const response = await this.makeAuthenticatedRequest('post', `/payment_methods/${paymentMethodId}/attach`, {
        customer: customerId
      });

      return {
        success: true,
        paymentMethod: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async detachPaymentMethod(paymentMethodId) {
    try {
      const response = await this.makeAuthenticatedRequest('post', `/payment_methods/${paymentMethodId}/detach`);

      return {
        success: true,
        paymentMethod: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async createCheckoutWithStoredMethod(checkoutData) {
    try {
      // Validate required parameters for checkout with stored payment method
      if (!checkoutData.customerId || !checkoutData.amount) {
        throw new Error('customerId and amount are required for checkout');
      }

      const payload = {
        customer_id: checkoutData.customerId,
        title: checkoutData.title || 'Xquisito Restaurant Payment',
        currency: checkoutData.currency || 'USD',
        amounts: [checkoutData.amount],
        concept: checkoutData.description || 'Restaurant order payment',
        notify_url: checkoutData.webhookUrl,
        reference_id: checkoutData.referenceId || `xq_${Date.now()}`
      };

      console.log('💳 Creating eCartPay checkout with stored method:', {
        customerId: checkoutData.customerId,
        amount: checkoutData.amount,
        currency: checkoutData.currency,
        referenceId: payload.reference_id
      });
      
      const response = await this.makeAuthenticatedRequest('post', '/checkouts', payload);

      console.log('✅ eCartPay checkout created:', {
        id: response.data?.id,
        publicId: response.data?.public_id,
        hasLink: !!response.data?.link
      });

      return {
        success: true,
        checkout: response.data
      };
    } catch (error) {
      console.error('❌ eCartPay checkout creation failed:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async generateCardToken(customerId, cardId, cardholderName) {
    try {
      console.log('🔑 Generating card token for customer:', customerId, 'card:', cardId);

      // Based on EcartPay documentation, the /tokens endpoint expects:
      // - id: the card_id
      // - cvc: the card's CVC (we don't store this for security)
      // But the API is also asking for 'name', so we'll include it
      const payload = {
        id: cardId
      };

      // Add name if provided (seems to be required by current API version)
      if (cardholderName) {
        payload.name = cardholderName;
      }

      // Note: CVC is required according to docs but we don't store it for security reasons
      // For production, you may need to ask user to re-enter CVC for tokenization
      // For now, we'll try without CVC and see what the API returns

      console.log('🔑 Token generation payload:', {
        id: cardId,
        hasName: !!cardholderName,
        note: 'CVC not included for security reasons'
      });

      const response = await this.makeAuthenticatedRequest('post', '/tokens', payload);

      console.log('✅ Card token generated successfully:', response.data?.token ? 'present' : 'missing');

      return {
        success: true,
        token: response.data?.token,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Card token generation failed:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async createOrderWithToken(orderData) {
    try {
      if (!orderData.customerId || !orderData.token) {
        throw new Error('customer_id and token are required');
      }

      if (!orderData.items || orderData.items.length === 0) {
        orderData.items = [{
          name: orderData.description || 'Xquisito Restaurant Order',
          quantity: orderData.quantity || 1,
          price: orderData.amount
        }];
      }

      const payload = {
        customer_id: orderData.customerId,
        currency: orderData.currency || 'USD',
        items: orderData.items,
        token: orderData.token,
        notify_url: orderData.webhookUrl || `${process.env.BASE_URL || 'http://localhost:5000'}/api/payments/webhooks/ecartpay`
      };

      console.log('🛒 Creating eCartPay order with token:', {
        customerId: orderData.customerId,
        token: orderData.token ? 'present' : 'missing',
        itemsCount: payload.items.length,
        currency: payload.currency
      });

      const response = await this.makeAuthenticatedRequest('post', '/orders', payload);

      console.log('✅ eCartPay order with token created successfully:', {
        id: response.data?.id,
        status: response.data?.status
      });

      return {
        success: true,
        order: response.data
      };
    } catch (error) {
      console.error('❌ eCartPay order with token creation failed:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async processCheckoutWithPaymentMethod(customerId, cardId, orderData) {
    try {
      console.log('💳 Processing payment with stored card:', { customerId, cardId });

      // Step 1: Generate token for the stored card
      const tokenResult = await this.generateCardToken(customerId, cardId, orderData.cardholderName);
      if (!tokenResult.success) {
        return tokenResult;
      }

      // Step 2: Create order with the token
      const orderResult = await this.createOrderWithToken({
        ...orderData,
        customerId,
        token: tokenResult.token
      });

      if (!orderResult.success) {
        return orderResult;
      }

      console.log('✅ Payment processed successfully with stored card');

      return {
        success: true,
        order: orderResult.order,
        token: tokenResult.token
      };

    } catch (error) {
      console.error('❌ Payment processing with stored card failed:', error);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async createOrder(orderData) {
    console.log('OrderData',orderData);
    
    try {
      // Validate required parameters according to eCartPay docs
      if (!orderData.customerId) {
        throw new Error('customer_id is required');
      }
      
      if (!orderData.items || orderData.items.length === 0) {
        // Create default item if not provided
        orderData.items = [{
          name: orderData.description || 'Xquisito Restaurant Order',
          quantity: orderData.quantity,
          price: orderData.amount
        }];
      }

      // Validate items have required fields
      orderData.items.forEach(item => {
        if (!item.name || !item.quantity || item.price === undefined) {
          throw new Error('Each item must have name, quantity, and price');
        }
      });

      const payload = {
        customer_id: orderData.customerId,
        currency: orderData.currency || 'USD',
        items: orderData.items,
        notify_url: orderData.webhookUrl || `${process.env.BASE_URL || 'http://localhost:5000'}/api/payments/webhooks/ecartpay`
      };

      // Add reference_id with table information for webhook processing
      if (orderData.tableNumber) {
        payload.reference_id = `xq_table_${orderData.tableNumber}_${Date.now()}`;
      } else if (orderData.referenceId) {
        payload.reference_id = orderData.referenceId;
      }

      // Add optional redirect_url if provided
      if (orderData.redirectUrl) {
        payload.redirect_url = orderData.redirectUrl;
      }

      console.log('🛒 Creating eCartPay order with payload:', {
        ...payload,
        items: payload.items.map(item => ({ ...item, price: '***' })) 
      });
      
      const response = await this.makeAuthenticatedRequest('post', '/orders', payload);

      console.log('✅ eCartPay order created successfully:', {
        id: response.data?.id,
        status: response.data?.status,
        payLink: response.data?.pay_link ? 'present' : 'missing'
      });

      return {
        success: true,
        order: response.data
      };
    } catch (error) {
      console.error('❌ eCartPay order creation failed:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async createPayment(paymentData) {
    console.log('⚠️  Using deprecated createPayment - consider using createOrder instead');
    
    // For backward compatibility, convert to order creation
    return this.createOrder({
      customerId: paymentData.customerId,
      amount: paymentData.amount,
      currency: paymentData.currency,
      description: paymentData.description,
      webhookUrl: paymentData.webhookUrl,
      redirectUrl: paymentData.redirectUrl,
      items: [{
        name: paymentData.description || 'Xquisito Restaurant Payment',
        quantity: paymentData.quantity,
        price: paymentData.amount
      }]
    });
  }

  async getOrder(orderId) {
    try {
      console.log('🔍 Getting eCartPay order:', orderId);
      
      const response = await this.makeAuthenticatedRequest('get', `/orders/${orderId}`);

      console.log('✅ eCartPay order retrieved:', response.data?.id);

      return {
        success: true,
        order: response.data
      };
    } catch (error) {
      console.error('❌ eCartPay order retrieval failed:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async confirmPayment(paymentId, paymentMethodId) {
    console.log('⚠️  confirmPayment is deprecated for eCartPay orders - orders are auto-confirmed via webhook');
    
    // Try to get order status instead
    return this.getOrder(paymentId);
  }

  async retrievePayment(paymentId) {
    try {
      const response = await this.makeAuthenticatedRequest('get', `/payments/${paymentId}`);

      return {
        success: true,
        payment: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async refundPayment(paymentId, amount = null) {
    try {
      const refundData = {
        payment_intent: paymentId
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // Convert to cents
      }

      const response = await this.makeAuthenticatedRequest('post', '/refunds', refundData);

      return {
        success: true,
        refund: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  // Admin/Debug methods for managing eCartPay data
  async listAllCustomers(limit = 100) {
    try {
      console.log('📋 Listing all eCartPay customers...');
      
      const response = await this.makeAuthenticatedRequest('get', '/customers', {}, {
        params: { limit }
      });

      console.log(`✅ Found ${response.data?.data?.length || 0} customers`);
      
      // Handle the response structure from eCartPay
      const customers = response.data?.data?.docs || response.data?.docs || response.data || [];
      
      return {
        success: true,
        customers: customers
      };
    } catch (error) {
      console.error('❌ Failed to list customers:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async deleteCustomer(customerId) {
    try {
      console.log(`🗑️ Deleting eCartPay customer: ${customerId}`);
      
      const response = await this.makeAuthenticatedRequest('delete', `/customers/${customerId}`);

      console.log('✅ Customer deleted successfully');
      
      return {
        success: true,
        message: 'Customer deleted successfully'
      };
    } catch (error) {
      console.error('❌ Failed to delete customer:', error.response?.data);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async deleteAllTestCustomers() {
    try {
      console.log('🧹 Starting cleanup of test customers...');
      
      // Get all customers
      const customersResult = await this.listAllCustomers();
      if (!customersResult.success) {
        return customersResult;
      }

      const customers = customersResult.customers;
      console.log(`📊 Total customers to review: ${customers.length}`);
      
      // Filter test customers (those with test emails or user_ids)
      const testCustomers = customers.filter(customer => {
        const email = customer.email || '';
        const userId = customer.user_id || '';
        const name = customer.name || '';
        
        return (
          email.includes('test') || 
          email.includes('guest') ||
          email.includes('temp.com') ||
          email.includes('@example.com') ||
          userId.includes('guest-') ||
          userId.includes('test-') ||
          name.includes('Test') ||
          name.includes('User')
        );
      });

      console.log(`🎯 Found ${testCustomers.length} test customers to delete`);

      // Delete each test customer
      const deleteResults = [];
      for (const customer of testCustomers) {
        console.log(`🗑️ Deleting test customer: ${customer.id} (${customer.email})`);
        const result = await this.deleteCustomer(customer.id);
        deleteResults.push({ customer, result });
        
        // Add small delay between deletions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const successCount = deleteResults.filter(r => r.result.success).length;
      const failCount = deleteResults.filter(r => !r.result.success).length;

      console.log(`✅ Cleanup complete: ${successCount} deleted, ${failCount} failed`);
      
      return {
        success: true,
        message: `Cleanup complete: ${successCount} customers deleted, ${failCount} failed`,
        details: {
          totalReviewed: customers.length,
          testCustomersFound: testCustomers.length,
          deleted: successCount,
          failed: failCount,
          results: deleteResults
        }
      };
    } catch (error) {
      console.error('❌ Failed to cleanup test customers:', error);
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  handleError(error) {
    if (error.response) {
      const { status, data } = error.response;
      
      return {
        type: 'api_error',
        code: data.error?.code || 'unknown_error',
        message: data.error?.message || 'An unknown error occurred',
        status,
        details: data
      };
    } else if (error.request) {
      return {
        type: 'network_error',
        code: 'network_error',
        message: 'Network error: Unable to reach EcartPay servers',
        details: error.message
      };
    } else {
      return {
        type: 'client_error',
        code: 'client_error',
        message: error.message,
        details: error
      };
    }
  }

  validateCardNumber(cardNumber) {
    const cleaned = cardNumber.replace(/\s/g, '');
    
    // Basic Luhn algorithm validation
    let sum = 0;
    let shouldDouble = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i]);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  getCardType(cardNumber) {
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

  maskCardNumber(cardNumber) {
    const cleaned = cardNumber.replace(/\s/g, '');
    const lastFour = cleaned.slice(-4);
    return `****-****-****-${lastFour}`;
  }

  validateExpiry(month, year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (year < currentYear) return false;
    if (year === currentYear && month < currentMonth) return false;
    if (month < 1 || month > 12) return false;

    return true;
  }
}

module.exports = new EcartPayService();