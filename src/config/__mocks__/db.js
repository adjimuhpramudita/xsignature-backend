// Mock database module for testing
module.exports = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  pool: {
    connect: jest.fn(),
    on: jest.fn()
  }
};
