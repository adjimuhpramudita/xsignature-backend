const request = require('supertest');
const app = require('../src/index');
const jwt = require('jsonwebtoken');

// Mock the database module
jest.mock('../src/config/db', () => {
  const query = jest.fn();
  
  // Login test mocks
  query
    .mockResolvedValueOnce({ rows: [{ 
      id: 1, 
      email: 'test@example.com',
      password_hash: '$2a$10$XgXB8Wd4ZGtKqkD0xXG9.OcnmZ1Wr9Vdcg.jFuD9vwLMoJX3zH0Uy', // hash for 'password123'
      name: 'Test User',
      role: 'customer',
      status: 'active'
    }] })
    .mockResolvedValueOnce({}) // for customer_id query
    .mockResolvedValueOnce({}) // for update last_login
    // Invalid email test
    .mockResolvedValueOnce({ rows: [] })
    // Invalid password test
    .mockResolvedValueOnce({ rows: [{ 
      id: 1, 
      email: 'test@example.com',
      password_hash: '$2a$10$XgXB8Wd4ZGtKqkD0xXG9.OcnmZ1Wr9Vdcg.jFuD9vwLMoJX3zH0Uy',
      name: 'Test User',
      role: 'customer',
      status: 'active'
    }] })
    // Register tests
    .mockResolvedValueOnce({ rows: [] }) // email check
    .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // insert user
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // insert customer
    // Existing email test
    .mockResolvedValueOnce({ rows: [{ email: 'existing@example.com' }] })
    // Verify token test
    .mockResolvedValueOnce({ rows: [{ 
      id: 1, 
      email: 'test@example.com',
      name: 'Test User',
      role: 'customer',
      status: 'active'
    }] })
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // customer_id query
  
  return {
    query,
    pool: { query }
  };
});

describe('Authentication API', () => {
  describe('POST /api/auth/login', () => {
    it('should login user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', 1);
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
    });

    it('should return 401 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid email or password');
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid email or password');
    });

    it('should return 401 for invalid input format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: ''
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new customer', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          phone: '1234567890',
          address: '123 Main St'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'newuser@example.com');
    });

    it('should return 400 for existing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
          name: 'Existing User',
          phone: '1234567890',
          address: '123 Main St'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Email already in use');
    });

    it('should return 400 for invalid input format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: '',
          name: ''
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/verify-token', () => {
    it('should verify a valid token', async () => {
      // Create a valid JWT token
      const token = jwt.sign(
        { id: 1, email: 'test@example.com', role: 'customer' },
        process.env.JWT_SECRET || 'xsignature_secret_key_123',
        { expiresIn: '1h' }
      );
      
      const response = await request(app)
        .get('/api/auth/verify-token')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', 1);
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
    });
    
    it('should return 403 for invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify-token')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(response.status).toBe(403);
    });
    
    it('should return 401 for missing token', async () => {
      const response = await request(app)
        .get('/api/auth/verify-token');
      
      expect(response.status).toBe(401);
    });
  });
}); 