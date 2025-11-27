const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateSupabaseToken } = require("../middleware/supabaseAuth");

// ============================================
// CUSTOMER (Phone)
// ============================================

// POST /api/auth/customer/send-otp - Enviar código OTP al teléfono
router.post("/customer/send-otp", authController.customerSendOTP);

// POST /api/auth/customer/verify-otp - Verificar código OTP y hacer login
router.post("/customer/verify-otp", authController.customerVerifyOTP);

// ============================================
// ADMIN & MAIN (Email + Password)
// ============================================

// POST /api/auth/admin/signup - Registrar admin o main
router.post("/admin/signup", authController.adminSignup);

// POST /api/auth/admin/login - Login de admin o main
router.post("/admin/login", authController.adminLogin);

// ============================================
// COMMON ENDPOINTS
// ============================================

// POST /api/auth/refresh - Refrescar access token
router.post("/refresh", authController.refreshToken);

// POST /api/auth/logout - Logout
router.post("/logout", authenticateSupabaseToken, authController.logout);

// GET /api/auth/me - Obtener usuario actual autenticado
router.get("/me", authenticateSupabaseToken, authController.getCurrentUser);

module.exports = router;
