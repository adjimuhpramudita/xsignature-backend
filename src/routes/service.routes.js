const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin, isAdminOrOwner } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

// Get all services (public)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = 'SELECT * FROM services';
    const params = [];
    
    if (search) {
      query += ' WHERE name ILIKE $1 OR description ILIKE $1';
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY category, name';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Server error while fetching services' });
  }
});

// Get featured services (public)
router.get('/featured', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM services WHERE featured = TRUE ORDER BY category, name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching featured services:', error);
    res.status(500).json({ message: 'Server error while fetching featured services' });
  }
});

// Get services by category (public)
router.get('/category/:category', async (req, res) => {
  const { category } = req.params;
  
  try {
    const result = await db.query(
      'SELECT * FROM services WHERE category = $1 ORDER BY name',
      [category]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching services by category:', error);
    res.status(500).json({ message: 'Server error while fetching services by category' });
  }
});

// Get service by ID (public)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const serviceResult = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [id]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Get testimonials for this service
    const testimonialResult = await db.query(
      'SELECT t.*, u.name as customer_name, u.avatar_url FROM testimonials t JOIN customers c ON t.customer_id = c.id JOIN users u ON c.user_id = u.id WHERE t.service_id = $1 AND t.approved = TRUE',
      [id]
    );
    
    res.json({
      ...serviceResult.rows[0],
      testimonials: testimonialResult.rows
    });
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ message: 'Server error while fetching service' });
  }
});

// Create new service (admin only)
router.post('/', verifyToken, isAdmin, upload.single('image'), async (req, res) => {
  console.log('Request body:', req.body);
  console.log('Request file:', req.file);
  
  // Get form data from req.body
  const { 
    name, 
    description, 
    price, 
    category, 
    estimated_time,
    in_stock,
    featured,
    stock
  } = req.body;
  
  console.log('Extracted estimated_time:', estimated_time);
  console.log('Extracted price:', price);
  console.log('Extracted stock:', stock);
  
  // Validate required fields
  if (!name || !price || !category || !estimated_time) {
    return res.status(400).json({ message: 'Name, price, category, and estimated time are required' });
  }
  
  try {
    // Parse boolean values
    const inStockBool = in_stock === 'true' || in_stock === true;
    const featuredBool = featured === 'true' || featured === true;
    
    // Begin transaction
    await db.query('BEGIN');
    
    // Prepare the image URL if file is uploaded
    let imageUrl = null;
    if (req.file) {
      // Use absolute path format that works with frontend
      imageUrl = `/uploads/${req.file.filename}`;
      console.log('Image URL set to:', imageUrl);
      
      // Verify the file was actually saved
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../..', imageUrl);
      console.log('Checking if file exists at:', filePath);
      if (fs.existsSync(filePath)) {
        console.log('File successfully saved and accessible');
      } else {
        console.error('File not found at expected location');
      }
    }
    
    // Convert price and estimated_time to numbers
    const priceNumber = Number(price);
    const estimatedTimeNumber = Number(estimated_time);
    const stockNumber = Number(stock || 0);
    
    console.log('Converted price:', priceNumber);
    console.log('Converted estimated_time:', estimatedTimeNumber);
    console.log('Converted stock:', stockNumber);
    
    // Insert new service
    const result = await db.query(
      `INSERT INTO services 
       (name, description, price, category, estimated_time, in_stock, featured, image_url, stock) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [
        name, 
        description || '', 
        priceNumber, 
        category, 
        estimatedTimeNumber, 
        inStockBool, 
        featuredBool,
        imageUrl,
        stockNumber
      ]
    );
    
    // Commit transaction
    await db.query('COMMIT');
    
    // Return the full service object including image_url
    console.log('Created service:', result.rows[0]);
    
    res.status(201).json({
      message: 'Service created successfully',
      service: result.rows[0]
    });
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Server error while creating service' });
  }
});

// Update service (admin only)
router.put('/:id', verifyToken, isAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  console.log('Update request body:', req.body);
  console.log('Update request file:', req.file);
  
  // Get form data from req.body
  const { 
    name, 
    description, 
    price, 
    category, 
    estimated_time, 
    in_stock, 
    featured,
    stock
  } = req.body;
  
  console.log('Update extracted estimated_time:', estimated_time);
  console.log('Update extracted price:', price);
  console.log('Update extracted stock:', stock);
  
  try {
    // Check if service exists
    const serviceCheck = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [id]
    );
    
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Begin transaction
    await db.query('BEGIN');
    
    // Build update query based on provided fields
    let updateFields = [];
    let queryParams = [];
    let paramCounter = 1;
    
    if (name !== undefined) {
      updateFields.push(`name = $${paramCounter}`);
      queryParams.push(name);
      paramCounter++;
    }
    
    if (description !== undefined) {
      updateFields.push(`description = $${paramCounter}`);
      queryParams.push(description);
      paramCounter++;
    }
    
    if (price !== undefined) {
      const priceNumber = Number(price);
      console.log('Update converted price:', priceNumber);
      updateFields.push(`price = $${paramCounter}`);
      queryParams.push(priceNumber);
      paramCounter++;
    }
    
    if (category !== undefined) {
      updateFields.push(`category = $${paramCounter}`);
      queryParams.push(category);
      paramCounter++;
    }
    
    if (estimated_time !== undefined) {
      const estimatedTimeNumber = Number(estimated_time);
      console.log('Update converted estimated_time:', estimatedTimeNumber);
      updateFields.push(`estimated_time = $${paramCounter}`);
      queryParams.push(estimatedTimeNumber);
      paramCounter++;
    }
    
    if (in_stock !== undefined) {
      const inStockBool = in_stock === 'true' || in_stock === true;
      updateFields.push(`in_stock = $${paramCounter}`);
      queryParams.push(inStockBool);
      paramCounter++;
    }
    
    if (featured !== undefined) {
      const featuredBool = featured === 'true' || featured === true;
      updateFields.push(`featured = $${paramCounter}`);
      queryParams.push(featuredBool);
      paramCounter++;
    }
    
    if (stock !== undefined) {
      const stockNumber = Number(stock);
      console.log('Update converted stock:', stockNumber);
      updateFields.push(`stock = $${paramCounter}`);
      queryParams.push(stockNumber);
      paramCounter++;
    }
    
    // Handle image if provided
    if (req.file) {
      const imageUrl = `/uploads/${req.file.filename}`;
      console.log('Update image URL set to:', imageUrl);
      
      // Verify the file was actually saved
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../..', imageUrl);
      console.log('Checking if update file exists at:', filePath);
      if (fs.existsSync(filePath)) {
        console.log('Update file successfully saved and accessible');
      } else {
        console.error('Update file not found at expected location');
      }
      
      updateFields.push(`image_url = $${paramCounter}`);
      queryParams.push(imageUrl);
      paramCounter++;
    }
    
    // If no fields to update
    if (updateFields.length === 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    // Add ID to params
    queryParams.push(id);
    
    // Update service
    const updateQuery = `
      UPDATE services 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    console.log('Update query:', updateQuery);
    console.log('Update query params:', queryParams);
    
    const result = await db.query(updateQuery, queryParams);
    
    // Log the updated service for debugging
    console.log('Updated service:', result.rows[0]);
    
    // Commit transaction
    await db.query('COMMIT');
    
    res.json({
      message: 'Service updated successfully',
      service: result.rows[0]
    });
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Server error while updating service' });
  }
});

// Update service image (admin only)
router.put('/:id/image', verifyToken, isAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if service exists
    const serviceCheck = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [id]
    );
    
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Update image URL
    const imageUrl = `/uploads/${req.file.filename}`;
    
    const result = await db.query(
      'UPDATE services SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, image_url',
      [imageUrl, id]
    );
    
    res.json({
      message: 'Service image updated successfully',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating service image:', error);
    res.status(500).json({ message: 'Server error while updating service image' });
  }
});

// Delete service (admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if service exists
    const serviceCheck = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [id]
    );
    
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Check if service is used in any bookings (just for logging)
    const bookingCheck = await db.query(
      'SELECT COUNT(*) FROM bookings WHERE service_id = $1',
      [id]
    );
    
    const bookingCount = parseInt(bookingCheck.rows[0].count);
    if (bookingCount > 0) {
      console.log(`Deleting service ID ${id} which is used in ${bookingCount} bookings. Admin requested deletion.`);
    }
    
    // Delete service regardless of existing bookings
    await db.query('DELETE FROM services WHERE id = $1', [id]);
    
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Server error while deleting service' });
  }
});

// Get all service categories (public)
router.get('/categories/all', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT DISTINCT category FROM services ORDER BY category'
    );
    
    // Extract categories from result
    const categories = result.rows.map(row => row.category);
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching service categories:', error);
    res.status(500).json({ message: 'Server error while fetching service categories' });
  }
});

module.exports = router; 