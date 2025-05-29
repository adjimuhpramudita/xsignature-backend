const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin, isOwner, isAdminOrOwner } = require('../middleware/auth.middleware');

// Get dashboard statistics
router.get('/stats', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    // Refresh dashboard stats materialized view
    await db.query('SELECT refresh_dashboard_stats()');
    
    // Get stats from materialized view
    const statsResult = await db.query('SELECT * FROM dashboard_stats');
    
    if (statsResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dashboard stats not found' });
    }
    
    // Transform field names to match what the frontend expects
    const stats = statsResult.rows[0];
    const transformedStats = {
      totalBookings: parseInt(stats.pending_bookings || 0) + 
                    parseInt(stats.confirmed_bookings || 0) + 
                    parseInt(stats.in_progress_bookings || 0) + 
                    parseInt(stats.completed_bookings || 0) + 
                    parseInt(stats.cancelled_bookings || 0),
      pendingBookings: parseInt(stats.pending_bookings || 0),
      completedBookings: parseInt(stats.completed_bookings || 0),
      canceledBookings: parseInt(stats.cancelled_bookings || 0),
      totalCustomers: parseInt(stats.total_customers || 0),
      totalMechanics: parseInt(stats.active_mechanics || 0)
    };
    
    res.json(transformedStats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error while fetching dashboard stats' });
  }
});

// Get bookings by day
router.get('/bookings-by-day', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        to_char(booking_date, 'Dy') AS name,
        COUNT(*) AS bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled
      FROM bookings
      WHERE booking_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY to_char(booking_date, 'Dy'), EXTRACT(DOW FROM booking_date)
      ORDER BY EXTRACT(DOW FROM booking_date)
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings by day:', error);
    res.status(500).json({ message: 'Server error while fetching bookings by day' });
  }
});

// Get bookings by week
router.get('/bookings-by-week', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        CONCAT('Week ', EXTRACT(WEEK FROM booking_date) - EXTRACT(WEEK FROM DATE_TRUNC('month', CURRENT_DATE)) + 1) AS name,
        COUNT(*) AS bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled
      FROM bookings
      WHERE booking_date >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY EXTRACT(WEEK FROM booking_date)
      ORDER BY EXTRACT(WEEK FROM booking_date)
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings by week:', error);
    res.status(500).json({ message: 'Server error while fetching bookings by week' });
  }
});

// Get bookings by month
router.get('/bookings-by-month', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        TO_CHAR(booking_date, 'Mon') AS name,
        COUNT(*) AS bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled
      FROM bookings
      WHERE booking_date >= DATE_TRUNC('year', CURRENT_DATE)
      GROUP BY TO_CHAR(booking_date, 'Mon'), EXTRACT(MONTH FROM booking_date)
      ORDER BY EXTRACT(MONTH FROM booking_date)
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings by month:', error);
    res.status(500).json({ message: 'Server error while fetching bookings by month' });
  }
});

// Get service statistics
router.get('/service-stats', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.name,
        COUNT(b.id) AS value
      FROM services s
      LEFT JOIN bookings b ON s.id = b.service_id
      GROUP BY s.name
      ORDER BY value DESC
      LIMIT 5
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service stats:', error);
    res.status(500).json({ message: 'Server error while fetching service stats' });
  }
});

// Get mechanic performance
router.get('/mechanic-performance', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        u.name,
        COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as jobs,
        COALESCE(AVG(b.rating), 0) as rating
      FROM users u
      JOIN mechanics m ON u.id = m.user_id
      LEFT JOIN bookings b ON m.id = b.mechanic_id
      WHERE u.role = 'mechanic'
      GROUP BY u.id, u.name
      ORDER BY jobs DESC
      LIMIT 5
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic performance:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic performance' });
  }
});

// Get mechanic stats (alias for mechanic-performance)
router.get('/mechanic-stats', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        u.name,
        COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as jobs,
        COALESCE(AVG(b.rating), 0) as rating
      FROM users u
      JOIN mechanics m ON u.id = m.user_id
      LEFT JOIN bookings b ON m.id = b.mechanic_id
      WHERE u.role = 'mechanic'
      GROUP BY u.id, u.name
      ORDER BY jobs DESC
      LIMIT 5
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic stats:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic stats' });
  }
});

// Get recent bookings
router.get('/recent-bookings', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        b.id, 
        b.booking_date, 
        b.status, 
        b.total_price,
        c.name as customer_name, 
        s.name as service_name
      FROM bookings b
       JOIN customers c ON b.customer_id = c.id
      JOIN services s ON b.service_id = s.id
       ORDER BY b.booking_date DESC
      LIMIT 10
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recent bookings:', error);
    res.status(500).json({ message: 'Server error while fetching recent bookings' });
  }
});

// Get bookings by status
router.get('/bookings-by-status', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        status, 
        COUNT(*) as count
      FROM bookings
      WHERE booking_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY status
      ORDER BY 
        CASE 
          WHEN status = 'pending' THEN 1
          WHEN status = 'confirmed' THEN 2
          WHEN status = 'in-progress' THEN 3
          WHEN status = 'completed' THEN 4
          WHEN status = 'cancelled' THEN 5
        END
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings by status:', error);
    res.status(500).json({ message: 'Server error while fetching bookings by status' });
  }
});

// Get today's bookings
router.get('/todays-bookings', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        b.*, 
             s.name AS service_name, 
             c.id AS customer_id, 
             u.name AS customer_name,
        v.make, 
        v.model, 
        v.license_plate,
             m.id AS mechanic_id,
             mu.name AS mechanic_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      LEFT JOIN users mu ON m.user_id = mu.id
      WHERE b.booking_date = CURRENT_DATE
      ORDER BY b.booking_time
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching today\'s bookings:', error);
    res.status(500).json({ message: 'Server error while fetching today\'s bookings' });
  }
});

// Get upcoming bookings (admin/staff/owner only)
router.get('/upcoming-bookings', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM upcoming_bookings
      LIMIT 10
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching upcoming bookings:', error);
    res.status(500).json({ message: 'Server error while fetching upcoming bookings' });
  }
});

// Get mechanic workload (admin/staff/owner only)
router.get('/mechanic-workload', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        m.id AS mechanic_id,
        u.name AS mechanic_name,
        COUNT(CASE WHEN b.status = 'pending' THEN 1 END) AS pending_tasks,
        COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) AS confirmed_tasks,
        COUNT(CASE WHEN b.status = 'in-progress' THEN 1 END) AS in_progress_tasks,
        COUNT(CASE WHEN b.status = 'completed' AND b.booking_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) AS completed_tasks_30d,
        COUNT(b.id) AS total_tasks
      FROM mechanics m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN bookings b ON m.id = b.mechanic_id AND b.booking_date >= CURRENT_DATE - INTERVAL '30 days'
      WHERE u.status = 'active'
      GROUP BY m.id, u.name
      ORDER BY total_tasks DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic workload:', error);
    res.status(500).json({ message: 'Server error while fetching mechanic workload' });
  }
});

// Get service popularity (admin/staff/owner only)
router.get('/service-popularity', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM service_popularity ORDER BY total_bookings DESC');
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service popularity:', error);
    res.status(500).json({ message: 'Server error while fetching service popularity' });
  }
});

// Get bookings by service (admin/staff/owner only)
router.get('/bookings-by-service', verifyToken, isAdminOrOwner, async (req, res) => {
  const { period = '30' } = req.query; // Default to 30 days
  
  try {
    const result = await db.query(`
      SELECT 
        s.id AS service_id,
        s.name AS service_name,
        s.category,
        COUNT(b.id) AS booking_count,
        SUM(s.price) AS total_revenue
      FROM services s
      LEFT JOIN bookings b ON s.id = b.service_id 
        AND b.booking_date >= CURRENT_DATE - INTERVAL '${period} days'
        AND b.status != 'cancelled'
      GROUP BY s.id, s.name, s.category
      ORDER BY booking_count DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings by service:', error);
    res.status(500).json({ message: 'Server error while fetching bookings by service' });
  }
});

// Get customer activity (admin/staff/owner only)
router.get('/customer-activity', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ca.*, u.email 
      FROM customer_activity ca
      JOIN customers c ON ca.id = c.id
      JOIN users u ON c.user_id = u.id
      ORDER BY ca.total_spent DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer activity:', error);
    res.status(500).json({ message: 'Server error while fetching customer activity' });
  }
});

// Get revenue by period (admin/staff/owner only)
router.get('/revenue', verifyToken, isAdminOrOwner, async (req, res) => {
  const { period_type = 'monthly', start_date, end_date } = req.query;
  
  // Validate period type
  const validPeriodTypes = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!validPeriodTypes.includes(period_type)) {
    return res.status(400).json({ message: 'Invalid period type' });
  }
  
  // Default to last 12 months if dates not provided
  const endDateValue = end_date ? end_date : new Date().toISOString().split('T')[0];
  let startDateValue;
  
  if (start_date) {
    startDateValue = start_date;
  } else {
    const date = new Date();
    date.setMonth(date.getMonth() - 12);
    startDateValue = date.toISOString().split('T')[0];
  }
  
  try {
    const result = await db.query(
      'SELECT * FROM calculate_revenue($1, $2, $3)',
      [period_type, startDateValue, endDateValue]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error calculating revenue:', error);
    res.status(500).json({ message: 'Server error while calculating revenue' });
  }
});

// Get bookings by hour (admin/staff/owner only)
router.get('/bookings-by-hour', verifyToken, isAdminOrOwner, async (req, res) => {
  const { period = '90' } = req.query; // Default to 90 days
  
  try {
    const result = await db.query(`
      SELECT 
        EXTRACT(HOUR FROM booking_time) AS hour,
        COUNT(*) AS booking_count
      FROM bookings
      WHERE booking_date >= CURRENT_DATE - INTERVAL '${period} days'
        AND status != 'cancelled'
      GROUP BY hour
      ORDER BY hour
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings by hour:', error);
    res.status(500).json({ message: 'Server error while fetching bookings by hour' });
  }
});

// Get pending testimonials count (admin/staff/owner only)
router.get('/pending-testimonials', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT COUNT(*) as count
      FROM testimonials
      WHERE approved = FALSE
    `);
    
    res.json({ pending_count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching pending testimonials count:', error);
    res.status(500).json({ message: 'Server error while fetching pending testimonials count' });
  }
});

// Refresh dashboard statistics (admin/staff/owner only)
router.post('/refresh-stats', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    await db.query('SELECT refresh_dashboard_stats()');
    const refreshedStats = await db.query('SELECT * FROM dashboard_stats');
    
    res.json({
      message: 'Dashboard statistics refreshed successfully',
      stats: refreshedStats.rows[0]
    });
  } catch (error) {
    console.error('Error refreshing dashboard stats:', error);
    res.status(500).json({ message: 'Server error while refreshing dashboard stats' });
  }
});

// Get reports data
router.get('/reports', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    if (!type || !startDate || !endDate) {
      return res.status(400).json({ message: 'Type, start date, and end date are required' });
    }
    
    if (type === 'booking') {
      // Get booking statistics for the period
      const bookingStatsQuery = `
        SELECT 
          COUNT(*) as total_bookings,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600) as average_service_time
        FROM bookings
        WHERE booking_date BETWEEN $1 AND $2
      `;
      
      const bookingStatsResult = await db.query(bookingStatsQuery, [startDate, endDate]);
      const bookingStats = bookingStatsResult.rows[0];
      
      // Get detailed bookings
      const bookingsQuery = `
        SELECT 
          b.id,
          b.booking_date as date,
          u.name as customer_name,
          s.name as service_name,
          COALESCE(mu.name, '-') as mechanic_name,
          b.status,
          CASE 
            WHEN b.completed_at IS NOT NULL AND b.started_at IS NOT NULL 
            THEN ROUND(EXTRACT(EPOCH FROM (b.completed_at - b.started_at)) / 3600, 1)
            ELSE NULL
          END as duration
        FROM bookings b
        JOIN customers c ON b.customer_id = c.id
        JOIN users u ON c.user_id = u.id
        JOIN services s ON b.service_id = s.id
        LEFT JOIN mechanics m ON b.mechanic_id = m.id
        LEFT JOIN users mu ON m.user_id = mu.id
        WHERE b.booking_date BETWEEN $1 AND $2
        ORDER BY b.booking_date DESC
      `;
      
      const bookingsResult = await db.query(bookingsQuery, [startDate, endDate]);
      
      res.json({
        totalBookings: parseInt(bookingStats.total_bookings),
        completedBookings: parseInt(bookingStats.completed_bookings),
        cancelledBookings: parseInt(bookingStats.cancelled_bookings),
        averageServiceTime: parseFloat(bookingStats.average_service_time || 0).toFixed(1),
        bookings: bookingsResult.rows
      });
    } else if (type === 'feedback') {
      // Get feedback statistics
      const feedbackStatsQuery = `
        SELECT 
          COUNT(*) as total_testimonials,
          AVG(rating) as average_rating,
          ROUND(COUNT(CASE WHEN rating >= 4 THEN 1 END)::numeric / COUNT(*) * 100) as satisfaction_rate
        FROM testimonials
        WHERE created_at BETWEEN $1 AND $2
      `;
      
      const feedbackStatsResult = await db.query(feedbackStatsQuery, [startDate, endDate]);
      const feedbackStats = feedbackStatsResult.rows[0];
      
      // Get detailed testimonials
      const testimonialsQuery = `
        SELECT 
          t.id,
          t.created_at as date,
          u.name as customer_name,
          s.name as service_name,
          t.rating,
          t.comment
        FROM testimonials t
        JOIN users u ON t.user_id = u.id
        JOIN services s ON t.service_id = s.id
        WHERE t.created_at BETWEEN $1 AND $2
        ORDER BY t.created_at DESC
      `;
      
      const testimonialsResult = await db.query(testimonialsQuery, [startDate, endDate]);
      
      res.json({
        totalTestimonials: parseInt(feedbackStats.total_testimonials),
        averageRating: parseFloat(feedbackStats.average_rating || 0),
        satisfactionRate: parseInt(feedbackStats.satisfaction_rate || 0),
        testimonials: testimonialsResult.rows
      });
    } else {
      return res.status(400).json({ message: 'Invalid report type' });
    }
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Server error while fetching reports' });
  }
});

// Generate new report
router.post('/reports/generate', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const { report_type, report_date, notes } = req.body;
    
    if (!report_type || !report_date) {
      return res.status(400).json({ message: 'Report type and date are required' });
    }
    
    // Calculate report metrics
    let startDate, endDate;
    
    if (report_type === 'daily') {
      startDate = report_date;
      endDate = report_date;
    } else if (report_type === 'weekly') {
      // Calculate start and end of week
      const date = new Date(report_date);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
      startDate = new Date(date.setDate(diff)).toISOString().split('T')[0];
      endDate = new Date(date.setDate(diff + 6)).toISOString().split('T')[0];
    } else if (report_type === 'monthly') {
      // Calculate start and end of month
      const date = new Date(report_date);
      startDate = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (report_type === 'yearly') {
      // Calculate start and end of year
      const year = new Date(report_date).getFullYear();
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }
    
    // Get booking statistics
    const bookingsQuery = `
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN s.price ELSE 0 END), 0) as total_revenue,
        AVG(CASE WHEN status = 'completed' THEN rating ELSE NULL END) as average_rating
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.booking_date BETWEEN $1 AND $2
    `;
    
    const bookingsResult = await db.query(bookingsQuery, [startDate, endDate]);
    const bookingStats = bookingsResult.rows[0];
    
    // Get top service
    const topServiceQuery = `
      SELECT s.name, COUNT(*) as count
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.booking_date BETWEEN $1 AND $2
      GROUP BY s.name
      ORDER BY count DESC
      LIMIT 1
    `;
    
    const topServiceResult = await db.query(topServiceQuery, [startDate, endDate]);
    const topService = topServiceResult.rows.length > 0 ? topServiceResult.rows[0].name : null;
    
    // Get top mechanic
    const topMechanicQuery = `
      SELECT u.name, COUNT(*) as count
      FROM bookings b
      JOIN mechanics m ON b.mechanic_id = m.id
      JOIN users u ON m.user_id = u.id
      WHERE b.booking_date BETWEEN $1 AND $2 AND b.status = 'completed'
      GROUP BY u.name
      ORDER BY count DESC
      LIMIT 1
    `;
    
    const topMechanicResult = await db.query(topMechanicQuery, [startDate, endDate]);
    const topMechanic = topMechanicResult.rows.length > 0 ? topMechanicResult.rows[0].name : null;
    
    // Insert report
    const insertQuery = `
      INSERT INTO reports (
        report_type, report_date, generated_by, 
        total_bookings, completed_bookings, cancelled_bookings, 
        total_revenue, average_rating, top_service, top_mechanic, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const insertResult = await db.query(insertQuery, [
      report_type, 
      report_date, 
      req.user.id,
      bookingStats.total_bookings,
      bookingStats.completed_bookings,
      bookingStats.cancelled_bookings,
      bookingStats.total_revenue,
      bookingStats.average_rating,
      topService,
      topMechanic,
      notes
    ]);
    
    res.status(201).json({
      message: 'Report generated successfully',
      report: insertResult.rows[0]
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Server error while generating report' });
  }
});

// Get insights data for owner
router.get('/insights', verifyToken, isOwner, async (req, res) => {
  try {
    const { range = 'month' } = req.query;
    
    // Determine date range based on query parameter
    let startDate;
    const endDate = new Date();
    
    if (range === 'month') {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (range === 'quarter') {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
    } else if (range === 'year') {
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
    }
    
    // Calculate growth rate
    const previousPeriodStart = new Date(startDate);
    const previousPeriodEnd = new Date(endDate);
    
    if (range === 'month') {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1);
    } else if (range === 'quarter') {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 3);
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 3);
    } else if (range === 'year') {
      previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
      previousPeriodEnd.setFullYear(previousPeriodEnd.getFullYear() - 1);
    }
    
    // Get current period bookings
    const currentBookingsResult = await db.query(
      'SELECT COUNT(*) FROM bookings WHERE booking_date BETWEEN $1 AND $2',
      [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );
    const currentBookings = parseInt(currentBookingsResult.rows[0].count);
    
    // Get previous period bookings
    const previousBookingsResult = await db.query(
      'SELECT COUNT(*) FROM bookings WHERE booking_date BETWEEN $1 AND $2',
      [previousPeriodStart.toISOString().split('T')[0], previousPeriodEnd.toISOString().split('T')[0]]
    );
    const previousBookings = parseInt(previousBookingsResult.rows[0].count);
    
    // Calculate growth rate
    let growthRate = 0;
    if (previousBookings > 0) {
      growthRate = Math.round(((currentBookings - previousBookings) / previousBookings) * 100);
    }
    
    // Get top service
    const topServiceResult = await db.query(`
      SELECT s.name, COUNT(*) as bookings, SUM(b.total_price) as revenue
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.booking_date BETWEEN $1 AND $2
      GROUP BY s.name
      ORDER BY bookings DESC
      LIMIT 1
    `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);
    
    const topService = topServiceResult.rows.length > 0 ? {
      name: topServiceResult.rows[0].name,
      bookings: parseInt(topServiceResult.rows[0].bookings),
      revenue: parseFloat(topServiceResult.rows[0].revenue)
    } : { name: 'No data', bookings: 0, revenue: 0 };
    
    // Get top mechanic
    const topMechanicResult = await db.query(`
      SELECT u.name, COUNT(*) as completed_jobs, AVG(b.rating) as rating
      FROM bookings b
      JOIN mechanics m ON b.mechanic_id = m.id
      JOIN users u ON m.user_id = u.id
      WHERE b.booking_date BETWEEN $1 AND $2 AND b.status = 'completed'
      GROUP BY u.name
      ORDER BY completed_jobs DESC
      LIMIT 1
    `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);
    
    const topMechanic = topMechanicResult.rows.length > 0 ? {
      name: topMechanicResult.rows[0].name,
      completedJobs: parseInt(topMechanicResult.rows[0].completed_jobs),
      rating: parseFloat(topMechanicResult.rows[0].rating).toFixed(1)
    } : { name: 'No data', completedJobs: 0, rating: 0 };
    
    // Get potential revenue
    const potentialRevenueResult = await db.query(`
      SELECT AVG(s.price) * COUNT(DISTINCT booking_date) * 10 as potential
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.booking_date BETWEEN $1 AND $2
    `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);
    
    const potentialRevenue = potentialRevenueResult.rows.length > 0 ? 
      Math.round(parseFloat(potentialRevenueResult.rows[0].potential)) : 0;
    
    // Get top services
    const topServicesResult = await db.query(`
      SELECT 
        s.name,
        COUNT(*) as bookings,
        SUM(b.total_price) / 100000 as revenue
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.booking_date BETWEEN $1 AND $2
      GROUP BY s.name
      ORDER BY bookings DESC
      LIMIT 5
    `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);
    
    // Generate recommendations based on data
    const serviceRecommendations = [
      {
        type: 'promotion',
        title: 'Promosikan Layanan Terbaik',
        description: `Tingkatkan promosi untuk layanan ${topService.name} yang sudah populer untuk meningkatkan pendapatan.`
      },
      {
        type: 'improvement',
        title: 'Tingkatkan Kualitas Layanan',
        description: 'Lakukan pelatihan tambahan untuk mekanik untuk meningkatkan rating pelanggan.'
      },
      {
        type: 'analysis',
        title: 'Analisis Tren Musiman',
        description: 'Perhatikan tren booking berdasarkan musim untuk mengoptimalkan ketersediaan staf.'
      }
    ];
    
    // Generate short term recommendations
    const shortTermRecommendations = [
      {
        title: 'Promosi Paket Layanan',
        description: 'Buat paket layanan yang menggabungkan layanan populer dengan layanan yang kurang populer.'
      },
      {
        title: 'Program Loyalitas',
        description: 'Implementasikan program loyalitas untuk pelanggan tetap dengan diskon atau layanan gratis.'
      },
      {
        title: 'Pelatihan Mekanik',
        description: 'Adakan pelatihan untuk mekanik untuk meningkatkan kecepatan dan kualitas layanan.'
      }
    ];
    
    // Generate long term recommendations
    const longTermRecommendations = [
      {
        title: 'Ekspansi Layanan',
        description: 'Pertimbangkan untuk menambahkan layanan baru berdasarkan permintaan pelanggan.'
      },
      {
        title: 'Teknologi Baru',
        description: 'Investasikan dalam teknologi baru untuk diagnosis dan perbaikan kendaraan.'
      },
      {
        title: 'Pengembangan Lokasi',
        description: 'Analisis kemungkinan membuka cabang baru di lokasi strategis.'
      }
    ];
    
    res.json({
      growthRate,
      topService,
      topMechanic,
      potentialRevenue,
      topServices: topServicesResult.rows,
      serviceRecommendations,
      shortTermRecommendations,
      longTermRecommendations
    });
  } catch (error) {
    console.error('Error fetching insights data:', error);
    res.status(500).json({ message: 'Server error while fetching insights data' });
  }
});

// Get booking report data
router.get('/reports/booking', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }
    
    // Get booking statistics for the period
    const bookingStatsQuery = `
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
        COALESCE(SUM(total_price), 0) as total_revenue,
        AVG(CASE WHEN status = 'completed' THEN rating ELSE NULL END) as average_rating
      FROM bookings
      WHERE booking_date BETWEEN $1 AND $2
    `;
    
    const bookingStatsResult = await db.query(bookingStatsQuery, [startDate, endDate]);
    const bookingStats = bookingStatsResult.rows[0];
    
    // Get bookings by service
    const bookingsByServiceQuery = `
      SELECT 
        s.name as service_name,
        COUNT(*) as booking_count,
        COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) as cancelled_count,
        COALESCE(SUM(b.total_price), 0) as total_revenue
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.booking_date BETWEEN $1 AND $2
      GROUP BY s.name
      ORDER BY booking_count DESC
    `;
    
    const bookingsByServiceResult = await db.query(bookingsByServiceQuery, [startDate, endDate]);
    
    // Get bookings by mechanic
    const bookingsByMechanicQuery = `
      SELECT 
        u.name as mechanic_name,
        COUNT(*) as booking_count,
        COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as completed_count,
        AVG(CASE WHEN b.status = 'completed' THEN b.rating ELSE NULL END) as average_rating
      FROM bookings b
      JOIN mechanics m ON b.mechanic_id = m.id
      JOIN users u ON m.user_id = u.id
      WHERE b.booking_date BETWEEN $1 AND $2
      GROUP BY u.name
      ORDER BY booking_count DESC
    `;
    
    const bookingsByMechanicResult = await db.query(bookingsByMechanicQuery, [startDate, endDate]);
    
    // Get bookings by day
    const bookingsByDayQuery = `
      SELECT 
        TO_CHAR(booking_date, 'YYYY-MM-DD') as booking_date,
        COUNT(*) as booking_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COALESCE(SUM(total_price), 0) as daily_revenue
      FROM bookings
      WHERE booking_date BETWEEN $1 AND $2
      GROUP BY booking_date
      ORDER BY booking_date
    `;
    
    const bookingsByDayResult = await db.query(bookingsByDayQuery, [startDate, endDate]);
    
    res.json({
      summary: bookingStats,
      bookingsByService: bookingsByServiceResult.rows,
      bookingsByMechanic: bookingsByMechanicResult.rows,
      bookingsByDay: bookingsByDayResult.rows
    });
  } catch (error) {
    console.error('Error fetching booking report data:', error);
    res.status(500).json({ message: 'Server error while fetching booking report data' });
  }
});

module.exports = router; 