const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function removeMessagesFeature() {
  console.log('Memulai penghapusan fitur messages...');
  
  // Konfigurasi koneksi database
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'xsignature',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'ganteng'
  });

  try {
    await client.connect();
    console.log('Terhubung ke database');
    
    // Membaca file SQL
    const sqlFilePath = path.join(__dirname, 'drop_messages.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log('Menjalankan script SQL...');
    await client.query(sql);
    
    console.log('Script SQL berhasil dijalankan');
    console.log('Fitur messages berhasil dihapus dari database!');
    
  } catch (error) {
    console.error('Error saat menghapus fitur messages:', error);
  } finally {
    await client.end();
    console.log('Koneksi database ditutup');
  }
}

removeMessagesFeature();