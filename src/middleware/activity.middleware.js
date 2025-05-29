const db = require('../config/db');

/**
 * Middleware to log user activities
 * @param {string} action - The action being performed (create, update, delete, etc.)
 * @param {Function} detailFormatter - Function to format detail message based on req object
 * @returns {Function} Express middleware
 */
const logActivity = (action, detailFormatter) => {
  return async (req, res, next) => {
    // Store the original end method
    const originalEnd = res.end;
    
    // Override the end method
    res.end = async function(chunk, encoding) {
      // Call the original end method
      originalEnd.call(this, chunk, encoding);
      
      try {
        // Only log if user is authenticated and response is successful (2xx)
        if (req.user && res.statusCode >= 200 && res.statusCode < 300) {
          const userId = req.user.id;
          const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
          const detail = typeof detailFormatter === 'function' 
            ? detailFormatter(req, res) 
            : `${action} operation performed`;
          
          await db.query(
            'INSERT INTO user_activity_logs (user_id, action, detail, ip_address) VALUES ($1, $2, $3, $4)',
            [userId, action, detail, clientIp]
          );
        }
      } catch (error) {
        console.error('Error logging user activity:', error);
        // Don't throw error, just log it - we don't want to affect the response
      }
    };
    
    next();
  };
};

module.exports = {
  logActivity
}; 