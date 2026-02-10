const app = require('./app');
const { validateClerkConfigs } = require('./config/clerkConfig');
const { validateSupabaseAuthConfig } = require('./config/supabaseAuth');
const renewalJob = require('./jobs/renewalJob');

const PORT = process.env.PORT || 5000;

// Validar configuraciones de Clerk al iniciar
validateClerkConfigs();

// Validar configuraciones de Supabase Auth al iniciar
try {
  validateSupabaseAuthConfig();
} catch (error) {
  console.error('⚠️ Supabase Auth configuration error:', error.message);
  console.error('   The server will continue but Supabase Auth features may not work properly.');
}

app.listen(PORT, () => {
  console.log(`🚀 Xquisito Backend server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);

  // Iniciar cron job de renovacion de suscripciones
  // Solo iniciar si no estamos en ambiente de pruebas
  if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_RENEWAL_JOB !== 'false') {
    renewalJob.start();
    console.log('📅 Cron job de renovacion de suscripciones iniciado');
  }
});