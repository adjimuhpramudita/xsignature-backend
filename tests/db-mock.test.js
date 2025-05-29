const dbMock = require('./db-mock');

describe('Database Mock', () => {
  it('should have mockResolvedValue function', () => {
    expect(typeof dbMock.query.mockResolvedValue).toBe('function');
  });

  it('should have mockResolvedValueOnce function', () => {
    expect(typeof dbMock.query.mockResolvedValueOnce).toBe('function');
  });

  it('should mock a resolved value', async () => {
    const mockData = { rows: [{ id: 1, name: 'Test' }] };
    dbMock.query.mockResolvedValue(mockData);
    
    const result = await dbMock.query('SELECT * FROM test');
    expect(result).toEqual(mockData);
  });

  it('should mock a resolved value once', async () => {
    const mockData1 = { rows: [{ id: 1, name: 'Test1' }] };
    const mockData2 = { rows: [{ id: 2, name: 'Test2' }] };
    
    dbMock.query.mockResolvedValueOnce(mockData1);
    dbMock.query.mockResolvedValueOnce(mockData2);
    
    const result1 = await dbMock.query('SELECT * FROM test WHERE id = 1');
    const result2 = await dbMock.query('SELECT * FROM test WHERE id = 2');
    
    expect(result1).toEqual(mockData1);
    expect(result2).toEqual(mockData2);
  });
}); 