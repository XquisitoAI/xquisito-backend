const supabase = require("../config/supabase");

const authenticateSupabaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required",
      });
    }

    const token = authHeader.substring(7);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (!error && user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next();
  }
};

// Guest authentication middleware for users who don't want to register
const guestAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check if user is authenticated
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (!error && user) {
        req.user = user;
        req.isGuest = false;
        return next();
      }
    }

    // If no valid auth, treat as guest user
    // Generate a temporary guest ID based on session/table info
    const guestId =
      req.headers["x-guest-id"] ||
      req.headers["x-table-number"] ||
      `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    req.user = {
      id: guestId,
      email: `guest-${guestId}@xquisito.temp`,
      isGuest: true,
    };
    req.isGuest = true;

    next();
  } catch (error) {
    console.error("Guest auth middleware error:", error);
    // Even if there's an error, continue as guest
    const guestId = `guest-error-${Date.now()}`;
    req.user = {
      id: guestId,
      email: `guest-${guestId}@xquisito.temp`,
      isGuest: true,
    };
    req.isGuest = true;
    next();
  }
};

module.exports = {
  authenticateSupabaseToken,
  optionalAuth,
  guestAuth,
};
