const supabase = require("../config/supabase");

class UserService {
  // Obtener información de múltiples usuarios desde Supabase
  async getUsersInfo(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return {};
      }

      // Filtrar IDs válidos (no null, no undefined, no vacíos) y excluir guest IDs
      const validUserIds = userIds.filter(
        (id) =>
          id &&
          typeof id === "string" &&
          id.trim() !== "" &&
          !id.startsWith("guest-")
      );

      if (validUserIds.length === 0) {
        return {};
      }

      // Obtener información de usuarios desde la tabla profiles
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, photo_url, first_name, last_name")
        .in("id", validUserIds);

      if (error) {
        console.error("❌ Error fetching profiles from Supabase:", error);
        throw new Error(`Error fetching profiles: ${error.message}`);
      }

      // Convertir array a objeto {userId: userInfo}
      const usersMap = {};

      if (profiles && profiles.length > 0) {
        profiles.forEach((profile) => {
          usersMap[profile.id] = {
            userId: profile.id,
            imageUrl: profile.photo_url || null,
            firstName: profile.first_name || null,
            lastName: profile.last_name || null,
            fullName:
              profile.first_name && profile.last_name
                ? `${profile.first_name} ${profile.last_name}`
                : profile.first_name || profile.last_name || null,
          };
        });
      }

      // Para usuarios que no se encontraron en profiles, retornar null
      validUserIds.forEach((userId) => {
        if (!usersMap[userId]) {
          console.warn(`⚠️ Profile not found for user ${userId}`);
          usersMap[userId] = {
            userId: userId,
            imageUrl: null,
            firstName: null,
            lastName: null,
            fullName: null,
          };
        }
      });

      return usersMap;
    } catch (error) {
      throw new Error(`Error getting users info: ${error.message}`);
    }
  }
}

module.exports = new UserService();
