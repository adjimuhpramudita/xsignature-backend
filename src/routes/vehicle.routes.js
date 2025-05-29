const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, isAdmin, isStaffOrAdmin, isCustomer } = require('../middleware/auth.middleware');

// Get all vehicles (admin/staff only)
router.get('/', verifyToken, isStaffOrAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, c.id AS customer_id, u.name AS customer_name
       FROM vehicles v
       JOIN customers c ON v.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       ORDER BY u.name, v.make, v.model`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ message: 'Server error while fetching vehicles' });
  }
});

// Get vehicles by customer ID (admin/staff/owner)
router.get('/customer/:customer_id', verifyToken, async (req, res) => {
  const { customer_id } = req.params;
  
  // Check permissions
  const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
  const isOwner = req.user.role === 'customer' && req.user.customer_id === parseInt(customer_id);
  
  if (!isAdminOrStaff && !isOwner) {
    return res.status(403).json({ message: 'Not authorized to view these vehicles' });
  }
  
  try {
    const result = await db.query(
      'SELECT * FROM vehicles WHERE customer_id = $1 ORDER BY make, model',
      [customer_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer vehicles:', error);
    res.status(500).json({ message: 'Server error while fetching customer vehicles' });
  }
});

// Get customer's own vehicles (for customer)
router.get('/my-vehicles', verifyToken, isCustomer, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM vehicles WHERE customer_id = $1 ORDER BY make, model',
      [req.user.customer_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer vehicles:', error);
    res.status(500).json({ message: 'Server error while fetching customer vehicles' });
  }
});

// Get vehicle by ID
router.get('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const vehicleResult = await db.query(
      `SELECT v.*, c.id AS customer_id, u.name AS customer_name, u.email AS customer_email
       FROM vehicles v
       JOIN customers c ON v.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       WHERE v.id = $1`,
      [id]
    );
    
    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    const vehicle = vehicleResult.rows[0];
    
    // Check permissions
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    const isOwner = req.user.role === 'customer' && req.user.customer_id === vehicle.customer_id;
    
    if (!isAdminOrStaff && !isOwner) {
      return res.status(403).json({ message: 'Not authorized to view this vehicle' });
    }
    
    // Get booking history for this vehicle
    const bookingResult = await db.query(
      `SELECT b.id, b.date, b.time, b.status, s.name AS service_name
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       WHERE b.vehicle_id = $1
       ORDER BY b.date DESC, b.time DESC`,
      [id]
    );
    
    vehicle.booking_history = bookingResult.rows;
    
    res.json(vehicle);
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({ message: 'Server error while fetching vehicle' });
  }
});

// Create new vehicle
router.post('/', verifyToken, async (req, res) => {
  const { make, model, year, license_plate, vin, color, customer_id } = req.body;
  
  // Validate required fields
  if (!make || !model || !year || !license_plate) {
    return res.status(400).json({ message: 'Make, model, year, and license plate are required' });
  }
  
  try {
    let vehicleCustomerId;
    
    // Determine customer ID based on role
    if (req.user.role === 'customer') {
      vehicleCustomerId = req.user.customer_id;
    } else if (req.user.role === 'admin' || req.user.role === 'staff') {
      if (!customer_id) {
        return res.status(400).json({ message: 'Customer ID is required for admin/staff' });
      }
      vehicleCustomerId = customer_id;
    } else {
      return res.status(403).json({ message: 'Not authorized to create vehicles' });
    }
    
    // Check if license plate is already registered
    const licenseCheck = await db.query(
      'SELECT * FROM vehicles WHERE license_plate = $1',
      [license_plate]
    );
    
    if (licenseCheck.rows.length > 0) {
      return res.status(400).json({ message: 'License plate is already registered' });
    }
    
    // Check if VIN is already registered (if provided)
    if (vin) {
      const vinCheck = await db.query(
        'SELECT * FROM vehicles WHERE vin = $1',
        [vin]
      );
      
      if (vinCheck.rows.length > 0) {
        return res.status(400).json({ message: 'VIN is already registered' });
      }
    }
    
    // Create vehicle
    const result = await db.query(
      `INSERT INTO vehicles 
       (customer_id, make, model, year, license_plate, vin, color) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [vehicleCustomerId, make, model, year, license_plate, vin, color]
    );
    
    res.status(201).json({
      message: 'Vehicle created successfully',
      vehicle: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    res.status(500).json({ message: 'Server error while creating vehicle' });
  }
});

// Update vehicle
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { make, model, year, license_plate, vin, color } = req.body;
  
  try {
    // Check if vehicle exists
    const vehicleCheck = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [id]
    );
    
    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    // Check permissions
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    const isOwner = req.user.role === 'customer' && req.user.customer_id === vehicleCheck.rows[0].customer_id;
    
    if (!isAdminOrStaff && !isOwner) {
      return res.status(403).json({ message: 'Not authorized to update this vehicle' });
    }
    
    // Build update query based on provided fields
    let updateFields = [];
    let queryParams = [];
    let paramCounter = 1;
    
    if (make !== undefined) {
      updateFields.push(`make = $${paramCounter}`);
      queryParams.push(make);
      paramCounter++;
    }
    
    if (model !== undefined) {
      updateFields.push(`model = $${paramCounter}`);
      queryParams.push(model);
      paramCounter++;
    }
    
    if (year !== undefined) {
      updateFields.push(`year = $${paramCounter}`);
      queryParams.push(year);
      paramCounter++;
    }
    
    if (license_plate !== undefined) {
      // Check if license plate is already used by another vehicle
      if (license_plate !== vehicleCheck.rows[0].license_plate) {
        const licenseCheck = await db.query(
          'SELECT * FROM vehicles WHERE license_plate = $1 AND id != $2',
          [license_plate, id]
        );
        
        if (licenseCheck.rows.length > 0) {
          return res.status(400).json({ message: 'License plate is already registered to another vehicle' });
        }
      }
      
      updateFields.push(`license_plate = $${paramCounter}`);
      queryParams.push(license_plate);
      paramCounter++;
    }
    
    if (vin !== undefined) {
      // Check if VIN is already used by another vehicle
      if (vin !== vehicleCheck.rows[0].vin) {
        const vinCheck = await db.query(
          'SELECT * FROM vehicles WHERE vin = $1 AND id != $2',
          [vin, id]
        );
        
        if (vinCheck.rows.length > 0) {
          return res.status(400).json({ message: 'VIN is already registered to another vehicle' });
        }
      }
      
      updateFields.push(`vin = $${paramCounter}`);
      queryParams.push(vin);
      paramCounter++;
    }
    
    if (color !== undefined) {
      updateFields.push(`color = $${paramCounter}`);
      queryParams.push(color);
      paramCounter++;
    }
    
    // If no fields to update
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    // Add ID to params
    queryParams.push(id);
    
    // Update vehicle
    const updateQuery = `
      UPDATE vehicles 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, queryParams);
    
    res.json({
      message: 'Vehicle updated successfully',
      vehicle: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({ message: 'Server error while updating vehicle' });
  }
});

// Delete vehicle
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if vehicle exists
    const vehicleCheck = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [id]
    );
    
    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    // Check permissions
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    const isOwner = req.user.role === 'customer' && req.user.customer_id === vehicleCheck.rows[0].customer_id;
    
    if (!isAdminOrStaff && !isOwner) {
      return res.status(403).json({ message: 'Not authorized to delete this vehicle' });
    }
    
    // Check if vehicle is used in any bookings
    const bookingCheck = await db.query(
      'SELECT COUNT(*) FROM bookings WHERE vehicle_id = $1',
      [id]
    );
    
    if (parseInt(bookingCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete vehicle that is used in bookings' 
      });
    }
    
    // Delete vehicle
    await db.query('DELETE FROM vehicles WHERE id = $1', [id]);
    
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({ message: 'Server error while deleting vehicle' });
  }
});

// Search vehicles by license plate or VIN (admin/staff only)
router.get('/search/:term', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { term } = req.params;
  
  try {
    const result = await db.query(
      `SELECT v.*, c.id AS customer_id, u.name AS customer_name
       FROM vehicles v
       JOIN customers c ON v.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       WHERE v.license_plate ILIKE $1 OR v.vin ILIKE $1
       ORDER BY u.name, v.make, v.model`,
      [`%${term}%`]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching vehicles:', error);
    res.status(500).json({ message: 'Server error while searching vehicles' });
  }
});

module.exports = router; 