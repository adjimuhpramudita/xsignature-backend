const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin, isAdminOrOwner } = require('../middleware/auth.middleware');
const { logActivity } = require('../middleware/activity.middleware');
const upload = require('../middleware/upload.middleware');

// Get all users (admin only)
router.get('/', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    // Check if search, role, or pagination filters are provided
    const { search, role, page, limit } = req.query;
    
    // Set default pagination values
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = parseInt(limit) || 10;
    const offset = (currentPage - 1) * itemsPerPage;
    
    // First, get count for pagination
    let countQuery = `SELECT COUNT(*) FROM users WHERE 1=1`;
    const countParams = [];
    let paramCounter = 1;
    
    // Apply search filter to count if provided
    if (search) {
      countQuery += ` AND (name ILIKE $${paramCounter} OR email ILIKE $${paramCounter})`;
      countParams.push(`%${search}%`);
      paramCounter++;
    }
    
    // Apply role filter to count if provided
    if (role && Array.isArray(role)) {
      countQuery += ` AND role IN (${role.map((_, i) => `$${paramCounter + i}`).join(', ')})`;
      countParams.push(...role);
      paramCounter += role.length;
    } else if (role) {
      countQuery += ` AND role = $${paramCounter}`;
      countParams.push(role);
      paramCounter++;
    }
    
    const countResult = await db.query(countQuery, countParams);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Now, get the actual data
    let query = `
      SELECT id, email, name, role, avatar_url, initials, status, last_login, created_at 
      FROM users 
      WHERE 1=1
    `;
    
    const queryParams = [];
    paramCounter = 1;
    
    // Apply search filter if provided
    if (search) {
      query += ` AND (name ILIKE $${paramCounter} OR email ILIKE $${paramCounter})`;
      queryParams.push(`%${search}%`);
      paramCounter++;
    }
    
    // Apply role filter if provided
    if (role && Array.isArray(role)) {
      query += ` AND role IN (${role.map((_, i) => `$${paramCounter + i}`).join(', ')})`;
      queryParams.push(...role);
      paramCounter += role.length;
    } else if (role) {
      query += ` AND role = $${paramCounter}`;
      queryParams.push(role);
      paramCounter++;
    }
    
    query += ' ORDER BY name';
    
    // Add pagination
    if (page) {
      query += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
      queryParams.push(itemsPerPage, offset);
    }
    
    console.log('Executing user query:', { query, params: queryParams });
    
    const result = await db.query(query, queryParams);
    
    // Add bookings count for each user
    const usersWithExtras = await Promise.all(
      result.rows.map(async (user) => {
        // Get booking count for customers
        if (user.role === 'customer') {
          try {
            const customerResult = await db.query(
              `SELECT id FROM customers WHERE user_id = $1`,
              [user.id]
            );
            
            if (customerResult.rows.length > 0) {
              const customerId = customerResult.rows[0].id;
              const bookingsResult = await db.query(
                `SELECT COUNT(*) FROM bookings WHERE customer_id = $1`,
                [customerId]
              );
              user.bookings = parseInt(bookingsResult.rows[0].count);
            } else {
              user.bookings = 0;
            }
          } catch (err) {
            console.error(`Error getting booking count for user ${user.id}:`, err);
            user.bookings = 0;
          }
        } else {
          user.bookings = 0;
        }
        
        return user;
      })
    );
    
    // Return with pagination info
    res.json({
      users: usersWithExtras,
      pagination: {
        currentPage,
        itemsPerPage,
        totalItems,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
});

// Get users by role (admin/staff only)
router.get('/role/:role', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { role } = req.params;
  
  // Validate role
  const validRoles = ['admin', 'staff', 'mechanic', 'customer', 'owner'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role specified' });
  }
  
  try {
    const result = await db.query(
      'SELECT id, email, name, role, avatar_url, initials, status, last_login, created_at FROM users WHERE role = $1 ORDER BY name',
      [role]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching ${role} users:`, error);
    res.status(500).json({ message: `Server error while fetching ${role} users` });
  }
});

// Get user by ID
router.get('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  
  // Only allow admins/staff to view other users, or users to view themselves
  if (req.user.role !== 'admin' && req.user.role !== 'staff' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ message: 'Not authorized to view this user' });
  }
  
  try {
    const userResult = await db.query(
      'SELECT id, email, name, role, avatar_url, initials, status, last_login, created_at FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Get additional data based on role
    let additionalData = {};
    
    if (user.role === 'mechanic') {
      const mechanicResult = await db.query(
        'SELECT m.*, u.name FROM mechanics m JOIN users u ON m.user_id = u.id WHERE m.user_id = $1',
        [id]
      );
      if (mechanicResult.rows.length > 0) {
        additionalData.mechanic = mechanicResult.rows[0];
      }
    } else if (user.role === 'customer') {
      const customerResult = await db.query(
        'SELECT c.*, u.name FROM customers c JOIN users u ON c.user_id = u.id WHERE c.user_id = $1',
        [id]
      );
      if (customerResult.rows.length > 0) {
        additionalData.customer = customerResult.rows[0];
      }
    }
    
    res.json({
      ...user,
      ...additionalData
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error while fetching user' });
  }
});

// Create new user (admin only)
router.post('/', 
  verifyToken, 
  isAdmin, 
  logActivity('create', (req) => `Created new ${req.body.role} user: ${req.body.name} (${req.body.email})`),
  async (req, res) => {
  const { email, password, name, role, status = 'active' } = req.body;
  
  // Validate required fields
  if (!email || !password || !name || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  
  // Validate role
  const validRoles = ['admin', 'staff', 'mechanic', 'customer', 'owner'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role specified' });
  }
  
  try {
    // Check if email already exists
    const emailCheck = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    
    // Generate initials from name
    const initials = name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Begin transaction
    await db.query('BEGIN');
    
    // Insert user
    const userResult = await db.query(
      'INSERT INTO users (email, password_hash, name, role, initials, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, passwordHash, name, role, initials, status]
    );
    
    const userId = userResult.rows[0].id;
    
    // If mechanic or customer, create additional record
    if (role === 'mechanic') {
      const { experience, phone } = req.body;
      
      if (!experience) {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: 'Experience is required for mechanics' });
      }
      
      await db.query(
        'INSERT INTO mechanics (user_id, experience, phone) VALUES ($1, $2, $3)',
        [userId, experience, phone]
      );
    } else if (role === 'customer') {
      const { phone, address } = req.body;
      
      await db.query(
        'INSERT INTO customers (user_id, phone, address, join_date) VALUES ($1, $2, $3, CURRENT_DATE)',
        [userId, phone, address]
      );
    }
    
    // Commit transaction
    await db.query('COMMIT');
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: userId,
        email,
        name,
        role,
        initials,
        status
      }
    });
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Server error while creating user' });
  }
});

// Update user (admin only for full update, users can update some of their own fields)
router.put('/:id', 
  verifyToken, 
  logActivity('update', (req) => `Updated user ID ${req.params.id}`),
  async (req, res) => {
  const { id } = req.params;
  const { name, email, status, role } = req.body;
  
  // Only allow admins to update other users, or users to update themselves
  const isOwnProfile = req.user.id === parseInt(id);
  const isAdmin = req.user.role === 'admin';
  
  if (!isAdmin && !isOwnProfile) {
    return res.status(403).json({ message: 'Not authorized to update this user' });
  }
  
  try {
    // Check if user exists
    const userCheck = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Begin transaction
    await db.query('BEGIN');
    
    // Build update query based on provided fields and permissions
    let updateFields = [];
    let queryParams = [];
    let paramCounter = 1;
    
    if (name) {
      updateFields.push(`name = $${paramCounter}`);
      queryParams.push(name);
      paramCounter++;
      
      // Update initials if name changes
      const initials = name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
      
      updateFields.push(`initials = $${paramCounter}`);
      queryParams.push(initials);
      paramCounter++;
    }
    
    if (email) {
      // Check if email is already in use by another user
      const emailCheck = await db.query(
        'SELECT * FROM users WHERE email = $1 AND id != $2',
        [email, id]
      );
      
      if (emailCheck.rows.length > 0) {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: 'Email already in use by another user' });
      }
      
      updateFields.push(`email = $${paramCounter}`);
      queryParams.push(email);
      paramCounter++;
    }
    
    // Only admins can update status and role
    if (isAdmin) {
      if (status) {
        updateFields.push(`status = $${paramCounter}`);
        queryParams.push(status);
        paramCounter++;
      }
      
      if (role) {
        updateFields.push(`role = $${paramCounter}`);
        queryParams.push(role);
        paramCounter++;
      }
    }
    
    // Update password if provided
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(req.body.password, salt);
      
      updateFields.push(`password_hash = $${paramCounter}`);
      queryParams.push(passwordHash);
      paramCounter++;
    }
    
    // If no fields to update
    if (updateFields.length === 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    // Add ID to params
    queryParams.push(id);
    
    // Update user
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCounter} 
      RETURNING id, email, name, role, avatar_url, initials, status
    `;
    
    const userResult = await db.query(updateQuery, queryParams);
    
    // If admin is updating a mechanic or customer, update their specific tables too
    if (isAdmin) {
      const updatedUser = userResult.rows[0];
      
      if (role === 'mechanic' || userCheck.rows[0].role === 'mechanic') {
        const { experience, phone } = req.body;
        
        // Check if mechanic record exists
        const mechanicCheck = await db.query(
          'SELECT * FROM mechanics WHERE user_id = $1',
          [id]
        );
        
        if (mechanicCheck.rows.length > 0) {
          // Update existing mechanic
          if (experience || phone) {
            let mechanicUpdateFields = [];
            let mechanicParams = [];
            let mechanicParamCounter = 1;
            
            if (experience) {
              mechanicUpdateFields.push(`experience = $${mechanicParamCounter}`);
              mechanicParams.push(experience);
              mechanicParamCounter++;
            }
            
            if (phone) {
              mechanicUpdateFields.push(`phone = $${mechanicParamCounter}`);
              mechanicParams.push(phone);
              mechanicParamCounter++;
            }
            
            if (mechanicUpdateFields.length > 0) {
              mechanicParams.push(id);
              
              await db.query(
                `UPDATE mechanics 
                SET ${mechanicUpdateFields.join(', ')}, updated_at = NOW() 
                WHERE user_id = $${mechanicParamCounter}`,
                mechanicParams
              );
            }
          }
        } else if (role === 'mechanic') {
          // Create new mechanic record if role changed to mechanic
          if (!experience) {
            await db.query('ROLLBACK');
            return res.status(400).json({ message: 'Experience is required for mechanics' });
          }
          
          await db.query(
            'INSERT INTO mechanics (user_id, experience, phone) VALUES ($1, $2, $3)',
            [id, experience, phone || null]
          );
        }
      }
      
      if (role === 'customer' || userCheck.rows[0].role === 'customer') {
        const { phone, address } = req.body;
        
        // Check if customer record exists
        const customerCheck = await db.query(
          'SELECT * FROM customers WHERE user_id = $1',
          [id]
        );
        
        if (customerCheck.rows.length > 0) {
          // Update existing customer
          if (phone || address) {
            let customerUpdateFields = [];
            let customerParams = [];
            let customerParamCounter = 1;
            
            if (phone) {
              customerUpdateFields.push(`phone = $${customerParamCounter}`);
              customerParams.push(phone);
              customerParamCounter++;
            }
            
            if (address) {
              customerUpdateFields.push(`address = $${customerParamCounter}`);
              customerParams.push(address);
              customerParamCounter++;
            }
            
            if (customerUpdateFields.length > 0) {
              customerParams.push(id);
              
              await db.query(
                `UPDATE customers 
                SET ${customerUpdateFields.join(', ')}, updated_at = NOW() 
                WHERE user_id = $${customerParamCounter}`,
                customerParams
              );
            }
          }
        } else if (role === 'customer') {
          // Create new customer record if role changed to customer
          await db.query(
            'INSERT INTO customers (user_id, phone, address, join_date) VALUES ($1, $2, $3, CURRENT_DATE)',
            [id, phone || null, address || null]
          );
        }
      }
    }
    
    // Commit transaction
    await db.query('COMMIT');
    
    res.json({
      message: 'User updated successfully',
      user: userResult.rows[0]
    });
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Server error while updating user' });
  }
});

// Update user avatar
router.put('/:id/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  const { id } = req.params;
  
  // Only allow admins to update other users, or users to update themselves
  if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ message: 'Not authorized to update this user' });
  }
  
  try {
    // Check if user exists
    const userCheck = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Update avatar URL
    const avatarUrl = `/uploads/${req.file.filename}`;
    
    const result = await db.query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url',
      [avatarUrl, id]
    );
    
    res.json({
      message: 'Avatar updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).json({ message: 'Server error while updating avatar' });
  }
});

// Delete user (admin only)
router.delete('/:id', 
  verifyToken, 
  isAdmin, 
  logActivity('delete', (req) => `Attempted to delete user ID ${req.params.id}`),
  async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if user exists
    const userCheck = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent deleting own account
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    // Store user role for reference
    const userRole = userCheck.rows[0].role;
    console.log(`Deleting user ID ${id} with role ${userRole}`);
    
    // Delete each dependency one by one with error handling for each
    
    // STEP 1: Handle user_activity_logs - this is the constraint that was causing the error
    try {
      await db.query('DELETE FROM user_activity_logs WHERE user_id = $1', [id]);
      console.log('Deleted user activity logs');
    } catch (error) {
      console.log('Error deleting user activity logs:', error.message);
      // Continue with deletion even if this fails
    }
    
    // STEP 2: Update any references to this user in bookings
    try {
      await db.query('UPDATE bookings SET created_by = NULL WHERE created_by = $1', [id]);
      console.log('Updated bookings created_by references');
    } catch (error) {
      console.log('No bookings to update or column does not exist');
    }
    
    // STEP 3: Delete notifications if they exist
    try {
      await db.query('DELETE FROM notifications WHERE user_id = $1', [id]);
      console.log('Deleted notifications');
    } catch (error) {
      console.log('No notifications to delete');
    }
    
    // STEP 4: Handle customer-specific data
    if (userRole === 'customer') {
      // Find customer ID
      let customerId = null;
      try {
        const customerResult = await db.query('SELECT id FROM customers WHERE user_id = $1', [id]);
        if (customerResult.rows.length > 0) {
          customerId = customerResult.rows[0].id;
          console.log(`Found customer ID ${customerId}`);
        }
      } catch (error) {
        console.log('Error finding customer ID:', error.message);
      }
      
      if (customerId) {
        // Delete customer bookings
        try {
          await db.query('DELETE FROM bookings WHERE customer_id = $1', [customerId]);
          console.log(`Deleted bookings for customer ID ${customerId}`);
        } catch (error) {
          console.log('Error deleting bookings:', error.message);
          try {
            // Try to nullify the reference instead
            await db.query('UPDATE bookings SET customer_id = NULL WHERE customer_id = $1', [customerId]);
            console.log('Updated bookings to NULL reference');
          } catch (innerError) {
            console.log('Could not update bookings:', innerError.message);
          }
        }
        
        // Delete customer testimonials
        try {
          await db.query('DELETE FROM testimonials WHERE customer_id = $1', [customerId]);
          console.log('Deleted testimonials');
        } catch (error) {
          console.log('No testimonials to delete');
        }
        
        // Delete customer vehicles
        try {
          await db.query('DELETE FROM vehicles WHERE customer_id = $1', [customerId]);
          console.log('Deleted vehicles');
        } catch (error) {
          console.log('No vehicles to delete');
        }
        
        // Delete customer record
        try {
          await db.query('DELETE FROM customers WHERE id = $1', [customerId]);
          console.log(`Deleted customer record ID ${customerId}`);
        } catch (error) {
          console.log('Error deleting customer:', error.message);
          return res.status(500).json({ message: 'Cannot delete user with active customer records' });
        }
      }
    }
    
    // STEP 5: Handle mechanic-specific data
    if (userRole === 'mechanic') {
      // Find mechanic ID
      let mechanicId = null;
      try {
        const mechanicResult = await db.query('SELECT id FROM mechanics WHERE user_id = $1', [id]);
        if (mechanicResult.rows.length > 0) {
          mechanicId = mechanicResult.rows[0].id;
          console.log(`Found mechanic ID ${mechanicId}`);
        }
      } catch (error) {
        console.log('Error finding mechanic ID:', error.message);
      }
      
      if (mechanicId) {
        // Update bookings to remove reference to this mechanic
        try {
          await db.query('UPDATE bookings SET mechanic_id = NULL WHERE mechanic_id = $1', [mechanicId]);
          console.log('Updated bookings to NULL mechanic reference');
        } catch (error) {
          console.log('Error updating bookings:', error.message);
        }
        
        // Delete mechanic record
        try {
          await db.query('DELETE FROM mechanics WHERE id = $1', [mechanicId]);
          console.log(`Deleted mechanic record ID ${mechanicId}`);
        } catch (error) {
          console.log('Error deleting mechanic:', error.message);
          return res.status(500).json({ message: 'Cannot delete user with active mechanic records' });
        }
      }
    }
    
    // STEP 6: Clean up additional references
    // Activity logs
    try {
      await db.query('DELETE FROM activity_logs WHERE user_id = $1', [id]);
      console.log('Deleted activity logs');
    } catch (error) {
      console.log('No activity logs to delete');
    }
    
    // Auth tokens
    try {
      await db.query('DELETE FROM tokens WHERE user_id = $1', [id]);
      console.log('Deleted tokens');
    } catch (error) {
      console.log('No tokens to delete');
    }
    
    // Messages
    try {
      await db.query('DELETE FROM messages WHERE sender_id = $1 OR recipient_id = $1', [id]);
      console.log('Deleted messages');
    } catch (error) {
      console.log('No messages to delete');
    }
    
    // STEP 7: Delete any other possible references
    // Possible staff records
    try {
      await db.query('DELETE FROM staff WHERE user_id = $1', [id]);
      console.log('Deleted staff record');
    } catch (error) {
      console.log('No staff record to delete');
    }
    
    // FINAL STEP: Delete the user
    try {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
      console.log(`Successfully deleted user ID ${id}`);
      return res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      // Check if there are any remaining foreign key constraints
      if (error.constraint) {
        console.log(`Foreign key constraint violation: ${error.constraint}`);
        // Try to identify and handle the specific constraint
        const constraintName = error.constraint;
        try {
          if (constraintName.includes('activity')) {
            // If it's an activity log constraint
            await db.query('UPDATE user_activity_logs SET user_id = NULL WHERE user_id = $1', [id]);
            // Try deleting again
            await db.query('DELETE FROM users WHERE id = $1', [id]);
            console.log(`Successfully deleted user ID ${id} after handling constraint ${constraintName}`);
            return res.json({ message: 'User deleted successfully' });
          }
        } catch (constraintError) {
          console.error('Error handling constraint:', constraintError);
        }
      }
      
      return res.status(500).json({ 
        message: 'Error deleting user, may have remaining dependencies',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Fatal error deleting user:', error);
    return res.status(500).json({ message: 'Server error while deleting user' });
  }
});

module.exports = router; 