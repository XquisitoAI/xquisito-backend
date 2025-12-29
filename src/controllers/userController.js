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

  // Get user order history (from payment_transactions)
  async getUserOrderHistory(req, res) {
    try {
      const { clerkUserId } = req.params;

      console.log(
        "📝 Getting order history (from payment_transactions) for:",
        clerkUserId
      );

      if (!clerkUserId) {
        return res.status(400).json({
          success: false,
          error: {
            type: "validation_error",
            message: "clerkUserId is required",
          },
        });
      }

      // ========================================
      // 1. Consultar transacciones del usuario
      // ========================================
      const { data: transactions, error: txError } = await supabase
        .from("payment_transactions")
        .select(
          `
          id,
          user_id,
          payment_method_id,
          restaurant_id,
          id_table_order,
          id_tap_orders_and_pay,
          id_pick_and_go_order,
          id_room_order,
          base_amount,
          tip_amount,
          total_amount_charged,
          created_at,
          currency
        `
        )
        .eq("user_id", clerkUserId)
        .order("created_at", { ascending: false });

      if (txError) {
        console.error("❌ Error getting transactions:", txError);
        return res.status(500).json({
          success: false,
          error: {
            type: "database_error",
            message: "Error retrieving history",
            details: txError,
          },
        });
      }

      console.log(`✅ Found ${transactions?.length || 0} transactions`);

      if (!transactions || transactions.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // ========================================
      // 2. Obtener IDs únicos
      // ========================================
      const tableOrderIds = [
        ...new Set(transactions.map((tx) => tx.id_table_order).filter(Boolean)),
      ];
      const tapOrderIds = [
        ...new Set(
          transactions.map((tx) => tx.id_tap_orders_and_pay).filter(Boolean)
        ),
      ];
      const pickAndGoOrdersIds = [
        ...new Set(
          transactions.map((tx) => tx.id_pick_and_go_order).filter(Boolean)
        ),
      ];
      const roomOrderIds = [
        ...new Set(
          transactions.map((tx) => tx.id_room_order).filter(Boolean)
        ),
      ];
      const restaurantIds = [
        ...new Set(transactions.map((tx) => tx.restaurant_id).filter(Boolean)),
      ];
      const paymentMethodIds = [
        ...new Set(
          transactions.map((tx) => tx.payment_method_id).filter(Boolean)
        ),
      ];

      console.log(
        `📊 IDs to fetch: ${tableOrderIds.length} flex_bill_orders, ${tapOrderIds.length} tap_order_and_pay_orders, ${pickAndGoOrdersIds.length} pick_and_go_orders, ${roomOrderIds.length} room_orders`
      );

      // ========================================
      // 3. Consultar Table Orders (Flex Bill)
      // ========================================
      let tableOrdersMap = {};
      if (tableOrderIds.length > 0) {
        const { data: tableOrders } = await supabase
          .from("table_order")
          .select(
            `
            id,
            status,
            created_at,
            total_amount,
            tables!inner(
              table_number,
              restaurant_id
            )
          `
          )
          .in("id", tableOrderIds);

        if (tableOrders) {
          console.log(
            `✅ Fetched ${tableOrders.length} table_orders (Flex Bill)`
          );
          tableOrders.forEach((order) => {
            tableOrdersMap[order.id] = order;
          });
        }

        // Obtener dish_orders de estas table_orders
        // Nota: No filtramos por user_id para mostrar todos los items de la transacción
        console.log(`🔍 Fetching ALL user_orders for table_order_ids:`, tableOrderIds);
        const { data: userOrders, error: userOrdersError } = await supabase
          .from("user_order")
          .select(
            `
            id,
            table_order_id,
            user_id,
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
          .in("table_order_id", tableOrderIds);

        if (userOrdersError) {
          console.error("❌ Error fetching user_orders:", userOrdersError);
        }
        console.log(`✅ Fetched ${userOrders?.length || 0} user_orders with dishes`);

        if (userOrders) {
          // Agregar dishes a cada table_order
          userOrders.forEach((userOrder) => {
            const tableOrderId = userOrder.table_order_id;
            if (tableOrdersMap[tableOrderId]) {
              if (!tableOrdersMap[tableOrderId].dishes) {
                tableOrdersMap[tableOrderId].dishes = [];
              }
              tableOrdersMap[tableOrderId].dishes.push(
                ...(userOrder.dish_order || [])
              );
            }
          });
        }
      }

      // ========================================
      // 4. Consultar Tap Orders (Tap Order & Pay)
      // ========================================
      let tapOrdersMap = {};
      if (tapOrderIds.length > 0) {
        const { data: tapOrders } = await supabase
          .from("tap_orders_and_pay")
          .select(
            `
            id,
            order_status,
            payment_status,
            created_at,
            total_amount,
            tables!inner(
              table_number,
              restaurant_id
            )
          `
          )
          .in("id", tapOrderIds);

        if (tapOrders) {
          console.log(
            `✅ Fetched ${tapOrders.length} tap_orders (Tap Order & Pay)`
          );
          tapOrders.forEach((order) => {
            tapOrdersMap[order.id] = order;
          });
        }

        // Obtener dish_orders de estos tap_orders
        const { data: tapDishes } = await supabase
          .from("dish_order")
          .select(
            `
            id,
            tap_order_id,
            item,
            quantity,
            price,
            status,
            payment_status,
            images,
            custom_fields,
            extra_price
          `
          )
          .in("tap_order_id", tapOrderIds)
          .not("tap_order_id", "is", null);

        if (tapDishes) {
          // Agregar dishes a cada tap_order
          tapDishes.forEach((dish) => {
            const tapOrderId = dish.tap_order_id;
            if (tapOrdersMap[tapOrderId]) {
              if (!tapOrdersMap[tapOrderId].dishes) {
                tapOrdersMap[tapOrderId].dishes = [];
              }
              tapOrdersMap[tapOrderId].dishes.push(dish);
            }
          });
        }
      }

      // ========================================
      // 4. Consultar Pick and Go Orders (Pick & Go)
      // ========================================
      let pickAndGoOrdersMap = {};
      if (pickAndGoOrdersIds.length > 0) {
        const { data: pickOrders } = await supabase
          .from("pick_and_go_orders")
          .select(
            `
            id,
            payment_status,
            order_status,
            created_at,
            total_amount
          `
          )
          .in("id", pickAndGoOrdersIds);

        if (pickOrders) {
          console.log(
            `✅ Fetched ${pickOrders.length} pick_and_go_orders (Pick & Go)`
          );
          pickOrders.forEach((order) => {
            pickAndGoOrdersMap[order.id] = order;
          });
        }

        // Obtener dish_orders de estos tap_orders
        const { data: pickDishes } = await supabase
          .from("dish_order")
          .select(
            `
            id,
            pick_and_go_order_id,
            item,
            quantity,
            price,
            status,
            payment_status,
            images,
            custom_fields,
            extra_price
          `
          )
          .in("pick_and_go_order_id", pickAndGoOrdersIds)
          .not("pick_and_go_order_id", "is", null);

        if (pickDishes) {
          // Agregar dishes a cada tap_order
          pickDishes.forEach((dish) => {
            const pickOrderId = dish.pick_and_go_order_id;
            if (pickAndGoOrdersMap[pickOrderId]) {
              if (!pickAndGoOrdersMap[pickOrderId].dishes) {
                pickAndGoOrdersMap[pickOrderId].dishes = [];
              }
              pickAndGoOrdersMap[pickOrderId].dishes.push(dish);
            }
          });
        }
      }

      // ========================================
      // 5. Consultar Room Orders (Room Service)
      // ========================================
      let roomOrdersMap = {};
      if (roomOrderIds.length > 0) {
        const { data: roomOrders } = await supabase
          .from("room_orders")
          .select(
            `
            id,
            payment_status,
            order_status,
            created_at,
            total_amount,
            rooms!inner(
              room_number,
              restaurant_id
            )
          `
          )
          .in("id", roomOrderIds);

        if (roomOrders) {
          console.log(
            `✅ Fetched ${roomOrders.length} room_orders (Room Service)`
          );
          roomOrders.forEach((order) => {
            roomOrdersMap[order.id] = order;
          });
        }

        // Obtener dish_orders de estos room_orders
        const { data: roomDishes } = await supabase
          .from("dish_order")
          .select(
            `
            id,
            room_order_id,
            item,
            quantity,
            price,
            status,
            payment_status,
            images,
            custom_fields,
            extra_price
          `
          )
          .in("room_order_id", roomOrderIds)
          .not("room_order_id", "is", null);

        if (roomDishes) {
          // Agregar dishes a cada room_order
          roomDishes.forEach((dish) => {
            const roomOrderId = dish.room_order_id;
            if (roomOrdersMap[roomOrderId]) {
              if (!roomOrdersMap[roomOrderId].dishes) {
                roomOrdersMap[roomOrderId].dishes = [];
              }
              roomOrdersMap[roomOrderId].dishes.push(dish);
            }
          });
        }
      }

      // ========================================
      // 6. Consultar Restaurants
      // ========================================
      let restaurantsMap = {};
      if (restaurantIds.length > 0) {
        const { data: restaurants } = await supabase
          .from("restaurants")
          .select("id, name, logo_url")
          .in("id", restaurantIds);

        if (restaurants) {
          restaurants.forEach((r) => {
            restaurantsMap[r.id] = r;
          });
        }
      }

      // ========================================
      // 6. Consultar Payment Methods
      // ========================================
      let paymentMethodsMap = {};
      if (paymentMethodIds.length > 0) {
        const { data: paymentMethods, error: pmError } = await supabase
          .from("user_payment_methods")
          .select("id, card_brand, last_four_digits, card_type")
          .in("id", paymentMethodIds);

        if (paymentMethods) {
          paymentMethods.forEach((pm) => {
            paymentMethodsMap[pm.id] = pm;
          });
        }
      }

      // ========================================
      // 7. Construir historial agrupado por transacción
      // ========================================
      const orderHistory = transactions.map((tx) => {
        const isFlexBill = tx.id_table_order != null;
        const isTapOrder = tx.id_tap_orders_and_pay != null;
        const isPickOrder = tx.id_pick_and_go_order != null;
        const isRoomOrder = tx.id_room_order != null;

        let orderData = null;
        let tableNumber = null;
        let roomNumber = null;
        let orderStatus = null;
        let orderType = null;
        let dishes = [];

        if (isFlexBill) {
          orderData = tableOrdersMap[tx.id_table_order];
          orderType = "flex-bill";
          tableNumber = orderData?.tables?.table_number;
          orderStatus = orderData?.status;
          dishes = orderData?.dishes || [];
        } else if (isTapOrder) {
          orderData = tapOrdersMap[tx.id_tap_orders_and_pay];
          orderType = "tap-order-and-pay";
          tableNumber = orderData?.tables?.table_number;
          orderStatus = orderData?.order_status;
          dishes = orderData?.dishes || [];
        } else if (isPickOrder) {
          orderData = pickAndGoOrdersMap[tx.id_pick_and_go_order];
          orderType = "pick-and-go";
          tableNumber = null; // Pick & Go no tiene mesa
          orderStatus = orderData?.order_status;
          dishes = orderData?.dishes || [];
        } else if (isRoomOrder) {
          orderData = roomOrdersMap[tx.id_room_order];
          orderType = "room-service";
          roomNumber = orderData?.rooms?.room_number;
          orderStatus = orderData?.order_status;
          dishes = orderData?.dishes || [];
        }

        // El restaurant_id viene de la transacción (payment_transactions)
        // Nota: pick_and_go_orders no tiene restaurant_id propio
        const restaurant = restaurantsMap[tx.restaurant_id];
        const paymentMethod = paymentMethodsMap[tx.payment_method_id];

        // Calcular totales de los platos
        const totalQuantity = dishes.reduce(
          (sum, d) => sum + (d.quantity || 0),
          0
        );
        const dishesTotal = dishes.reduce(
          (sum, d) => sum + d.quantity * (d.price + (d.extra_price || 0)),
          0
        );

        return {
          // Transaction info
          transactionId: tx.id,
          orderType,

          // Order info
          tableOrderId:
            tx.id_table_order ||
            tx.id_tap_orders_and_pay ||
            tx.id_pick_and_go_order ||
            tx.id_room_order,
          tableNumber,
          roomNumber,
          tableOrderStatus: orderStatus,
          tableOrderDate: orderData?.created_at || tx.created_at,

          // Restaurant info
          restaurantId: tx.restaurant_id,
          restaurantName: restaurant?.name || "Restaurant Name",
          restaurantLogo: restaurant?.logo_url || null,

          // Payment info
          baseAmount: parseFloat(tx.base_amount),
          tipAmount: parseFloat(tx.tip_amount || 0),
          totalAmount: parseFloat(tx.total_amount_charged),
          currency: tx.currency || "MXN",
          paymentStatus: "paid",

          // Payment method info
          paymentMethodId: tx.payment_method_id,
          paymentCardLastFour: paymentMethod?.last_four_digits || null,
          paymentCardType: paymentMethod?.card_type || null,
          paymentCardBrand: paymentMethod?.card_brand || null,

          // Dishes info (para mostrar en el detalle)
          totalQuantity,
          dishesTotal: parseFloat(dishesTotal.toFixed(2)),
          dishes: dishes.map((d) => ({
            dishOrderId: d.id,
            item: d.item,
            quantity: d.quantity,
            price: d.price,
            totalPrice: d.quantity * (d.price + (d.extra_price || 0)),
            status: d.status,
            paymentStatus: d.payment_status,
            images: d.images || [],
            customFields: d.custom_fields,
            extraPrice: d.extra_price || 0,
          })),

          // Timestamp
          createdAt: tx.created_at,
        };
      });

      console.log(
        `✅ Processed ${orderHistory.length} transactions into history`
      );

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

  // Get user order history (from payment_transactions)
  async getOrderHistory(req, res) {
    try {
      console.log(
        "📝 Getting order history (from payment_transactions) for all users"
      );

      // ========================================
      // 1. Consultar transacciones del usuario
      // ========================================
      const { data: transactions, error: txError } = await supabase
        .from("payment_transactions")
        .select(
          `
          id,
          user_id,
          payment_method_id,
          restaurant_id,
          id_table_order,
          id_tap_orders_and_pay,
          base_amount,
          tip_amount,
          total_amount_charged,
          created_at,
          currency
        `
        )
        .order("created_at", { ascending: false });

      if (txError) {
        console.error("❌ Error getting transactions:", txError);
        return res.status(500).json({
          success: false,
          error: {
            type: "database_error",
            message: "Error retrieving history",
            details: txError,
          },
        });
      }

      console.log(`✅ Found ${transactions?.length || 0} transactions`);

      if (!transactions || transactions.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // ========================================
      // 2. Obtener IDs únicos
      // ========================================
      const tableOrderIds = [
        ...new Set(transactions.map((tx) => tx.id_table_order).filter(Boolean)),
      ];
      const tapOrderIds = [
        ...new Set(
          transactions.map((tx) => tx.id_tap_orders_and_pay).filter(Boolean)
        ),
      ];
      const restaurantIds = [
        ...new Set(transactions.map((tx) => tx.restaurant_id).filter(Boolean)),
      ];
      const paymentMethodIds = [
        ...new Set(
          transactions.map((tx) => tx.payment_method_id).filter(Boolean)
        ),
      ];

      console.log(
        `📊 IDs to fetch: ${tableOrderIds.length} table_orders, ${tapOrderIds.length} tap_orders`
      );

      // ========================================
      // 3. Consultar Table Orders (Flex Bill)
      // ========================================
      let tableOrdersMap = {};
      if (tableOrderIds.length > 0) {
        const { data: tableOrders } = await supabase
          .from("table_order")
          .select(
            `
            id,
            status,
            created_at,
            total_amount,
            tables!inner(
              table_number,
              restaurant_id
            )
          `
          )
          .in("id", tableOrderIds);

        if (tableOrders) {
          console.log(
            `✅ Fetched ${tableOrders.length} table_orders (Flex Bill)`
          );
          tableOrders.forEach((order) => {
            tableOrdersMap[order.id] = order;
          });
        }

        // Obtener dish_orders de estas table_orders
        const { data: userOrders } = await supabase
          .from("user_order")
          .select(
            `
            id,
            table_order_id,
            user_id,
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
          .in("table_order_id", tableOrderIds);

        if (userOrders) {
          // Agregar dishes a cada table_order
          userOrders.forEach((userOrder) => {
            const tableOrderId = userOrder.table_order_id;
            if (tableOrdersMap[tableOrderId]) {
              if (!tableOrdersMap[tableOrderId].dishes) {
                tableOrdersMap[tableOrderId].dishes = [];
              }
              tableOrdersMap[tableOrderId].dishes.push(
                ...(userOrder.dish_order || [])
              );
            }
          });
        }
      }

      // ========================================
      // 4. Consultar Tap Orders (Tap Order & Pay)
      // ========================================
      let tapOrdersMap = {};
      if (tapOrderIds.length > 0) {
        const { data: tapOrders } = await supabase
          .from("tap_orders_and_pay")
          .select(
            `
            id,
            order_status,
            payment_status,
            created_at,
            total_amount,
            tables!inner(
              table_number,
              restaurant_id
            )
          `
          )
          .in("id", tapOrderIds);

        if (tapOrders) {
          console.log(
            `✅ Fetched ${tapOrders.length} tap_orders (Tap Order & Pay)`
          );
          tapOrders.forEach((order) => {
            tapOrdersMap[order.id] = order;
          });
        }

        // Obtener dish_orders de estos tap_orders
        const { data: tapDishes } = await supabase
          .from("dish_order")
          .select(
            `
            id,
            tap_order_id,
            item,
            quantity,
            price,
            status,
            payment_status,
            images,
            custom_fields,
            extra_price
          `
          )
          .in("tap_order_id", tapOrderIds)
          .not("tap_order_id", "is", null);

        if (tapDishes) {
          // Agregar dishes a cada tap_order
          tapDishes.forEach((dish) => {
            const tapOrderId = dish.tap_order_id;
            if (tapOrdersMap[tapOrderId]) {
              if (!tapOrdersMap[tapOrderId].dishes) {
                tapOrdersMap[tapOrderId].dishes = [];
              }
              tapOrdersMap[tapOrderId].dishes.push(dish);
            }
          });
        }
      }

      // ========================================
      // 5. Consultar Restaurants
      // ========================================
      let restaurantsMap = {};
      if (restaurantIds.length > 0) {
        const { data: restaurants } = await supabase
          .from("restaurants")
          .select("id, name, logo_url")
          .in("id", restaurantIds);

        if (restaurants) {
          restaurants.forEach((r) => {
            restaurantsMap[r.id] = r;
          });
        }
      }

      // ========================================
      // 6. Consultar Payment Methods
      // ========================================
      let paymentMethodsMap = {};
      console.log("💳 Payment Method IDs to fetch:", paymentMethodIds);
      if (paymentMethodIds.length > 0) {
        const { data: paymentMethods, error: pmError } = await supabase
          .from("user_payment_methods")
          .select("id, card_brand, last_four_digits, card_type")
          .in("id", paymentMethodIds);

        console.log("💳 Payment Methods fetched:", paymentMethods);
        console.log("💳 Payment Methods error:", pmError);

        if (paymentMethods) {
          paymentMethods.forEach((pm) => {
            paymentMethodsMap[pm.id] = pm;
          });
        }
      }

      // ========================================
      // 7. Construir historial agrupado por transacción
      // ========================================
      const orderHistory = transactions.map((tx) => {
        const isFlexBill = tx.id_table_order != null;
        const isTapOrder = tx.id_tap_orders_and_pay != null;

        let orderData = null;
        let tableNumber = null;
        let orderStatus = null;
        let orderType = null;
        let dishes = [];

        if (isFlexBill) {
          orderData = tableOrdersMap[tx.id_table_order];
          orderType = "flex-bill";
          tableNumber = orderData?.tables?.table_number;
          orderStatus = orderData?.status;
          dishes = orderData?.dishes || [];
        } else if (isTapOrder) {
          orderData = tapOrdersMap[tx.id_tap_orders_and_pay];
          orderType = "tap-order-and-pay";
          tableNumber = orderData?.tables?.table_number;
          orderStatus = orderData?.order_status;
          dishes = orderData?.dishes || [];
        }

        const restaurant = restaurantsMap[tx.restaurant_id];
        const paymentMethod = paymentMethodsMap[tx.payment_method_id];

        console.log(
          `💳 Transaction ${tx.id} - payment_method_id: ${tx.payment_method_id}, paymentMethod found:`,
          paymentMethod
        );

        // Calcular totales de los platos
        const totalQuantity = dishes.reduce(
          (sum, d) => sum + (d.quantity || 0),
          0
        );
        const dishesTotal = dishes.reduce(
          (sum, d) => sum + d.quantity * (d.price + (d.extra_price || 0)),
          0
        );

        return {
          // Transaction info
          transactionId: tx.id,
          orderType,

          // Order info
          tableOrderId: tx.id_table_order || tx.id_tap_orders_and_pay,
          tableNumber,
          tableOrderStatus: orderStatus,
          tableOrderDate: orderData?.created_at || tx.created_at,

          // Restaurant info
          restaurantId: tx.restaurant_id,
          restaurantName: restaurant?.name || "Restaurant Name",
          restaurantLogo: restaurant?.logo_url || null,

          // Payment info
          baseAmount: parseFloat(tx.base_amount),
          tipAmount: parseFloat(tx.tip_amount || 0),
          totalAmount: parseFloat(tx.total_amount_charged),
          currency: tx.currency || "MXN",
          paymentStatus: "paid",

          // Payment method info
          paymentMethodId: tx.payment_method_id,
          paymentCardLastFour: paymentMethod?.last_four_digits || null,
          paymentCardType: paymentMethod?.card_type || null,
          paymentCardBrand: paymentMethod?.card_brand || null,

          // Dishes info (para mostrar en el detalle)
          totalQuantity,
          dishesTotal: parseFloat(dishesTotal.toFixed(2)),
          dishes: dishes.map((d) => ({
            dishOrderId: d.id,
            item: d.item,
            quantity: d.quantity,
            price: d.price,
            totalPrice: d.quantity * (d.price + (d.extra_price || 0)),
            status: d.status,
            paymentStatus: d.payment_status,
            images: d.images || [],
            customFields: d.custom_fields,
            extraPrice: d.extra_price || 0,
          })),

          // Timestamp
          createdAt: tx.created_at,
        };
      });

      console.log(
        `✅ Processed ${orderHistory.length} transactions into history`
      );

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
