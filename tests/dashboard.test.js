const request = require('supertest');
const app = require('../src/index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

// Mock database untuk testing
jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

describe('Dashboard API', () => {
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

  describe('GET /api/dashboard/stats', () => {
    it('should get dashboard stats for admin', async () => {
      // Mock database responses
      db.query.mockResolvedValueOnce({}); // Refresh materialized view
      db.query.mockResolvedValueOnce({ 
        rows: [{
          pending_bookings: 3,
          confirmed_bookings: 2,
          in_progress_bookings: 1,
          completed_bookings: 5,
          cancelled_bookings: 1,
          total_customers: 5,
          active_mechanics: 4,
          total_services: 8,
          total_vehicles: 7,
          approved_testimonials: 4,
          pending_testimonials: 1,
          unread_messages: 2,
          monthly_revenue: 1245.75,
          average_rating: 4.5
        }] 
      });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pending_bookings');
      expect(response.body).toHaveProperty('monthly_revenue');
      expect(response.body.total_customers).toBe(5);
      expect(response.body.active_mechanics).toBe(4);
    });
    
    it('should allow staff to access dashboard stats', async () => {
      // Mock database responses
      db.query.mockResolvedValueOnce({}); // Refresh materialized view
      db.query.mockResolvedValueOnce({ 
        rows: [{
          pending_bookings: 3,
          confirmed_bookings: 2,
          in_progress_bookings: 1,
          completed_bookings: 5,
          cancelled_bookings: 1,
          total_customers: 5,
          active_mechanics: 4,
          total_services: 8,
          total_vehicles: 7,
          approved_testimonials: 4,
          pending_testimonials: 1,
          unread_messages: 2,
          monthly_revenue: 1245.75,
          average_rating: 4.5
        }] 
      });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${staffToken}`);
      
      expect(response.status).toBe(200);
    });
    
    it('should return 403 for customer', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(403);
    });
    
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats');
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/dashboard/bookings-by-status', () => {
    it('should get bookings by status for admin', async () => {
      // Mock database response
      db.query.mockResolvedValueOnce({ 
        rows: [
          { status: 'pending', count: '3' },
          { status: 'confirmed', count: '2' },
          { status: 'in-progress', count: '1' },
          { status: 'completed', count: '5' },
          { status: 'cancelled', count: '1' }
        ] 
      });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/dashboard/bookings-by-status')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(5);
      expect(response.body[0]).toHaveProperty('status');
      expect(response.body[0]).toHaveProperty('count');
    });
  });
  
  describe('GET /api/dashboard/mechanic-workload', () => {
    it('should get mechanic workload for admin', async () => {
      // Mock database response
      db.query.mockResolvedValueOnce({ 
        rows: [
          { 
            mechanic_id: 1,
            mechanic_name: 'Alex Johnson',
            pending_tasks: '1',
            confirmed_tasks: '1',
            in_progress_tasks: '0',
            completed_tasks_30d: '2',
            total_tasks: '4'
          },
          { 
            mechanic_id: 2,
            mechanic_name: 'Sarah Williams',
            pending_tasks: '0',
            confirmed_tasks: '1',
            in_progress_tasks: '1',
            completed_tasks_30d: '3',
            total_tasks: '5'
          }
        ] 
      });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/dashboard/mechanic-workload')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].mechanic_name).toBe('Alex Johnson');
      expect(response.body[0]).toHaveProperty('total_tasks');
    });
  });
  
  describe('GET /api/dashboard/service-popularity', () => {
    it('should get service popularity for admin', async () => {
      // Mock database response
      db.query.mockResolvedValueOnce({ 
        rows: [
          { 
            id: 1,
            name: 'Full Car Detailing',
            category: 'Detailing',
            total_bookings: '3',
            completed_bookings: '2',
            average_rating: '4.5',
            price: '199.99'
          },
          { 
            id: 2,
            name: 'Oil Change & Filter',
            category: 'Maintenance',
            total_bookings: '5',
            completed_bookings: '4',
            average_rating: '4.8',
            price: '49.99'
          }
        ] 
      });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/dashboard/service-popularity')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].name).toBe('Full Car Detailing');
      expect(response.body[0]).toHaveProperty('total_bookings');
      expect(response.body[0]).toHaveProperty('average_rating');
    });
  });
  
  describe('GET /api/dashboard/revenue', () => {
    it('should get revenue by period for admin', async () => {
      // Mock database response
      db.query.mockResolvedValueOnce({ 
        rows: [
          { 
            period: '2023-05',
            total_revenue: '450.25',
            completed_bookings: '3'
          },
          { 
            period: '2023-06',
            total_revenue: '795.50',
            completed_bookings: '5'
          }
        ] 
      });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/dashboard/revenue?period_type=monthly')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('period');
      expect(response.body[0]).toHaveProperty('total_revenue');
      expect(response.body[0]).toHaveProperty('completed_bookings');
    });
    
    it('should return 400 for invalid period type', async () => {
      const response = await request(app)
        .get('/api/dashboard/revenue?period_type=invalid')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(400);
    });
  });
}); 