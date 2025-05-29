const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isMechanic, isStaffOrAdmin } = require('../middleware/auth.middleware');

/**
 * @route   GET /api/mechanic-tasks/daily
 * @desc    Get mechanic's tasks for today
 * @access  Private (mechanic only)
 */
router.get('/daily', verifyToken, isMechanic, async (req, res) => {
  try {
    const mechanicId = req.user.mechanic_id;
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db.query(
      `SELECT 
        b.id, 
        b.booking_date,
        b.booking_time,
        b.status AS booking_status,
        s.id AS service_id,
        s.name AS service_name, 
        s.description AS service_description,
        s.price AS service_price,
        s.estimated_time,
        c.id AS customer_id, 
        u.name AS customer_name,
        u.phone AS customer_phone,
        v.id AS vehicle_id,
        v.make, 
        v.model, 
        v.year,
        v.license_plate,
        mt.id AS task_id,
        mt.status AS task_status,
        mt.start_time,
        mt.end_time,
        b.notes AS customer_notes,
        (SELECT string_agg(fn.note, ', ') 
         FROM field_notes fn 
         WHERE fn.booking_id = b.id) AS field_notes
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanic_tasks mt ON b.id = mt.booking_id AND mt.mechanic_id = $1
      WHERE b.mechanic_id = $1 AND b.booking_date = $2
      ORDER BY b.booking_time ASC`,
      [mechanicId, today]
    );
    
    res.json({
      date: today,
      tasks: result.rows
    });
  } catch (error) {
    console.error('Error fetching daily mechanic tasks:', error);
    res.status(500).json({ message: 'Server error while fetching daily tasks' });
  }
});

/**
 * @route   GET /api/mechanic-tasks/all
 * @desc    Get all mechanic's tasks (with optional filters)
 * @access  Private (mechanic only)
 */
router.get('/all', verifyToken, isMechanic, async (req, res) => {
  try {
    const mechanicId = req.user.mechanic_id;
    const { status, startDate, endDate } = req.query;
    
    let queryParams = [mechanicId];
    let statusCondition = '';
    let dateCondition = '';
    
    // Add status filter if provided
    if (status && status !== 'all') {
      statusCondition = 'AND mt.status = $2';
      queryParams.push(status);
    }
    
    // Add date range filter if provided
    if (startDate && endDate) {
      const paramIndex = queryParams.length + 1;
      dateCondition = `AND b.booking_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      queryParams.push(startDate, endDate);
    }
    
    const result = await db.query(
      `SELECT 
        b.id, 
        b.booking_date,
        b.booking_time,
        b.status AS booking_status,
        s.name AS service_name, 
        s.price AS service_price,
        s.estimated_time,
        c.id AS customer_id, 
        u.name AS customer_name,
        v.make, 
        v.model, 
        v.license_plate,
        mt.id AS task_id,
        mt.status AS task_status,
        mt.start_time,
        mt.end_time,
        b.notes AS customer_notes
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanic_tasks mt ON b.id = mt.booking_id AND mt.mechanic_id = $1
      WHERE b.mechanic_id = $1 ${statusCondition} ${dateCondition}
      ORDER BY b.booking_date DESC, b.booking_time ASC`,
      queryParams
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic tasks:', error);
    res.status(500).json({ message: 'Server error while fetching tasks' });
  }
});

/**
 * @route   GET /api/mechanic-tasks/date-range
 * @desc    Get mechanic's tasks for a date range (for schedule page)
 * @access  Private (mechanic only)
 */
router.get('/date-range', verifyToken, isMechanic, async (req, res) => {
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Start date and end date are required' });
  }
  
  try {
    const mechanicId = req.user.mechanic_id;
    
    const result = await db.query(
      `SELECT 
        b.id, 
        b.booking_date AS date,
        b.booking_time AS time,
        b.status AS booking_status,
        s.name AS service_name, 
        s.estimated_time,
        c.id AS customer_id, 
        u.name AS customer_name,
        v.make, 
        v.model, 
        v.license_plate,
        mt.id AS task_id,
        mt.status AS task_status,
        b.notes AS customer_notes
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanic_tasks mt ON b.id = mt.booking_id AND mt.mechanic_id = $1
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

/**
 * @route   GET /api/mechanic-tasks/:taskId
 * @desc    Get details of a specific task
 * @access  Private (mechanic only)
 */
router.get('/:taskId', verifyToken, isMechanic, async (req, res) => {
  try {
    const { taskId } = req.params;
    const mechanicId = req.user.mechanic_id;
    
    console.log(`GET /:taskId called with taskId: ${taskId}, mechanicId: ${mechanicId}`);
    
    // First, check if the taskId is a booking ID
    let result;
    let bookingId;
    
    // Try to get the task directly
    result = await db.query(
      `SELECT 
        b.id, 
        b.booking_date,
        b.booking_time,
        b.status AS booking_status,
        s.id AS service_id,
        s.name AS service_name, 
        s.description AS service_description,
        s.price AS service_price,
        s.estimated_time,
        c.id AS customer_id, 
        u.name AS customer_name,
        u.phone AS customer_phone,
        v.id AS vehicle_id,
        v.make, 
        v.model, 
        v.year,
        v.license_plate,
        mt.id AS task_id,
        mt.status AS task_status,
        mt.start_time,
        mt.end_time,
        b.notes AS customer_notes
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanic_tasks mt ON b.id = mt.booking_id AND mt.mechanic_id = $2
      WHERE (mt.id = $1 OR b.id = $1) AND b.mechanic_id = $2`,
      [taskId, mechanicId]
    );
    
    if (result.rows.length === 0) {
      console.log(`No results found for taskId: ${taskId}, mechanicId: ${mechanicId}`);
      
      // Try another query just for booking ID
      const bookingResult = await db.query(
        `SELECT 
          b.id, 
          b.booking_date,
          b.booking_time,
          b.status AS booking_status,
          s.id AS service_id,
          s.name AS service_name, 
          s.description AS service_description,
          s.price AS service_price,
          s.estimated_time,
          c.id AS customer_id, 
          u.name AS customer_name,
          u.phone AS customer_phone,
          v.id AS vehicle_id,
          v.make, 
          v.model, 
          v.year,
          v.license_plate,
          b.notes AS customer_notes
        FROM bookings b
        JOIN services s ON b.service_id = s.id
        JOIN customers c ON b.customer_id = c.id
        JOIN users u ON c.user_id = u.id
        JOIN vehicles v ON b.vehicle_id = v.id
        WHERE b.id = $1 AND b.mechanic_id = $2`,
        [taskId, mechanicId]
      );
      
      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ message: 'Task or booking not found or not assigned to you' });
      }
      
      result = bookingResult;
    }
    
    bookingId = result.rows[0].id;
    console.log(`Found bookingId: ${bookingId}`);
    
    // Get field notes for this task
    const notesResult = await db.query(
      `SELECT fn.*, u.name AS mechanic_name
       FROM field_notes fn
       JOIN mechanics m ON fn.mechanic_id = m.id
       JOIN users u ON m.user_id = u.id
       WHERE fn.booking_id = $1
       ORDER BY fn.date DESC, fn.time DESC`,
      [bookingId]
    );
    
    const task = {
      ...result.rows[0],
      field_notes: notesResult.rows
    };
    
    res.json(task);
  } catch (error) {
    console.error('Error fetching task details:', error);
    res.status(500).json({ message: 'Server error while fetching task details' });
  }
});

/**
 * @route   PUT /api/mechanic-tasks/:taskId/status
 * @desc    Update task status
 * @access  Private (mechanic only)
 */
router.put('/:taskId/status', verifyToken, isMechanic, async (req, res) => {
  const { taskId } = req.params;
  const { status } = req.body;
  
  // Validate status
  const validStatuses = ['pending', 'in-progress', 'completed'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Valid status is required (pending, in-progress, completed)' });
  }
  
  try {
    const mechanicId = req.user.mechanic_id;
    let bookingId = null;
    let task = null;
    
    // Begin transaction
    await db.query('BEGIN');
    
    try {
      // First, check if the taskId is a booking ID
      const bookingCheck = await db.query(
        `SELECT * FROM bookings WHERE id = $1 AND mechanic_id = $2`,
        [taskId, mechanicId]
      );
      
      if (bookingCheck.rows.length > 0) {
        // It's a booking ID
        bookingId = taskId;
        
        // Check if a task already exists
        const taskCheck = await db.query(
          `SELECT * FROM mechanic_tasks WHERE booking_id = $1 AND mechanic_id = $2`,
          [bookingId, mechanicId]
        );
        
        if (taskCheck.rows.length > 0) {
          task = taskCheck.rows[0];
        } else {
          // Create a new task
          const now = new Date();
          const nowTime = now.toTimeString().split(' ')[0];
          const bookingEndTime = bookingCheck.rows[0].booking_time;
          
          const newTaskResult = await db.query(
            `INSERT INTO mechanic_tasks 
             (booking_id, mechanic_id, status, start_time, end_time, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
             RETURNING *`,
            [bookingId, mechanicId, status, nowTime, bookingEndTime]
          );
          
          task = newTaskResult.rows[0];
        }
      } else {
        // Check if it's a task ID
        const taskCheck = await db.query(
          `SELECT mt.*, b.id AS booking_id 
           FROM mechanic_tasks mt
           JOIN bookings b ON mt.booking_id = b.id
           WHERE mt.id = $1 AND b.mechanic_id = $2`,
          [taskId, mechanicId]
        );
        
        if (taskCheck.rows.length === 0) {
          await db.query('ROLLBACK');
          return res.status(404).json({ message: 'Task or booking not found or not assigned to you' });
        }
        
        task = taskCheck.rows[0];
        bookingId = task.booking_id;
      }
      
      // Update task status
      const now = new Date();
      const nowTime = now.toTimeString().split(' ')[0];
      let updateFields = ['status = $1', 'updated_at = NOW()'];
      let queryParams = [status];
      
      // Set start_time if moving to in-progress
      if (status === 'in-progress' && (!task.start_time || task.start_time === task.end_time)) {
        updateFields.push('start_time = $2');
        queryParams.push(nowTime);
      }
      
      // Set end_time if moving to completed
      if (status === 'completed' && !task.end_time) {
        const paramIndex = queryParams.length + 1;
        updateFields.push(`end_time = $${paramIndex}`);
        queryParams.push(nowTime);
      }
      
      // Add task ID and mechanic ID to params
      queryParams.push(task.id, mechanicId);
      
      const taskResult = await db.query(
        `UPDATE mechanic_tasks 
         SET ${updateFields.join(', ')} 
         WHERE id = $${queryParams.length - 1} 
         AND mechanic_id = $${queryParams.length} 
         RETURNING *`,
        queryParams
      );
      
      // Also update booking status to match task status
      if (status === 'in-progress' || status === 'completed') {
        await db.query(
          'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2',
          [status, bookingId]
        );
      }
      
      // If task is completed, update completed_at timestamp in bookings
      if (status === 'completed') {
        await db.query(
          'UPDATE bookings SET completed_at = NOW() WHERE id = $1',
          [bookingId]
        );
      }
      
      // Commit transaction
      await db.query('COMMIT');
      
      // Get updated task with booking info
      const updatedTaskResult = await db.query(
        `SELECT 
          mt.*,
          b.id AS booking_id,
          b.booking_date,
          b.booking_time,
          b.status AS booking_status,
          s.name AS service_name,
          c.id AS customer_id,
          u.name AS customer_name,
          v.make, v.model, v.license_plate
        FROM mechanic_tasks mt
        JOIN bookings b ON mt.booking_id = b.id
        JOIN services s ON b.service_id = s.id
        JOIN customers c ON b.customer_id = c.id
        JOIN users u ON c.user_id = u.id
        JOIN vehicles v ON b.vehicle_id = v.id
        WHERE mt.id = $1`,
        [task.id]
      );
      
      res.json({
        message: 'Task status updated successfully',
        task: updatedTaskResult.rows[0]
      });
    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ message: 'Server error while updating task status' });
  }
});

/**
 * @route   POST /api/mechanic-tasks/:taskId/notes
 * @desc    Add field note to a task
 * @access  Private (mechanic only)
 */
router.post('/:taskId/notes', verifyToken, isMechanic, async (req, res) => {
  const { taskId } = req.params;
  const { note } = req.body;
  
  if (!note) {
    return res.status(400).json({ message: 'Note is required' });
  }
  
  try {
    const mechanicId = req.user.mechanic_id;
    let bookingId = null;
    
    // First, check if the taskId is a booking ID
    const bookingCheck = await db.query(
      `SELECT * FROM bookings WHERE id = $1 AND mechanic_id = $2`,
      [taskId, mechanicId]
    );
    
    if (bookingCheck.rows.length > 0) {
      // It's a booking ID
      bookingId = taskId;
    } else {
      // Check if it's a task ID
      const taskCheck = await db.query(
        `SELECT mt.*, b.id AS booking_id 
         FROM mechanic_tasks mt
         JOIN bookings b ON mt.booking_id = b.id
         WHERE mt.id = $1 AND b.mechanic_id = $2`,
        [taskId, mechanicId]
      );
      
      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Task or booking not found or not assigned to you' });
      }
      
      bookingId = taskCheck.rows[0].booking_id;
    }
    
    // Add field note
    const result = await db.query(
      `INSERT INTO field_notes 
       (mechanic_id, booking_id, date, time, note, status)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_TIME, $3, 'pending')
       RETURNING *`,
      [mechanicId, bookingId, note]
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

module.exports = router; 