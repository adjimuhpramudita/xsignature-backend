const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin } = require('../middleware/auth.middleware');

// Get all booking schedules
router.get('/', async (req, res) => {
  console.log('Schedule routes: GET / endpoint called');
  try {
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
router.post('/', verifyToken, isAdmin, async (req, res) => {
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
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
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
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
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

module.exports = router; 