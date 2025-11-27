const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

/**
 * NOTA: Este archivo es solo para testing/desarrollo
 * NO USAR EN PRODUCCIÓN
 * Permite crear usuarios y obtener tokens fácilmente para probar con Postman
 */

// POST /api/auth-test/signup - Crear usuario y obtener token
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "email and password are required",
      });
    }

    // Crear usuario en Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "User created successfully",
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: data.session,
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
      note: "Use the access_token in the Authorization header: Bearer <access_token>",
    });
  } catch (error) {
    console.error("Error in signup:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/auth-test/login - Login y obtener token
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "email and password are required",
      });
    }

    // Login con Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: data.session,
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
      note: "Use the access_token in the Authorization header: Bearer <access_token>",
    });
  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/auth-test/refresh - Refrescar token
router.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: "refresh_token is required",
      });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        session: data.session,
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
    });
  } catch (error) {
    console.error("Error in refresh:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// PHONE AUTHENTICATION (Passwordless con OTP)
// ============================================

// POST /api/auth-test/phone/send-otp - Enviar código OTP al teléfono
router.post("/phone/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: "phone number is required (format: +1234567890)",
      });
    }

    // Enviar OTP vía SMS usando Twilio (configurado en Supabase)
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: `OTP code sent successfully to ${phone}`,
      data: {
        phone: phone,
        messageId: data?.messageId,
      },
      note: "Check your phone for the 6-digit OTP code, then use /phone/verify-otp endpoint to complete login",
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/auth-test/phone/verify-otp - Verificar código OTP y obtener token
router.post("/phone/verify-otp", async (req, res) => {
  try {
    const { phone, token } = req.body;

    if (!phone || !token) {
      return res.status(400).json({
        success: false,
        error: "phone and token (6-digit OTP code) are required",
      });
    }

    // Verificar OTP
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phone,
      token: token,
      type: "sms",
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Phone verified successfully! User logged in.",
      data: {
        user: {
          id: data.user.id,
          phone: data.user.phone,
          email: data.user.email,
        },
        session: data.session,
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
      note: "Use the access_token in the Authorization header: Bearer <access_token>",
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
