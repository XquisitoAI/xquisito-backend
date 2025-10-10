const supabase = require("../config/supabase");
const userService = require("../services/userService");

class UserController {
  // Create or update user from Clerk sign-up
  async createUser(req, res) {
    try {
      const { clerkUserId, email, firstName, lastName, age, gender, phone } =
        req.body;

      // Validate required fields
      if (!clerkUserId || !email || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "clerkUserId, email, firstName, and lastName are required",
          },
        });
      }

      // Validate age range
      if (age && (age < 18 || age > 100)) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Age must be between 18 and 100",
          },
        });
      }

      // Validate gender options
      const validGenders = [
        "male",
        "female",
        "non-binary",
        "prefer-not-to-say",
      ];
      if (gender && !validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: `Gender must be one of: ${validGenders.join(", ")}`,
          },
        });
      }

      // Check if user already exists
      const { data: existingUser, error: findError } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_user_id", clerkUserId)
        .single();

      if (findError && findError.code !== "PGRST116") {
        // PGRST116 = no rows found
        console.error("❌ Error checking existing user:", findError);
        return res.status(500).json({
          success: false,
          error: {
            type: "database_error",
            message: "Error checking existing user",
            details: findError,
          },
        });
      }

      let user;
      let operation;

      if (existingUser) {
        // Update existing user
        const { data: updatedUser, error: updateError } = await supabase
          .from("users")
          .update({
            email,
            first_name: firstName,
            last_name: lastName,
            age: age || null,
            gender: gender || null,
            phone: phone || null,
            updated_at: new Date().toISOString(),
          })
          .eq("clerk_user_id", clerkUserId)
          .select()
          .single();

        if (updateError) {
          console.error("❌ Error updating user:", updateError);
          return res.status(500).json({
            success: false,
            error: {
              type: "database_error",
              message: "Error updating user",
              details: updateError,
            },
          });
        }

        user = updatedUser;
        operation = "updated";
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabase
          .from("users")
          .insert({
            clerk_user_id: clerkUserId,
            email,
            first_name: firstName,
            last_name: lastName,
            age: age || null,
            gender: gender || null,
            phone: phone || null,
          })
          .select()
          .single();

        if (createError) {
          console.error("❌ Error creating user:", createError);
          return res.status(500).json({
            success: false,
            error: {
              type: "database_error",
              message: "Error creating user",
              details: createError,
            },
          });
        }

        user = newUser;
        operation = "created";
      }

      res.status(operation === "created" ? 201 : 200).json({
        success: true,
        message: `User ${operation} successfully`,
        user: {
          id: user.id,
          clerkUserId: user.clerk_user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          age: user.age,
          gender: user.gender,
          phone: user.phone,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
      });
    } catch (error) {
      console.error("❌ Unexpected error in createUser:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "server_error",
          message: "Internal server error",
          details: error.message,
        },
      });
    }
  }

  // Get user by Clerk ID
  async getUserByClerkId(req, res) {
    try {
      const { clerkUserId } = req.params;

      if (!clerkUserId) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "clerkUserId is required",
          },
        });
      }

      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_user_id", clerkUserId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows found
          return res.status(404).json({
            success: false,
            error: {
              type: "not_found",
              message: "User not found",
            },
          });
        }

        console.error("❌ Error getting user:", error);
        return res.status(500).json({
          success: false,
          error: {
            type: "database_error",
            message: "Error retrieving user",
            details: error,
          },
        });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          clerkUserId: user.clerk_user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          age: user.age,
          gender: user.gender,
          phone: user.phone,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
      });
    } catch (error) {
      console.error("❌ Unexpected error in getUserByClerkId:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "server_error",
          message: "Internal server error",
          details: error.message,
        },
      });
    }
  }

  /**
   * Obtener información de usuarios (principalmente imágenes)
   * POST body: { userIds: string[] }
   */
  async getUsersInfo(req, res) {
    try {
      const { userIds } = req.body;

      if (!Array.isArray(userIds)) {
        return res.status(400).json({
          success: false,
          message: "userIds debe ser un array",
        });
      }

      const usersInfo = await userService.getUsersInfo(userIds);

      res.json({
        success: true,
        data: usersInfo,
      });
    } catch (error) {
      console.error("Error getting users info:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Update user data
  async updateUser(req, res) {
    try {
      const { clerkUserId } = req.params;
      const updates = req.body;

      if (!clerkUserId) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "clerkUserId is required",
          },
        });
      }

      // Remove fields that shouldn't be updated directly
      delete updates.id;
      delete updates.clerk_user_id;
      delete updates.created_at;

      // Validate age if provided
      if (updates.age && (updates.age < 18 || updates.age > 100)) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "Age must be between 18 and 100",
          },
        });
      }

      // Validate gender if provided
      const validGenders = [
        "male",
        "female",
        "non-binary",
        "prefer-not-to-say",
      ];
      if (updates.gender && !validGenders.includes(updates.gender)) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: `Gender must be one of: ${validGenders.join(", ")}`,
          },
        });
      }

      // Convert firstName/lastName to database field names
      if (updates.firstName) {
        updates.first_name = updates.firstName;
        delete updates.firstName;
      }
      if (updates.lastName) {
        updates.last_name = updates.lastName;
        delete updates.lastName;
      }

      updates.updated_at = new Date().toISOString();

      const { data: user, error } = await supabase
        .from("users")
        .update(updates)
        .eq("clerk_user_id", clerkUserId)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows found
          return res.status(404).json({
            success: false,
            error: {
              type: "not_found",
              message: "User not found",
            },
          });
        }

        console.error("❌ Error updating user:", error);
        return res.status(500).json({
          success: false,
          error: {
            type: "database_error",
            message: "Error updating user",
            details: error,
          },
        });
      }

      res.json({
        success: true,
        message: "User updated successfully",
        user: {
          id: user.id,
          clerkUserId: user.clerk_user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          age: user.age,
          gender: user.gender,
          phone: user.phone,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
      });
    } catch (error) {
      console.error("❌ Unexpected error in updateUser:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "server_error",
          message: "Internal server error",
          details: error.message,
        },
      });
    }
  }

  // Get user order history
  async getUserOrderHistory(req, res) {
    try {
      const { clerkUserId } = req.params;

      console.log("📝 Getting order history for clerkUserId:", clerkUserId);

      if (!clerkUserId) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "clerkUserId is required",
          },
        });
      }

      // First, get the user's internal ID
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .single();

      if (userError) {
        console.error("❌ Error finding user:", userError);
        return res.status(404).json({
          success: false,
          error: {
            type: "not_found",
            message: "User not found",
            details: userError,
          },
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            type: "not_found",
            message: "User not found",
          },
        });
      }

      // Get all user_orders for this user with their dishes and restaurant info
      const { data: userOrders, error: ordersError } = await supabase
        .from("user_order")
        .select(
          `
          id,
          user_id,
          guest_name,
          payment_method_id,
          payment_card_last_four,
          payment_card_type,
          table_order!inner(
            id,
            status,
            created_at,
            tables!inner(
              table_number,
              restaurant_id,
              restaurants(
                id,
                name,
                logo_url
              )
            )
          ),
          dish_order(
            id,
            item,
            quantity,
            price,
            status,
            payment_status,
            images,
            custom_fields,
            extra_price
          )
        `
        )
        .eq("user_id", clerkUserId);

      if (ordersError) {
        console.error("❌ Error getting user orders:", ordersError);
        return res.status(500).json({
          success: false,
          error: {
            type: "database_error",
            message: "Error retrieving order history",
            details: ordersError,
          },
        });
      }

      console.log(`✅ Found ${userOrders?.length || 0} user orders`);

      // Transform and flatten the data
      const orderHistory = [];
      (userOrders || []).forEach((userOrder) => {
        if (userOrder.dish_order && userOrder.dish_order.length > 0) {
          userOrder.dish_order.forEach((dish) => {
            const restaurant = userOrder.table_order.tables.restaurants;
            orderHistory.push({
              dishOrderId: dish.id,
              item: dish.item,
              quantity: dish.quantity,
              price: dish.price,
              totalPrice:
                dish.quantity * (dish.price + (dish.extra_price || 0)),
              status: dish.status,
              paymentStatus: dish.payment_status,
              images: dish.images || [],
              customFields: dish.custom_fields,
              extraPrice: dish.extra_price || 0,
              createdAt: userOrder.created_at,
              tableNumber: userOrder.table_order.tables.table_number,
              tableOrderId: userOrder.table_order.id,
              tableOrderStatus: userOrder.table_order.status,
              tableOrderDate: userOrder.table_order.created_at,
              // Restaurant information
              restaurantId: restaurant?.id || null,
              restaurantName: restaurant?.name || "Restaurant Name",
              restaurantLogo: restaurant?.logo_url || null,
              // Payment method information
              paymentMethodId: userOrder.payment_method_id,
              paymentCardLastFour: userOrder.payment_card_last_four,
              paymentCardType: userOrder.payment_card_type,
            });
          });
        }
      });

      res.json({
        success: true,
        data: orderHistory,
      });
    } catch (error) {
      console.error("❌ Unexpected error in getUserOrderHistory:", error);
      res.status(500).json({
        success: false,
        error: {
          type: "server_error",
          message: "Internal server error",
          details: error.message,
        },
      });
    }
  }
}

module.exports = new UserController();
