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

  async createPayment(paymentData) {
    try {
      const response = await this.makeAuthenticatedRequest('post', '/payments', {
        amount: Math.round(paymentData.amount * 100), // Convert to cents
        currency: paymentData.currency || 'USD',
        payment_method: paymentData.paymentMethodId,
        customer: paymentData.customerId,
        confirmation_method: 'manual',
        confirm: true,
        description: paymentData.description || 'Xquisito Restaurant Payment',
        metadata: {
          order_id: paymentData.orderId,
          table_number: paymentData.tableNumber,
          restaurant_id: paymentData.restaurantId
        }
      });

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

  async confirmPayment(paymentId, paymentMethodId) {
    try {
      const response = await this.makeAuthenticatedRequest('post', `/payments/${paymentId}/confirm`, {
        payment_method: paymentMethodId
      });

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