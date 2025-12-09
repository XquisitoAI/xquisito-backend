-- ===============================================
-- PART 3: Add constraints to active_table_users
-- ===============================================

-- Add foreign key
ALTER TABLE active_table_users
ADD CONSTRAINT fk_active_table_users_branch
FOREIGN KEY (restaurant_id, branch_number)
REFERENCES branches(restaurant_id, branch_number)
ON DELETE CASCADE;

-- Add unique constraint
ALTER TABLE active_table_users
ADD CONSTRAINT unique_user_per_restaurant_branch_table
UNIQUE (restaurant_id, branch_number, table_number, user_id, guest_name);

SELECT 'Part 3 completed: Constraints added' as status;
