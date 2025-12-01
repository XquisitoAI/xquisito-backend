const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { authenticateSupabaseToken } = require("../middleware/supabaseAuth");
const ImageUploadService = require("../services/imageUploadService");

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

// POST /api/profiles/upload-photo - Subir foto de perfil del usuario autenticado
const upload = ImageUploadService.getMulterConfig();
router.post(
  "/upload-photo",
  authenticateSupabaseToken,
  upload.single("photo"),
  profileController.uploadProfilePhoto
);

module.exports = router;
