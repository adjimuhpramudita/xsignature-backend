const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'xsignature',
  password: process.env.DB_PASSWORD || 'acer123',
  port: process.env.DB_PORT || 5432,
});

async function fixStatusInconsistency() {
  try {
    console.log('Connecting to database...');
    
    // Check if database is accessible
    const dbCheck = await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    
    // Check booking_status type definition
    const typeCheck = await pool.query(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'booking_status'
    `);
    
    console.log('Current booking status values:');
    typeCheck.rows.forEach(row => {
      console.log(`- ${row.enumlabel}`);
    });
    
    // Check if there are any bookings with in-progress status
    const bookingsCheck = await pool.query(`
      SELECT id, status FROM bookings WHERE status = 'in-progress'
    `);
    
    console.log(`\nFound ${bookingsCheck.rows.length} bookings with 'in-progress' status`);
    
    // Create a patch for frontend files to ensure consistency
    console.log('\nCreating patch for frontend files...');
    
    // List of files to check
    const filesToCheck = [
      'src/pages/staff/Dashboard.js',
      'src/pages/staff/Bookings.js',
      'src/pages/customer/Dashboard.js',
      'src/pages/customer/Bookings.js'
    ];
    
    console.log('\nTo fix the status inconsistency issue:');
    console.log('1. Make sure all frontend code uses "in-progress" (with hyphen) instead of "in_progress" (with underscore)');
    console.log('2. Check these files for inconsistencies:');
    filesToCheck.forEach(file => {
      console.log(`   - ${file}`);
    });
    
    console.log('\nReplace any instances of "in_progress" with "in-progress" in the frontend code');
    console.log('Example search and replace:');
    console.log('- Search for: case \'in_progress\':');
    console.log('- Replace with: case \'in-progress\':');
    
    console.log('\nAfter making these changes, restart both the backend and frontend servers');
    
  } catch (error) {
    console.error('Error fixing status inconsistency:', error);
  } finally {
    await pool.end();
  }
}

fixStatusInconsistency(); 