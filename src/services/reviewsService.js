const supabase = require("../config/supabase");

class ReviewsService {
  // Crear una review
  async createReview({ menu_item_id, reviewer_identifier, rating }) {
    try {
      // Validar rating
      if (rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }

      const { data, error } = await supabase
        .from("menu_item_reviews")
        .insert({
          menu_item_id,
          reviewer_identifier,
          rating,
        })
        .select()
        .single();

      if (error) {
        // Manejar constraint de review duplicada
        if (error.code === "23505") {
          throw new Error("You have already reviewed this item");
        }
        throw error;
      }

      // Refrescar estadísticas
      await this.refreshRatingStats();

      return data;
    } catch (error) {
      throw new Error(`Error creating review: ${error.message}`);
    }
  }

  // Obtener reviews de un platillo
  async getReviewsByMenuItem(menuItemId) {
    try {
      const { data, error } = await supabase
        .from("menu_item_reviews")
        .select("*")
        .eq("menu_item_id", menuItemId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Error getting reviews: ${error.message}`);
    }
  }

  // Obtener estadísticas de un platillo
  async getMenuItemStats(menuItemId) {
    try {
      const { data, error } = await supabase
        .from("menu_item_rating_stats")
        .select("*")
        .eq("menu_item_id", menuItemId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data || null;
    } catch (error) {
      throw new Error(`Error getting review stats: ${error.message}`);
    }
  }

  // Obtener review específica de un usuario para un platillo
  async getUserReviewForMenuItem(menuItemId, reviewerIdentifier) {
    try {
      const { data, error } = await supabase
        .from("menu_item_reviews")
        .select("*")
        .eq("menu_item_id", menuItemId)
        .eq("reviewer_identifier", reviewerIdentifier)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data || null;
    } catch (error) {
      throw new Error(`Error getting user review: ${error.message}`);
    }
  }

  // Actualizar una review
  async updateReview(reviewId, reviewerIdentifier, rating) {
    try {
      if (rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }

      // First, verify the review exists and belongs to the user
      const { data: existingReview, error: fetchError } = await supabase
        .from("menu_item_reviews")
        .select("*")
        .eq("id", reviewId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          throw new Error("Review not found");
        }
        throw fetchError;
      }

      // Verify ownership
      if (existingReview.reviewer_identifier !== reviewerIdentifier) {
        console.log("❌ Ownership mismatch!");
        console.log("  Expected:", existingReview.reviewer_identifier);
        console.log("  Received:", reviewerIdentifier);
        throw new Error("Unauthorized to update this review");
      }

      console.log("✅ Ownership verified, updating review...");

      // Now update the review (only using id, since we already verified ownership)
      const { data, error } = await supabase
        .from("menu_item_reviews")
        .update({ rating, updated_at: new Date().toISOString() })
        .eq("id", reviewId)
        .select()
        .single();

      if (error) {
        console.log("❌ Update error:", error);
        throw error;
      }

      console.log("✅ Review updated successfully:", data);

      await this.refreshRatingStats();
      return data;
    } catch (error) {
      throw new Error(`Error updating review: ${error.message}`);
    }
  }

  // Refrescar vista materializada de estadísticas

  async refreshRatingStats() {
    try {
      const { error } = await supabase.rpc("refresh_menu_item_rating_stats");
      if (error) {
        console.error("Error refreshing rating stats:", error);
      }
    } catch (error) {
      console.error("Error refreshing rating stats:", error);
    }
  }
}

module.exports = new ReviewsService();
