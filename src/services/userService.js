const { createClerkClient } = require('@clerk/clerk-sdk-node');

// Initialize Clerk client
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

class UserService {
  /**
   * Obtener información de múltiples usuarios de Clerk
   * @param {string[]} userIds - Array de user IDs de Clerk
   * @returns {Promise<Object>} - Mapa de userId -> {imageUrl, firstName, lastName, fullName}
   */
  async getUsersInfo(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return {};
      }

      // Filtrar IDs válidos (no null, no undefined, no vacíos)
      const validUserIds = userIds.filter(id => id && typeof id === 'string' && id.trim() !== '');

      if (validUserIds.length === 0) {
        return {};
      }

      // Obtener información de cada usuario
      const userPromises = validUserIds.map(async (userId) => {
        try {
          const user = await clerkClient.users.getUser(userId);
          return {
            userId: user.id,
            imageUrl: user.imageUrl || null,
            firstName: user.firstName || null,
            lastName: user.lastName || null,
            fullName: user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}`
              : user.firstName || user.lastName || null,
          };
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error.message);
          return null;
        }
      });

      const users = await Promise.all(userPromises);

      // Convertir array a objeto {userId: userInfo}
      const usersMap = {};
      users.forEach(user => {
        if (user) {
          usersMap[user.userId] = user;
        }
      });

      return usersMap;
    } catch (error) {
      throw new Error(`Error getting users info: ${error.message}`);
    }
  }
}

module.exports = new UserService();