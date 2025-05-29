/**
 * Custom error class untuk API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Middleware untuk menangani error global
 */
const errorHandler = (err, req, res, next) => {
  // Default error object
  let error = {
    statusCode: err.statusCode || 500,
    message: err.message || 'Server Error',
    errors: err.errors || []
  };

  // Log error untuk debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.user ? { id: req.user.id, role: req.user.role } : null
  });

  // Handle specific error types
  
  // PostgreSQL error handling
  if (err.code) {
    switch (err.code) {
      // Unique violation
      case '23505':
        error.statusCode = 409;
        error.message = 'Data already exists';
        if (err.detail) {
          error.errors.push({ message: err.detail });
        }
        break;
      
      // Foreign key violation
      case '23503':
        error.statusCode = 400;
        error.message = 'Referenced data does not exist';
        if (err.detail) {
          error.errors.push({ message: err.detail });
        }
        break;
      
      // Not null violation
      case '23502':
        error.statusCode = 400;
        error.message = 'Required field is missing';
        if (err.column) {
          error.errors.push({ field: err.column, message: `${err.column} is required` });
        }
        break;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.statusCode = 401;
    error.message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    error.statusCode = 401;
    error.message = 'Token expired';
  }

  // Multer errors
  if (err.name === 'MulterError') {
    error.statusCode = 400;
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        error.message = 'File too large';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        error.message = 'Unexpected file field';
        break;
      default:
        error.message = 'File upload error';
    }
  }

  // Handle 404 errors
  if (err.statusCode === 404) {
    error.message = err.message || 'Resource not found';
  }

  // Handle validation errors
  if (err.statusCode === 400) {
    error.message = err.message || 'Bad request';
  }

  // Handle unauthorized errors
  if (err.statusCode === 401) {
    error.message = err.message || 'Unauthorized';
  }

  // Handle forbidden errors
  if (err.statusCode === 403) {
    error.message = err.message || 'Forbidden';
  }

  // Send error response
  res.status(error.statusCode).json({
    status: 'error',
    message: error.message,
    errors: error.errors.length > 0 ? error.errors : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

/**
 * Middleware untuk menangani rute yang tidak ditemukan
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Route not found: ${req.originalUrl}`);
  next(error);
};

/**
 * Utility untuk membuat error dengan status code dan pesan tertentu
 */
const createError = (statusCode, message, errors = []) => {
  return new ApiError(statusCode, message, errors);
};

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
  createError
}; 