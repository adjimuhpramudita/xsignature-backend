const { Pool } = require('pg');

// Create a pool with connection parameters
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'xsignature',
  password: process.env.DB_PASSWORD || 'ganteng',
  port: process.env.DB_PORT || 5432,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection not established
});

// Add error handler for pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

// Add connection validation and retry logic
const query = async (text, params) => {
  const client = await pool.connect();
  try {
    // Debug logging
    console.log('DB Query:', {
      text: text.split('\n')[0], // Log first line of query for debugging
      params: params ? JSON.stringify(params).substring(0, 100) : 'none'
    });
    
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    
    // Debug logging for slow queries
    if (duration > 500) {
      console.log('Long query execution time:', { text, duration, rows: result.rowCount });
    }
    
    return result;
  } catch (err) {
    console.error('Database query error:', err.message);
    // Add more context to the error
    err.query = text;
    err.params = params;
    throw err;
  } finally {
    client.release();
  }
};

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully');
  }
});

module.exports = {
  query,
  pool
}; 