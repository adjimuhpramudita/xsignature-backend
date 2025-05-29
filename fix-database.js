const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'xsignature',
  password: process.env.DB_PASSWORD || 'acer123',
  port: process.env.DB_PORT || 5432,
});

// Function to hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Function to generate initials from name
const generateInitials = (name) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

async function fixDatabase() {
  try {
    console.log('Connecting to database...');
    
    // Check if database is accessible
    const dbCheck = await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    
    // Check if users table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Users table does not exist. Initializing database schema...');
      
      // Read the SQL file
      const sqlFilePath = path.join(__dirname, 'databaase.sql');
      if (!fs.existsSync(sqlFilePath)) {
        console.error('Database SQL file not found:', sqlFilePath);
        return;
      }
      
      const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
      
      // Execute the SQL script
      await pool.query(sqlContent);
      console.log('Database schema initialized successfully');
      
      // Check if users were created
      const usersResult = await pool.query('SELECT id, email, role FROM users');
      console.log(`Created ${usersResult.rows.length} users`);
      
      console.log('\nUsers created:');
      usersResult.rows.forEach(user => {
        console.log(`- ${user.email} (${user.role})`);
      });
      
      console.log('\nAll users have the same default password. You can now run fix-login.js to set a new password.');
    } else {
      // Check if there are any users
      const usersResult = await pool.query('SELECT COUNT(*) FROM users');
      console.log(`Database schema already exists with ${usersResult.rows[0].count} users`);
      
      if (usersResult.rows[0].count === '0') {
        console.log('No users found. You may need to reinitialize the database or run the SQL script manually.');
      } else {
        console.log('Database seems to be properly set up. If you are having login issues, run fix-login.js.');
      }
    }

    // Create sample users if they don't exist
    const sampleUsers = [
      {
        email: 'admin@xsignature.com',
        name: 'Admin Utama',
        role: 'admin',
        password: 'admin123',
        status: 'active'
      },
      {
        email: 'owner@xsignature.com',
        name: 'Pemilik Bengkel',
        role: 'owner',
        password: 'owner123',
        status: 'active'
      },
      {
        email: 'staff@xsignature.com',
        name: 'Staff Pelayanan',
        role: 'staff',
        password: 'staff123',
        status: 'active'
      },
      {
        email: 'mechanic@xsignature.com',
        name: 'Budi Santoso',
        role: 'mechanic',
        password: 'mechanic123',
        status: 'active',
        specialization: 'Engine Repair',
        experience: 5,
        phone: '081234567890'
      },
      {
        email: 'customer@xsignature.com',
        name: 'Joko Widodo',
        role: 'customer',
        password: 'customer123',
        status: 'active',
        phone: '081234567891',
        address: 'Jl. Sudirman No. 123, Jakarta'
      },
      {
        email: 'inactive@xsignature.com',
        name: 'Akun Tidak Aktif',
        role: 'staff',
        password: 'inactive123',
        status: 'inactive'
      },
      {
        email: 'suspended@xsignature.com',
        name: 'Akun Ditangguhkan',
        role: 'staff',
        password: 'suspended123',
        status: 'suspended'
      }
    ];

    console.log('Adding sample users...');
    
    // Begin transaction
    await pool.query('BEGIN');

    for (const user of sampleUsers) {
      // Check if user already exists
      const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [user.email]);
      
      if (userCheck.rows.length === 0) {
        // Hash the password
        const passwordHash = await hashPassword(user.password);
        
        // Generate initials
        const initials = generateInitials(user.name);
        
        // Insert user
        const userResult = await pool.query(`
          INSERT INTO users (email, password_hash, name, role, initials, status, last_login)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [user.email, passwordHash, user.name, user.role, initials, user.status, new Date()]);
        
        const userId = userResult.rows[0].id;
        
        // Add role-specific data
        if (user.role === 'mechanic') {
          await pool.query(`
            INSERT INTO mechanics (user_id, specialization, experience, phone)
            VALUES ($1, $2, $3, $4)
          `, [userId, user.specialization, user.experience, user.phone]);
        } else if (user.role === 'customer') {
          await pool.query(`
            INSERT INTO customers (user_id, phone, address, join_date)
            VALUES ($1, $2, $3, CURRENT_DATE)
          `, [userId, user.phone, user.address]);
        }
        
        console.log(`Added ${user.role}: ${user.name} (${user.email})`);
      } else {
        console.log(`User ${user.email} already exists, skipping...`);
      }
    }
    
    // Commit transaction
    await pool.query('COMMIT');
    
    console.log('Database fix completed successfully!');
  } catch (error) {
    // Rollback transaction on error
    await pool.query('ROLLBACK');
    console.error('Error fixing database:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Fix booking columns
async function checkAndFixBookingColumns() {
  try {
    console.log('Checking booking table columns...');
    
    // Check if booking_date and booking_time columns exist
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bookings'
        AND column_name = 'booking_date'
      ) AS has_booking_date,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bookings'
        AND column_name = 'booking_time'
      ) AS has_booking_time,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bookings'
        AND column_name = 'date'
      ) AS has_date,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bookings'
        AND column_name = 'time'
      ) AS has_time
    `);
    
    if (result.rows.length > 0) {
      const { has_booking_date, has_booking_time, has_date, has_time } = result.rows[0];
      
      if (has_booking_date && has_booking_time) {
        console.log('Booking table has booking_date and booking_time columns.');
        
        if (has_date && has_time) {
          console.log('Redundant date and time columns found. Dropping them...');
          
          await pool.query('BEGIN');
          
          // Copy data if needed
          await pool.query(`
            UPDATE bookings
            SET booking_date = date, booking_time = time
            WHERE booking_date IS NULL
          `);
          
          // Drop columns
          await pool.query('ALTER TABLE bookings DROP COLUMN IF EXISTS date');
          await pool.query('ALTER TABLE bookings DROP COLUMN IF EXISTS time');
          
          await pool.query('COMMIT');
          
          console.log('Redundant columns dropped successfully!');
        }
      } else if (has_date && has_time) {
        console.log('Booking table has date and time columns but missing booking_date and booking_time.');
        console.log('Renaming columns...');
        
        await pool.query('BEGIN');
        
        // Add new columns if they don't exist
        if (!has_booking_date) {
          await pool.query('ALTER TABLE bookings ADD COLUMN booking_date DATE');
        }
        
        if (!has_booking_time) {
          await pool.query('ALTER TABLE bookings ADD COLUMN booking_time TIME');
        }
        
        // Copy data
        await pool.query(`
          UPDATE bookings
          SET booking_date = date, booking_time = time
          WHERE date IS NOT NULL AND time IS NOT NULL
        `);
        
        // Set not null constraint
        await pool.query('ALTER TABLE bookings ALTER COLUMN booking_date SET NOT NULL');
        await pool.query('ALTER TABLE bookings ALTER COLUMN booking_time SET NOT NULL');
        
        // Drop old columns
        await pool.query('ALTER TABLE bookings DROP COLUMN date');
        await pool.query('ALTER TABLE bookings DROP COLUMN time');
        
        await pool.query('COMMIT');
        
        console.log('Columns renamed successfully!');
      }
    }
    
    console.log('Creating/updating necessary database functions...');
    
    // Create booking function for proper column usage
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
        RETURN QUERY INSERT INTO bookings 
          (id, customer_id, service_id, vehicle_id, booking_date, booking_time, status, notes) 
          VALUES (p_booking_id, p_customer_id, p_service_id, p_vehicle_id, p_date, p_time, 'pending', p_notes) 
          RETURNING *;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('Database functions created/updated successfully!');
    
  } catch (error) {
    console.error('Error fixing booking columns:', error);
    await pool.query('ROLLBACK');
  }
}

// Add booking column check and fix to init function
async function init() {
  // ... existing init code ...
  
  await checkAndFixBookingColumns();
  
  // ... rest of existing init code ...
}

fixDatabase(); 