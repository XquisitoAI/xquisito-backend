const { createClerkClient } = require('@clerk/clerk-sdk-node');

// Initialize Clerk client with secret key
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

const authenticateClerkToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7);

    try {
      // Verify the Clerk JWT token
      const decoded = await clerkClient.verifyToken(token);

      if (!decoded || !decoded.sub) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Get user info from Clerk
      const user = await clerkClient.users.getUser(decoded.sub);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      // Set user info in request
      req.user = {
        id: user.id, // This is the clerk_user_id
        email: user.emailAddresses[0]?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        isGuest: false
      };
      req.isGuest = false;

      console.log('✅ Clerk user authenticated:', user.id);
      next();
    } catch (clerkError) {
      console.error('❌ Clerk token verification failed:', clerkError);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Optional Clerk authentication - allows both authenticated and guest users
const optionalClerkAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        // Try to verify Clerk token
        const decoded = await clerkClient.verifyToken(token);

        if (decoded && decoded.sub) {
          const user = await clerkClient.users.getUser(decoded.sub);

          if (user) {
            req.user = {
              id: user.id,
              email: user.emailAddresses[0]?.emailAddress,
              firstName: user.firstName,
              lastName: user.lastName,
              isGuest: false
            };
            req.isGuest = false;
            console.log('✅ Optional Clerk auth successful for user:', user.id);
            return next();
          }
        }
      } catch (clerkError) {
        console.log('ℹ️ Clerk token verification failed, continuing as guest:', clerkError.message);
      }
    }

    // If no valid auth, treat as guest user
    const guestId = req.headers['x-guest-id'] ||
                   req.headers['x-table-number'] ||
                   `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    req.user = {
      id: guestId,
      email: `guest-${guestId}@xquisito.temp`,
      isGuest: true
    };
    req.isGuest = true;

    console.log('👥 Continuing as guest user:', guestId);
    next();
  } catch (error) {
    console.error('❌ Optional auth middleware error:', error);
    // Even if there's an error, continue as guest
    const guestId = `guest-error-${Date.now()}`;
    req.user = {
      id: guestId,
      email: `guest-${guestId}@xquisito.temp`,
      isGuest: true
    };
    req.isGuest = true;
    next();
  }
};

module.exports = {
  authenticateClerkToken,
  optionalClerkAuth
};