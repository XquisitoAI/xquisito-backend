const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { authenticateSupabaseToken } = require("../middleware/supabaseAuth");

// POST /api/profiles - Crear o actualizar perfil del usuario autenticado
router.post(
  "/",
  authenticateSupabaseToken,
  profileController.createOrUpdateProfile
);

// GET /api/profiles/me - Obtener perfil del usuario autenticado
router.get("/me", authenticateSupabaseToken, profileController.getMyProfile);

// PUT /api/profiles/me - Actualizar perfil del usuario autenticado
router.put("/me", authenticateSupabaseToken, profileController.updateMyProfile);

module.exports = router;
