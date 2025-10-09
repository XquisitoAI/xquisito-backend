const restaurantService = require("../services/restaurantService");

// Obtener restaurante por ID
const getRestaurantById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Getting restaurant by ID:", id);

    const restaurant = await restaurantService.getRestaurantById(parseInt(id));

    console.log("✅ Restaurant found:", restaurant.name);
    res.json({
      success: true,
      data: restaurant,
    });
  } catch (error) {
    console.error("❌ Error getting restaurant:", error.message);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        message: "Restaurant not found",
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener menú completo de un restaurante
const getRestaurantMenu = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Getting menu for restaurant:", id);

    const menu = await restaurantService.getRestaurantMenu(parseInt(id));

    console.log(`✅ Menu retrieved successfully with ${menu.length} sections`);
    res.json({
      success: true,
      data: menu,
    });
  } catch (error) {
    console.error("❌ Error getting restaurant menu:", error.message);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        message: "Restaurant not found",
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener restaurante con su menú completo
const getRestaurantWithMenu = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Getting restaurant with complete menu:", id);

    const data = await restaurantService.getRestaurantWithMenu(parseInt(id));

    console.log(`✅ Restaurant and menu retrieved successfully`);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("❌ Error getting restaurant with menu:", error.message);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        message: "Restaurant not found",
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Listar todos los restaurantes activos
const getAllRestaurants = async (req, res) => {
  try {
    console.log("🔍 Getting all active restaurants");

    const restaurants = await restaurantService.getAllRestaurants();

    console.log(`✅ Found ${restaurants.length} active restaurants`);
    res.json({
      success: true,
      data: restaurants,
    });
  } catch (error) {
    console.error("❌ Error getting restaurants:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

module.exports = {
  getRestaurantById,
  getRestaurantMenu,
  getRestaurantWithMenu,
  getAllRestaurants,
};
