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

// Obtener sucursales de un restaurante
const getRestaurantBranches = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Getting branches for restaurant:", id);

    const branches = await restaurantService.getRestaurantBranches(parseInt(id));

    console.log(`✅ Found ${branches.length} branches for restaurant ${id}`);
    res.json({
      success: true,
      data: branches,
    });
  } catch (error) {
    console.error("❌ Error getting restaurant branches:", error.message);

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

// Validar solo restaurante (Pick & Go)
const validateRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    console.log(`🔍 Validating restaurant ${restaurantId}`);

    // 1. Verificar restaurante
    const restaurant = await restaurantService.getRestaurantById(parseInt(restaurantId));
    if (!restaurant) {
      return res.json({
        success: true,
        data: { valid: false, error: "RESTAURANT_NOT_FOUND" }
      });
    }

    // 2. Verificar que tenga sucursales activas
    const branches = await restaurantService.getRestaurantBranches(parseInt(restaurantId));
    if (branches.length === 0) {
      return res.json({
        success: true,
        data: { valid: false, error: "NO_BRANCHES" }
      });
    }

    console.log(`✅ Restaurant validation successful`);
    res.json({
      success: true,
      data: { valid: true }
    });
  } catch (error) {
    console.error("❌ Error validating restaurant:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Validar restaurante y sucursal (Pick & Go)
const validateRestaurantAndBranch = async (req, res) => {
  try {
    const { restaurantId, branchNumber } = req.params;

    console.log(`🔍 Validating restaurant ${restaurantId}, branch ${branchNumber}`);

    // 1. Verificar restaurante
    const restaurant = await restaurantService.getRestaurantById(parseInt(restaurantId));
    if (!restaurant) {
      return res.json({
        success: true,
        data: { valid: false, error: "RESTAURANT_NOT_FOUND" }
      });
    }

    // 2. Obtener sucursales
    const branches = await restaurantService.getRestaurantBranches(parseInt(restaurantId));
    if (branches.length === 0) {
      return res.json({
        success: true,
        data: { valid: false, error: "NO_BRANCHES" }
      });
    }

    // 3. Verificar que la sucursal existe
    const branch = branches.find(b => b.branch_number === parseInt(branchNumber));
    if (!branch) {
      return res.json({
        success: true,
        data: { valid: false, error: "BRANCH_NOT_FOUND" }
      });
    }

    console.log(`✅ Restaurant and branch validation successful`);
    res.json({
      success: true,
      data: { valid: true }
    });
  } catch (error) {
    console.error("❌ Error validating restaurant and branch:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Validar que restaurante, sucursal y mesa existen (Tap Order & Pay)
const validateRestaurantBranchTable = async (req, res) => {
  try {
    const { restaurantId, branchNumber, tableNumber } = req.params;

    console.log(`🔍 Validating restaurant ${restaurantId}, branch ${branchNumber}, table ${tableNumber}`);

    // 1. Verificar restaurante
    const restaurant = await restaurantService.getRestaurantById(parseInt(restaurantId));
    if (!restaurant) {
      return res.json({
        success: true,
        data: { valid: false, error: "RESTAURANT_NOT_FOUND" }
      });
    }

    // 2. Obtener sucursales
    const branches = await restaurantService.getRestaurantBranches(parseInt(restaurantId));
    if (branches.length === 0) {
      return res.json({
        success: true,
        data: { valid: false, error: "NO_BRANCHES" }
      });
    }

    // 3. Verificar que la sucursal existe
    const branch = branches.find(b => b.branch_number === parseInt(branchNumber));
    if (!branch) {
      return res.json({
        success: true,
        data: { valid: false, error: "BRANCH_NOT_FOUND" }
      });
    }

    // 4. Validar que la mesa existe en la tabla 'tables'
    const tableExists = await restaurantService.validateTable(branch.id, parseInt(tableNumber));
    if (!tableExists) {
      return res.json({
        success: true,
        data: { valid: false, error: "TABLE_NOT_FOUND" }
      });
    }

    console.log(`✅ Validation successful`);
    res.json({
      success: true,
      data: { valid: true }
    });
  } catch (error) {
    console.error("❌ Error validating:", error.message);
    res.status(500).json({
      success: false,
      error: "server_error",
      message: error.message,
    });
  }
};

// Obtener menú de un restaurante por número de sucursal
const getRestaurantMenuByBranch = async (req, res) => {
  try {
    const { id, branchNumber } = req.params;

    console.log(`🔍 Getting menu for restaurant ${id}, branch ${branchNumber}`);

    const menu = await restaurantService.getRestaurantMenu(parseInt(id));

    console.log(`✅ Menu retrieved successfully with ${menu.length} sections`);
    res.json({
      success: true,
      data: menu,
      branch: parseInt(branchNumber),
    });
  } catch (error) {
    console.error("❌ Error getting restaurant menu:", error.message);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        message: "Restaurant or branch not found",
      });
    }

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
  getRestaurantBranches,
  validateRestaurant,
  validateRestaurantAndBranch,
  validateRestaurantBranchTable,
  getRestaurantMenuByBranch,
};
