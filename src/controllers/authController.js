const supabase = require("../config/supabase");

class AuthController {
  // Enviar código OTP al teléfono del customer
  async customerSendOTP(req, res) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: "Ingresa un número de teléfono (formato: +521234567890)",
        });
      }

      if (!phone.startsWith("+")) {
        return res.status(400).json({
          success: false,
          error:
            "El número de teléfono debe incluir el código de país. (e.g., +521234567890)",
        });
      }

      // Enviar OTP vía SMS usando Twilio
      const { data, error } = await supabase.auth.signInWithOtp({
        phone: phone,
      });

      if (error) {
        console.error("❌ Error al enviar OTP:", error);
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.json({
        success: true,
        message: `El código OTP se envió correctamente a ${phone}`,
        data: {
          phone: phone,
          messageId: data?.messageId,
        },
      });
    } catch (error) {
      console.error("❌ Error inesperado en customerSendOTP:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Verificar código OTP y login del customer
  async customerVerifyOTP(req, res) {
    try {
      const { phone, token } = req.body;

      if (!phone || !token) {
        return res.status(400).json({
          success: false,
          error: "Se requieren teléfono y token OTP",
        });
      }

      // Verificar OTP
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phone,
        token: token,
        type: "sms",
      });

      if (error) {
        console.error("❌ Error al verificar OTP:", error);
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      // Obtener perfil del usuario
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("❌ Error al obtener el perfil:", profileError);
      }

      res.json({
        success: true,
        message: "Teléfono verificado exitosamente",
        data: {
          user: {
            id: data.user.id,
            phone: data.user.phone,
            accountType: profile?.account_type || "customer",
          },
          profile: profile || null,
          session: {
            access_token: data.session?.access_token,
            refresh_token: data.session?.refresh_token,
            expires_at: data.session?.expires_at,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error inesperado en customerVerifyOTP:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Registro de admin/main con email y contraseña
  async adminSignup(req, res) {
    try {
      const { email, password, firstName, lastName, accountType } = req.body;

      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          error:
            "Se requieren correo electrónico, contraseña, nombre y apellido",
        });
      }

      if (accountType && !["admin", "main"].includes(accountType)) {
        return res.status(400).json({
          success: false,
          error: "El tipo de cuenta debe ser 'admin' o 'main'",
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: "La contraseña debe tener al menos 6 caracteres",
        });
      }

      // Crear usuario en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (error) {
        console.error("❌ Error al crear usuario administrador:", error);
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      // Actualizar perfil con información adicional y tipo de cuenta
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          account_type: accountType || "admin",
        })
        .eq("id", data.user.id)
        .select()
        .single();

      if (profileError) {
        console.error("❌ Error updating profile:", profileError);
      }

      res.status(201).json({
        success: true,
        message: "Administrador/Usuario principal creado exitosamente",
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
            accountType: profile?.account_type || accountType || "admin",
          },
          profile: profile,
          session: data.session
            ? {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
              }
            : null,
        },
        note: "Por favor revise su correo electrónico para verificar su cuenta.",
      });
    } catch (error) {
      console.error("❌ Error inesperado adminSignup:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Login de admin/main con email y contraseña
  async adminLogin(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: "Se requiere correo electrónico y contraseña",
        });
      }

      // Login con Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        console.error("❌ Error al iniciar sesión:", error);
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("❌ Error al obtener el perfil:", profileError);
      }

      // Verificar que el usuario sea admin o main
      if (profile && !["admin", "main"].includes(profile.account_type)) {
        return res.status(403).json({
          success: false,
          error: "Acceso denegado. Este punto final es solo para admin/main",
        });
      }

      res.json({
        success: true,
        message: "Inicio de sesión exitoso",
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
            accountType: profile?.account_type,
          },
          profile: profile,
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error inesperado en adminLogin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Refrescar token de acceso
  async refreshToken(req, res) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          success: false,
          error: "Se requiere el token de actualización",
        });
      }

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token,
      });

      if (error) {
        console.error("❌ Error al actualizar token:", error);
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.json({
        success: true,
        message: "Token actualizado correctamente",
        data: {
          session: {
            access_token: data.session?.access_token,
            refresh_token: data.session?.refresh_token,
            expires_at: data.session?.expires_at,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error inesperado en refreshToken:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Logout
  async logout(req, res) {
    try {
      // Obtener token del header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          error: "Se requiere token de autorización",
        });
      }

      const token = authHeader.substring(7);

      const { error } = await supabase.auth.admin.signOut(token);

      if (error) {
        console.error("❌ Error al cerrar sesión:", error);
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.json({
        success: true,
        message: "Cerró sesión exitosamente",
      });
    } catch (error) {
      console.error("❌ Error inesperado al cerrar sesión:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Obtener usuario actual autenticado
  async getCurrentUser(req, res) {
    try {
      const user = req.user; // Viene del middleware authenticateSupabaseToken

      // Obtener perfil del usuario
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("❌ Error al obtener el perfil:", profileError);
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            phone: user.phone,
            accountType: profile?.account_type,
          },
          profile: profile,
        },
      });
    } catch (error) {
      console.error("❌ Error inesperado en getCurrentUser:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}

module.exports = new AuthController();
