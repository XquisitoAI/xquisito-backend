const express = require('express');
const authController = require('../controllers/authController');
const { authenticateSupabaseToken } = require('../middleware/supabaseAuth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/profile', authenticateSupabaseToken, authController.getProfile);

module.exports = router;