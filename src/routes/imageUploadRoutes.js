const express = require('express');
const ImageUploadService = require('../services/imageUploadService');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

const router = express.Router();

// Configurar multer
const upload = ImageUploadService.getMulterConfig();

/**
 * POST /api/images/upload
 * Subir imagen (banner o logo)
 */
router.post('/upload', adminPortalAuth, upload.single('image'), async (req, res) => {
  try {
    const { type } = req.body; // 'banner' o 'logo'
    const clerkUserId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    if (!type || !['banner', 'logo', 'item'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Type must be either "banner", "logo", or "item"'
      });
    }

    console.log(`📤 ${clerkUserId} uploading ${type} image:`, file.originalname);

    // Eliminar imagen anterior si se proporciona
    const { oldImageUrl } = req.body;

    // Subir nueva imagen
    const publicUrl = await ImageUploadService.updateImage(
      file,
      type,
      clerkUserId,
      oldImageUrl
    );

    console.log(`✅ ${type} image uploaded successfully for user ${clerkUserId}`);

    res.json({
      success: true,
      imageUrl: publicUrl,
      message: `${type} image uploaded successfully`
    });

  } catch (error) {
    console.error('❌ Error uploading image:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload image'
    });
  }
});

/**
 * DELETE /api/images/delete
 * Eliminar imagen
 */
router.delete('/delete', adminPortalAuth, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const clerkUserId = req.user.id;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Image URL is required'
      });
    }

    console.log(`🗑️ ${clerkUserId} deleting image:`, imageUrl);

    await ImageUploadService.deleteImage(imageUrl);

    console.log(`✅ Image deleted successfully for user ${clerkUserId}`);

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting image:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete image'
    });
  }
});

module.exports = router;