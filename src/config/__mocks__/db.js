const query = jest.fn();
module.exports = {
  query,
  pool: {
    query
  }
}; 