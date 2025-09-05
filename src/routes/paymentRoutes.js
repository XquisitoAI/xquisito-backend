const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticateSupabaseToken, optionalAuth, guestAuth } = require('../middleware/supabaseAuth');

const router = express.Router();

// Use guestAuth middleware - supports both authenticated users and guests
router.use(guestAuth);

// Payment Methods Management
router.post('/payment-methods', paymentController.addPaymentMethod);
router.get('/payment-methods', paymentController.getUserPaymentMethods);
router.delete('/payment-methods/:paymentMethodId', paymentController.deletePaymentMethod);
router.put('/payment-methods/:paymentMethodId/default', paymentController.setDefaultPaymentMethod);

// Payment Processing (for future implementation)
router.post('/payments', paymentController.processPayment);
router.get('/payments/history', paymentController.getPaymentHistory);

// Webhook endpoint (no authentication required for EcartPay webhooks)
router.post('/webhooks/ecartpay', (req, res, next) => {
  // Remove authentication for webhooks
  req.skipAuth = true;
  next();
}, paymentController.handleWebhook);

// Debug/Testing endpoints (remove in production)
router.get('/debug/ecartpay/customers', async (req, res) => {
  try {
    const ecartPayService = require('../services/ecartpayService');
    const result = await ecartPayService.getCustomers();
    
    res.json({
      success: result.success,
      customers: result.customers,
      error: result.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

router.get('/debug/ecartpay/customers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const ecartPayService = require('../services/ecartpayService');
    const result = await ecartPayService.findCustomerByUserId(userId);
    
    res.json({
      success: result.success,
      customer: result.customer,
      error: result.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

module.exports = router;