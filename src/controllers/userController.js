const supabase = require('../config/supabase');

class UserController {
  // Create or update user from Clerk sign-up
  async createUser(req, res) {
    try {
      const {
        clerkUserId,
        email,
        firstName,
        lastName,
        age,
        gender,
        phone
      } = req.body;


      // Validate required fields
      if (!clerkUserId || !email || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: 'clerkUserId, email, firstName, and lastName are required'
          }
        });
      }

      // Validate age range
      if (age && (age < 18 || age > 100)) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: 'Age must be between 18 and 100'
          }
        });
      }

      // Validate gender options
      const validGenders = ['male', 'female', 'non-binary', 'prefer-not-to-say'];
      if (gender && !validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: `Gender must be one of: ${validGenders.join(', ')}`
          }
        });
      }

      // Check if user already exists
      const { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .single();

      if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('❌ Error checking existing user:', findError);
        return res.status(500).json({
          success: false,
          error: {
            type: 'database_error',
            message: 'Error checking existing user',
            details: findError
          }
        });
      }

      let user;
      let operation;

      if (existingUser) {
        // Update existing user
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            email,
            first_name: firstName,
            last_name: lastName,
            age: age || null,
            gender: gender || null,
            phone: phone || null,
            updated_at: new Date().toISOString()
          })
          .eq('clerk_user_id', clerkUserId)
          .select()
          .single();

        if (updateError) {
          console.error('❌ Error updating user:', updateError);
          return res.status(500).json({
            success: false,
            error: {
              type: 'database_error',
              message: 'Error updating user',
              details: updateError
            }
          });
        }

        user = updatedUser;
        operation = 'updated';
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            clerk_user_id: clerkUserId,
            email,
            first_name: firstName,
            last_name: lastName,
            age: age || null,
            gender: gender || null,
            phone: phone || null
          })
          .select()
          .single();

        if (createError) {
          console.error('❌ Error creating user:', createError);
          return res.status(500).json({
            success: false,
            error: {
              type: 'database_error',
              message: 'Error creating user',
              details: createError
            }
          });
        }

        user = newUser;
        operation = 'created';
      }


      res.status(operation === 'created' ? 201 : 200).json({
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
          updatedAt: user.updated_at
        }
      });

    } catch (error) {
      console.error('❌ Unexpected error in createUser:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'server_error',
          message: 'Internal server error',
          details: error.message
        }
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
            type: 'validation_error',
            message: 'clerkUserId is required'
          }
        });
      }


      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows found
          return res.status(404).json({
            success: false,
            error: {
              type: 'not_found',
              message: 'User not found'
            }
          });
        }

        console.error('❌ Error getting user:', error);
        return res.status(500).json({
          success: false,
          error: {
            type: 'database_error',
            message: 'Error retrieving user',
            details: error
          }
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
          updatedAt: user.updated_at
        }
      });

    } catch (error) {
      console.error('❌ Unexpected error in getUserByClerkId:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'server_error',
          message: 'Internal server error',
          details: error.message
        }
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
            type: 'validation_error',
            message: 'clerkUserId is required'
          }
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
            type: 'validation_error',
            message: 'Age must be between 18 and 100'
          }
        });
      }

      // Validate gender if provided
      const validGenders = ['male', 'female', 'non-binary', 'prefer-not-to-say'];
      if (updates.gender && !validGenders.includes(updates.gender)) {
        return res.status(400).json({
          success: false,
          error: {
            type: 'validation_error',
            message: `Gender must be one of: ${validGenders.join(', ')}`
          }
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
        .from('users')
        .update(updates)
        .eq('clerk_user_id', clerkUserId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows found
          return res.status(404).json({
            success: false,
            error: {
              type: 'not_found',
              message: 'User not found'
            }
          });
        }

        console.error('❌ Error updating user:', error);
        return res.status(500).json({
          success: false,
          error: {
            type: 'database_error',
            message: 'Error updating user',
            details: error
          }
        });
      }


      res.json({
        success: true,
        message: 'User updated successfully',
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
          updatedAt: user.updated_at
        }
      });

    } catch (error) {
      console.error('❌ Unexpected error in updateUser:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'server_error',
          message: 'Internal server error',
          details: error.message
        }
      });
    }
  }
}

module.exports = new UserController();