const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'xsignature',
  password: process.env.DB_PASSWORD || 'ganteng',
  port: process.env.DB_PORT || 5432,
});

async function fixVehicles() {
  try {
    console.log('Connecting to database...');
    
    // Check if database is accessible
    const dbCheck = await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    
    // Check vehicles with null customer_id
    const nullVehiclesResult = await pool.query(`
      SELECT v.id, v.make, v.model, v.license_plate 
      FROM vehicles v 
      WHERE v.customer_id IS NULL
    `);
    
    const nullVehicles = nullVehiclesResult.rows;
    console.log(`Found ${nullVehicles.length} vehicles with null customer_id`);
    
    if (nullVehicles.length > 0) {
      // Get a list of customers
      const customersResult = await pool.query(`
        SELECT c.id, u.name, u.email
        FROM customers c
        JOIN users u ON c.user_id = u.id
        ORDER BY u.name
      `);
      
      if (customersResult.rows.length === 0) {
        console.log('No customers found in the database');
        return;
      }
      
      const firstCustomer = customersResult.rows[0];
      console.log(`Will assign all vehicles to customer: ${firstCustomer.name} (${firstCustomer.email}), ID: ${firstCustomer.id}`);
      
      // Begin transaction
      await pool.query('BEGIN');
      
      try {
        // Update all null vehicles to the first customer
        const updateResult = await pool.query(`
          UPDATE vehicles
          SET customer_id = $1
          WHERE customer_id IS NULL
          RETURNING id, make, model, license_plate
        `, [firstCustomer.id]);
        
        console.log(`Successfully assigned ${updateResult.rows.length} vehicles to customer ID ${firstCustomer.id}`);
        console.log('Updated vehicles:');
        updateResult.rows.forEach(vehicle => {
          console.log(`- ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`);
        });
        
        // Commit transaction
        await pool.query('COMMIT');
        console.log('Transaction committed successfully');
      } catch (error) {
        // Rollback transaction on error
        await pool.query('ROLLBACK');
        console.error('Error updating vehicles:', error);
      }
    }
    
    // Check for bookings with missing vehicles
    const missingVehicleBookingsResult = await pool.query(`
      SELECT b.id, b.customer_id, b.service_id, b.vehicle_id,
             u.name AS customer_name, s.name AS service_name
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN services s ON b.service_id = s.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      WHERE v.id IS NULL
    `);
    
    const missingVehicleBookings = missingVehicleBookingsResult.rows;
    console.log(`Found ${missingVehicleBookings.length} bookings with missing vehicles`);
    
    if (missingVehicleBookings.length > 0) {
      console.log('Bookings with missing vehicles:');
      missingVehicleBookings.forEach(booking => {
        console.log(`- Booking ID: ${booking.id}, Customer: ${booking.customer_name}, Service: ${booking.service_name}`);
      });
      
      console.log('\nThese bookings need to be fixed manually or deleted.');
    }
    
    console.log('\nVehicle fix check completed!');
  } catch (error) {
    console.error('Error fixing vehicles:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

fixVehicles(); 