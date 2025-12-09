-- ===============================================
-- PART 2: Add index to active_table_users
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_active_table_users_restaurant_branch
ON active_table_users (restaurant_id, branch_number);

SELECT 'Part 2 completed: Index created' as status;
