const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin, isCustomer } = require('../middleware/auth.middleware');

// Get all approved testimonials (public)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
              u.name AS customer_name, 
              u.avatar_url,
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE t.approved = TRUE
       ORDER BY t.featured DESC, t.date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching testimonials:', error);
    res.status(500).json({ message: 'Server error while fetching testimonials' });
  }
});

// Get featured testimonials (public)
router.get('/featured', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
              u.name AS customer_name, 
              u.avatar_url,
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE t.approved = TRUE AND t.featured = TRUE
       ORDER BY t.date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching featured testimonials:', error);
    res.status(500).json({ message: 'Server error while fetching featured testimonials' });
  }
});

// Get all testimonials (admin/staff only)
router.get('/all', verifyToken, isStaffOrAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
              u.name AS customer_name, 
              u.avatar_url,
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       ORDER BY t.approved, t.date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all testimonials:', error);
    res.status(500).json({ message: 'Server error while fetching all testimonials' });
  }
});

// Get pending testimonials (admin/staff only)
router.get('/pending', verifyToken, isStaffOrAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
              u.name AS customer_name, 
              u.avatar_url,
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE t.approved = FALSE
       ORDER BY t.date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending testimonials:', error);
    res.status(500).json({ message: 'Server error while fetching pending testimonials' });
  }
});

// Get testimonials by service ID (public)
router.get('/service/:service_id', async (req, res) => {
  const { service_id } = req.params;
  
  try {
    const result = await db.query(
      `SELECT t.*, 
              u.name AS customer_name, 
              u.avatar_url,
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE t.service_id = $1 AND t.approved = TRUE
       ORDER BY t.date DESC`,
      [service_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching testimonials by service:', error);
    res.status(500).json({ message: 'Server error while fetching testimonials by service' });
  }
});

// Get testimonials by mechanic ID (public)
router.get('/mechanic/:mechanic_id', async (req, res) => {
  const { mechanic_id } = req.params;
  
  try {
    const result = await db.query(
      `SELECT t.*, 
              u.name AS customer_name, 
              u.avatar_url,
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE t.mechanic_id = $1 AND t.approved = TRUE
       ORDER BY t.date DESC`,
      [mechanic_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching testimonials by mechanic:', error);
    res.status(500).json({ message: 'Server error while fetching testimonials by mechanic' });
  }
});

// Get customer's own testimonials
router.get('/my-testimonials', verifyToken, isCustomer, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE t.customer_id = $1
       ORDER BY t.date DESC`,
      [req.user.customer_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer testimonials:', error);
    res.status(500).json({ message: 'Server error while fetching customer testimonials' });
  }
});

// Get testimonial by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      `SELECT t.*, 
              u.name AS customer_name, 
              u.avatar_url,
              s.name AS service_name,
              mu.name AS mechanic_name
       FROM testimonials t
       JOIN customers c ON t.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN mechanics m ON t.mechanic_id = m.id
       LEFT JOIN users mu ON m.user_id = mu.id
       WHERE t.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    
    const testimonial = result.rows[0];
    
    // If testimonial is not approved, only allow admin/staff or the testimonial owner to view it
    if (!testimonial.approved) {
      if (!req.user) {
        return res.status(403).json({ message: 'Not authorized to view this testimonial' });
      }
      
      const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
      const isOwner = req.user.role === 'customer' && req.user.customer_id === testimonial.customer_id;
      
      if (!isAdminOrStaff && !isOwner) {
        return res.status(403).json({ message: 'Not authorized to view this testimonial' });
      }
    }
    
    res.json(testimonial);
  } catch (error) {
    console.error('Error fetching testimonial:', error);
    res.status(500).json({ message: 'Server error while fetching testimonial' });
  }
});

// Create new testimonial (customer only)
router.post('/', verifyToken, isCustomer, async (req, res) => {
  const { service_id, mechanic_id, rating, comment } = req.body;
  
  // Validate required fields
  if (!service_id || !rating || !comment) {
    return res.status(400).json({ message: 'Service ID, rating, and comment are required' });
  }
  
  // Validate rating
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
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
    
    // Check if mechanic exists (if provided)
    if (mechanic_id) {
      const mechanicCheck = await db.query(
        'SELECT * FROM mechanics WHERE id = $1',
        [mechanic_id]
      );
      
      if (mechanicCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Mechanic not found' });
      }
    }
    
    // Check if customer has already reviewed this service/mechanic combination
    const existingCheck = await db.query(
      'SELECT * FROM testimonials WHERE customer_id = $1 AND service_id = $2 AND mechanic_id IS NOT DISTINCT FROM $3',
      [req.user.customer_id, service_id, mechanic_id]
    );
    
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ 
        message: 'You have already submitted a testimonial for this service/mechanic combination' 
      });
    }
    
    // Create testimonial
    const result = await db.query(
      `INSERT INTO testimonials 
       (customer_id, service_id, mechanic_id, rating, comment, date, approved, featured) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, FALSE, FALSE) 
       RETURNING *`,
      [req.user.customer_id, service_id, mechanic_id, rating, comment]
    );
    
    res.status(201).json({
      message: 'Testimonial submitted successfully and is pending approval',
      testimonial: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating testimonial:', error);
    res.status(500).json({ message: 'Server error while creating testimonial' });
  }
});

// Approve/reject testimonial (admin/staff only)
router.put('/:id/approve', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;
  
  if (approved === undefined) {
    return res.status(400).json({ message: 'Approved status is required' });
  }
  
  try {
    // Check if testimonial exists
    const testimonialCheck = await db.query(
      'SELECT * FROM testimonials WHERE id = $1',
      [id]
    );
    
    if (testimonialCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    
    // Update approval status
    const result = await db.query(
      'UPDATE testimonials SET approved = $1, featured = FALSE WHERE id = $2 RETURNING *',
      [approved, id]
    );
    
    res.json({
      message: `Testimonial ${approved ? 'approved' : 'rejected'} successfully`,
      testimonial: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating testimonial approval:', error);
    res.status(500).json({ message: 'Server error while updating testimonial approval' });
  }
});

// Toggle featured status (admin/staff only)
router.put('/:id/featured', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { featured } = req.body;
  
  if (featured === undefined) {
    return res.status(400).json({ message: 'Featured status is required' });
  }
  
  try {
    // Check if testimonial exists
    const testimonialCheck = await db.query(
      'SELECT * FROM testimonials WHERE id = $1',
      [id]
    );
    
    if (testimonialCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    
    // Check if testimonial is approved
    if (!testimonialCheck.rows[0].approved && featured) {
      return res.status(400).json({ message: 'Cannot feature an unapproved testimonial' });
    }
    
    // Update featured status
    const result = await db.query(
      'UPDATE testimonials SET featured = $1 WHERE id = $2 RETURNING *',
      [featured, id]
    );
    
    res.json({
      message: `Testimonial ${featured ? 'featured' : 'unfeatured'} successfully`,
      testimonial: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating testimonial featured status:', error);
    res.status(500).json({ message: 'Server error while updating testimonial featured status' });
  }
});

// Delete testimonial
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if testimonial exists
    const testimonialCheck = await db.query(
      'SELECT * FROM testimonials WHERE id = $1',
      [id]
    );
    
    if (testimonialCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    
    // Check permissions
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    const isOwner = req.user.role === 'customer' && req.user.customer_id === testimonialCheck.rows[0].customer_id;
    
    if (!isAdminOrStaff && !isOwner) {
      return res.status(403).json({ message: 'Not authorized to delete this testimonial' });
    }
    
    // Delete testimonial
    await db.query('DELETE FROM testimonials WHERE id = $1', [id]);
    
    res.json({ message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error('Error deleting testimonial:', error);
    res.status(500).json({ message: 'Server error while deleting testimonial' });
  }
});

module.exports = router; 