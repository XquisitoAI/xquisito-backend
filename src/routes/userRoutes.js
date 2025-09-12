const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// POST /api/users - Create or update user from Clerk sign-up
router.post('/', userController.createUser);

// GET /api/users/:clerkUserId - Get user by Clerk ID
router.get('/:clerkUserId', userController.getUserByClerkId);

// PUT /api/users/:clerkUserId - Update user data
router.put('/:clerkUserId', userController.updateUser);

module.exports = router;