const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth.middleware');

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const userResult = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Check if password matches
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ message: 'Account is not active. Please contact administrator.' });
    }

    // Get additional user data based on role
    let additionalData = {};
    
    if (user.role === 'mechanic') {
      const mechanicResult = await db.query(
        'SELECT id FROM mechanics WHERE user_id = $1',
        [user.id]
      );
      if (mechanicResult.rows.length > 0) {
        additionalData.mechanic_id = mechanicResult.rows[0].id;
      }
    } else if (user.role === 'customer') {
      const customerResult = await db.query(
        'SELECT id FROM customers WHERE user_id = $1',
        [user.id]
      );
      if (customerResult.rows.length > 0) {
        additionalData.customer_id = customerResult.rows[0].id;
      }
    }

    // Update last login
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );
    
    // Log user login activity
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await db.query(
      'INSERT INTO user_activity_logs (user_id, action, detail, ip_address) VALUES ($1, $2, $3, $4)',
      [user.id, 'login', `User logged in from ${clientIp}`, clientIp]
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role,
        ...additionalData
      },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar_url: user.avatar_url,
        initials: user.initials,
        ...additionalData
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Register customer route
router.post('/register', async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  try {
    // Check if email already exists
    const emailCheck = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Generate initials from name
    const initials = name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Begin transaction
    await db.query('BEGIN');

    // Insert user
    const userResult = await db.query(
      'INSERT INTO users (email, password_hash, name, role, initials, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, passwordHash, name, 'customer', initials, 'active']
    );

    const userId = userResult.rows[0].id;

    // Insert customer
    const customerResult = await db.query(
      'INSERT INTO customers (user_id, phone, address, join_date) VALUES ($1, $2, $3, CURRENT_DATE) RETURNING id',
      [userId, phone, address]
    );

    // Commit transaction
    await db.query('COMMIT');

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: userId, 
        email, 
        name, 
        role: 'customer',
        customer_id: customerResult.rows[0].id
      },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: userId,
        email,
        name,
        role: 'customer',
        initials,
        customer_id: customerResult.rows[0].id
      }
    });
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Verify token route
router.get('/verify-token', verifyToken, async (req, res) => {
  try {
    // Get user data from database to ensure it's up to date
    const userResult = await db.query(
      'SELECT id, email, name, role, avatar_url, initials, status FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ message: 'Account is not active' });
    }

    // Get additional user data based on role
    let additionalData = {};
    
    if (user.role === 'mechanic') {
      const mechanicResult = await db.query(
        'SELECT id FROM mechanics WHERE user_id = $1',
        [user.id]
      );
      if (mechanicResult.rows.length > 0) {
        additionalData.mechanic_id = mechanicResult.rows[0].id;
      }
    } else if (user.role === 'customer') {
      const customerResult = await db.query(
        'SELECT id FROM customers WHERE user_id = $1',
        [user.id]
      );
      if (customerResult.rows.length > 0) {
        additionalData.customer_id = customerResult.rows[0].id;
      }
    }

    res.json({
      user: {
        ...user,
        ...additionalData
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ message: 'Server error during token verification' });
  }
});

module.exports = router; 