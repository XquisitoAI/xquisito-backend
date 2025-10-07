const supabase = require("../config/supabase");
const multer = require('multer');

class ImageUploadService {
  static BUCKET_NAME = 'restaurant-images';

  /**
   * Configuración de multer para almacenar archivos en memoria
   */
  static getMulterConfig() {
    return multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB máximo
      },
      fileFilter: (req, file, cb) => {
        // Validar que sea una imagen
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed'), false);
        }
      },
    });
  }

  /**
   * Subir imagen al storage de Supabase
   */
  static async uploadImage(file, path, userId) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }

      // Generar nombre único para el archivo
      const fileExt = file.originalname.split('.').pop();
      const fileName = `${path}_${userId}_${Date.now()}.${fileExt}`;

      console.log('📤 Uploading image:', fileName);

      // Subir archivo al storage
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('❌ Error uploading image:', error);
        throw error;
      }

      // Obtener URL pública
      const { data: publicUrlData } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fileName);

      console.log('✅ Image uploaded successfully:', publicUrlData.publicUrl);
      return publicUrlData.publicUrl;

    } catch (error) {
      console.error('❌ Error in uploadImage:', error);
      throw error;
    }
  }

  /**
   * Eliminar imagen del storage
   */
  static async deleteImage(imageUrl) {
    try {
      if (!imageUrl || !this.isSupabaseStorageUrl(imageUrl)) {
        console.log('🔍 URL is not from Supabase Storage, skipping deletion:', imageUrl);
        return;
      }

      // Extraer el nombre del archivo de la URL
      const fileName = this.extractFileNameFromUrl(imageUrl);
      if (!fileName) {
        console.warn('⚠️ Could not extract filename from URL:', imageUrl);
        return;
      }

      console.log('🗑️ Deleting image:', fileName);

      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([fileName]);

      if (error) {
        console.error('❌ Error deleting image:', error);
        throw error;
      }

      console.log('✅ Image deleted successfully');

    } catch (error) {
      console.error('❌ Error in deleteImage:', error);
      // No lanzamos el error para no romper el flujo si no se puede eliminar
    }
  }

  /**
   * Actualizar imagen (elimina la anterior y sube la nueva)
   */
  static async updateImage(file, path, userId, oldImageUrl) {
    try {
      // Eliminar imagen anterior si existe
      if (oldImageUrl) {
        await this.deleteImage(oldImageUrl);
      }

      // Subir nueva imagen
      return await this.uploadImage(file, path, userId);

    } catch (error) {
      console.error('❌ Error in updateImage:', error);
      throw error;
    }
  }

  /**
   * Extraer nombre de archivo de una URL de Supabase Storage
   */
  static extractFileNameFromUrl(url) {
    try {
      const match = url.match(/\/storage\/v1\/object\/public\/restaurant-images\/(.+)$/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('❌ Error extracting filename:', error);
      return null;
    }
  }

  /**
   * Verificar si una URL es de Supabase Storage
   */
  static isSupabaseStorageUrl(url) {
    return url && url.includes('/storage/v1/object/public/restaurant-images/');
  }
}

module.exports = ImageUploadService;