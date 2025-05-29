const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, isAdminOrOwner } = require('../middleware/auth');

// Get all services
router.get('/', async (req, res) => {
  try {
    const { search, category, featured, in_stock } = req.query;
    
    let query = `SELECT * FROM services WHERE 1=1`;
    const params = [];
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }
    
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    
    if (featured === 'true') {
      query += ` AND featured = true`;
    }
    
    if (in_stock === 'true') {
      query += ` AND in_stock = true`;
    }
    
    query += ` ORDER BY name ASC`;
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Server error while fetching services' });
  }
});

// Get service by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM services WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ message: 'Server error while fetching service' });
  }
});

// Create new service
router.post('/', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const { name, description, price, category, image_url, estimated_time, in_stock, featured, stock } = req.body;
    
    const result = await db.query(
      `INSERT INTO services 
       (name, description, price, category, image_url, estimated_time, in_stock, featured, stock) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [name, description, price, category, image_url, estimated_time, in_stock, featured, stock || 0]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Server error while creating service' });
  }
});

// Update service
router.put('/:id', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, image_url, estimated_time, in_stock, featured, stock } = req.body;
    
    const result = await db.query(
      `UPDATE services 
       SET name = $1, description = $2, price = $3, category = $4, 
           image_url = $5, estimated_time = $6, in_stock = $7, featured = $8, stock = $9, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $10 
       RETURNING *`,
      [name, description, price, category, image_url, estimated_time, in_stock, featured, stock || 0, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Server error while updating service' });
  }
});

// Delete service
router.delete('/:id', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if service is used in any bookings (just for logging)
    const bookingCheck = await db.query(
      'SELECT COUNT(*) FROM bookings WHERE service_id = $1',
      [id]
    );
    
    if (parseInt(bookingCheck.rows[0].count) > 0) {
      // Just log this information but proceed with deletion
      console.log(`Service ID ${id} is used in ${bookingCheck.rows[0].count} bookings but will be deleted as requested by admin`);
    }
    
    const result = await db.query('DELETE FROM services WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Server error while deleting service' });
  }
});

// Update service stock
router.patch('/:id/stock', verifyToken, isAdminOrOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;
    
    if (stock === undefined) {
      return res.status(400).json({ message: 'Stock value is required' });
    }
    
    const result = await db.query(
      `UPDATE services 
       SET stock = $1, in_stock = $1 > 0, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [stock, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating service stock:', error);
    res.status(500).json({ message: 'Server error while updating service stock' });
  }
});

module.exports = router; 