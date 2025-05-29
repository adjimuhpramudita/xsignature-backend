const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'xsignature',
  password: process.env.DB_PASSWORD || 'ganteng',
  port: process.env.DB_PORT || 5432,
});

async function fixBookings() {
  try {
    console.log('Connecting to database...');
    
    // Check if database is accessible
    const dbCheck = await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    
    // Create the stored procedure for booking creation
    console.log('Creating booking function...');
    
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
    
    console.log('Booking function created successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    console.log('Connection closed');
  }
}

fixBookings(); 