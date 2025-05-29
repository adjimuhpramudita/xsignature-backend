// Create a mock function
const query = jest.fn();

// Add mock implementation methods
query.mockResolvedValue = jest.fn().mockImplementation(value => {
  query.mockImplementation(() => Promise.resolve(value));
  return query;
});

query.mockResolvedValueOnce = jest.fn().mockImplementation(value => {
  query.mockImplementationOnce(() => Promise.resolve(value));
  return query;
});

query.mockRejectedValue = jest.fn().mockImplementation(error => {
  query.mockImplementation(() => Promise.reject(error));
  return query;
});

query.mockRejectedValueOnce = jest.fn().mockImplementation(error => {
  query.mockImplementationOnce(() => Promise.reject(error));
  return query;
});

query.mockImplementation = jest.fn().mockImplementation(implementation => {
  jest.fn().mockImplementation(implementation).mockImplementation(query);
  return query;
});

query.mockImplementationOnce = jest.fn().mockImplementation(implementation => {
  jest.fn().mockImplementationOnce(implementation).mockImplementationOnce(query);
  return query;
});

// Export the mock
module.exports = {
  query,
  pool: { query }
}; 