const request = require('supertest');
const app = require('../src/index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

// Mock database untuk testing
jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

describe('Customer Messages API', () => {
  let adminToken, customerToken, staffToken;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Generate tokens for different user roles
    adminToken = jwt.sign(
      { id: 1, role: 'admin' },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
    
    staffToken = jwt.sign(
      { id: 2, role: 'staff' },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
    
    customerToken = jwt.sign(
      { id: 8, role: 'customer', customer_id: 1 },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/messages/customer/:customer_id', () => {
    it('should get messages for a customer as admin', async () => {
      // Mock database response
      const mockMessages = [
        {
          id: 1,
          customer_id: 1,
          staff_id: 2,
          booking_id: 'B-1234',
          date: '2023-06-19',
          time: '14:30:00',
          message: 'Hi, I\'m confirming my appointment for tomorrow at 10:00 AM for the full detailing service.',
          type: 'incoming',
          read: true,
          staff_name: 'Staff Member',
          service_name: 'Full Car Detailing'
        },
        {
          id: 2,
          customer_id: 1,
          staff_id: 2,
          booking_id: 'B-1234',
          date: '2023-06-19',
          time: '15:00:00',
          message: 'Yes, your appointment is confirmed for tomorrow at 10:00 AM with Alex. Please arrive 10 minutes early for check-in.',
          type: 'outgoing',
          read: true,
          staff_name: 'Staff Member',
          service_name: 'Full Car Detailing'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockMessages });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/messages/customer/1')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].message).toBe('Hi, I\'m confirming my appointment for tomorrow at 10:00 AM for the full detailing service.');
    });
    
    it('should allow customer to view their own messages', async () => {
      // Mock database response
      const mockMessages = [
        {
          id: 1,
          customer_id: 1,
          staff_id: 2,
          booking_id: 'B-1234',
          date: '2023-06-19',
          time: '14:30:00',
          message: 'Hi, I\'m confirming my appointment for tomorrow at 10:00 AM for the full detailing service.',
          type: 'incoming',
          read: true,
          staff_name: 'Staff Member',
          service_name: 'Full Car Detailing'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockMessages });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/messages/customer/1')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
    
    it('should return 403 for customer trying to view other customer\'s messages', async () => {
      const response = await request(app)
        .get('/api/messages/customer/2')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('GET /api/messages/my-messages', () => {
    it('should get customer\'s own messages', async () => {
      // Mock database response
      const mockMessages = [
        {
          id: 1,
          customer_id: 1,
          staff_id: 2,
          booking_id: 'B-1234',
          date: '2023-06-19',
          time: '14:30:00',
          message: 'Hi, I\'m confirming my appointment for tomorrow at 10:00 AM for the full detailing service.',
          type: 'incoming',
          read: true,
          staff_name: 'Staff Member',
          service_name: 'Full Car Detailing'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockMessages });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/messages/my-messages')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
    });
    
    it('should return 403 for non-customer users', async () => {
      const response = await request(app)
        .get('/api/messages/my-messages')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('GET /api/messages/unread', () => {
    it('should get all unread messages for admin', async () => {
      // Mock database response
      const mockMessages = [
        {
          id: 5,
          customer_id: 2,
          staff_id: null,
          booking_id: 'B-1235',
          date: '2023-06-20',
          time: '09:00:00',
          message: 'I might be running about 15 minutes late for my 11:30 appointment today. Is that okay?',
          type: 'incoming',
          read: false,
          customer_name: 'Emily Wilson',
          service_name: 'Oil Change & Filter'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockMessages });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/messages/unread')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].read).toBe(false);
    });
    
    it('should return 403 for customer', async () => {
      const response = await request(app)
        .get('/api/messages/unread')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('POST /api/messages/send', () => {
    it('should send a message from customer', async () => {
      // Mock database responses
      db.query.mockResolvedValueOnce({ rows: [{ id: 'B-1234', customer_id: 1 }] }); // Check booking
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 6,
          customer_id: 1,
          booking_id: 'B-1234',
          date: '2023-06-20',
          time: '10:30:00',
          message: 'Test message from customer',
          type: 'incoming',
          read: false
        }] 
      }); // Insert message
      
      // Test endpoint
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          booking_id: 'B-1234',
          message: 'Test message from customer'
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('customer_message');
      expect(response.body.customer_message.message).toBe('Test message from customer');
    });
    
    it('should return 400 for missing message content', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          booking_id: 'B-1234'
          // Missing message content
        });
      
      expect(response.status).toBe(400);
    });
    
    it('should return 403 for non-customer users', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          booking_id: 'B-1234',
          message: 'Test message'
        });
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('POST /api/messages/reply', () => {
    it('should send a reply from staff to customer', async () => {
      // Mock database responses
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Check customer
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 7,
          customer_id: 1,
          staff_id: 2,
          booking_id: 'B-1234',
          date: '2023-06-20',
          time: '11:00:00',
          message: 'Test reply from staff',
          type: 'outgoing',
          read: false
        }] 
      }); // Insert message
      
      // Test endpoint
      const response = await request(app)
        .post('/api/messages/reply')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customer_id: 1,
          booking_id: 'B-1234',
          message: 'Test reply from staff'
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('customer_message');
      expect(response.body.customer_message.message).toBe('Test reply from staff');
    });
    
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/messages/reply')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          // Missing customer_id
          message: 'Test reply'
        });
      
      expect(response.status).toBe(400);
    });
    
    it('should return 403 for customer trying to reply', async () => {
      const response = await request(app)
        .post('/api/messages/reply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customer_id: 2,
          message: 'Test reply'
        });
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('PUT /api/messages/:id/read', () => {
    it('should mark message as read for staff', async () => {
      // Mock database responses
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 5,
          customer_id: 2,
          type: 'incoming',
          read: false
        }] 
      }); // Get message
      
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 5,
          customer_id: 2,
          type: 'incoming',
          read: true
        }] 
      }); // Update message
      
      // Test endpoint
      const response = await request(app)
        .put('/api/messages/5/read')
        .set('Authorization', `Bearer ${staffToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('customer_message');
      expect(response.body.customer_message.read).toBe(true);
    });
    
    it('should return 404 for non-existent message', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // Message not found
      
      const response = await request(app)
        .put('/api/messages/999/read')
        .set('Authorization', `Bearer ${staffToken}`);
      
      expect(response.status).toBe(404);
    });
  });
}); 