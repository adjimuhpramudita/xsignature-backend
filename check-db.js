const { pool } = require('./src/config/db');

async function checkDatabase() {
  try {
    console.log('Connecting to database...');
    
    // Check if bookings table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'bookings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('Bookings table does not exist!');
      process.exit(1);
    }
    
    console.log('Bookings table exists, checking schema...');
    
    // Get table schema
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bookings'
      ORDER BY ordinal_position
    `);
    
    console.log('Bookings table columns:');
    schemaResult.rows.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });
    
    // Try to get one record
    console.log('\nTrying to fetch a sample booking...');
    const bookingResult = await pool.query('SELECT * FROM bookings LIMIT 1');
    
    if (bookingResult.rows.length > 0) {
      console.log('Sample booking:', bookingResult.rows[0]);
    } else {
      console.log('No bookings found in the database.');
    }
    
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await pool.end();
  }
}

checkDatabase(); 