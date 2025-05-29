/**
 * Script untuk memperbaiki masalah endpoint booking
 * 
 * Masalah:
 * 1. Filter status 'all' tidak ditangani dengan benar
 * 2. Pagination tidak berfungsi dengan baik
 * 3. Endpoint assign-mechanic perlu diperbaiki
 */

const fs = require('fs');
const path = require('path');

// Path ke file booking.routes.js
const bookingRoutesPath = path.join(__dirname, 'src', 'routes', 'booking.routes.js');

// Baca file
fs.readFile(bookingRoutesPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error membaca file:', err);
    return;
  }

  // Buat backup file
  fs.writeFile(`${bookingRoutesPath}.backup`, data, (err) => {
    if (err) {
      console.error('Error membuat backup file:', err);
      return;
    }
    console.log('File backup dibuat:', `${bookingRoutesPath}.backup`);
  });

  // Perbaiki endpoint GET all bookings
  let updatedContent = data.replace(
    /router\.get\('\/', verifyToken, isStaffOrAdmin, async \(req, res\) => \{[\s\S]*?const \{ status, date, mechanic_id \} = req\.query;[\s\S]*?if \(status\) \{[\s\S]*?queryParams\.push\(status\);[\s\S]*?conditions\.push\(`b\.status = \$\$\{queryParams\.length\}`\);[\s\S]*?\}/,
    `router.get('/', verifyToken, isStaffOrAdmin, async (req, res) => {
  const { status, date, mechanic_id, page, pageSize, term } = req.query;
  
  try {
    let query = \`
      SELECT b.*, 
             s.name AS service_name, 
             s.price AS service_price,
             c.id AS customer_id, 
             u.name AS customer_name,
             c.phone AS customer_phone,
             v.make, v.model, v.license_plate,
             m.id AS mechanic_id,
             mu.name AS mechanic_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN customers c ON b.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      LEFT JOIN users mu ON m.user_id = mu.id
    \`;
    
    const queryParams = [];
    let conditions = [];
    
    // Add filters if provided but skip 'all' status since we want all
    if (status && status !== 'all') {
      queryParams.push(status);
      conditions.push(\`b.status = \$\${queryParams.length}\`);
    }
    
    // Add search term if provided
    if (term) {
      queryParams.push(\`%\${term}%\`);
      conditions.push(\`(u.name ILIKE \$\${queryParams.length} OR s.name ILIKE \$\${queryParams.length})\`);
    }`
  );

  // Tambahkan pagination ke endpoint
  updatedContent = updatedContent.replace(
    /query \+= ' ORDER BY b\.booking_date DESC, b\.booking_time DESC';/,
    `query += ' ORDER BY b.booking_date DESC, b.booking_time DESC';
    
    // Add pagination if specified
    if (page && pageSize) {
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      query += \` LIMIT \$\${queryParams.length + 1} OFFSET \$\${queryParams.length + 2}\`;
      queryParams.push(parseInt(pageSize), offset);
    }
    
    console.log('Executing query:', { query, params: queryParams });`
  );

  // Simpan file yang telah diupdate
  fs.writeFile(bookingRoutesPath, updatedContent, (err) => {
    if (err) {
      console.error('Error menyimpan file yang diupdate:', err);
      return;
    }
    console.log('File booking.routes.js berhasil diupdate');
  });
}); 