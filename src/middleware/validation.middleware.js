const { body, param, query, validationResult } = require('express-validator');

// Middleware untuk menangani hasil validasi
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      status: 'error',
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Validasi untuk autentikasi
const validateLogin = [
  body('email')
    .isEmail().withMessage('Email harus valid')
    .normalizeEmail()
    .trim(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password minimal 6 karakter')
    .trim(),
  handleValidationErrors
];

const validateRegister = [
  body('email')
    .isEmail().withMessage('Email harus valid')
    .normalizeEmail()
    .trim(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password minimal 6 karakter')
    .trim(),
  body('name')
    .notEmpty().withMessage('Nama tidak boleh kosong')
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Nama harus antara 3-100 karakter'),
  body('phone')
    .optional()
    .isMobilePhone('any').withMessage('Nomor telepon tidak valid'),
  body('address')
    .optional()
    .trim()
    .isLength({ min: 5 }).withMessage('Alamat terlalu pendek'),
  handleValidationErrors
];

// Validasi untuk user
const validateUserCreate = [
  body('email')
    .isEmail().withMessage('Email harus valid')
    .normalizeEmail()
    .trim(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password minimal 6 karakter')
    .trim(),
  body('name')
    .notEmpty().withMessage('Nama tidak boleh kosong')
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Nama harus antara 3-100 karakter'),
  body('role')
    .isIn(['admin', 'staff', 'mechanic', 'customer']).withMessage('Role tidak valid'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'on-leave', 'suspended']).withMessage('Status tidak valid'),
  body('specialization')
    .if(body('role').equals('mechanic'))
    .notEmpty().withMessage('Specialization wajib diisi untuk mechanic'),
  body('experience')
    .if(body('role').equals('mechanic'))
    .isInt({ min: 0 }).withMessage('Experience harus berupa angka positif'),
  handleValidationErrors
];

const validateUserUpdate = [
  body('email')
    .optional()
    .isEmail().withMessage('Email harus valid')
    .normalizeEmail()
    .trim(),
  body('name')
    .optional()
    .notEmpty().withMessage('Nama tidak boleh kosong')
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Nama harus antara 3-100 karakter'),
  body('role')
    .optional()
    .isIn(['admin', 'staff', 'mechanic', 'customer']).withMessage('Role tidak valid'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'on-leave', 'suspended']).withMessage('Status tidak valid'),
  body('password')
    .optional()
    .isLength({ min: 6 }).withMessage('Password minimal 6 karakter')
    .trim(),
  handleValidationErrors
];

// Validasi untuk service
const validateServiceCreate = [
  body('name')
    .notEmpty().withMessage('Nama layanan tidak boleh kosong')
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Nama layanan harus antara 3-100 karakter'),
  body('price')
    .isFloat({ min: 0 }).withMessage('Harga harus berupa angka positif'),
  body('category')
    .notEmpty().withMessage('Kategori tidak boleh kosong')
    .trim(),
  body('estimated_time')
    .isInt({ min: 1 }).withMessage('Estimasi waktu harus berupa angka positif'),
  body('in_stock')
    .optional()
    .isBoolean().withMessage('In stock harus berupa boolean'),
  body('featured')
    .optional()
    .isBoolean().withMessage('Featured harus berupa boolean'),
  handleValidationErrors
];

// Validasi untuk booking
const validateBookingCreate = [
  body('service_id')
    .isInt({ min: 1 }).withMessage('ID layanan harus valid'),
  body('vehicle_id')
    .isInt({ min: 1 }).withMessage('ID kendaraan harus valid'),
  body('date')
    .isDate().withMessage('Format tanggal tidak valid'),
  body('time')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Format waktu tidak valid (HH:MM)'),
  body('customer_id')
    .optional()
    .isInt({ min: 1 }).withMessage('ID pelanggan harus valid'),
  body('notes')
    .optional()
    .trim(),
  handleValidationErrors
];

const validateBookingStatus = [
  body('status')
    .isIn(['pending', 'confirmed', 'in-progress', 'completed', 'cancelled']).withMessage('Status tidak valid'),
  handleValidationErrors
];

// Validasi untuk mechanic
const validateMechanicAssign = [
  body('mechanic_id')
    .isInt({ min: 1 }).withMessage('ID mekanik harus valid'),
  handleValidationErrors
];

// Validasi untuk field note
const validateFieldNote = [
  body('booking_id')
    .notEmpty().withMessage('ID booking tidak boleh kosong'),
  body('note')
    .notEmpty().withMessage('Catatan tidak boleh kosong')
    .trim(),
  body('parts_needed')
    .optional()
    .trim(),
  body('time_adjustment')
    .optional()
    .trim(),
  body('status')
    .optional()
    .isIn(['pending', 'in-progress', 'completed', 'cancelled']).withMessage('Status tidak valid'),
  handleValidationErrors
];

// Validasi untuk vehicle
const validateVehicleCreate = [
  body('make')
    .notEmpty().withMessage('Merk kendaraan tidak boleh kosong')
    .trim(),
  body('model')
    .notEmpty().withMessage('Model kendaraan tidak boleh kosong')
    .trim(),
  body('year')
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Tahun kendaraan tidak valid'),
  body('license_plate')
    .notEmpty().withMessage('Plat nomor tidak boleh kosong')
    .trim()
    .matches(/^[A-Z0-9 -]+$/).withMessage('Format plat nomor tidak valid'),
  body('vin')
    .optional()
    .isLength({ min: 17, max: 17 }).withMessage('VIN harus 17 karakter')
    .matches(/^[A-HJ-NPR-Z0-9]+$/).withMessage('Format VIN tidak valid'),
  body('color')
    .optional()
    .trim(),
  body('customer_id')
    .optional()
    .isInt({ min: 1 }).withMessage('ID pelanggan harus valid'),
  handleValidationErrors
];

// Validasi untuk testimonial
const validateTestimonialCreate = [
  body('service_id')
    .isInt({ min: 1 }).withMessage('ID layanan harus valid'),
  body('mechanic_id')
    .optional()
    .isInt({ min: 1 }).withMessage('ID mekanik harus valid'),
  body('rating')
    .isInt({ min: 1, max: 5 }).withMessage('Rating harus antara 1-5'),
  body('comment')
    .notEmpty().withMessage('Komentar tidak boleh kosong')
    .trim(),
  handleValidationErrors
];

// Validasi untuk customer message
const validateMessageSend = [
  body('message')
    .notEmpty().withMessage('Pesan tidak boleh kosong')
    .trim(),
  body('booking_id')
    .optional()
    .notEmpty().withMessage('ID booking tidak boleh kosong'),
  handleValidationErrors
];

const validateMessageReply = [
  body('customer_id')
    .isInt({ min: 1 }).withMessage('ID pelanggan harus valid'),
  body('message')
    .notEmpty().withMessage('Pesan tidak boleh kosong')
    .trim(),
  body('booking_id')
    .optional()
    .notEmpty().withMessage('ID booking tidak boleh kosong'),
  handleValidationErrors
];

// Validasi untuk ID parameter
const validateIdParam = [
  param('id')
    .notEmpty().withMessage('ID tidak boleh kosong')
    .isInt().withMessage('ID harus berupa angka'),
  handleValidationErrors
];

const validateBookingIdParam = [
  param('id')
    .notEmpty().withMessage('ID booking tidak boleh kosong')
    .matches(/^B-\d+$/).withMessage('Format ID booking tidak valid (B-XXXX)'),
  handleValidationErrors
];

module.exports = {
  validateLogin,
  validateRegister,
  validateUserCreate,
  validateUserUpdate,
  validateServiceCreate,
  validateBookingCreate,
  validateBookingStatus,
  validateMechanicAssign,
  validateFieldNote,
  validateVehicleCreate,
  validateTestimonialCreate,
  validateMessageSend,
  validateMessageReply,
  validateIdParam,
  validateBookingIdParam
}; 