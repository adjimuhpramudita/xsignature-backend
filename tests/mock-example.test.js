// Import the mock
const dbMock = require('./db-mock');

// Mock the database module
jest.mock('../src/config/db', () => {
  return dbMock;
});

// Import the mocked module
const db = require('../src/config/db');

describe('Mock Example', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should mock a database query', async () => {
    // Set up the mock response
    const mockData = { rows: [{ id: 1, name: 'Test' }] };
    db.query.mockResolvedValueOnce(mockData);
    
    // Call the mocked function
    const result = await db.query('SELECT * FROM test');
    
    // Verify the result
    expect(result).toEqual(mockData);
    
    // Verify the mock was called
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith('SELECT * FROM test');
  });

  it('should mock multiple database queries', async () => {
    // Set up mock responses
    const mockData1 = { rows: [{ id: 1, name: 'Test1' }] };
    const mockData2 = { rows: [{ id: 2, name: 'Test2' }] };
    
    db.query.mockResolvedValueOnce(mockData1);
    db.query.mockResolvedValueOnce(mockData2);
    
    // Call the mocked function multiple times
    const result1 = await db.query('SELECT * FROM test WHERE id = 1');
    const result2 = await db.query('SELECT * FROM test WHERE id = 2');
    
    // Verify the results
    expect(result1).toEqual(mockData1);
    expect(result2).toEqual(mockData2);
    
    // Verify the mocks were called
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM test WHERE id = 1');
    expect(db.query).toHaveBeenNthCalledWith(2, 'SELECT * FROM test WHERE id = 2');
  });
}); 