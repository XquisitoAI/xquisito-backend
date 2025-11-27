require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL es requerido en las variables de entorno");
}

// Cliente para operaciones de administración (con service role key)
// Usar solo para operaciones del lado del servidor que requieren permisos elevados
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

// Cliente para operaciones públicas (con anon key)
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Verifica el JWT token de Supabase Auth
const verifySupabaseToken = async (token) => {
  try {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser(token);

    if (error) {
      return { user: null, error };
    }

    return { user, error: null };
  } catch (error) {
    return { user: null, error };
  }
};

// Valida que las configuraciones necesarias estén presentes
const validateSupabaseAuthConfig = () => {
  const errors = [];

  if (!supabaseUrl) {
    errors.push("SUPABASE_URL no está configurado");
  }

  if (!supabaseAnonKey) {
    errors.push("SUPABASE_ANON_KEY no está configurado");
  }

  if (!supabaseServiceRoleKey) {
    console.warn(
      "⚠️ SUPABASE_SERVICE_ROLE_KEY no está configurado. Algunas funcionalidades de administración pueden no estar disponibles."
    );
  }

  if (errors.length > 0) {
    console.error("❌ Configuración de Supabase Auth incompleta:");
    errors.forEach((error) => console.error(`   - ${error}`));
    throw new Error("Configuración de Supabase Auth incompleta");
  } else {
    console.log("✅ Configuración de Supabase Auth completa");
  }

  return true;
};

module.exports = {
  supabaseAdmin,
  supabaseClient,
  verifySupabaseToken,
  validateSupabaseAuthConfig,
};
