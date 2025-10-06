const app = require('./app');
const { validateClerkConfigs } = require('./config/clerkConfig');

const PORT = process.env.PORT || 5000;

// Validar configuraciones de Clerk al iniciar
validateClerkConfigs();

app.listen(PORT, () => {
  console.log(`🚀 Xquisito Backend server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});