const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  console.log('verifyToken middleware called for path:', req.path);
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'xsignature_secret_key_123');
    req.user = decoded;
    console.log('Token verified successfully, user:', { id: decoded.id, role: decoded.role });
    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Requires admin privileges' });
  }
};

const isOwner = (req, res, next) => {
  if (req.user && req.user.role === 'owner') {
    next();
  } else {
    return res.status(403).json({ message: 'Requires owner privileges' });
  }
};

const isStaffOrAdmin = (req, res, next) => {
  console.log('isStaffOrAdmin middleware called, user role:', req.user?.role);
  if (req.user && (req.user.role === 'staff' || req.user.role === 'admin' || req.user.role === 'owner')) {
    console.log('User has staff/admin/owner privileges, proceeding');
    next();
  } else {
    console.log('User does not have staff/admin/owner privileges, access denied');
    return res.status(403).json({ message: 'Requires staff or admin privileges' });
  }
};

const isAdminOrOwner = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'owner')) {
    next();
  } else {
    return res.status(403).json({ message: 'Requires admin or owner privileges' });
  }
};

const isMechanic = (req, res, next) => {
  if (req.user && req.user.role === 'mechanic') {
    next();
  } else {
    return res.status(403).json({ message: 'Requires mechanic privileges' });
  }
};

const isCustomer = (req, res, next) => {
  if (req.user && req.user.role === 'customer') {
    next();
  } else {
    return res.status(403).json({ message: 'Requires customer privileges' });
  }
};

module.exports = {
  verifyToken,
  isAdmin,
  isOwner,
  isStaffOrAdmin,
  isAdminOrOwner,
  isMechanic,
  isCustomer
}; 