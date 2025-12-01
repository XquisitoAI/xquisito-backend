const supabase = require("../config/supabase");

class ProfileController {
  // Crear o actualizar perfil del usuario autenticado
  async createOrUpdateProfile(req, res) {
    try {
      const authUser = req.user; // Viene del middleware
      const { email, phone, firstName, lastName, birthDate, gender, photoUrl } =
        req.body;

      if (!firstName || !lastName) {
        return res.status(400).json({
          success: false,
          error: "firstName y lastName son requeridos",
        });
      }

      const validGenders = ["male", "female", "other"];
      if (gender && !validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          error: `El género debe ser uno de: ${validGenders.join(", ")}`,
        });
      }

      const { data: existingProfile, error: findError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (findError && findError.code !== "PGRST116") {
        console.error("❌ Error al comprobar el perfil existente:", findError);
        return res.status(500).json({
          success: false,
          error: "Error al comprobar el perfil existente",
          details: findError,
        });
      }

      let profile;
      let operation;

      if (existingProfile) {
        // Actualizar perfil existente
        const updateData = {
          first_name: firstName,
          last_name: lastName,
          updated_at: new Date().toISOString(),
        };

        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (birthDate !== undefined) updateData.birth_date = birthDate;
        if (gender !== undefined) updateData.gender = gender;
        if (photoUrl !== undefined) updateData.photo_url = photoUrl;

        const { data: updatedProfile, error: updateError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("id", authUser.id)
          .select()
          .single();

        if (updateError) {
          console.error("❌ Error al actualizar el perfil:", updateError);
          return res.status(500).json({
            success: false,
            error: "Error al actualizar el perfil",
            details: updateError,
          });
        }

        profile = updatedProfile;
        operation = "updated";
      } else {
        // Crear nuevo perfil
        const insertData = {
          id: authUser.id,
          first_name: firstName,
          last_name: lastName,
        };

        if (email) insertData.email = email;
        if (phone) insertData.phone = phone;
        if (birthDate) insertData.birth_date = birthDate;
        if (gender) insertData.gender = gender;
        if (photoUrl) insertData.photo_url = photoUrl;

        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert(insertData)
          .select()
          .single();

        if (createError) {
          console.error("❌ Error al crear perfil:", createError);
          return res.status(500).json({
            success: false,
            error: "Error al crear perfil",
            details: createError,
          });
        }

        profile = newProfile;
        operation = "created";
      }

      res.status(operation === "created" ? 201 : 200).json({
        success: true,
        message: `Profile ${operation} successfully`,
        data: {
          profile: {
            id: profile.id,
            email: profile.email,
            phone: profile.phone,
            firstName: profile.first_name,
            lastName: profile.last_name,
            birthDate: profile.birth_date,
            gender: profile.gender,
            photoUrl: profile.photo_url,
            accountType: profile.account_type,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
          },
        },
      });
    } catch (error) {
      console.error("❌ Unexpected error in createOrUpdateProfile:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Obtener perfil del usuario autenticado
  async getMyProfile(req, res) {
    try {
      const authUser = req.user;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({
            success: false,
            error: "Profile not found",
          });
        }

        console.error("❌ Error getting profile:", error);
        return res.status(500).json({
          success: false,
          error: "Error retrieving profile",
        });
      }

      res.json({
        success: true,
        data: {
          profile: {
            id: profile.id,
            email: profile.email,
            phone: profile.phone,
            firstName: profile.first_name,
            lastName: profile.last_name,
            birthDate: profile.birth_date,
            gender: profile.gender,
            photoUrl: profile.photo_url,
            accountType: profile.account_type,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
          },
        },
      });
    } catch (error) {
      console.error("❌ Unexpected error in getMyProfile:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Actualizar perfil del usuario autenticado
  async updateMyProfile(req, res) {
    try {
      const authUser = req.user;
      const updates = req.body;

      delete updates.id;
      delete updates.account_type;
      delete updates.created_at;

      const validGenders = ["male", "female", "other"];
      if (updates.gender && !validGenders.includes(updates.gender)) {
        return res.status(400).json({
          success: false,
          error: `El género debe ser uno de: ${validGenders.join(", ")}`,
        });
      }

      const updateData = {};
      if (updates.firstName !== undefined)
        updateData.first_name = updates.firstName;
      if (updates.lastName !== undefined)
        updateData.last_name = updates.lastName;
      if (updates.birthDate !== undefined)
        updateData.birth_date = updates.birthDate;
      if (updates.gender !== undefined) updateData.gender = updates.gender;
      if (updates.photoUrl !== undefined)
        updateData.photo_url = updates.photoUrl;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.phone !== undefined) updateData.phone = updates.phone;

      updateData.updated_at = new Date().toISOString();

      const { data: profile, error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", authUser.id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({
            success: false,
            error: "Perfil no encontrado",
          });
        }

        console.error("❌ Error al actualizar el perfil:", error);
        return res.status(500).json({
          success: false,
          error: "Error al actualizar el perfil",
        });
      }

      res.json({
        success: true,
        message: "Perfil actualizado exitosamente",
        data: {
          profile: {
            id: profile.id,
            email: profile.email,
            phone: profile.phone,
            firstName: profile.first_name,
            lastName: profile.last_name,
            birthDate: profile.birth_date,
            gender: profile.gender,
            photoUrl: profile.photo_url,
            accountType: profile.account_type,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error inesperado en updateMyProfile:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Subir foto de perfil del usuario autenticado
  async uploadProfilePhoto(req, res) {
    try {
      const authUser = req.user;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No se proporcionó ninguna imagen",
        });
      }

      console.log(`📤 User ${authUser.id} uploading profile photo:`, file.originalname);

      // Obtener foto anterior para eliminarla
      const { data: profile } = await supabase
        .from("profiles")
        .select("photo_url")
        .eq("id", authUser.id)
        .single();

      const oldPhotoUrl = profile?.photo_url;

      // Importar ImageUploadService
      const ImageUploadService = require("../services/imageUploadService");

      // Subir nueva foto
      const photoUrl = await ImageUploadService.updateImage(
        file,
        "profile",
        authUser.id,
        oldPhotoUrl
      );

      // Actualizar el perfil con la nueva URL
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({
          photo_url: photoUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", authUser.id)
        .select()
        .single();

      if (updateError) {
        console.error("❌ Error updating profile with photo URL:", updateError);
        return res.status(500).json({
          success: false,
          error: "Error al actualizar el perfil con la foto",
        });
      }

      console.log(`✅ Profile photo uploaded successfully for user ${authUser.id}`);

      res.json({
        success: true,
        message: "Foto de perfil actualizada exitosamente",
        data: {
          photoUrl: photoUrl,
          profile: {
            id: updatedProfile.id,
            email: updatedProfile.email,
            phone: updatedProfile.phone,
            firstName: updatedProfile.first_name,
            lastName: updatedProfile.last_name,
            birthDate: updatedProfile.birth_date,
            gender: updatedProfile.gender,
            photoUrl: updatedProfile.photo_url,
            accountType: updatedProfile.account_type,
            createdAt: updatedProfile.created_at,
            updatedAt: updatedProfile.updated_at,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error uploading profile photo:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Error al subir la foto de perfil",
      });
    }
  }
}

module.exports = new ProfileController();
