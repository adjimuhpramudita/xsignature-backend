const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'xsignature',
  password: process.env.DB_PASSWORD || 'ganteng',
  port: process.env.DB_PORT || 5432,
});

async function checkAndFixBookings() {
  try {
    console.log('Connecting to database...');
    
    // Check if database is accessible
    const dbCheck = await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    
    // Check bookings table schema
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
    
    // Create a temporary function to handle the date/time column discrepancy
    console.log('\nCreating temporary function to handle date/time conversion...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION create_booking(
        p_booking_id VARCHAR(20),
        p_customer_id INTEGER,
        p_service_id INTEGER,
        p_vehicle_id INTEGER,
        p_date DATE,
        p_time TIME,
        p_notes TEXT
      ) RETURNS SETOF bookings AS $$
      BEGIN
        -- Insert the booking with correct column names
        RETURN QUERY INSERT INTO bookings 
          (id, customer_id, service_id, vehicle_id, booking_date, booking_time, status, notes) 
          VALUES (p_booking_id, p_customer_id, p_service_id, p_vehicle_id, p_date, p_time, 'pending', p_notes) 
          RETURNING *;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('Temporary function created successfully. Use this function in your booking.routes.js file.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    console.log('Connection closed');
  }
}

checkAndFixBookings(); 