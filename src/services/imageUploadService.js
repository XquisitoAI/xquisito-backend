const supabase = require("../config/supabase");
const multer = require('multer');
const sharp = require('sharp');

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
   * Convertir imagen a JPG si es WebP (para compatibilidad con MMS)
   */
  static async convertToJpgIfNeeded(buffer, mimetype) {
    try {
      // Si es WebP, convertir a JPG para compatibilidad con MMS
      if (mimetype === 'image/webp') {
        console.log('🔄 Converting WebP to JPG for MMS compatibility');
        const jpgBuffer = await sharp(buffer)
          .jpeg({ quality: 90 })
          .toBuffer();
        return {
          buffer: jpgBuffer,
          mimetype: 'image/jpeg',
          extension: 'jpg'
        };
      }

      // Para otros formatos, mantener el original
      const ext = mimetype.split('/')[1] || 'jpg';
      return {
        buffer,
        mimetype,
        extension: ext === 'jpeg' ? 'jpg' : ext
      };
    } catch (error) {
      console.error('❌ Error converting image:', error);
      // Si falla la conversión, devolver el original
      return {
        buffer,
        mimetype,
        extension: mimetype.split('/')[1] || 'jpg'
      };
    }
  }

  /**
   * Subir imagen al storage de Supabase
   */
  static async uploadImage(file, path, userId) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }

      // Convertir a JPG si es necesario (para compatibilidad MMS)
      const { buffer, mimetype, extension } = await this.convertToJpgIfNeeded(
        file.buffer,
        file.mimetype
      );

      // Generar nombre único para el archivo
      const fileName = `${path}_${userId}_${Date.now()}.${extension}`;

      console.log('📤 Uploading image:', fileName, `(${mimetype})`);

      // Subir archivo al storage
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(fileName, buffer, {
          contentType: mimetype,
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