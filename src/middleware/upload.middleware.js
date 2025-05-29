const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists with absolute path
const uploadDir = path.resolve(__dirname, '../../uploads');
console.log('Upload directory absolute path:', uploadDir);

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Upload directory created successfully at:', uploadDir);
  } else {
    console.log('Upload directory already exists at:', uploadDir);
    // List contents of the directory
    const files = fs.readdirSync(uploadDir);
    console.log('Files in upload directory:', files);
  }
} catch (error) {
  console.error('Error creating upload directory:', error);
}

// Configure storage with absolute path
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Storing file in directory:', uploadDir);
    // Check if directory exists and is writable
    try {
      fs.accessSync(uploadDir, fs.constants.W_OK);
      console.log('Upload directory is writable');
    } catch (err) {
      console.error('Upload directory is not writable:', err);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + ext;
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  console.log('Processing file:', file.originalname, 'mimetype:', file.mimetype);
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    console.log('File type approved:', file.originalname);
    return cb(null, true);
  } else {
    console.log('File type rejected:', file.originalname);
    cb(new Error('Only image files are allowed!'));
  }
};

// Create upload middleware with safer options
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

module.exports = upload; 