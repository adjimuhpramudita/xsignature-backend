const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'xsignature',
  password: 'ganteng',
  port: 5432,
});

async function modifyConstraint() {
  try {
    console.log('Starting constraint modification...');

    // Check the current constraint
    const constraintCheck = await pool.query(`
      SELECT tc.constraint_name, tc.table_name, kcu.column_name, 
             ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name,
             rc.delete_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'bookings'
        AND kcu.column_name = 'service_id'
    `);

    if (constraintCheck.rows.length > 0) {
      console.log('Current constraints:', constraintCheck.rows);
      
      // Drop the existing constraint
      await pool.query(`
        ALTER TABLE bookings 
        DROP CONSTRAINT ${constraintCheck.rows[0].constraint_name}
      `);
      console.log(`Dropped constraint: ${constraintCheck.rows[0].constraint_name}`);
    } else {
      console.log('No existing constraint found');
    }

    // Add a new constraint with ON DELETE CASCADE
    await pool.query(`
      ALTER TABLE bookings 
      ADD CONSTRAINT fk_service_cascade 
      FOREIGN KEY (service_id) 
      REFERENCES services(id) 
      ON DELETE CASCADE
    `);
    
    console.log('Added new constraint with ON DELETE CASCADE');
    console.log('Constraint modification completed successfully!');
  } catch (error) {
    console.error('Error modifying constraint:', error);
  } finally {
    await pool.end();
  }
}

// Execute the function
modifyConstraint(); 