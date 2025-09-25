const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticateSupabaseToken, optionalAuth, guestAuth } = require('../middleware/supabaseAuth');
const { optionalClerkAuth } = require('../middleware/clerkAuth');

const router = express.Router();

// Use optionalClerkAuth middleware - supports both Clerk-authenticated users and guests
router.use(optionalClerkAuth);

// Payment Methods Management
router.post('/payment-methods', paymentController.addPaymentMethod);
router.get('/payment-methods', paymentController.getUserPaymentMethods);
router.delete('/payment-methods/:paymentMethodId', paymentController.deletePaymentMethod);
router.put('/payment-methods/:paymentMethodId/default', paymentController.setDefaultPaymentMethod);

// Payment Processing
router.post('/payments', paymentController.processPayment);
router.get('/payments/history', paymentController.getPaymentHistory);

// Guest Data Cleanup
router.post('/payments/cleanup-guest', paymentController.cleanupGuestData);

// Webhook endpoint (no authentication required for EcartPay webhooks)
router.post('/webhooks/ecartpay', (req, res, next) => {
  // Remove authentication for webhooks
  req.skipAuth = true;
  next();
}, paymentController.handleWebhook);

// Admin endpoints for managing eCartPay data (development only)
router.get('/admin/ecartpay/customers', paymentController.listEcartPayCustomers);
router.delete('/admin/ecartpay/customers/cleanup', paymentController.cleanupTestCustomers);
router.delete('/admin/ecartpay/customers/:customerId', paymentController.deleteEcartPayCustomer);

// Legacy debug endpoints (keep for compatibility)
router.get('/debug/ecartpay/customers', paymentController.listEcartPayCustomers);

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