const supabase = require("../config/supabase");

class RestaurantReviewsService {
  // Crear una review de restaurante
  async createRestaurantReview({ restaurant_id, rating }) {
    try {
      // Validar rating
      if (rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }

      const { data, error } = await supabase
        .from("restaurant_reviews")
        .insert({
          restaurant_id,
          rating,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Refrescar estadísticas
      await this.refreshRestaurantRatingStats();

      return data;
    } catch (error) {
      throw new Error(`Error creating restaurant review: ${error.message}`);
    }
  }

  // Obtener reviews de un restaurante
  async getReviewsByRestaurant(restaurantId) {
    try {
      const { data, error } = await supabase
        .from("restaurant_reviews")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Error getting restaurant reviews: ${error.message}`);
    }
  }

  // Obtener estadísticas de un restaurante
  async getRestaurantStats(restaurantId) {
    try {
      const { data, error } = await supabase
        .from("restaurant_rating_stats")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data || null;
    } catch (error) {
      throw new Error(
        `Error getting restaurant review stats: ${error.message}`
      );
    }
  }

  // Refrescar vista materializada de estadísticas
  async refreshRestaurantRatingStats() {
    try {
      const { error } = await supabase.rpc("refresh_restaurant_rating_stats");
      if (error) {
        console.error("Error refreshing restaurant rating stats:", error);
      }
    } catch (error) {
      console.error("Error refreshing restaurant rating stats:", error);
    }
  }
}

module.exports = new RestaurantReviewsService();
