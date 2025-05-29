const errorHandler = (err, req, res, next) => {
  console.error('Error caught by middleware:', err);
  
  // Log detailed error information
  console.error('Error stack:', err.stack);
  console.error('Request body:', req.body);
  console.error('Request query:', req.query);
  console.error('Request params:', req.params);
  
  // Default error message
  let statusCode = 500;
  let errorMessage = 'Server error. Please try again later.';
  
  // Handle specific database errors
  if (err.code) {
    console.error('Database error code:', err.code);
    console.error('Database error details:', err.detail);
    
    switch (err.code) {
      case '42703': // undefined_column
        statusCode = 400;
        errorMessage = `Database column error: ${err.message}`;
        break;
      case '23505': // unique_violation
        statusCode = 400;
        errorMessage = 'A record with this information already exists.';
        break;
      case '23503': // foreign_key_violation
        statusCode = 400;
        errorMessage = 'Referenced record does not exist.';
        break;
      case '23502': // not_null_violation
        statusCode = 400;
        errorMessage = 'Missing required fields.';
        break;
      default:
        // Keep default error message
        break;
    }
  }
  
  // Send response
  res.status(statusCode).json({
    status: 'error',
    message: errorMessage,
    errorCode: err.code || 'unknown',
    path: req.path
  });
};

module.exports = errorHandler; 