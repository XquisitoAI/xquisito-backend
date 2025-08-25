const supabaseService = require('../services/supabaseService');

class AuthController {
  async register(req, res) {
    try {
      const { email, password, ...metadata } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      const result = await supabaseService.registerUser(email, password, metadata);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: result.data.user,
          session: result.data.session
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      const result = await supabaseService.authenticateUser(email, password);
      
      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.data.user,
          session: result.data.session
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async logout(req, res) {
    try {
      const result = await supabaseService.signOut();
      
      return res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getProfile(req, res) {
    try {
      return res.status(200).json({
        success: true,
        data: req.user
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new AuthController();