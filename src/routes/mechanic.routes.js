const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin, isMechanic } = require('../middleware/auth.middleware');

// Get all mechanics (public)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT m.*, u.name, u.avatar_url, u.initials, u.status
       FROM mechanics m
       JOIN users u ON m.user_id = u.id
       WHERE u.status = 'active'
       ORDER BY u.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanics:', error);
    res.status(500).json({ message: 'Server error while fetching mechanics' });
  }
});

// Add a debug endpoint to check mechanic data
router.get('/debug', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT m.*, u.name, u.email
       FROM mechanics m
       JOIN users u ON m.user_id = u.id
    `);
    
    console.log('Mechanics debug data:', result.rows);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanics debug data:', error);
    res.status(500).json({ message: 'Server error while fetching mechanics debug data' });
  }
});

// Get mechanic dashboard stats (for mechanic)
router.get('/dashboard/stats', verifyToken, isMechanic, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const mechanic_id = req.user.mechanic_id;
    
    // Get completed tasks today
    const completedTodayResult = await db.query(
      `SELECT COUNT(*) as count
       FROM mechanic_tasks
       WHERE mechanic_id = $1
       AND status = 'completed'
       AND booking_id IN (SELECT id FROM bookings WHERE booking_date = $2)`,
      [mechanic_id, today]
    );
    
    // Get pending tasks today
    const pendingTodayResult = await db.query(
      `SELECT COUNT(*) as count
       FROM mechanic_tasks
       WHERE mechanic_id = $1
       AND status IN ('pending', 'in-progress')
       AND booking_id IN (SELECT id FROM bookings WHERE booking_date = $2)`,
      [mechanic_id, today]
    );
    
    // Get total tasks this week
    const weekStartDate = new Date();
    weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay());
    const weekStart = weekStartDate.toISOString().split('T')[0];
    
    const weekEndDate = new Date();
    weekEndDate.setDate(weekEndDate.getDate() + (6 - weekEndDate.getDay()));
    const weekEnd = weekEndDate.toISOString().split('T')[0];
    
    const totalWeekResult = await db.query(
      `SELECT COUNT(*) as count
       FROM mechanic_tasks
       WHERE mechanic_id = $1
       AND booking_id IN (SELECT id FROM bookings WHERE booking_date BETWEEN $2 AND $3)`,
      [mechanic_id, weekStart, weekEnd]
    );
    
    // Get mechanic rating
    const ratingResult = await db.query(
      `SELECT rating
       FROM mechanics
       WHERE id = $1`,
      [mechanic_id]
    );
    
    res.json({
      completedToday: parseInt(completedTodayResult.rows[0].count),
      pendingToday: parseInt(pendingTodayResult.rows[0].count),
      totalWeek: parseInt(totalWeekResult.rows[0].count),
      rating: parseFloat(ratingResult.rows[0].rating || 0)
    });
  } catch (error) {
    console.error('Error fetching mechanic dashboard stats:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic dashboard stats' });
  }
});

// Get all mechanic tasks (for mechanic)
router.get('/my-tasks', verifyToken, isMechanic, async (req, res) => {
  try {
    const mechanicId = req.user.mechanic_id;
    
    const result = await db.query(
      `SELECT b.*, 
              s.name AS service_name, 
              s.price AS service_price,
              s.estimated_time,
              c.id AS customer_id, 
              u.name AS customer_name,
              v.make, v.model, v.license_plate,
              mt.status AS task_status,
              mt.start_time,
              mt.end_time,
              b.notes AS customer_notes
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN vehicles v ON b.vehicle_id = v.id
       JOIN mechanic_tasks mt ON b.id = mt.booking_id
       WHERE b.mechanic_id = $1
       ORDER BY b.booking_date DESC, b.booking_time ASC`,
      [mechanicId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic tasks:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic tasks' });
  }
});

// Get mechanic tasks for a specific date (for mechanic)
router.get('/my-tasks/:date', verifyToken, isMechanic, async (req, res) => {
  const { date } = req.params;
  
  try {
    const mechanicId = req.user.mechanic_id;
    
    const result = await db.query(
      `SELECT b.*, 
              s.name AS service_name, 
              s.price AS service_price,
              s.estimated_time,
              c.id AS customer_id, 
              u.name AS customer_name,
              v.make, v.model, v.license_plate,
              mt.status AS task_status,
              mt.start_time,
              mt.end_time,
              b.notes AS customer_notes
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN vehicles v ON b.vehicle_id = v.id
       JOIN mechanic_tasks mt ON b.id = mt.booking_id
       WHERE b.mechanic_id = $1 AND b.booking_date = $2
       ORDER BY b.booking_time`,
      [mechanicId, date]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic tasks:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic tasks' });
  }
});

// Get mechanic tasks for a date range (for mechanic)
router.get('/tasks/date-range', verifyToken, isMechanic, async (req, res) => {
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Start date and end date are required' });
  }
  
  try {
    const mechanicId = req.user.mechanic_id;
    
    const result = await db.query(
      `SELECT b.id, 
              b.booking_date AS date,
              b.booking_time AS time,
              s.name AS service_name, 
              s.estimated_time,
              c.id AS customer_id, 
              u.name AS customer_name,
              v.make, v.model, v.license_plate,
              mt.status AS task_status,
              b.notes AS customer_notes
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN vehicles v ON b.vehicle_id = v.id
       JOIN mechanic_tasks mt ON b.id = mt.booking_id
       WHERE b.mechanic_id = $1
       AND b.booking_date BETWEEN $2 AND $3
       ORDER BY b.booking_date, b.booking_time`,
      [mechanicId, startDate, endDate]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic tasks by date range:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic tasks by date range' });
  }
});

// Get mechanic's field notes
router.get('/field-notes', verifyToken, isMechanic, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT fn.*, 
              b.id AS booking_id, 
              s.name AS service_name,
              c.id AS customer_id,
              u.name AS customer_name
       FROM field_notes fn
       JOIN bookings b ON fn.booking_id = b.id
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       WHERE fn.mechanic_id = $1
       ORDER BY fn.date DESC, fn.time DESC`,
      [req.user.mechanic_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic field notes:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic field notes' });
  }
});

// Get field notes by booking (for mechanic or admin/staff)
router.get('/field-notes/booking/:booking_id', verifyToken, async (req, res) => {
  const { booking_id } = req.params;
  
  try {
    // Get booking details to check permissions
    const bookingCheck = await db.query(
      'SELECT * FROM bookings WHERE id = $1',
      [booking_id]
    );
    
    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    // Check permissions
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    const isAssignedMechanic = req.user.role === 'mechanic' && req.user.mechanic_id === bookingCheck.rows[0].mechanic_id;
    
    if (!isAdminOrStaff && !isAssignedMechanic) {
      return res.status(403).json({ message: 'Not authorized to view these field notes' });
    }
    
    const result = await db.query(
      `SELECT fn.*, 
              m.id AS mechanic_id,
              u.name AS mechanic_name
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

// Get field notes by mechanic (for mechanic or admin/staff)
router.get('/field-notes/:mechanic_id', verifyToken, async (req, res) => {
  const { mechanic_id } = req.params;
  
  // Check permissions
  const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
  const isRequestingMechanic = req.user.role === 'mechanic' && req.user.mechanic_id === parseInt(mechanic_id);
  
  if (!isAdminOrStaff && !isRequestingMechanic) {
    return res.status(403).json({ message: 'Not authorized to view these field notes' });
  }
  
  try {
    const result = await db.query(
      `SELECT fn.*, 
              b.id AS booking_id, 
              s.name AS service_name,
              c.id AS customer_id,
              u.name AS customer_name,
              v.make, v.model, v.license_plate
       FROM field_notes fn
       JOIN bookings b ON fn.booking_id = b.id
       JOIN services s ON b.service_id = s.id
       JOIN customers c ON b.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN vehicles v ON b.vehicle_id = v.id
       WHERE fn.mechanic_id = $1
       ORDER BY fn.date DESC, fn.time DESC`,
      [mechanic_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching field notes:', error);
    res.status(500).json({ message: 'Server error while fetching field notes' });
  }
});

// Update task status (for mechanic)
router.put('/task/:booking_id/status', verifyToken, isMechanic, async (req, res) => {
  const { booking_id } = req.params;
  const { status } = req.body;
  
  // Validate status
  const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Valid status is required' });
  }
  
  try {
    // Check if task exists and belongs to this mechanic
    const taskCheck = await db.query(
      'SELECT * FROM mechanic_tasks WHERE booking_id = $1 AND mechanic_id = $2',
      [booking_id, req.user.mechanic_id]
    );
    
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found or not assigned to you' });
    }
    
    // Update task status
    const taskResult = await db.query(
      'UPDATE mechanic_tasks SET status = $1, updated_at = NOW() WHERE booking_id = $2 AND mechanic_id = $3 RETURNING *',
      [status, booking_id, req.user.mechanic_id]
    );
    
    // If task is completed or in-progress, also update booking status
    if (status === 'completed') {
      await db.query('CALL update_booking_status($1, $2)', [booking_id, 'completed']);
    } else if (status === 'in-progress') {
      await db.query('CALL update_booking_status($1, $2)', [booking_id, 'in-progress']);
    }
    
    res.json({
      message: 'Task status updated successfully',
      task: taskResult.rows[0]
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ message: 'Server error while updating task status' });
  }
});

// Add field note (for mechanic)
router.post('/field-note', verifyToken, isMechanic, async (req, res) => {
  const { booking_id, note, parts_needed, time_adjustment } = req.body;
  
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
    
    // Add field note
    const result = await db.query(
      `INSERT INTO field_notes 
       (mechanic_id, booking_id, date, time, note, parts_needed, time_adjustment, status)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_TIME, $3, $4, $5, 'pending')
       RETURNING *`,
      [req.user.mechanic_id, booking_id, note, parts_needed || null, time_adjustment || null]
    );
    
    // Also update notes in the booking
    await db.query(
      'UPDATE bookings SET notes = $1 WHERE id = $2',
      [note, booking_id]
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

// Update field note (for mechanic)
router.put('/field-note/:id', verifyToken, isMechanic, async (req, res) => {
  const { id } = req.params;
  const { note, parts_needed, time_adjustment, status } = req.body;
  
  try {
    // Check if field note exists and belongs to this mechanic
    const noteCheck = await db.query(
      'SELECT * FROM field_notes WHERE id = $1 AND mechanic_id = $2',
      [id, req.user.mechanic_id]
    );
    
    if (noteCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Field note not found or not created by you' });
    }
    
    // Build update query based on provided fields
    let updateFields = [];
    let queryParams = [];
    let paramCounter = 1;
    
    if (note !== undefined) {
      updateFields.push(`note = $${paramCounter}`);
      queryParams.push(note);
      paramCounter++;
    }
    
    if (parts_needed !== undefined) {
      updateFields.push(`parts_needed = $${paramCounter}`);
      queryParams.push(parts_needed);
      paramCounter++;
    }
    
    if (time_adjustment !== undefined) {
      updateFields.push(`time_adjustment = $${paramCounter}`);
      queryParams.push(time_adjustment);
      paramCounter++;
    }
    
    if (status !== undefined) {
      updateFields.push(`status = $${paramCounter}`);
      queryParams.push(status);
      paramCounter++;
    }
    
    // If no fields to update
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    // Add ID to params
    queryParams.push(id);
    
    // Update field note
    const updateQuery = `
      UPDATE field_notes 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, queryParams);
    
    res.json({
      message: 'Field note updated successfully',
      field_note: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating field note:', error);
    res.status(500).json({ message: 'Server error while updating field note' });
  }
});

// Get mechanic performance stats (admin/staff only)
router.get('/stats/performance', verifyToken, isStaffOrAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM mechanic_performance');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic performance stats:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic performance stats' });
  }
});

// Get mechanic availability (public)
router.get('/:id/availability', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'SELECT * FROM mechanic_availability WHERE mechanic_id = $1 ORDER BY day_of_week',
      [id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic availability:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic availability' });
  }
});

// Update mechanic availability (admin/staff only)
router.put('/:id/availability', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { availability } = req.body;
  
  if (!Array.isArray(availability)) {
    return res.status(400).json({ message: 'Availability must be an array' });
  }
  
  try {
    // Check if mechanic exists
    const mechanicCheck = await db.query(
      'SELECT * FROM mechanics WHERE id = $1',
      [id]
    );
    
    if (mechanicCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Mechanic not found' });
    }
    
    // Begin transaction
    await db.query('BEGIN');
    
    // Delete existing availability
    await db.query('DELETE FROM mechanic_availability WHERE mechanic_id = $1', [id]);
    
    // Insert new availability
    for (const slot of availability) {
      const { day_of_week, start_time, end_time } = slot;
      
      if (day_of_week === undefined || !start_time || !end_time) {
        await db.query('ROLLBACK');
        return res.status(400).json({ 
          message: 'Each availability slot must have day_of_week, start_time, and end_time' 
        });
      }
      
      await db.query(
        'INSERT INTO mechanic_availability (mechanic_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
        [id, day_of_week, start_time, end_time]
      );
    }
    
    // Commit transaction
    await db.query('COMMIT');
    
    // Get updated availability
    const result = await db.query(
      'SELECT * FROM mechanic_availability WHERE mechanic_id = $1 ORDER BY day_of_week',
      [id]
    );
    
    res.json({
      message: 'Mechanic availability updated successfully',
      availability: result.rows
    });
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    console.error('Error updating mechanic availability:', error);
    res.status(500).json({ message: 'Server error while updating mechanic availability' });
  }
});

// Get mechanic by ID (public) - This should be last since it uses a parameter that could match other routes
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const mechanicResult = await db.query(
      `SELECT m.*, u.name, u.avatar_url, u.initials, u.status, u.email
       FROM mechanics m
       JOIN users u ON m.user_id = u.id
       WHERE m.id = $1`,
      [id]
    );
    
    if (mechanicResult.rows.length === 0) {
      return res.status(404).json({ message: 'Mechanic not found' });
    }
    
    // Get mechanic availability
    const availabilityResult = await db.query(
      'SELECT * FROM mechanic_availability WHERE mechanic_id = $1 ORDER BY day_of_week',
      [id]
    );
    
    // Get mechanic performance stats
    const statsResult = await db.query(
      'SELECT * FROM mechanic_performance WHERE id = $1',
      [id]
    );
    
    // Get testimonials for this mechanic
    const testimonialResult = await db.query(
      `SELECT t.*, u.name as customer_name, u.avatar_url, s.name as service_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       WHERE t.mechanic_id = $1 AND t.approved = TRUE
       ORDER BY t.date DESC`,
      [id]
    );
    
    res.json({
      ...mechanicResult.rows[0],
      availability: availabilityResult.rows,
      performance: statsResult.rows[0] || null,
      testimonials: testimonialResult.rows
    });
  } catch (error) {
    console.error('Error fetching mechanic:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic' });
  }
});

module.exports = router; 