const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'websaga.db');
const db = new sqlite3.Database(dbPath);

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase() {
  db.serialize();

  // 1. Programs Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive'))
    )
  `);

  // 2. Branches Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive'))
    )
  `);

  // 3. Regulations Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS regulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive'))
    )
  `);

  // 4. Program-Branch Mapping Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS program_branch_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      UNIQUE(program_id, branch_id)
    )
  `);

  // 5. Courses Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      branch_id INTEGER NOT NULL,
      regulation_id INTEGER NOT NULL,
      year TEXT NOT NULL CHECK(year IN ('I', 'II', 'III', 'IV')),
      semester TEXT NOT NULL CHECK(semester IN ('I', 'II')),
      type TEXT NOT NULL CHECK(type IN ('Theory', 'Lab', 'Project')),
      elective_type TEXT NOT NULL CHECK(elective_type IN ('CORE', 'Professional Elective', 'Open Elective')),
      credits INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      FOREIGN KEY (regulation_id) REFERENCES regulations(id) ON DELETE CASCADE
    )
  `);

  // 6. Branch-Course Mapping Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS branch_course_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pb_mapping_id INTEGER NOT NULL,
      regulation_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      FOREIGN KEY (pb_mapping_id) REFERENCES program_branch_mappings(id) ON DELETE CASCADE,
      FOREIGN KEY (regulation_id) REFERENCES regulations(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE(pb_mapping_id, regulation_id, course_id)
    )
  `);

  // 7. Faculties Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS faculties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_type TEXT NOT NULL CHECK(user_type IN ('Admin', 'Faculty')),
      branch_id INTEGER,
      honorific TEXT NOT NULL CHECK(honorific IN ('Dr.', 'Mr.', 'Mrs.', 'Ms.')),
      name TEXT NOT NULL,
      emp_id TEXT NOT NULL UNIQUE,
      phone TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
    )
  `);

  // 8. Faculty-Course Mapping Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS faculty_course_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      course_type TEXT NOT NULL,
      year TEXT NOT NULL,
      semester TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      elective_type TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE(faculty_id, course_id, academic_year)
    )
  `);

  // 9. Bloom's Levels Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS blooms_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive'))
    )
  `);

  // 10. Difficulty Levels Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS difficulty_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive'))
    )
  `);

  // 11. Units Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive'))
    )
  `);

  // 12. Course Outcomes (COs) Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS course_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE(course_id, code)
    )
  `);

  // 13. Questions Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      co_id INTEGER NOT NULL,
      blooms_level_id INTEGER NOT NULL,
      difficulty_level_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      image_path TEXT,
      marks INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (co_id) REFERENCES course_outcomes(id) ON DELETE CASCADE,
      FOREIGN KEY (blooms_level_id) REFERENCES blooms_levels(id) ON DELETE CASCADE,
      FOREIGN KEY (difficulty_level_id) REFERENCES difficulty_levels(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    )
  `);

  // 14. Question Papers Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS question_papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      assessment_type TEXT NOT NULL,
      date_of_exam TEXT NOT NULL,
      regulation_id INTEGER NOT NULL,
      year TEXT NOT NULL,
      semester TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      structure_json TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (program_id) REFERENCES programs(id),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (regulation_id) REFERENCES regulations(id)
    )
  `);

  // Seed default admin and tables if empty
  await seedDatabase();
}

async function seedDatabase() {
  // Seed Bloom's Levels
  const blooms = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
  for (const name of blooms) {
    await runQuery(`INSERT OR IGNORE INTO blooms_levels (name, status) VALUES (?, 'active')`, [name]);
  }

  // Seed Difficulty Levels
  const diffs = ['Easy', 'Moderate', 'Hard'];
  for (const name of diffs) {
    await runQuery(`INSERT OR IGNORE INTO difficulty_levels (name, status) VALUES (?, 'active')`, [name]);
  }

  // Seed Units
  const units = ['Unit-1', 'Unit-2', 'Unit-3', 'Unit-4', 'Unit-5'];
  for (const name of units) {
    await runQuery(`INSERT OR IGNORE INTO units (name, status) VALUES (?, 'active')`, [name]);
  }

  // Seed Programs
  const programs = ['B.Tech', 'M.Tech', 'MBA'];
  for (const name of programs) {
    await runQuery(`INSERT OR IGNORE INTO programs (name, status) VALUES (?, 'active')`, [name]);
  }

  // Seed Branches
  const branches = [
    { code: '05', name: 'CSE' },
    { code: '12', name: 'IT' },
    { code: '42', name: 'CSE-AIM' },
    { code: '45', name: 'CSE-AIDS' },
    { code: '04', name: 'ECE' }
  ];
  for (const b of branches) {
    await runQuery(`INSERT OR IGNORE INTO branches (code, name, status) VALUES (?, ?, 'active')`, [b.code, b.name]);
  }

  // Seed Regulations
  const regulations = ['AR23', 'AR21', 'AR20'];
  for (const name of regulations) {
    await runQuery(`INSERT OR IGNORE INTO regulations (name, status) VALUES (?, 'active')`, [name]);
  }

  // Seed Admin Account
  const adminEmail = 'admin@websaga.com';
  const existingAdmin = await getQuery(`SELECT id FROM faculties WHERE email = ?`, [adminEmail]);
  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin123', salt);
    await runQuery(`
      INSERT INTO faculties (user_type, branch_id, honorific, name, emp_id, phone, email, password_hash, status)
      VALUES ('Admin', NULL, 'Dr.', 'System Admin', 'EMP000', '1234567890', ?, ?, 'active')
    `, [adminEmail, hash]);
  }

  // Seed standard Program-Branch mapping
  const pBTech = await getQuery(`SELECT id FROM programs WHERE name = 'B.Tech'`);
  const bCse = await getQuery(`SELECT id FROM branches WHERE name = 'CSE'`);
  if (pBTech && bCse) {
    await runQuery(`
      INSERT OR IGNORE INTO program_branch_mappings (program_id, branch_id, status)
      VALUES (?, ?, 'active')
    `, [pBTech.id, bCse.id]);
  }

  // Seed sample course (Python Programming)
  const courseCode = 'CS2101';
  const existingCourse = await getQuery(`SELECT id FROM courses WHERE code = ?`, [courseCode]);
  if (!existingCourse && bCse) {
    const regAR23 = await getQuery(`SELECT id FROM regulations WHERE name = 'AR23'`);
    if (regAR23) {
      await runQuery(`
        INSERT INTO courses (code, name, branch_id, regulation_id, year, semester, type, elective_type, credits, status)
        VALUES (?, 'Python Programming', ?, ?, 'II', 'I', 'Theory', 'CORE', 3, 'active')
      `, [courseCode, bCse.id, regAR23.id]);

      const newCourse = await getQuery(`SELECT id FROM courses WHERE code = ?`, [courseCode]);
      if (newCourse) {
        // Seed branch course mapping
        const pbMapping = await getQuery(`SELECT id FROM program_branch_mappings WHERE program_id = ? AND branch_id = ?`, [pBTech.id, bCse.id]);
        if (pbMapping) {
          await runQuery(`
            INSERT OR IGNORE INTO branch_course_mappings (pb_mapping_id, regulation_id, course_id, status)
            VALUES (?, ?, ?, 'active')
          `, [pbMapping.id, regAR23.id, newCourse.id]);
        }

        // Seed some COs
        await runQuery(`INSERT INTO course_outcomes (course_id, code, description, status) VALUES (?, 'CO1', 'Understand core programming concepts and python syntax', 'active')`, [newCourse.id]);
        await runQuery(`INSERT INTO course_outcomes (course_id, code, description, status) VALUES (?, 'CO2', 'Implement data structures like lists, tuples, and dictionaries', 'active')`, [newCourse.id]);
        await runQuery(`INSERT INTO course_outcomes (course_id, code, description, status) VALUES (?, 'CO3', 'Develop file reading and writing routines with error handling', 'active')`, [newCourse.id]);

        // Fetch seeded items for questions
        const co1 = await getQuery(`SELECT id FROM course_outcomes WHERE course_id = ? AND code = 'CO1'`, [newCourse.id]);
        const co2 = await getQuery(`SELECT id FROM course_outcomes WHERE course_id = ? AND code = 'CO2'`, [newCourse.id]);
        const bloomRem = await getQuery(`SELECT id FROM blooms_levels WHERE name = 'Remember'`);
        const bloomUnd = await getQuery(`SELECT id FROM blooms_levels WHERE name = 'Understand'`);
        const bloomApp = await getQuery(`SELECT id FROM blooms_levels WHERE name = 'Apply'`);
        const diffEasy = await getQuery(`SELECT id FROM difficulty_levels WHERE name = 'Easy'`);
        const diffMod = await getQuery(`SELECT id FROM difficulty_levels WHERE name = 'Moderate'`);
        const unit1 = await getQuery(`SELECT id FROM units WHERE name = 'Unit-1'`);
        const unit2 = await getQuery(`SELECT id FROM units WHERE name = 'Unit-2'`);

        if (co1 && co2 && bloomRem && bloomUnd && bloomApp && diffEasy && diffMod && unit1 && unit2) {
          // Seed Questions
          await runQuery(`
            INSERT INTO questions (course_id, co_id, blooms_level_id, difficulty_level_id, unit_id, text, marks, status)
            VALUES (?, ?, ?, ?, ?, 'What is Python and mention some of its key features?', 5, 'active')
          `, [newCourse.id, co1.id, bloomRem.id, diffEasy.id, unit1.id]);

          await runQuery(`
            INSERT INTO questions (course_id, co_id, blooms_level_id, difficulty_level_id, unit_id, text, marks, status)
            VALUES (?, ?, ?, ?, ?, 'Explain mutable and immutable data types in Python with examples.', 10, 'active')
          `, [newCourse.id, co1.id, bloomUnd.id, diffMod.id, unit1.id]);

          await runQuery(`
            INSERT INTO questions (course_id, co_id, blooms_level_id, difficulty_level_id, unit_id, text, marks, status)
            VALUES (?, ?, ?, ?, ?, 'Write a Python program to reverse a given list without using library functions.', 5, 'active')
          `, [newCourse.id, co2.id, bloomApp.id, diffMod.id, unit2.id]);
          
          await runQuery(`
            INSERT INTO questions (course_id, co_id, blooms_level_id, difficulty_level_id, unit_id, text, marks, status)
            VALUES (?, ?, ?, ?, ?, 'Describe Python list comprehension syntax and write an example to filter even numbers.', 5, 'active')
          `, [newCourse.id, co2.id, bloomUnd.id, diffEasy.id, unit2.id]);
        }
      }
    }
  }
}

module.exports = {
  db,
  initDatabase,
  runQuery,
  getQuery,
  allQuery
};
