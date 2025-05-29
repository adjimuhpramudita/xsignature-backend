const request = require('supertest');
const app = require('../src/index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

// Mock database untuk testing
jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

describe('Booking API', () => {
  let adminToken, customerToken, staffToken, mechanicToken;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Generate tokens for different user roles
    adminToken = jwt.sign(
      { id: 1, role: 'admin' },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
    
    customerToken = jwt.sign(
      { id: 8, role: 'customer', customer_id: 1 },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
    
    staffToken = jwt.sign(
      { id: 2, role: 'staff' },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
    
    mechanicToken = jwt.sign(
      { id: 3, role: 'mechanic', mechanic_id: 1 },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/bookings', () => {
    it('should get all bookings for admin', async () => {
      // Mock database response
      const mockBookings = [
        {
          id: 'B-1234',
          customer_id: 1,
          service_id: 1,
          mechanic_id: 1,
          vehicle_id: 1,
          date: '2023-06-20',
          time: '10:00:00',
          status: 'pending',
          notes: 'Test booking'
        },
        {
          id: 'B-1235',
          customer_id: 2,
          service_id: 2,
          mechanic_id: 2,
          vehicle_id: 2,
          date: '2023-06-21',
          time: '11:00:00',
          status: 'confirmed',
          notes: 'Another test booking'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockBookings });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].id).toBe('B-1234');
    });
    
    it('should return 403 for customer trying to get all bookings', async () => {
      const response = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(403);
    });
    
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/bookings');
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/bookings/:id', () => {
    it('should get booking by ID for admin', async () => {
      // Mock database response
      const mockBooking = {
        id: 'B-1234',
        customer_id: 1,
        service_id: 1,
        mechanic_id: 1,
        vehicle_id: 1,
        date: '2023-06-20',
        time: '10:00:00',
        status: 'pending',
        notes: 'Test booking',
        service_name: 'Oil Change',
        customer_name: 'John Smith',
        mechanic_name: 'Alex Johnson',
        vehicle_info: 'Toyota Camry (ABC123)'
      };
      
      db.query.mockResolvedValueOnce({ rows: [mockBooking] });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/bookings/B-1234')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('B-1234');
      expect(response.body.service_name).toBe('Oil Change');
    });
    
    it('should allow customer to view their own booking', async () => {
      // Mock database response
      const mockBooking = {
        id: 'B-1234',
        customer_id: 1, // Same as token's customer_id
        service_id: 1,
        mechanic_id: 1,
        vehicle_id: 1,
        date: '2023-06-20',
        time: '10:00:00',
        status: 'pending',
        notes: 'Test booking',
        service_name: 'Oil Change',
        customer_name: 'John Smith',
        mechanic_name: 'Alex Johnson',
        vehicle_info: 'Toyota Camry (ABC123)'
      };
      
      db.query.mockResolvedValueOnce({ rows: [mockBooking] });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/bookings/B-1234')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('B-1234');
    });
    
    it('should return 404 for non-existent booking', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      
      const response = await request(app)
        .get('/api/bookings/B-9999')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(404);
    });
  });
  
  describe('POST /api/bookings', () => {
    it('should create a new booking', async () => {
      // Mock database responses
      db.query.mockImplementation((query, params) => {
        if (query.includes('CREATE OR REPLACE FUNCTION')) {
          return { rows: [{ new_booking_id: 'B-1250' }] };
        } else {
          return { rows: [{ id: 'B-1250' }] };
        }
      });
      
      // Test endpoint
      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          service_id: 1,
          vehicle_id: 1,
          date: '2023-07-01',
          time: '14:00',
          notes: 'New booking test'
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('booking');
      expect(response.body.booking.id).toBe('B-1250');
    });
    
    it('should return 400 for invalid booking data', async () => {
      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          // Missing required fields
          notes: 'Invalid booking test'
        });
      
      expect(response.status).toBe(400);
    });
  });
  
  describe('PUT /api/bookings/:id/status', () => {
    it('should update booking status for admin', async () => {
      // Mock database responses
      db.query.mockResolvedValueOnce({ rows: [{ id: 'B-1234', status: 'pending' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'B-1234', status: 'confirmed' }] });
      
      // Test endpoint
      const response = await request(app)
        .put('/api/bookings/B-1234/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('booking');
      expect(response.body.booking.status).toBe('confirmed');
    });
    
    it('should return 403 for customer trying to update status', async () => {
      const response = await request(app)
        .put('/api/bookings/B-1234/status')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'confirmed' });
      
      expect(response.status).toBe(403);
    });
    
    it('should return 400 for invalid status', async () => {
      const response = await request(app)
        .put('/api/bookings/B-1234/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid-status' });
      
      expect(response.status).toBe(400);
    });
  });
  
  describe('GET /api/bookings/customer/my-bookings', () => {
    it('should get customer\'s own bookings', async () => {
      // Mock database response
      const mockBookings = [
        {
          id: 'B-1234',
          customer_id: 1,
          service_id: 1,
          date: '2023-06-20',
          time: '10:00:00',
          status: 'pending',
          service_name: 'Oil Change',
          vehicle_info: 'Toyota Camry (ABC123)'
        },
        {
          id: 'B-1239',
          customer_id: 1,
          service_id: 2,
          date: '2023-06-21',
          time: '09:00:00',
          status: 'confirmed',
          service_name: 'Wheel Alignment',
          vehicle_info: 'Honda Civic (XYZ789)'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockBookings });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/bookings/customer/my-bookings')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].id).toBe('B-1234');
    });
    
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/bookings/customer/my-bookings');
      
      expect(response.status).toBe(401);
    });
  });
}); 