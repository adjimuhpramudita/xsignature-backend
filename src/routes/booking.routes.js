const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin, isMechanic, isCustomer } = require('../middleware/auth.middleware');

// Get all bookings (admin/staff only)
router.get('/', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { status, date, mechanic_id, page, pageSize, term } = req.query;
  
  try {
    let query = `
      SELECT b.*, 
             s.name AS service_name, 
             s.price AS service_price,
             c.id AS customer_id, 
             u.name AS customer_name,
             c.phone AS customer_phone,
             v.make, v.model, v.year, v.license_plate,
             m.id AS mechanic_id,
             mu.name AS mechanic_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      LEFT JOIN users mu ON m.user_id = mu.id
    `;
    
    const queryParams = [];
    let conditions = [];
    
    // Skip 'all' status since we want all records
    if (status && status !== 'all') {
      queryParams.push(status);
      conditions.push(`b.status = $${queryParams.length}`);
    }
    
    if (date) {
      queryParams.push(date);
      conditions.push(`b.booking_date = $${queryParams.length}`);
    }
    
    if (mechanic_id) {
      queryParams.push(mechanic_id);
      conditions.push(`b.mechanic_id = $${queryParams.length}`);
    }
    
    // Add search term if provided
    if (term) {
      queryParams.push(`%${term}%`);
      conditions.push(`(u.name ILIKE $${queryParams.length} OR s.name ILIKE $${queryParams.length})`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Add sorting
    query += ' ORDER BY b.booking_date DESC, b.booking_time DESC';
    
    // Add pagination if specified
    if (page && pageSize) {
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(parseInt(pageSize), offset);
    }
    
    console.log('Executing booking query:', { query, params: queryParams });
    
    const result = await db.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Server error while fetching bookings' });
  }
});

// Get booking by ID
router.get('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const bookingResult = await db.query(
      `SELECT b.*, 
              s.name AS service_name, 
              s.price AS service_price,
              s.estimated_time,
              c.id AS customer_id, 
              u.name AS customer_name,
              u.email AS customer_email,
              c.phone AS customer_phone,
              v.make, v.model, v.year, v.license_plate,
              m.id AS mechanic_id,
              mu.name AS mechanic_name
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN vehicles v ON b.vehicle_id = v.id
       LEFT JOIN mechanics m ON b.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE b.id = $1`,
      [id]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Check permissions
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    const isAssignedMechanic = req.user.role === 'mechanic' && req.user.mechanic_id === booking.mechanic_id;
    const isBookingCustomer = req.user.role === 'customer' && req.user.customer_id === booking.customer_id;
    
    if (!isAdminOrStaff && !isAssignedMechanic && !isBookingCustomer) {
      return res.status(403).json({ message: 'Not authorized to view this booking' });
    }
    
    // Get mechanic tasks if admin/staff or assigned mechanic
    if (isAdminOrStaff || isAssignedMechanic) {
      const tasksResult = await db.query(
        'SELECT * FROM mechanic_tasks WHERE booking_id = $1',
        [id]
      );
      booking.tasks = tasksResult.rows;
      
      // Get field notes
      const notesResult = await db.query(
        'SELECT * FROM field_notes WHERE booking_id = $1 ORDER BY date, time',
        [id]
      );
      booking.field_notes = notesResult.rows;
    }
    
    // Get customer messages
    const messagesResult = await db.query(
      'SELECT * FROM customer_messages WHERE booking_id = $1 ORDER BY date, time',
      [id]
    );
    booking.messages = messagesResult.rows;
    
    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ message: 'Server error while fetching booking' });
  }
});

// Get customer bookings (for customer)
router.get('/customer/my-bookings', verifyToken, isCustomer, async (req, res) => {
  try {
    console.log('Fetching bookings for customer ID:', req.user.customer_id);
    
    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;
    const status = req.query.status; // Get status filter
    
    // Build the query based on filters
    let countQuery = `SELECT COUNT(*) AS total FROM bookings WHERE customer_id = $1`;
    let queryParams = [req.user.customer_id];
    
    // Add status filter if provided
    if (status) {
      countQuery += ` AND status = $${queryParams.length + 1}`;
      queryParams.push(status);
    }
    
    // Count total bookings for pagination info
    const countResult = await db.query(countQuery, queryParams);
    
    const totalBookings = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalBookings / pageSize);
    
    // Reset params and build the full query
    let query = `
      SELECT b.*, 
              s.name AS service_name, 
              s.price AS service_price,
              v.make, v.model, v.year, v.license_plate,
              m.id AS mechanic_id,
              mu.name AS mechanic_name,
              mu.id AS mechanic_user_id,
              COALESCE(b.customer_name, u.name) AS customer_name
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN vehicles v ON b.vehicle_id = v.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       LEFT JOIN mechanics m ON b.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE b.customer_id = $1
    `;
    
    queryParams = [req.user.customer_id];
    
    // Add status filter if provided
    if (status) {
      query += ` AND b.status = $${queryParams.length + 1}`;
      queryParams.push(status);
    }
    
    // Add sorting and pagination
    query += ` ORDER BY b.booking_date DESC, b.booking_time DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(pageSize, offset);
    
    // Get bookings with pagination
    const result = await db.query(query, queryParams);
    
    // Add debug logging to understand what's happening
    console.log(`Sending ${result.rows.length} bookings to client:`, result.rows[0]);
    
    // Log customer_name data for debugging
    if (result.rows.length > 0) {
      for (const booking of result.rows) {
        console.log(`Booking ${booking.id} customer name data:`, {
          customer_name: booking.customer_name,
          user_name: booking.user_name,
          final_name: booking.customer_name || 'No customer name'
        });
      }
    }
    
    // Rename columns for backward compatibility
    for (const booking of result.rows) {
      if (booking.booking_date !== undefined) {
        booking.date = booking.booking_date;
      }
      
      if (booking.booking_time !== undefined) {
        booking.time = booking.booking_time;
      }
      
      // Ensure vehicle fields are included
      if (!booking.make && booking.vehicle_id) {
        console.log(`Need to fetch vehicle details for booking ${booking.id} (vehicle_id: ${booking.vehicle_id})`);
        try {
          const vehicleResult = await db.query('SELECT make, model, year, license_plate FROM vehicles WHERE id = $1', [booking.vehicle_id]);
          if (vehicleResult.rows.length > 0) {
            const vehicle = vehicleResult.rows[0];
            booking.make = vehicle.make;
            booking.model = vehicle.model;
            booking.year = vehicle.year;
            booking.license_plate = vehicle.license_plate;
          }
        } catch (err) {
          console.error(`Failed to fetch vehicle details: ${err.message}`);
        }
      }
      
      // Fetch related bookings (made at the same time) to get all services
      if (booking.id) {
        try {
          const relatedBookingsQuery = `
            SELECT b.id, s.name AS service_name, s.price AS service_price
            FROM bookings b 
            JOIN services s ON b.service_id = s.id
            WHERE b.customer_id = $1 
            AND b.booking_date = $2 
            AND b.booking_time = $3
            AND b.vehicle_id = $4`;
          
          const relatedParams = [
            booking.customer_id, 
            booking.booking_date, 
            booking.booking_time,
            booking.vehicle_id
          ];
          
          const relatedBookings = await db.query(relatedBookingsQuery, relatedParams);
          
          if (relatedBookings.rows.length > 1) {
            // Multiple services were booked at the same time
            booking.related_bookings = relatedBookings.rows.map(b => b.id);
            booking.all_services = relatedBookings.rows.map(b => b.service_name);
            booking.all_services_prices = relatedBookings.rows.map(b => b.service_price);
            
            // Calculate total price of all services
            booking.total_services_price = relatedBookings.rows.reduce(
              (sum, b) => sum + parseFloat(b.service_price || 0), 
              0
            );
            
            console.log(`Booking ${booking.id} has related services:`, booking.all_services);
            console.log(`Booking ${booking.id} total services price:`, booking.total_services_price);
          }
        } catch (err) {
          console.error(`Failed to fetch related bookings: ${err.message}`);
        }
      }
    }
    
    // Add debugging to verify data structure
    if (result.rows.length > 0) {
      console.log('First booking sample:', {
        id: result.rows[0].id,
        booking_date: result.rows[0].booking_date,
        date: result.rows[0].date,
        booking_time: result.rows[0].booking_time,
        time: result.rows[0].time,
        service_name: result.rows[0].service_name
      });
    }
    
    console.log('Found', result.rows.length, 'bookings on page', page, 'of', totalPages);
    
    // Debug mechanics data in the response
    if (result.rows.length > 0) {
      for (const booking of result.rows) {
        console.log(`Booking ${booking.id} mechanic data:`, {
          mechanic_id: booking.mechanic_id,
          mechanic_name: booking.mechanic_name,
          mechanic_user_id: booking.mechanic_user_id
        });
        
        // If mechanic_id exists but mechanic_name is missing, try to fetch it directly
        if (booking.mechanic_id && !booking.mechanic_name) {
          try {
            const mechanicResult = await db.query(
              `SELECT m.id, u.name, u.id AS user_id 
               FROM mechanics m 
               JOIN users u ON m.user_id = u.id 
               WHERE m.id = $1`,
              [booking.mechanic_id]
            );
            
            if (mechanicResult.rows.length > 0) {
              console.log(`Found mechanic data for booking ${booking.id}:`, mechanicResult.rows[0]);
              booking.mechanic_name = mechanicResult.rows[0].name;
              booking.mechanic_user_id = mechanicResult.rows[0].user_id;
            } else {
              console.log(`No mechanic found for id ${booking.mechanic_id}`);
            }
          } catch (err) {
            console.error(`Error fetching mechanic data for booking ${booking.id}:`, err);
          }
        }
      }
    }
    
    // Return paginated result with metadata
    res.json({
      bookings: result.rows,
      pagination: {
        totalItems: totalBookings,
        totalPages: totalPages,
        currentPage: page,
        pageSize: pageSize,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching customer bookings:', error);
    res.status(500).json({ message: 'Server error while fetching customer bookings' });
  }
});

// Get mechanic bookings (for mechanic)
router.get('/mechanic/my-tasks', verifyToken, isMechanic, async (req, res) => {
  const { date, status } = req.query;
  
  try {
    let query = `
      SELECT b.*, 
             s.name AS service_name, 
             s.price AS service_price,
             s.estimated_time,
             c.id AS customer_id, 
             u.name AS customer_name,
             v.make, v.model, v.license_plate,
             mt.status AS task_status,
             mt.start_time,
             mt.end_time
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      JOIN mechanic_tasks mt ON b.id = mt.booking_id
      WHERE b.mechanic_id = $1
    `;
    
    const queryParams = [req.user.mechanic_id];
    
    // Add filters if provided
    if (date) {
      queryParams.push(date);
      query += ` AND b.booking_date = $${queryParams.length}`;
    }
    
    if (status) {
      queryParams.push(status);
      query += ` AND b.status = $${queryParams.length}`;
    }
    
    query += ' ORDER BY b.booking_date, b.booking_time';
    
    const result = await db.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic tasks:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic tasks' });
  }
});

// Get mechanic assigned bookings with pagination (for mechanic)
router.get('/mechanic/assigned-bookings', verifyToken, isMechanic, async (req, res) => {
  try {
    console.log('Fetching bookings for mechanic ID:', req.user.mechanic_id);
    
    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;
    const status = req.query.status; // Get status filter
    
    // Build the query based on filters
    let countQuery = `SELECT COUNT(*) AS total FROM bookings WHERE mechanic_id = $1`;
    let queryParams = [req.user.mechanic_id];
    
    // Add status filter if provided
    if (status) {
      countQuery += ` AND status = $${queryParams.length + 1}`;
      queryParams.push(status);
    }
    
    // Count total bookings for pagination info
    const countResult = await db.query(countQuery, queryParams);
    
    const totalBookings = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalBookings / pageSize);
    
    // Reset params and build the full query
    let query = `
      SELECT b.*, 
              s.name AS service_name, 
              s.price AS service_price,
              s.estimated_time,
              c.id AS customer_id, 
              u.name AS customer_name,
              u.email AS customer_email,
              c.phone AS customer_phone,
              v.make, v.model, v.year, v.license_plate
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN vehicles v ON b.vehicle_id = v.id
       WHERE b.mechanic_id = $1
    `;
    
    queryParams = [req.user.mechanic_id];
    
    // Add status filter if provided
    if (status) {
      query += ` AND b.status = $${queryParams.length + 1}`;
      queryParams.push(status);
    }
    
    // Add sorting and pagination
    query += ` ORDER BY b.booking_date DESC, b.booking_time DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(pageSize, offset);
    
    // Get bookings with pagination
    const result = await db.query(query, queryParams);
    
    console.log('Found', result.rows.length, 'mechanic bookings on page', page, 'of', totalPages);
    
    // Return paginated result with metadata
    res.json({
      bookings: result.rows,
      pagination: {
        totalItems: totalBookings,
        totalPages: totalPages,
        currentPage: page,
        pageSize: pageSize,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching mechanic bookings:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic bookings' });
  }
});

// Create new booking
router.post('/', verifyToken, async (req, res) => {
  const { 
    service_id, 
    vehicle_id, 
    date, 
    time, 
    notes,
    mechanic_id,
    customer_name,
    payment_method,
    is_down_payment,
    down_payment_percent,
    down_payment_amount
  } = req.body;
  
  console.log('Received booking request:', req.body);
  console.log('User:', req.user);
  console.log('Data types:', {
    service_id: typeof service_id,
    vehicle_id: typeof vehicle_id,
    date: typeof date,
    time: typeof time,
    notes: typeof notes,
    mechanic_id: typeof mechanic_id,
    customer_name: typeof customer_name,
    payment_method: typeof payment_method,
    is_down_payment: typeof is_down_payment,
    down_payment_percent: typeof down_payment_percent,
    down_payment_amount: typeof down_payment_amount
  });
  console.log('Values:', { 
    service_id, 
    vehicle_id, 
    date, 
    time, 
    notes, 
    mechanic_id, 
    customer_name,
    payment_method,
    is_down_payment,
    down_payment_percent,
    down_payment_amount
  });
  
  // Validate required fields
  if (!service_id || !vehicle_id || !date || !time) {
    console.log('Missing required fields:', { service_id, vehicle_id, date, time });
    return res.status(400).json({ message: 'Service, vehicle, date and time are required' });
  }
  
  try {
    // Check if service exists and is in stock
    console.log('Checking service:', service_id);
    const serviceCheck = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [service_id]
    );
    
    console.log('Service check result:', serviceCheck.rows);
    
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    if (!serviceCheck.rows[0].in_stock) {
      return res.status(400).json({ message: 'Service is currently unavailable' });
    }
    
    // For customers, check if the vehicle belongs to them
    let customer_id;
    
    if (req.user.role === 'customer') {
      customer_id = req.user.customer_id;
      console.log('Customer ID from token:', customer_id);
      
      // Check vehicle ownership
      console.log('Checking vehicle ownership:', vehicle_id, customer_id);
      const vehicleCheck = await db.query(
        'SELECT * FROM vehicles WHERE id = $1',
        [vehicle_id]
      );
      
      console.log('Vehicle check result:', vehicleCheck.rows);
      
      if (vehicleCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Vehicle not found' });
      }
      
      // If this is a new vehicle being created during booking, customer_id might be null
      // so we need to update it
      if (vehicleCheck.rows[0].customer_id === null) {
        await db.query(
          'UPDATE vehicles SET customer_id = $1 WHERE id = $2',
          [customer_id, vehicle_id]
        );
      } else if (vehicleCheck.rows[0].customer_id !== customer_id) {
        return res.status(403).json({ message: 'Vehicle does not belong to this customer' });
      }
    } else if (req.user.role === 'admin' || req.user.role === 'staff') {
      // Admin/staff can create booking for any customer
      customer_id = req.body.customer_id;
      
      if (!customer_id) {
        return res.status(400).json({ message: 'Customer ID is required for admin/staff booking creation' });
      }
      
      // Check if vehicle exists
      const vehicleCheck = await db.query(
        'SELECT * FROM vehicles WHERE id = $1',
        [vehicle_id]
      );
      
      if (vehicleCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Vehicle not found' });
      }
      
      // If vehicle doesn't belong to the customer, update it
      if (vehicleCheck.rows[0].customer_id !== customer_id) {
        await db.query(
          'UPDATE vehicles SET customer_id = $1 WHERE id = $2',
          [customer_id, vehicle_id]
        );
      }
    } else {
      return res.status(403).json({ message: 'Not authorized to create bookings' });
    }
    
    // Generate booking ID
    console.log('Generating booking ID');
    const bookingIdResult = await db.query('SELECT generate_booking_id()');
    const booking_id = bookingIdResult.rows[0].generate_booking_id;
    console.log('Generated booking ID:', booking_id);
    
    // Begin transaction
    await db.query('BEGIN');
    
    try {
      // Check if customer_name column exists in bookings table
      const columnCheck = await db.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'bookings' 
          AND column_name = 'customer_name'
        );
      `);
      
      const columnExists = columnCheck.rows[0].exists;
      
      // If customer_name column doesn't exist, add it
      if (!columnExists) {
        console.log('Adding customer_name column to bookings table');
        await db.query(`
          ALTER TABLE bookings 
          ADD COLUMN customer_name VARCHAR(255);
        `);
      }
      
      // Prepare mechanic_id if provided
      const mechanic_id_param = mechanic_id ? parseInt(mechanic_id, 10) : null;
      console.log('Using mechanic_id for booking:', mechanic_id_param);
      
      // Create booking
      console.log('Creating booking with data:', {
        booking_id, customer_id, service_id, vehicle_id, date, time, notes, mechanic_id: mechanic_id_param, customer_name
      });
      
      // Decide which function to call based on whether mechanic_id is provided
      let bookingResult;
      if (mechanic_id_param) {
        console.log('Creating booking with mechanic assigned');
        // Insert booking directly to include customer_name
        bookingResult = await db.query(
          `INSERT INTO bookings 
           (id, customer_id, service_id, vehicle_id, booking_date, booking_time, mechanic_id, notes, customer_name) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
           RETURNING *`,
          [booking_id, customer_id, service_id, vehicle_id, date, time, mechanic_id_param, notes, customer_name]
        );
      } else {
        console.log('Creating booking without mechanic assigned');
        // Insert booking directly to include customer_name
        bookingResult = await db.query(
          `INSERT INTO bookings 
           (id, customer_id, service_id, vehicle_id, booking_date, booking_time, notes, customer_name) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
           RETURNING *`,
          [booking_id, customer_id, service_id, vehicle_id, date, time, notes, customer_name]
        );
      }
      
      console.log('Booking created:', bookingResult.rows[0]);
    
      // Save payment information if provided
      if (payment_method) {
        try {
          // Check if booking_payments table exists
          const tableCheck = await db.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = 'booking_payments'
            );
          `);
          
          const tableExists = tableCheck.rows[0].exists;
          
          if (tableExists) {
            // Convert boolean to PostgreSQL boolean
            const isDownPaymentBool = is_down_payment === true || is_down_payment === 'true';
            
            // Create payment record
            await db.query(
              `INSERT INTO booking_payments 
              (booking_id, payment_method, is_down_payment, down_payment_percent, down_payment_amount, payment_status) 
              VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                booking_id, 
                payment_method, 
                isDownPaymentBool, 
                isDownPaymentBool ? down_payment_percent : 0, 
                isDownPaymentBool ? down_payment_amount : 0,
                'pending'
              ]
            );
            
            console.log('Payment information saved for booking:', booking_id);
          } else {
            // Table doesn't exist, create it first
            console.log('booking_payments table does not exist, creating it...');
            
            await db.query(`
              CREATE TABLE IF NOT EXISTS booking_payments (
                id SERIAL PRIMARY KEY,
                booking_id VARCHAR(20) REFERENCES bookings(id) ON DELETE CASCADE,
                payment_method VARCHAR(50) NOT NULL,
                is_down_payment BOOLEAN DEFAULT false,
                down_payment_percent INTEGER,
                down_payment_amount DECIMAL(10,2),
                payment_status VARCHAR(20) DEFAULT 'pending',
                admin_notes TEXT,
                payment_date TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
              );
            `);
            
            // Now insert the payment record
            const isDownPaymentBool = is_down_payment === true || is_down_payment === 'true';
            
            await db.query(
              `INSERT INTO booking_payments 
              (booking_id, payment_method, is_down_payment, down_payment_percent, down_payment_amount, payment_status) 
              VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                booking_id, 
                payment_method, 
                isDownPaymentBool, 
                isDownPaymentBool ? down_payment_percent : 0, 
                isDownPaymentBool ? down_payment_amount : 0,
                'pending'
              ]
            );
            
            console.log('Created booking_payments table and saved payment information');
          }
        } catch (error) {
          console.error('Error saving payment information:', error);
          // Continue with the booking process even if payment info saving fails
        }
      }
    
      // Update customer total_bookings
      await db.query(
        'UPDATE customers SET total_bookings = total_bookings + 1, updated_at = NOW() WHERE id = $1',
        [customer_id]
      );
      
      // Commit transaction
      await db.query('COMMIT');
      
      res.status(201).json({
        message: 'Booking created successfully',
        booking: bookingResult.rows[0]
      });
    } catch (innerError) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      console.error('Error in transaction:', innerError);
      throw innerError;
    }
  } catch (error) {
    console.error('Error creating booking:', error);
    
    // Berikan pesan error yang lebih spesifik berdasarkan jenis error
    let errorMessage = 'Server error while creating booking';
    
    if (error.code === '23505') {
      // Duplicate key error
      errorMessage = 'Booking dengan ID yang sama sudah ada';
    } else if (error.code === '23503') {
      // Foreign key violation
      errorMessage = 'Referensi ke data yang tidak ada (service, vehicle, atau customer)';
    } else if (error.code === '42P01') {
      // Undefined table
      errorMessage = 'Tabel database tidak ditemukan';
      
      // Jika error karena tabel booking_payments tidak ada, coba buat booking tanpa menyimpan info pembayaran
      if (error.message.includes('booking_payments')) {
        try {
          // Rollback transaksi sebelumnya
          await db.query('ROLLBACK');
          
          // Mulai transaksi baru
          await db.query('BEGIN');
          
          // Generate booking ID baru
          const bookingIdResult = await db.query('SELECT generate_booking_id()');
          const booking_id = bookingIdResult.rows[0].generate_booking_id;
          
          // Prepare mechanic_id if provided
          const mechanic_id_param = mechanic_id ? parseInt(mechanic_id, 10) : null;
          
          // Create booking tanpa menyimpan info pembayaran
          let bookingResult;
          if (mechanic_id_param) {
            bookingResult = await db.query(
              `INSERT INTO bookings 
               (id, customer_id, service_id, vehicle_id, booking_date, booking_time, mechanic_id, notes, customer_name) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
               RETURNING *`,
              [booking_id, customer_id, service_id, vehicle_id, date, time, mechanic_id_param, notes, customer_name]
            );
          } else {
            bookingResult = await db.query(
              `INSERT INTO bookings 
               (id, customer_id, service_id, vehicle_id, booking_date, booking_time, notes, customer_name) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
               RETURNING *`,
              [booking_id, customer_id, service_id, vehicle_id, date, time, notes, customer_name]
            );
          }
          
          // Update customer total_bookings
          await db.query(
            'UPDATE customers SET total_bookings = total_bookings + 1, updated_at = NOW() WHERE id = $1',
            [customer_id]
          );
          
          // Commit transaction
          await db.query('COMMIT');
          
          return res.status(201).json({
            message: 'Booking created successfully (without payment information)',
            booking: bookingResult.rows[0]
          });
        } catch (retryError) {
          console.error('Error in retry attempt:', retryError);
          await db.query('ROLLBACK');
          errorMessage = 'Gagal membuat booking setelah mencoba ulang';
        }
      }
    }
    
    res.status(500).json({ 
      message: errorMessage,
      error: error.message 
    });
  }
});

// Update booking status (admin/staff and mechanics)
router.put('/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  try {
    // Check if booking exists
    const bookingCheck = await db.query(
      'SELECT * FROM bookings WHERE id = $1',
      [id]
    );
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    const booking = bookingCheck.rows[0];
    
    // Check permissions and validate status based on role
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      // Admin/staff can set any valid status
      const validStatuses = ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Valid status is required' });
      }
      
      // Update booking status using stored procedure
      await db.query('CALL update_booking_status($1, $2)', [id, status]);
    } 
    else if (req.user.role === 'mechanic') {
      // Mechanics can only update their assigned bookings
      if (booking.mechanic_id !== req.user.mechanic_id) {
        return res.status(403).json({ message: 'Not authorized to update this booking' });
      }
      
      // Mechanics can only set specific statuses
      const validStatuses = ['in-progress', 'completed'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Valid status is required. Mechanics can only set in-progress or completed status.' });
      }
      
      // Update booking status
      await db.query(
        'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, id]
      );
      
      // If status is completed, update completed_at timestamp
      if (status === 'completed') {
        await db.query(
          'UPDATE bookings SET completed_at = NOW() WHERE id = $1',
          [id]
        );
      }
    }
    else {
      return res.status(403).json({ message: 'Not authorized to update booking status' });
    }
    
    // Get updated booking
    const bookingResult = await db.query(
      `SELECT b.*, 
              s.name AS service_name, 
              s.price AS service_price,
              c.id AS customer_id, 
              u.name AS customer_name,
              v.make, v.model, v.license_plate
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN vehicles v ON b.vehicle_id = v.id
       WHERE b.id = $1`,
      [id]
    );
    
    res.json({
      message: 'Booking status updated successfully',
      booking: bookingResult.rows[0]
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ message: 'Server error while updating booking status' });
  }
});

// Assign mechanic to booking (admin/staff only)
router.put('/:id/assign-mechanic', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { mechanic_id } = req.body;
  
  if (!mechanic_id) {
    return res.status(400).json({ message: 'Mechanic ID is required' });
  }
  
  try {
    // Check if booking exists
    const bookingCheck = await db.query(
      'SELECT * FROM bookings WHERE id = $1',
      [id]
    );
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    // Check if mechanic exists
    const mechanicCheck = await db.query(
      'SELECT m.*, u.name FROM mechanics m JOIN users u ON m.user_id = u.id WHERE m.id = $1',
      [mechanic_id]
    );
    
    if (mechanicCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Mechanic not found' });
    }
    
    try {
      // Start a transaction
      await db.query('BEGIN');
      
      // Get booking details
      const bookingDetailsResult = await db.query(
        `SELECT b.date, b.time, b.service_id, s.estimated_time 
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         WHERE b.id = $1`,
        [id]
      );
      
      if (bookingDetailsResult.rows.length === 0) {
        await db.query('ROLLBACK');
        return res.status(404).json({ message: 'Booking details not found' });
      }
      
      const bookingDetails = bookingDetailsResult.rows[0];
      const bookingDate = bookingDetails.date;
      const bookingTime = bookingDetails.time;
      const serviceDuration = bookingDetails.estimated_time || 60; // Default to 60 minutes if not specified
      
      // Calculate end time
      const bookingEndTime = new Date(`1970-01-01T${bookingTime}`);
      bookingEndTime.setMinutes(bookingEndTime.getMinutes() + serviceDuration);
      const formattedEndTime = bookingEndTime.toTimeString().split(' ')[0];
      
      // Check if mechanic is available on that day (day_of_week is 0-6, Sunday=0)
      const dayOfWeek = new Date(bookingDate).getDay();
      const mechanicAvailabilityCheck = await db.query(
        `SELECT EXISTS (
          SELECT 1 FROM mechanic_availability
          WHERE mechanic_id = $1
          AND day_of_week = $2
          AND start_time <= $3
          AND end_time >= $4
        ) AS is_available`,
        [mechanic_id, dayOfWeek, bookingTime, formattedEndTime]
      );
      
      if (!mechanicAvailabilityCheck.rows[0].is_available) {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: 'Mechanic is not available during this time slot' });
      }
      
      // Check for conflicts with other bookings
      const conflictCheck = await db.query(
        `SELECT COUNT(*) AS conflict_count
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         WHERE b.mechanic_id = $1
         AND b.date = $2
         AND b.status NOT IN ('cancelled')
         AND (
           (b.time <= $3 AND b.time + (s.estimated_time * INTERVAL '1 minute') > $3)
           OR
           (b.time < $4 AND b.time >= $3)
         )`,
        [mechanic_id, bookingDate, bookingTime, formattedEndTime]
      );
      
      if (conflictCheck.rows[0].conflict_count > 0) {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: 'Mechanic has conflicting bookings during this time slot' });
      }
      
      // Assign mechanic to booking
      await db.query(
        `UPDATE bookings
         SET mechanic_id = $1,
             status = 'confirmed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [mechanic_id, id]
      );
      
      // Create mechanic task
      await db.query(
        `INSERT INTO mechanic_tasks (booking_id, mechanic_id, status, start_time, end_time)
         VALUES ($1, $2, 'pending', $3, $4)`,
        [id, mechanic_id, bookingTime, formattedEndTime]
      );
      
      await db.query('COMMIT');
      
      // Get updated booking
      const bookingResult = await db.query(
        `SELECT b.*, 
                s.name AS service_name,
                m.id AS mechanic_id,
                u.name AS mechanic_name
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         LEFT JOIN mechanics m ON b.mechanic_id = m.id
         LEFT JOIN users u ON m.user_id = u.id
         WHERE b.id = $1`,
        [id]
      );
      
      res.json({
        message: 'Mechanic assigned successfully',
        booking: bookingResult.rows[0]
      });
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Error in transaction:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error assigning mechanic:', error);
    res.status(500).json({ message: 'Server error while assigning mechanic' });
  }
});

// Update booking notes
router.put('/:id/notes', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  
  try {
    // Check if booking exists
    const bookingCheck = await db.query(
      'SELECT * FROM bookings WHERE id = $1',
      [id]
    );
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    // Check permissions
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    const isAssignedMechanic = req.user.role === 'mechanic' && req.user.mechanic_id === bookingCheck.rows[0].mechanic_id;
    const isBookingCustomer = req.user.role === 'customer' && req.user.customer_id === bookingCheck.rows[0].customer_id;
    
    if (!isAdminOrStaff && !isAssignedMechanic && !isBookingCustomer) {
      return res.status(403).json({ message: 'Not authorized to update this booking' });
    }
    
    // Update notes
    const result = await db.query(
      'UPDATE bookings SET notes = $1, updated_at = NOW() WHERE id = $2 RETURNING id, notes',
      [notes, id]
    );
    
    res.json({
      message: 'Booking notes updated successfully',
      booking: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating booking notes:', error);
    res.status(500).json({ message: 'Server error while updating booking notes' });
  }
});

// Get available time slots for booking
router.get('/available-slots/:date', async (req, res) => {
  const { date } = req.params;
  const { service_id, mechanic_id } = req.query;
  
  if (!service_id) {
    return res.status(400).json({ message: 'Service ID is required' });
  }
  
  try {
    // Check if service exists
    const serviceCheck = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [service_id]
    );
    
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Get available slots using function
    let result;
    
    if (mechanic_id) {
      result = await db.query(
        'SELECT * FROM get_available_time_slots($1, $2, $3)',
        [service_id, date, mechanic_id]
      );
    } else {
      result = await db.query(
        'SELECT * FROM get_available_time_slots($1, $2)',
        [service_id, date]
      );
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching available time slots:', error);
    res.status(500).json({ message: 'Server error while fetching available time slots' });
  }
});

// Cancel booking (customer only)
router.put('/:id/cancel', verifyToken, isCustomer, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if booking exists and belongs to this customer
    const bookingCheck = await db.query(
      'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
      [id, req.user.customer_id]
    );
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found or not owned by you' });
    }
    
    const booking = bookingCheck.rows[0];
    
    // Check if booking can be cancelled (only pending or confirmed bookings can be cancelled)
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      return res.status(400).json({ 
        message: 'Only pending or confirmed bookings can be cancelled' 
      });
    }
    
    // Update booking status to cancelled
    await db.query(
      'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['cancelled', id]
    );
    
    // Add to audit log
    await db.query(
      `INSERT INTO audit_logs 
       (user_id, action, table_name, record_id, old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        'cancel_booking',
        'bookings',
        id,
        JSON.stringify({ status: booking.status }),
        JSON.stringify({ status: 'cancelled' }),
        req.ip
      ]
    );
    
    res.json({
      message: 'Booking cancelled successfully',
      booking_id: id
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Server error while cancelling booking' });
  }
});

// Search bookings (admin/staff only)
router.get('/search/:term', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { term } = req.params;
  
  try {
    const result = await db.query('SELECT * FROM search_bookings($1)', [term]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching bookings:', error);
    res.status(500).json({ message: 'Server error while searching bookings' });
  }
});

// Get booking report (admin/staff only)
router.get('/reports/date-range', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { start_date, end_date } = req.query;
  
  if (!start_date || !end_date) {
    return res.status(400).json({ message: 'Start date and end date are required' });
  }
  
  try {
    const result = await db.query(
      'SELECT * FROM generate_booking_report($1, $2)',
      [start_date, end_date]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error generating booking report:', error);
    res.status(500).json({ message: 'Server error while generating booking report' });
  }
});

// Get customer's completed bookings without testimonials
router.get('/customer/completed-without-testimonial', verifyToken, isCustomer, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT b.*, 
              s.name AS service_name, 
              s.price AS service_price,
              v.make, v.model, v.license_plate,
              m.id AS mechanic_id,
              mu.name AS mechanic_name
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN vehicles v ON b.vehicle_id = v.id
       LEFT JOIN mechanics m ON b.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE b.customer_id = $1
       AND b.status = 'completed'
       AND NOT EXISTS (
         SELECT 1 FROM testimonials t 
         WHERE t.service_id = b.service_id 
         AND t.customer_id = b.customer_id
       )
       ORDER BY b.booking_date DESC, b.booking_time DESC`,
      [req.user.customer_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching completed bookings without testimonials:', error);
    res.status(500).json({ message: 'Server error while fetching completed bookings without testimonials' });
  }
});

// Add field notes to booking (mechanic only)
router.post('/mechanics/field-note', verifyToken, isMechanic, async (req, res) => {
  const { booking_id, note } = req.body;
  
  if (!booking_id || !note) {
    return res.status(400).json({ message: 'Booking ID and note are required' });
  }
  
  try {
    // Check if booking exists and is assigned to this mechanic
    const bookingCheck = await db.query(
      'SELECT * FROM bookings WHERE id = $1 AND mechanic_id = $2',
      [booking_id, req.user.mechanic_id]
    );
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found or not assigned to you' });
    }
    
    // Get current date and time
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    
    // Insert field note
    const result = await db.query(
      `INSERT INTO field_notes 
       (booking_id, mechanic_id, note, date, time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [booking_id, req.user.mechanic_id, note, date, time]
    );
    
    res.status(201).json({
      message: 'Field note added successfully',
      field_note: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding field note:', error);
    res.status(500).json({ message: 'Server error while adding field note' });
  }
});

// Get field notes for a booking (mechanic only)
router.get('/mechanics/field-notes/:booking_id', verifyToken, isMechanic, async (req, res) => {
  const { booking_id } = req.params;
  
  try {
    // Check if booking exists and is assigned to this mechanic
    const bookingCheck = await db.query(
      'SELECT * FROM bookings WHERE id = $1 AND mechanic_id = $2',
      [booking_id, req.user.mechanic_id]
    );
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found or not assigned to you' });
    }
    
    // Get field notes
    const result = await db.query(
      `SELECT fn.*, u.name AS mechanic_name
       FROM field_notes fn
       JOIN mechanics m ON fn.mechanic_id = m.id
       JOIN users u ON m.user_id = u.id
       WHERE fn.booking_id = $1
       ORDER BY fn.date DESC, fn.time DESC`,
      [booking_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching field notes:', error);
    res.status(500).json({ message: 'Server error while fetching field notes' });
  }
});

// Add a debug endpoint to check booking data with mechanic information
router.get('/debug', verifyToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT b.*, 
             s.name AS service_name, 
             s.price AS service_price,
             v.make, v.model, v.year, v.license_plate,
             m.id AS mechanic_id, m.specialization,
             mu.id AS mechanic_user_id, mu.name AS mechanic_name, mu.email AS mechanic_email
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      LEFT JOIN users mu ON m.user_id = mu.id
      ORDER BY b.booking_date DESC, b.booking_time DESC
      LIMIT 10
    `);
    
    console.log('Bookings debug data:', result.rows);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings debug data:', error);
    res.status(500).json({ message: 'Server error while fetching bookings debug data' });
  }
});

// Add a debug endpoint to check booking table structure
router.get('/debug/table-structure', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'bookings'
      ORDER BY ordinal_position
    `);
    
    console.log('Bookings table structure:', result.rows);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings table structure:', error);
    res.status(500).json({ message: 'Server error while fetching bookings table structure' });
  }
});

// Add a test endpoint for debugging
router.get('/test-schedules', async (req, res) => {
  console.log('Test schedules endpoint called');
  try {
    const result = await db.query(
      `SELECT id, booking_date, booking_time, status 
       FROM bookings 
       ORDER BY booking_date DESC, booking_time ASC
       LIMIT 10`
    );
    
    console.log(`Test found ${result.rows.length} booking schedules`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({ message: 'Server error in test endpoint' });
  }
});

// ----- BOOKING SCHEDULE ENDPOINTS (ADMIN ONLY) -----

// Get all booking schedules
router.get('/schedules', verifyToken, isStaffOrAdmin, async (req, res) => {
  console.log('GET /api/booking/schedules endpoint called');
  try {
    console.log('Executing query for booking schedules');
    const result = await db.query(
      `SELECT id, booking_date, booking_time, status 
       FROM bookings 
       ORDER BY booking_date DESC, booking_time ASC`
    );
    
    console.log(`Found ${result.rows.length} booking schedules`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching booking schedules:', error);
    res.status(500).json({ message: 'Server error while fetching booking schedules' });
  }
});

// Add a new booking schedule
router.post('/schedule', verifyToken, isAdmin, async (req, res) => {
  const { booking_date, booking_time, status } = req.body;
  
  // Validate inputs
  if (!booking_date || !booking_time) {
    return res.status(400).json({ message: 'Date and time are required' });
  }
  
  try {
    // Generate a new booking ID
    const bookingIdResult = await db.query('SELECT public.generate_booking_id() AS id');
    const bookingId = bookingIdResult.rows[0].id;
    
    // Insert placeholder booking (with required fields)
    const result = await db.query(
      `INSERT INTO bookings 
       (id, booking_date, booking_time, status, customer_id, service_id, vehicle_id, notes) 
       VALUES ($1, $2, $3, $4, 1, 1, 1, 'Admin created schedule') 
       RETURNING id, booking_date, booking_time, status`,
      [bookingId, booking_date, booking_time, status || 'pending']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating booking schedule:', error);
    res.status(500).json({ message: 'Server error while creating booking schedule' });
  }
});

// Update a booking schedule
router.put('/schedule/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { booking_date, booking_time, status } = req.body;
  
  // Validate inputs
  if (!booking_date || !booking_time) {
    return res.status(400).json({ message: 'Date and time are required' });
  }
  
  try {
    const result = await db.query(
      `UPDATE bookings 
       SET booking_date = $1, booking_time = $2, status = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 
       RETURNING id, booking_date, booking_time, status`,
      [booking_date, booking_time, status, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Booking schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating booking schedule:', error);
    res.status(500).json({ message: 'Server error while updating booking schedule' });
  }
});

// Delete a booking schedule
router.delete('/schedule/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Booking schedule not found' });
    }
    
    res.json({ message: 'Booking schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting booking schedule:', error);
    res.status(500).json({ message: 'Server error while deleting booking schedule' });
  }
});

// Get payment history (approved/rejected) (staff/admin only)
router.get('/payments/history', verifyToken, isStaffOrAdmin, async (req, res) => {
  try {
    console.log('Fetching payment history...');
    
    // Make sure the booking_payments table exists with the right structure
    await setupBookingPaymentsTable();
    
    // Get query parameters for filtering
    const { status, paymentStatus, search, dateFrom, dateTo, page = 1, pageSize = 10 } = req.query;
    
    // Build query conditions
    const queryParams = [];
    const conditions = ["bp.payment_status != 'pending'"]; // Exclude pending payments
    
    // Add status filter
    if (status && status !== 'all') {
      queryParams.push(status);
      conditions.push(`bp.payment_status = $${queryParams.length}`);
    }
    
    // Add payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      queryParams.push(paymentStatus);
      conditions.push(`bp.payment_status = $${queryParams.length}`);
    }
    
    // Add date range filter
    if (dateFrom) {
      queryParams.push(dateFrom);
      conditions.push(`bp.payment_date::date >= $${queryParams.length}`);
    }
    
    if (dateTo) {
      queryParams.push(dateTo);
      conditions.push(`bp.payment_date::date <= $${queryParams.length}`);
    }
    
    // Add search filter
    if (search) {
      queryParams.push(`%${search}%`);
      conditions.push(`(
        bp.booking_id ILIKE $${queryParams.length} OR
        b.customer_name ILIKE $${queryParams.length} OR
        v.license_plate ILIKE $${queryParams.length}
      )`);
    }
    
    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    queryParams.push(parseInt(pageSize), offset);
    
    // Build the WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Query to get payment history with booking and customer information
    const query = `
      SELECT 
        bp.id,
        bp.booking_id,
        bp.payment_method,
        bp.is_down_payment,
        bp.down_payment_percent,
        bp.down_payment_amount,
        bp.payment_status,
        bp.payment_date,
        bp.admin_notes,
        bp.created_at,
        bp.updated_at,
        b.customer_id,
        b.service_id,
        b.vehicle_id,
        b.booking_date AS service_date,
        b.mechanic_id,
        b.status AS booking_status,
        b.customer_name,
        s.name AS service_name,
        s.price AS service_price,
        v.make AS vehicle_make,
        v.model AS vehicle_model,
        v.year AS vehicle_year,
        v.license_plate AS vehicle_plate,
        u.name AS mechanic_name
      FROM booking_payments bp
      JOIN bookings b ON bp.booking_id = b.id
      JOIN services s ON b.service_id = s.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClause}
      ORDER BY bp.updated_at DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
    `;
    
    // Count total records for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM booking_payments bp
      JOIN bookings b ON bp.booking_id = b.id
      JOIN services s ON b.service_id = s.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClause}
    `;
    
    // Execute queries
    const [result, countResult] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, queryParams.slice(0, -2)) // Remove LIMIT and OFFSET params
    ]);
    
    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / parseInt(pageSize));
    
    console.log(`Found ${result.rows.length} payment history records (total: ${totalRecords})`);

    // Transform the data to match the expected format in the frontend
    const payments = result.rows.map(row => {
      // Calculate total amount based on service price and down payment info
      const servicePrice = parseFloat(row.service_price || 0);
      const totalAmount = row.is_down_payment 
        ? parseFloat(row.down_payment_amount || 0) 
        : servicePrice;
      
      // Generate a simple invoice number
      const createdAt = new Date(row.created_at);
      const invoiceNumber = `INV/${createdAt.getFullYear()}/${(createdAt.getMonth() + 1).toString().padStart(2, '0')}/${row.id}`;
      
      // Determine who approved/rejected and when
      let approvedBy = null;
      let approvedAt = null;
      let rejectedBy = null;
      let rejectedAt = null;
      let rejectionReason = null;
      
      if (row.payment_status === 'approved') {
        approvedBy = 'Admin'; // In a real app, get the actual admin name
        approvedAt = row.updated_at;
      } else if (row.payment_status === 'rejected') {
        rejectedBy = 'Admin'; // In a real app, get the actual admin name
        rejectedAt = row.updated_at;
        rejectionReason = row.admin_notes;
      }
      
      return {
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        booking_id: row.booking_id,
        invoice_number: invoiceNumber,
        customer_id: row.customer_id,
        customer_name: row.customer_name || 'Unknown Customer',
        customer_phone: 'N/A', // Add customer phone if available
        customer_email: 'N/A', // Add customer email if available
        vehicle_id: row.vehicle_id,
        vehicle_make: row.vehicle_make || '',
        vehicle_model: row.vehicle_model || '',
        vehicle_year: row.vehicle_year || '',
        vehicle_plate: row.vehicle_plate || '',
        service_date: row.service_date,
        payment_date: row.payment_date,
        service_items: [
          { 
            item_id: `S${row.service_id}`, 
            name: row.service_name || 'Unknown Service', 
            qty: 1, 
            price: servicePrice, 
            type: 'service' 
          }
        ],
        subtotal: servicePrice,
        tax: servicePrice * 0.1, // Assuming 10% tax
        total_amount: totalAmount,
        payment_method: row.payment_method,
        is_down_payment: row.is_down_payment,
        down_payment_percent: row.down_payment_percent,
        down_payment_amount: row.down_payment_amount,
        status: row.payment_status,
        payment_status: row.payment_status === 'approved' ? 'paid' : 'unpaid',
        mechanic_id: row.mechanic_id,
        mechanic_name: row.mechanic_name || 'Belum ditugaskan',
        approved_by: approvedBy,
        approved_at: approvedAt,
        rejected_by: rejectedBy,
        rejected_at: rejectedAt,
        rejection_reason: rejectionReason,
        admin_notes: row.admin_notes || '',
        // Add dummy values for fields that might be expected by the frontend
        payment_account: '123456789',
        payment_account_name: row.customer_name || 'Unknown Customer',
        payment_proof_url: '#',
        payment_proof_name: 'payment_proof.jpg',
        payment_notes: ''
      };
    });
    
    console.log('Successfully processed payment history data');
    
    // Return data with pagination info
    res.json({
      transactions: payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRecords
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    
    // Return empty array instead of error to prevent frontend from breaking
    res.json({
      transactions: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalRecords: 0
      }
    });
  }
});

// Get pending payments (staff/admin only)
router.get('/payments/pending', verifyToken, isStaffOrAdmin, async (req, res) => {
  try {
    console.log('Fetching pending payments...');
    
    // Make sure the booking_payments table exists with the right structure
    await setupBookingPaymentsTable();
    
    // Query to get all pending payments with booking and customer information
    const result = await db.query(`
      SELECT 
        bp.id,
        bp.booking_id,
        bp.payment_method,
        bp.is_down_payment,
        bp.down_payment_percent,
        bp.down_payment_amount,
        bp.payment_status,
        bp.payment_date,
        bp.created_at,
        bp.updated_at,
        b.customer_id,
        b.service_id,
        b.vehicle_id,
        b.booking_date AS service_date,
        b.mechanic_id,
        b.status AS booking_status,
        b.customer_name,
        s.name AS service_name,
        s.price AS service_price,
        v.make AS vehicle_make,
        v.model AS vehicle_model,
        v.year AS vehicle_year,
        v.license_plate AS vehicle_plate,
        u.name AS mechanic_name
      FROM booking_payments bp
      JOIN bookings b ON bp.booking_id = b.id
      JOIN services s ON b.service_id = s.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE bp.payment_status = 'pending'
      ORDER BY bp.created_at DESC
    `);

    console.log(`Found ${result.rows.length} pending payments`);

    // Transform the data to match the expected format in the frontend
    const payments = result.rows.map(row => {
      // Calculate total amount based on service price and down payment info
      const servicePrice = parseFloat(row.service_price || 0);
      const totalAmount = row.is_down_payment 
        ? parseFloat(row.down_payment_amount || 0) 
        : servicePrice;
      
      // Generate a simple invoice number
      const createdAt = new Date(row.created_at);
      const invoiceNumber = `INV/${createdAt.getFullYear()}/${(createdAt.getMonth() + 1).toString().padStart(2, '0')}/${row.id}`;
      
      return {
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        booking_id: row.booking_id,
        invoice_number: invoiceNumber,
        customer_id: row.customer_id,
        customer_name: row.customer_name || 'Unknown Customer',
        vehicle_id: row.vehicle_id,
        vehicle_make: row.vehicle_make || '',
        vehicle_model: row.vehicle_model || '',
        vehicle_year: row.vehicle_year || '',
        vehicle_plate: row.vehicle_plate || '',
        service_date: row.service_date,
        payment_date: row.payment_date,
        service_items: [
          { 
            item_id: `S${row.service_id}`, 
            name: row.service_name || 'Unknown Service', 
            qty: 1, 
            price: servicePrice, 
            type: 'service' 
          }
        ],
        subtotal: servicePrice,
        tax: 0, // Add tax calculation if needed
        total_amount: totalAmount,
        payment_method: row.payment_method,
        is_down_payment: row.is_down_payment,
        down_payment_percent: row.down_payment_percent,
        down_payment_amount: row.down_payment_amount,
        status: row.payment_status,
        mechanic_id: row.mechanic_id,
        mechanic_name: row.mechanic_name || 'Belum ditugaskan',
        // Add dummy values for fields that might be expected by the frontend
        payment_account: '123456789',
        payment_account_name: row.customer_name || 'Unknown Customer',
        payment_proof_url: '#',
        payment_proof_name: 'payment_proof.jpg',
        payment_notes: '',
        admin_notes: row.admin_notes || ''
      };
    });
    
    console.log('Successfully processed payment data');
    res.json(payments);
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    
    // Return empty array instead of error to prevent frontend from breaking
    res.json([]);
  }
});

// Approve payment (staff/admin only) - Simplified version
router.post('/payments/:id/approve', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { admin_notes } = req.body;
  
  try {
    console.log(`Attempting to approve payment with ID: ${id}`);
    
    // Get the payment record
    const paymentResult = await db.query(
      `SELECT * FROM booking_payments WHERE id = $1`,
      [id]
    );
    
    if (paymentResult.rows.length === 0) {
      console.log(`Payment with ID ${id} not found`);
      return res.status(404).json({ message: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    console.log(`Found payment:`, payment);
    
    // Update payment status directly
    await db.query(
      `UPDATE booking_payments 
       SET payment_status = 'approved', updated_at = NOW(), admin_notes = $1
       WHERE id = $2`,
      [admin_notes || '', id]
    );
    
    console.log(`Updated payment status to approved`);
    
    // Update booking status - use 'confirmed' instead of 'paid' or 'partial_paid'
    // since those aren't valid enum values in the booking_status type
    console.log(`Updating booking ${payment.booking_id} status to confirmed`);
    
    // Update booking status
    await db.query(
      `UPDATE bookings 
       SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1`,
      [payment.booking_id]
    );
    
    console.log(`Successfully updated booking status`);
    
    res.json({
      message: 'Payment approved successfully',
      payment: {
        id: payment.id,
        booking_id: payment.booking_id,
        status: 'approved'
      }
    });
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({ message: 'Server error while approving payment: ' + error.message });
  }
});

// Reject payment (staff/admin only) - Simplified version
router.post('/payments/:id/reject', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { admin_notes } = req.body;
  
  try {
    console.log(`Attempting to reject payment with ID: ${id}`);
    
    // Get the payment record
    const paymentResult = await db.query(
      `SELECT * FROM booking_payments WHERE id = $1`,
      [id]
    );
    
    if (paymentResult.rows.length === 0) {
      console.log(`Payment with ID ${id} not found`);
      return res.status(404).json({ message: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    console.log(`Found payment:`, payment);
    
    // Update payment status directly
    await db.query(
      `UPDATE booking_payments 
       SET payment_status = 'rejected', updated_at = NOW(), admin_notes = $1
       WHERE id = $2`,
      [admin_notes || '', id]
    );
    
    console.log(`Updated payment status to rejected`);
    
    res.json({
      message: 'Payment rejected successfully',
      payment: {
        id: payment.id,
        booking_id: payment.booking_id,
        status: 'rejected'
      }
    });
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ message: 'Server error while rejecting payment: ' + error.message });
  }
});

// Create audit_logs table if it doesn't exist
const ensureAuditLogsTable = async () => {
  try {
    // Check if table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'audit_logs'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    
    if (!tableExists) {
      console.log('Creating audit_logs table...');
      await db.query(`
        CREATE TABLE audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          action VARCHAR(100) NOT NULL,
          table_name VARCHAR(100) NOT NULL,
          record_id VARCHAR(100) NOT NULL,
          old_values JSONB,
          new_values JSONB,
          ip_address VARCHAR(50),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('audit_logs table created successfully');
    }
  } catch (error) {
    console.error('Error ensuring audit_logs table:', error);
  }
};

// Call this function when the server starts
ensureAuditLogsTable();

// Create or update booking_payments table with the correct structure
const setupBookingPaymentsTable = async () => {
  try {
    console.log('Setting up booking_payments table...');
    
    // Check if table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'booking_payments'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    
    if (!tableExists) {
      console.log('Creating booking_payments table...');
      await db.query(`
        CREATE TABLE booking_payments (
          id SERIAL PRIMARY KEY,
          booking_id VARCHAR(20) REFERENCES bookings(id) ON DELETE CASCADE,
          payment_method VARCHAR(50) NOT NULL,
          is_down_payment BOOLEAN DEFAULT false,
          down_payment_percent INTEGER,
          down_payment_amount DECIMAL(10,2),
          payment_status VARCHAR(20) DEFAULT 'pending',
          admin_notes TEXT,
          payment_date TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('booking_payments table created successfully');
    } else {
      // Check if admin_notes column exists
      const columnCheck = await db.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'booking_payments' 
          AND column_name = 'admin_notes'
        );
      `);
      
      const columnExists = columnCheck.rows[0].exists;
      
      // Add admin_notes column if it doesn't exist
      if (!columnExists) {
        console.log('Adding admin_notes column to booking_payments table...');
        await db.query(`
          ALTER TABLE booking_payments 
          ADD COLUMN admin_notes TEXT;
        `);
        console.log('admin_notes column added successfully');
      }
    }
  } catch (error) {
    console.error('Error setting up booking_payments table:', error);
  }
};

// Call this function when the server starts
setupBookingPaymentsTable();

module.exports = router; 