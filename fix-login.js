const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'xsignature',
  password: process.env.DB_PASSWORD || 'ganteng',
  port: process.env.DB_PORT || 5432,
});

async function fixLoginIssue() {
  try {
    console.log('Connecting to database...');
    
    // Check if database is accessible
    const dbCheck = await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    
    // Get all users
    const usersResult = await pool.query('SELECT id, email, password_hash FROM users');
    console.log(`Found ${usersResult.rows.length} users to process`);
    
    // Standard password for all users to simplify testing
    const standardPassword = 'password123';
    
    // Hash the standard password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(standardPassword, salt);
    
    // Update all users with the new password hash
    for (const user of usersResult.rows) {
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, user.id]
      );
      console.log(`Updated user ${user.email} with new password hash`);
    }
    
    console.log('All users have been updated successfully');
    console.log(`All users now have the password: ${standardPassword}`);
    
  } catch (error) {
    console.error('Error fixing login issue:', error);
  } finally {
    pool.end();
  }
}

// Run the function
fixLoginIssue(); 