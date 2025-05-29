const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { notFoundHandler } = require('./utils/errorHandler');
const errorHandler = require('./middleware/error.middleware');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const serviceRoutes = require('./routes/service.routes');
const bookingRoutes = require('./routes/booking.routes');
const mechanicRoutes = require('./routes/mechanic.routes');
const vehicleRoutes = require('./routes/vehicle.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const testimonialRoutes = require('./routes/testimonial.routes');
const mechanicTasksRoutes = require('./routes/mechanic_tasks.routes');
const scheduleRoutes = require('./routes/schedule.routes');

// Initialize express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Set up uploads directory and static file serving
const uploadsDir = path.join(__dirname, '../uploads');
console.log('Uploads directory full path:', uploadsDir);

// Ensure uploads directory exists
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory');
  } else {
    console.log('Uploads directory exists');
    // Log contents of the directory
    const files = fs.readdirSync(uploadsDir);
    console.log('Files in uploads directory:', files);
  }
} catch (error) {
  console.error('Error with uploads directory:', error);
}

// Static files
app.use('/uploads', (req, res, next) => {
  console.log('Static file request:', req.url);
  next();
}, express.static(uploadsDir));

// Add a test endpoint to verify upload functionality
app.get('/api/test-uploads', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    res.json({
      message: 'Uploads directory test',
      directory: uploadsDir,
      exists: fs.existsSync(uploadsDir),
      isDirectory: fs.existsSync(uploadsDir) ? fs.statSync(uploadsDir).isDirectory() : false,
      files: files
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error checking uploads directory',
      error: error.message
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/mechanic', mechanicRoutes);
app.use('/api/mechanics', mechanicRoutes);
app.use('/api/vehicle', vehicleRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/testimonial', testimonialRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/mechanic-tasks', mechanicTasksRoutes);
app.use('/api/schedule', scheduleRoutes);

// Direct test endpoint for booking schedules
const db = require('./config/db');
app.get('/api/direct-test/schedules', async (req, res) => {
  console.log('Direct test schedules endpoint called');
  try {
    const result = await db.query(
      `SELECT id, booking_date, booking_time, status 
       FROM bookings 
       ORDER BY booking_date DESC, booking_time ASC
       LIMIT 10`
    );
    
    console.log(`Direct test found ${result.rows.length} booking schedules`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error in direct test endpoint:', error);
    res.status(500).json({ message: 'Server error in direct test endpoint', error: error.message });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to XSignature Auto Garage API' });
});

// Handle favicon.ico requests to prevent 404 errors in logs
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content response
});

// Handle placeholder.svg requests
app.get('/placeholder.svg', (req, res) => {
  const { width = 300, height = 200, text = 'No Image' } = req.query;
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#e9e9e9"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle" fill="#666666">${text}</text>
    </svg>
  `;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Static files served from: ${uploadsDir}`);
  console.log(`Test URL: http://localhost:${PORT}/api/test-uploads`);
});

// For testing purposes
module.exports = app; 