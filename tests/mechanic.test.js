const request = require('supertest');
const app = require('../src/index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

// Mock database untuk testing
jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

describe('Mechanic API', () => {
  let adminToken, customerToken, mechanicToken;
  
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
    
    mechanicToken = jwt.sign(
      { id: 3, role: 'mechanic', mechanic_id: 1 },
      process.env.JWT_SECRET || 'xsignature_secret_key_123',
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/mechanics', () => {
    it('should get all mechanics', async () => {
      // Mock database response
      const mockMechanics = [
        {
          id: 1,
          user_id: 3,
          specialization: 'Engine Repair',
          experience: 8,
          phone: '555-123-4567',
          rating: 4.9,
          name: 'Alex Johnson',
          avatar_url: '/placeholder.svg',
          initials: 'AJ',
          status: 'active'
        },
        {
          id: 2,
          user_id: 4,
          specialization: 'Electrical Systems',
          experience: 6,
          phone: '555-234-5678',
          rating: 4.8,
          name: 'Sarah Williams',
          avatar_url: '/placeholder.svg',
          initials: 'SW',
          status: 'active'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockMechanics });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/mechanics');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].name).toBe('Alex Johnson');
    });
  });
  
  describe('GET /api/mechanics/:id', () => {
    it('should get mechanic by ID', async () => {
      // Mock database responses
      const mockMechanic = {
        id: 1,
        user_id: 3,
        specialization: 'Engine Repair',
        experience: 8,
        phone: '555-123-4567',
        rating: 4.9,
        name: 'Alex Johnson',
        avatar_url: '/placeholder.svg',
        initials: 'AJ',
        status: 'active',
        email: 'alex.johnson@xsignature.com'
      };
      
      const mockAvailability = [
        { day_of_week: 1, start_time: '08:00:00', end_time: '17:00:00' },
        { day_of_week: 2, start_time: '08:00:00', end_time: '17:00:00' },
        { day_of_week: 3, start_time: '08:00:00', end_time: '17:00:00' },
        { day_of_week: 4, start_time: '08:00:00', end_time: '17:00:00' },
        { day_of_week: 5, start_time: '08:00:00', end_time: '17:00:00' }
      ];
      
      const mockStats = {
        id: 1,
        name: 'Alex Johnson',
        specialization: 'Engine Repair',
        experience: 8,
        rating: 4.9,
        completed_jobs: 48,
        total_jobs: 52,
        completion_rate: 92.31,
        upcoming_bookings: 3
      };
      
      const mockTestimonials = [
        {
          id: 1,
          customer_id: 1,
          service_id: 1,
          mechanic_id: 1,
          rating: 5,
          comment: 'Excellent service!',
          date: '2023-05-22',
          customer_name: 'John Smith',
          service_name: 'Full Car Detailing'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: [mockMechanic] });
      db.query.mockResolvedValueOnce({ rows: mockAvailability });
      db.query.mockResolvedValueOnce({ rows: [mockStats] });
      db.query.mockResolvedValueOnce({ rows: mockTestimonials });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/mechanics/1');
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(1);
      expect(response.body.name).toBe('Alex Johnson');
      expect(response.body).toHaveProperty('availability');
      expect(Array.isArray(response.body.availability)).toBe(true);
      expect(response.body).toHaveProperty('performance');
      expect(response.body).toHaveProperty('testimonials');
    });
    
    it('should return 404 for non-existent mechanic', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      
      const response = await request(app)
        .get('/api/mechanics/999');
      
      expect(response.status).toBe(404);
    });
  });
  
  describe('GET /api/mechanics/my-tasks/:date', () => {
    it('should get mechanic tasks for a specific date', async () => {
      // Mock database response
      const mockTasks = [
        {
          id: 'B-1234',
          service_name: 'Oil Change',
          service_price: 49.99,
          estimated_time: 45,
          customer_id: 1,
          customer_name: 'John Smith',
          make: 'Toyota',
          model: 'Camry',
          license_plate: 'ABC123',
          task_status: 'pending',
          start_time: '10:00:00',
          end_time: '10:45:00'
        },
        {
          id: 'B-1238',
          service_name: 'Engine Diagnostics',
          service_price: 79.99,
          estimated_time: 60,
          customer_id: 5,
          customer_name: 'David Miller',
          make: 'Audi',
          model: 'A4',
          license_plate: 'AUDI44',
          task_status: 'pending',
          start_time: '15:45:00',
          end_time: '16:45:00'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockTasks });
      
      // Test endpoint
      const response = await request(app)
        .get('/api/mechanics/my-tasks/2023-06-20')
        .set('Authorization', `Bearer ${mechanicToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].service_name).toBe('Oil Change');
    });
    
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/mechanics/my-tasks/2023-06-20');
      
      expect(response.status).toBe(401);
    });
    
    it('should return 403 for non-mechanic users', async () => {
      const response = await request(app)
        .get('/api/mechanics/my-tasks/2023-06-20')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('POST /api/mechanics/field-note', () => {
    it('should add a field note', async () => {
      // Mock database responses
      db.query.mockResolvedValueOnce({ rows: [{ id: 'B-1234', mechanic_id: 1 }] }); // Check booking
      db.query.mockResolvedValueOnce({ 
        rows: [{ 
          id: 1, 
          mechanic_id: 1, 
          booking_id: 'B-1234',
          date: '2023-06-20',
          time: '12:00:00',
          note: 'Test field note',
          parts_needed: 'None',
          time_adjustment: 'None',
          status: 'pending'
        }] 
      }); // Insert field note
      
      // Test endpoint
      const response = await request(app)
        .post('/api/mechanics/field-note')
        .set('Authorization', `Bearer ${mechanicToken}`)
        .send({
          booking_id: 'B-1234',
          note: 'Test field note',
          parts_needed: 'None',
          time_adjustment: 'None'
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('field_note');
      expect(response.body.field_note.note).toBe('Test field note');
    });
    
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/mechanics/field-note')
        .set('Authorization', `Bearer ${mechanicToken}`)
        .send({
          booking_id: 'B-1234'
          // Missing note field
        });
      
      expect(response.status).toBe(400);
    });
    
    it('should return 404 for non-existent booking', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // Booking not found
      
      const response = await request(app)
        .post('/api/mechanics/field-note')
        .set('Authorization', `Bearer ${mechanicToken}`)
        .send({
          booking_id: 'B-9999',
          note: 'Test field note'
        });
      
      expect(response.status).toBe(404);
    });
  });
  
  describe('GET /api/mechanics/field-notes/:mechanic_id', () => {
    it('should get field notes for a mechanic', async () => {
      // Mock database response
      const mockNotes = [
        {
          id: 1,
          mechanic_id: 1,
          booking_id: 'B-1234',
          date: '2023-06-20',
          time: '12:00:00',
          note: 'Test field note 1',
          parts_needed: 'None',
          time_adjustment: 'None',
          status: 'completed',
          service_name: 'Oil Change',
          customer_id: 1,
          customer_name: 'John Smith',
          make: 'Toyota',
          model: 'Camry',
          license_plate: 'ABC123'
        },
        {
          id: 2,
          mechanic_id: 1,
          booking_id: 'B-1238',
          date: '2023-06-20',
          time: '16:00:00',
          note: 'Test field note 2',
          parts_needed: 'Oxygen sensor (part #OS-2234)',
          time_adjustment: 'Will need additional 45 minutes',
          status: 'pending',
          service_name: 'Engine Diagnostics',
          customer_id: 5,
          customer_name: 'David Miller',
          make: 'Audi',
          model: 'A4',
          license_plate: 'AUDI44'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockNotes });
      
      // Test endpoint for mechanic viewing their own notes
      const response = await request(app)
        .get('/api/mechanics/field-notes/1')
        .set('Authorization', `Bearer ${mechanicToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].note).toBe('Test field note 1');
    });
    
    it('should allow admin to view any mechanic\'s notes', async () => {
      // Mock database response
      const mockNotes = [
        {
          id: 1,
          mechanic_id: 1,
          booking_id: 'B-1234',
          date: '2023-06-20',
          time: '12:00:00',
          note: 'Test field note 1',
          parts_needed: 'None',
          time_adjustment: 'None',
          status: 'completed',
          service_name: 'Oil Change',
          customer_id: 1,
          customer_name: 'John Smith',
          make: 'Toyota',
          model: 'Camry',
          license_plate: 'ABC123'
        }
      ];
      
      db.query.mockResolvedValueOnce({ rows: mockNotes });
      
      // Test endpoint for admin
      const response = await request(app)
        .get('/api/mechanics/field-notes/1')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
    
    it('should return 403 for unauthorized access', async () => {
      // Test endpoint for customer trying to access mechanic notes
      const response = await request(app)
        .get('/api/mechanics/field-notes/1')
        .set('Authorization', `Bearer ${customerToken}`);
      
      expect(response.status).toBe(403);
    });
  });
}); 