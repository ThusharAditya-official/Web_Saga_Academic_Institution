const { initDatabase, getQuery, allQuery } = require('./database');
const bcrypt = require('bcryptjs');

async function testDatabase() {
  console.log('--- Starting Database Verification ---');
  try {
    // 1. Initialize DB and run migrations & seed
    console.log('Initializing database...');
    await initDatabase();
    console.log('Database initialized successfully.');

    // 2. Query default Admin account
    console.log('Verifying default Admin account...');
    const admin = await getQuery(`SELECT * FROM faculties WHERE email = 'admin@websaga.com'`);
    if (!admin) {
      throw new Error('Default Admin account admin@websaga.com is missing!');
    }
    console.log(`Default Admin account verified. EMP ID: ${admin.emp_id}, Name: ${admin.name}`);

    // 3. Verify Admin Password Hash
    console.log('Verifying Admin password hash decryption...');
    const match = await bcrypt.compare('admin123', admin.password_hash);
    if (!match) {
      throw new Error('Admin password hash does not match decrypted password "admin123"!');
    }
    console.log('Password hash verification passed.');

    // 4. Verify seeded programs
    console.log('Verifying programs seeds...');
    const programs = await allQuery(`SELECT name FROM programs`);
    console.log(`Seeded programs found: ${programs.map(p => p.name).join(', ')}`);
    if (programs.length < 3) {
      throw new Error('Expected at least 3 programs seeded (B.Tech, M.Tech, MBA)!');
    }

    // 5. Verify seeded branches
    console.log('Verifying branches seeds...');
    const branches = await allQuery(`SELECT code, name FROM branches`);
    console.log(`Seeded branches found: ${branches.map(b => `${b.name} (${b.code})`).join(', ')}`);
    if (branches.length < 5) {
      throw new Error('Expected at least 5 branches seeded!');
    }

    // 6. Verify seeded regulations
    console.log('Verifying regulations seeds...');
    const regulations = await allQuery(`SELECT name FROM regulations`);
    console.log(`Seeded regulations found: ${regulations.map(r => r.name).join(', ')}`);
    if (regulations.length < 3) {
      throw new Error('Expected at least 3 regulations seeded!');
    }

    // 7. Verify dummy course & question seeds
    console.log('Verifying course & questions repository...');
    const course = await getQuery(`SELECT * FROM courses WHERE code = 'CS2101'`);
    if (!course) {
      throw new Error('Seeded course CS2101 is missing!');
    }
    console.log(`Seeded course CS2101 found: "${course.name}"`);

    const qCount = await getQuery(`SELECT count(*) as count FROM questions WHERE course_id = ?`, [course.id]);
    console.log(`Seeded questions count for CS2101: ${qCount.count}`);
    if (qCount.count < 3) {
      throw new Error('Expected at least 3 seeded questions for CS2101!');
    }

    console.log('\n==========================================');
    console.log(' SUCCESS: Database and seeds verified!    ');
    console.log('==========================================');
    process.exit(0);

  } catch (err) {
    console.error('\n==========================================');
    console.error(' ERROR: Verification failed!              ');
    console.error(err.message);
    console.error('==========================================');
    process.exit(1);
  }
}

testDatabase();
