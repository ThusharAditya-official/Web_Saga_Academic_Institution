const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const csv = require('csv-parser');
const { initDatabase, runQuery, getQuery, allQuery } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configurations
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'img_' + Date.now() + ext);
  }
});
const upload = multer({ storage });

const tempUpload = multer({ dest: 'temp/' });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'websaga_secret_key_123!@#',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

// Route helpers for Auth
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.userType !== 'Admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

// ----------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ----------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { email, password, userType } = req.body;
  if (!email || !password || !userType) {
    return res.status(400).json({ error: 'Missing required credentials' });
  }

  try {
    const user = await getQuery(
      `SELECT * FROM faculties WHERE email = ? AND user_type = ? AND status = 'active'`,
      [email, userType]
    );

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Set session
    req.session.userId = user.id;
    req.session.userType = user.user_type;
    req.session.name = user.name;
    req.session.email = user.email;

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        userType: user.user_type
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    user: {
      id: req.session.userId,
      name: req.session.name,
      email: req.session.email,
      userType: req.session.userType
    }
  });
});

app.post('/api/auth/change-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const user = await getQuery(`SELECT password_hash FROM faculties WHERE id = ?`, [req.session.userId]);
    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await runQuery(`UPDATE faculties SET password_hash = ? WHERE id = ?`, [hash, req.session.userId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DASHBOARDS
// ----------------------------------------------------
app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const programsCount = await getQuery(`SELECT count(*) as count FROM programs`);
    const branchesCount = await getQuery(`SELECT count(*) as count FROM branches`);
    const coursesCount = await getQuery(`SELECT count(*) as count FROM courses`);
    const facultyCount = await getQuery(`SELECT count(*) as count FROM faculties WHERE user_type = 'Faculty'`);
    const activeFaculty = await getQuery(`SELECT count(*) as count FROM faculties WHERE user_type = 'Faculty' AND status = 'active'`);
    const activeCourses = await getQuery(`SELECT count(*) as count FROM courses WHERE status = 'active'`);
    const qpCount = await getQuery(`SELECT count(*) as count FROM question_papers`);

    // Course status distribution chart data
    const courseTypes = await allQuery(`SELECT type, count(*) as count FROM courses GROUP BY type`);
    // Bloom's levels question counts
    const bloomQCounts = await allQuery(`
      SELECT b.name, count(q.id) as count 
      FROM blooms_levels b LEFT JOIN questions q ON q.blooms_level_id = b.id 
      GROUP BY b.id
    `);

    res.json({
      stats: {
        programs: programsCount.count,
        branches: branchesCount.count,
        courses: coursesCount.count,
        activeCourses: activeCourses.count,
        faculty: facultyCount.count,
        activeFaculty: activeFaculty.count,
        qps: qpCount.count
      },
      charts: {
        courseTypes,
        bloomQCounts
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/faculty/dashboard', requireLogin, async (req, res) => {
  try {
    const facultyId = req.session.userId;
    const coursesMapped = await allQuery(`
      SELECT c.*, b.name as branch_name, r.name as regulation_name, fcm.academic_year
      FROM faculty_course_mappings fcm
      JOIN courses c ON fcm.course_id = c.id
      JOIN branches b ON c.branch_id = b.id
      JOIN regulations r ON c.regulation_id = r.id
      WHERE fcm.faculty_id = ? AND fcm.status = 'active' AND c.status = 'active'
    `, [facultyId]);

    const totalQuestions = await getQuery(`
      SELECT count(*) as count FROM questions q
      WHERE q.course_id IN (SELECT course_id FROM faculty_course_mappings WHERE faculty_id = ? AND status = 'active')
    `, [facultyId]);

    const bloomQCounts = await allQuery(`
      SELECT b.name, count(q.id) as count 
      FROM blooms_levels b 
      LEFT JOIN questions q ON q.blooms_level_id = b.id AND q.course_id IN (SELECT course_id FROM faculty_course_mappings WHERE faculty_id = ? AND status = 'active')
      GROUP BY b.id
    `, [facultyId]);

    res.json({
      courses: coursesMapped,
      stats: {
        totalCourses: coursesMapped.length,
        totalQuestions: totalQuestions.count
      },
      charts: {
        bloomQCounts
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// PROGRAMS CRUD
// ----------------------------------------------------
app.get('/api/programs', requireLogin, async (req, res) => {
  try {
    const programs = await allQuery(`SELECT * FROM programs`);
    res.json(programs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/programs', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    await runQuery(`INSERT INTO programs (name, status) VALUES (?, ?)`, [name, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Program already exists' : err.message });
  }
});

app.put('/api/programs/:id', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    await runQuery(`UPDATE programs SET name = ?, status = ? WHERE id = ?`, [name, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/programs/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM programs WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// BRANCHES CRUD
// ----------------------------------------------------
app.get('/api/branches', requireLogin, async (req, res) => {
  try {
    const branches = await allQuery(`SELECT * FROM branches`);
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/branches', requireAdmin, async (req, res) => {
  const { code, name, status } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and Name are required' });

  try {
    await runQuery(`INSERT INTO branches (code, name, status) VALUES (?, ?, ?)`, [code, name, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Branch Code already exists' : err.message });
  }
});

app.put('/api/branches/:id', requireAdmin, async (req, res) => {
  const { code, name, status } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and Name are required' });

  try {
    await runQuery(`UPDATE branches SET code = ?, name = ?, status = ? WHERE id = ?`, [code, name, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/branches/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM branches WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// REGULATIONS CRUD
// ----------------------------------------------------
app.get('/api/regulations', requireLogin, async (req, res) => {
  try {
    const regulations = await allQuery(`SELECT * FROM regulations`);
    res.json(regulations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/regulations', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    await runQuery(`INSERT INTO regulations (name, status) VALUES (?, ?)`, [name, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Regulation already exists' : err.message });
  }
});

app.put('/api/regulations/:id', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    await runQuery(`UPDATE regulations SET name = ?, status = ? WHERE id = ?`, [name, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/regulations/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM regulations WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// PROGRAM - BRANCH MAPPING CRUD
// ----------------------------------------------------
app.get('/api/pb-mappings', requireLogin, async (req, res) => {
  try {
    const mappings = await allQuery(`
      SELECT pbm.*, p.name as program_name, b.name as branch_name, b.code as branch_code
      FROM program_branch_mappings pbm
      JOIN programs p ON pbm.program_id = p.id
      JOIN branches b ON pbm.branch_id = b.id
    `);
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pb-mappings', requireAdmin, async (req, res) => {
  const { program_id, branch_id, status } = req.body;
  if (!program_id || !branch_id) return res.status(400).json({ error: 'Program and Branch are required' });

  try {
    await runQuery(`INSERT INTO program_branch_mappings (program_id, branch_id, status) VALUES (?, ?, ?)`, [program_id, branch_id, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Mapping already exists' : err.message });
  }
});

app.put('/api/pb-mappings/:id', requireAdmin, async (req, res) => {
  const { program_id, branch_id, status } = req.body;
  if (!program_id || !branch_id) return res.status(400).json({ error: 'Program and Branch are required' });

  try {
    await runQuery(`UPDATE program_branch_mappings SET program_id = ?, branch_id = ?, status = ? WHERE id = ?`, [program_id, branch_id, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/pb-mappings/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM program_branch_mappings WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// COURSES CRUD
// ----------------------------------------------------
app.get('/api/courses', requireLogin, async (req, res) => {
  try {
    const courses = await allQuery(`
      SELECT c.*, b.name as branch_name, r.name as regulation_name
      FROM courses c
      JOIN branches b ON c.branch_id = b.id
      JOIN regulations r ON c.regulation_id = r.id
    `);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/courses', requireAdmin, async (req, res) => {
  const { code, name, branch_id, regulation_id, year, semester, type, elective_type, credits, status } = req.body;
  if (!code || !name || !branch_id || !regulation_id || !year || !semester || !type || !elective_type || !credits) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    await runQuery(`
      INSERT INTO courses (code, name, branch_id, regulation_id, year, semester, type, elective_type, credits, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [code, name, branch_id, regulation_id, year, semester, type, elective_type, credits, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Course Code already exists' : err.message });
  }
});

app.put('/api/courses/:id', requireAdmin, async (req, res) => {
  const { code, name, branch_id, regulation_id, year, semester, type, elective_type, credits, status } = req.body;
  if (!code || !name || !branch_id || !regulation_id || !year || !semester || !type || !elective_type || !credits) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    await runQuery(`
      UPDATE courses 
      SET code = ?, name = ?, branch_id = ?, regulation_id = ?, year = ?, semester = ?, type = ?, elective_type = ?, credits = ?, status = ?
      WHERE id = ?
    `, [code, name, branch_id, regulation_id, year, semester, type, elective_type, credits, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/courses/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM courses WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// BRANCH - COURSE MAPPING CRUD
// ----------------------------------------------------
app.get('/api/bc-mappings', requireLogin, async (req, res) => {
  try {
    const mappings = await allQuery(`
      SELECT bcm.*, p.name as program_name, b.name as branch_name, r.name as regulation_name, c.name as course_name, c.code as course_code
      FROM branch_course_mappings bcm
      JOIN program_branch_mappings pbm ON bcm.pb_mapping_id = pbm.id
      JOIN programs p ON pbm.program_id = p.id
      JOIN branches b ON pbm.branch_id = b.id
      JOIN regulations r ON bcm.regulation_id = r.id
      JOIN courses c ON bcm.course_id = c.id
    `);
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bc-mappings', requireAdmin, async (req, res) => {
  const { pb_mapping_id, regulation_id, course_id, status } = req.body;
  if (!pb_mapping_id || !regulation_id || !course_id) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    await runQuery(`
      INSERT INTO branch_course_mappings (pb_mapping_id, regulation_id, course_id, status)
      VALUES (?, ?, ?, ?)
    `, [pb_mapping_id, regulation_id, course_id, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Mapping already exists' : err.message });
  }
});

app.put('/api/bc-mappings/:id', requireAdmin, async (req, res) => {
  const { pb_mapping_id, regulation_id, course_id, status } = req.body;
  if (!pb_mapping_id || !regulation_id || !course_id) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    await runQuery(`
      UPDATE branch_course_mappings 
      SET pb_mapping_id = ?, regulation_id = ?, course_id = ?, status = ?
      WHERE id = ?
    `, [pb_mapping_id, regulation_id, course_id, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/bc-mappings/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM branch_course_mappings WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// FACULTY CRUD, BULK UPLOAD, & MAPPINGS
// ----------------------------------------------------
app.get('/api/faculties', requireLogin, async (req, res) => {
  try {
    const faculties = await allQuery(`
      SELECT f.*, b.name as branch_name 
      FROM faculties f
      LEFT JOIN branches b ON f.branch_id = b.id
    `);
    res.json(faculties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faculties', requireAdmin, async (req, res) => {
  const { user_type, branch_id, honorific, name, emp_id, phone, email, status } = req.body;
  if (!user_type || !honorific || !name || !emp_id || !email) {
    return res.status(400).json({ error: 'User Type, Honorific, Name, EMP ID, and Email are required' });
  }

  // Generate random password
  const rawPassword = Math.random().toString(36).substring(2, 10);
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(rawPassword, salt);
    await runQuery(`
      INSERT INTO faculties (user_type, branch_id, honorific, name, emp_id, phone, email, password_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [user_type, branch_id || null, honorific, name, emp_id, phone || '', email, hash, status || 'active']);

    res.status(201).json({
      success: true,
      generatedPassword: rawPassword,
      message: `Faculty created. Generated Password: ${rawPassword}. (Simulated email sent to ${email})`
    });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Email or EMP ID already exists' : err.message });
  }
});

app.put('/api/faculties/:id', requireAdmin, async (req, res) => {
  const { user_type, branch_id, honorific, name, emp_id, phone, email, status } = req.body;
  if (!user_type || !honorific || !name || !emp_id || !email) {
    return res.status(400).json({ error: 'User Type, Honorific, Name, EMP ID, and Email are required' });
  }

  try {
    await runQuery(`
      UPDATE faculties
      SET user_type = ?, branch_id = ?, honorific = ?, name = ?, emp_id = ?, phone = ?, email = ?, status = ?
      WHERE id = ?
    `, [user_type, branch_id || null, honorific, name, emp_id, phone || '', email, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/faculties/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM faculties WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV bulk upload for faculty
app.post('/api/faculties/bulk-upload', requireAdmin, tempUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const createdList = [];
  const errorsList = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      fs.unlinkSync(req.file.path); // Remove temp file

      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const { UserType, BranchCode, Honorific, FacultyName, EMPID, PhoneNumber, Email } = row;

        if (!UserType || !Honorific || !FacultyName || !EMPID || !Email) {
          errorsList.push(`Row ${i + 1}: Missing required fields.`);
          continue;
        }

        try {
          // Resolve branch code to id
          let branchId = null;
          if (BranchCode) {
            const branch = await getQuery(`SELECT id FROM branches WHERE code = ? AND status = 'active'`, [BranchCode.trim()]);
            if (branch) {
              branchId = branch.id;
            } else {
              errorsList.push(`Row ${i + 1}: Active branch code "${BranchCode}" not found.`);
              continue;
            }
          }

          const rawPassword = Math.random().toString(36).substring(2, 10);
          const salt = await bcrypt.genSalt(10);
          const hash = await bcrypt.hash(rawPassword, salt);

          await runQuery(`
            INSERT INTO faculties (user_type, branch_id, honorific, name, emp_id, phone, email, password_hash, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
          `, [UserType.trim(), branchId, Honorific.trim(), FacultyName.trim(), EMPID.trim(), PhoneNumber ? PhoneNumber.trim() : '', Email.trim(), hash]);

          createdList.push({
            name: FacultyName,
            email: Email,
            empId: EMPID,
            password: rawPassword
          });
        } catch (err) {
          errorsList.push(`Row ${i + 1} (${FacultyName || Email}): ${err.message.includes('UNIQUE') ? 'EMP ID or Email already exists' : err.message}`);
        }
      }

      res.json({
        success: true,
        created: createdList,
        errors: errorsList
      });
    });
});

// ----------------------------------------------------
// FACULTY - COURSE MAPPING CRUD
// ----------------------------------------------------
app.get('/api/faculty-course-mappings', requireLogin, async (req, res) => {
  try {
    const mappings = await allQuery(`
      SELECT fcm.*, f.name as faculty_name, f.emp_id as faculty_emp_id, c.name as course_name, c.code as course_code
      FROM faculty_course_mappings fcm
      JOIN faculties f ON fcm.faculty_id = f.id
      JOIN courses c ON fcm.course_id = c.id
    `);
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faculty-course-mappings', requireAdmin, async (req, res) => {
  const { faculty_id, course_id, status } = req.body;
  if (!faculty_id || !course_id) {
    return res.status(400).json({ error: 'Faculty and Course are required' });
  }

  try {
    // Get dependent fields from course
    const course = await getQuery(`SELECT * FROM courses WHERE id = ?`, [course_id]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Auto-calculate Academic Year: system timeline June 2025 to May 2026 => 2025-2026
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed (5 is June)
    let academicYear = '';
    if (month >= 5) { // June or later
      academicYear = `${year}-${year + 1}`;
    } else { // Jan-May
      academicYear = `${year - 1}-${year}`;
    }

    await runQuery(`
      INSERT INTO faculty_course_mappings (faculty_id, course_id, course_type, year, semester, academic_year, elective_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      faculty_id,
      course_id,
      course.type,
      course.year,
      course.semester,
      academicYear,
      course.elective_type,
      status || 'active'
    ]);

    res.status(201).json({ success: true, academicYear });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'This faculty is already mapped to this course for this academic year' : err.message });
  }
});

app.put('/api/faculty-course-mappings/:id', requireAdmin, async (req, res) => {
  const { faculty_id, course_id, status } = req.body;
  if (!faculty_id || !course_id) {
    return res.status(400).json({ error: 'Faculty and Course are required' });
  }

  try {
    const course = await getQuery(`SELECT * FROM courses WHERE id = ?`, [course_id]);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    await runQuery(`
      UPDATE faculty_course_mappings
      SET faculty_id = ?, course_id = ?, course_type = ?, year = ?, semester = ?, elective_type = ?, status = ?
      WHERE id = ?
    `, [faculty_id, course_id, course.type, course.year, course.semester, course.elective_type, status, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/faculty-course-mappings/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM faculty_course_mappings WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// COURSE PLUGINS (BLOOMS, DIFFICULTY, UNITS)
// ----------------------------------------------------
// Bloom's levels
app.get('/api/blooms', requireLogin, async (req, res) => {
  try {
    const data = await allQuery(`SELECT * FROM blooms_levels`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/blooms', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    await runQuery(`INSERT INTO blooms_levels (name, status) VALUES (?, ?)`, [name, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.put('/api/blooms/:id', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  try {
    await runQuery(`UPDATE blooms_levels SET name = ?, status = ? WHERE id = ?`, [name, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.delete('/api/blooms/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM blooms_levels WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Difficulty levels
app.get('/api/difficulties', requireLogin, async (req, res) => {
  try {
    const data = await allQuery(`SELECT * FROM difficulty_levels`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/difficulties', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    await runQuery(`INSERT INTO difficulty_levels (name, status) VALUES (?, ?)`, [name, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.put('/api/difficulties/:id', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  try {
    await runQuery(`UPDATE difficulty_levels SET name = ?, status = ? WHERE id = ?`, [name, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.delete('/api/difficulties/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM difficulty_levels WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Units
app.get('/api/units', requireLogin, async (req, res) => {
  try {
    const data = await allQuery(`SELECT * FROM units`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/units', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    await runQuery(`INSERT INTO units (name, status) VALUES (?, ?)`, [name, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.put('/api/units/:id', requireAdmin, async (req, res) => {
  const { name, status } = req.body;
  try {
    await runQuery(`UPDATE units SET name = ?, status = ? WHERE id = ?`, [name, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.delete('/api/units/:id', requireAdmin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM units WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// FACULTY SPECIFIC: MY COURSES, COs, & QUESTIONS
// ----------------------------------------------------

// GET COs of a Course
app.get('/api/courses/:courseId/cos', requireLogin, async (req, res) => {
  try {
    const cos = await allQuery(
      `SELECT * FROM course_outcomes WHERE course_id = ?`,
      [req.params.courseId]
    );
    res.json(cos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new CO
app.post('/api/courses/:courseId/cos', requireLogin, async (req, res) => {
  const { code, description, status } = req.body;
  if (!code || !description) {
    return res.status(400).json({ error: 'Code and Description are required' });
  }

  try {
    await runQuery(`
      INSERT INTO course_outcomes (course_id, code, description, status)
      VALUES (?, ?, ?, ?)
    `, [req.params.courseId, code, description, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'CO Code already exists for this course' : err.message });
  }
});

// PUT CO
app.put('/api/cos/:id', requireLogin, async (req, res) => {
  const { code, description, status } = req.body;
  if (!code || !description) {
    return res.status(400).json({ error: 'Code and Description are required' });
  }

  try {
    await runQuery(`
      UPDATE course_outcomes
      SET code = ?, description = ?, status = ?
      WHERE id = ?
    `, [code, description, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE CO
app.delete('/api/cos/:id', requireLogin, async (req, res) => {
  try {
    await runQuery(`DELETE FROM course_outcomes WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET questions of a Course
app.get('/api/courses/:courseId/questions', requireLogin, async (req, res) => {
  try {
    const questions = await allQuery(`
      SELECT q.*, co.code as co_code, b.name as blooms_name, d.name as difficulty_name, u.name as unit_name
      FROM questions q
      JOIN course_outcomes co ON q.co_id = co.id
      JOIN blooms_levels b ON q.blooms_level_id = b.id
      JOIN difficulty_levels d ON q.difficulty_level_id = d.id
      JOIN units u ON q.unit_id = u.id
      WHERE q.course_id = ?
    `, [req.params.courseId]);
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE question (handles optional image upload)
app.post('/api/courses/:courseId/questions', requireLogin, upload.single('image'), async (req, res) => {
  const { co_id, blooms_level_id, difficulty_level_id, unit_id, text, marks, status } = req.body;
  if (!co_id || !blooms_level_id || !difficulty_level_id || !unit_id || !text || !marks) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  let imagePath = null;
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  try {
    await runQuery(`
      INSERT INTO questions (course_id, co_id, blooms_level_id, difficulty_level_id, unit_id, text, image_path, marks, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.params.courseId, co_id, blooms_level_id, difficulty_level_id, unit_id, text, imagePath, marks, status || 'active']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE question (handles optional image upload)
app.put('/api/questions/:id', requireLogin, upload.single('image'), async (req, res) => {
  const { co_id, blooms_level_id, difficulty_level_id, unit_id, text, marks, status } = req.body;
  if (!co_id || !blooms_level_id || !difficulty_level_id || !unit_id || !text || !marks) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if new image is uploaded or keeping the old one
    let imagePath = req.body.image_path;
    if (req.file) {
      imagePath = '/uploads/' + req.file.filename;
    }

    await runQuery(`
      UPDATE questions
      SET co_id = ?, blooms_level_id = ?, difficulty_level_id = ?, unit_id = ?, text = ?, image_path = ?, marks = ?, status = ?
      WHERE id = ?
    `, [co_id, blooms_level_id, difficulty_level_id, unit_id, text, imagePath, marks, status, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE question
app.delete('/api/questions/:id', requireLogin, async (req, res) => {
  try {
    // Delete file if exists
    const q = await getQuery(`SELECT image_path FROM questions WHERE id = ?`, [req.params.id]);
    if (q && q.image_path) {
      const fullPath = path.join(__dirname, 'public', q.image_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await runQuery(`DELETE FROM questions WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Question Bulk Upload (CSV)
app.post('/api/questions/:courseId/bulk-upload', requireLogin, tempUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const createdList = [];
  const errorsList = [];
  const courseId = req.params.courseId;

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      fs.unlinkSync(req.file.path); // Remove temp file

      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const { COCode, BloomsLevel, DifficultyLevel, UnitName, QuestionText, Marks } = row;

        if (!COCode || !BloomsLevel || !DifficultyLevel || !UnitName || !QuestionText || !Marks) {
          errorsList.push(`Row ${i + 1}: Missing required fields.`);
          continue;
        }

        try {
          // Resolve COCode to id for this course
          const co = await getQuery(`SELECT id FROM course_outcomes WHERE course_id = ? AND code = ? AND status = 'active'`, [courseId, COCode.trim()]);
          if (!co) {
            errorsList.push(`Row ${i + 1}: Active CO "${COCode}" not found for this course.`);
            continue;
          }

          // Resolve BloomsLevel to id
          const bloom = await getQuery(`SELECT id FROM blooms_levels WHERE name = ? AND status = 'active'`, [BloomsLevel.trim()]);
          if (!bloom) {
            errorsList.push(`Row ${i + 1}: Active Bloom's level "${BloomsLevel}" not found.`);
            continue;
          }

          // Resolve DifficultyLevel to id
          const diff = await getQuery(`SELECT id FROM difficulty_levels WHERE name = ? AND status = 'active'`, [DifficultyLevel.trim()]);
          if (!diff) {
            errorsList.push(`Row ${i + 1}: Active Difficulty level "${DifficultyLevel}" not found.`);
            continue;
          }

          // Resolve UnitName to id
          const unit = await getQuery(`SELECT id FROM units WHERE name = ? AND status = 'active'`, [UnitName.trim()]);
          if (!unit) {
            errorsList.push(`Row ${i + 1}: Active Unit "${UnitName}" not found.`);
            continue;
          }

          await runQuery(`
            INSERT INTO questions (course_id, co_id, blooms_level_id, difficulty_level_id, unit_id, text, image_path, marks, status)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'active')
          `, [courseId, co.id, bloom.id, diff.id, unit.id, QuestionText.trim(), parseInt(Marks.trim())]);

          createdList.push(QuestionText.trim());
        } catch (err) {
          errorsList.push(`Row ${i + 1}: ${err.message}`);
        }
      }

      res.json({
        success: true,
        createdCount: createdList.length,
        errors: errorsList
      });
    });
});


// ----------------------------------------------------
// QUESTION PAPER GENERATION (QP WIZARD)
// ----------------------------------------------------

// Get courses mapped to a program (via Branch Course mappings and Program-Branch mappings)
app.get('/api/qp/courses-by-program/:programId', requireLogin, async (req, res) => {
  try {
    const courses = await allQuery(`
      SELECT DISTINCT c.id, c.code, c.name, c.year, c.semester, r.name as regulation_name
      FROM branch_course_mappings bcm
      JOIN program_branch_mappings pbm ON bcm.pb_mapping_id = pbm.id
      JOIN courses c ON bcm.course_id = c.id
      JOIN regulations r ON bcm.regulation_id = r.id
      WHERE pbm.program_id = ? AND c.status = 'active' AND bcm.status = 'active'
    `, [req.params.programId]);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active filters for a course (COs, Bloom's, Difficulties, Units, etc.)
app.get('/api/qp/active-filters/:courseId', requireLogin, async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const cos = await allQuery(`SELECT id, code, description FROM course_outcomes WHERE course_id = ? AND status = 'active'`, [courseId]);
    const blooms = await allQuery(`SELECT id, name FROM blooms_levels WHERE status = 'active'`);
    const difficulties = await allQuery(`SELECT id, name FROM difficulty_levels WHERE status = 'active'`);
    const units = await allQuery(`SELECT id, name FROM units WHERE status = 'active'`);
    res.json({ cos, blooms, difficulties, units });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-generate questions based on selected criteria
app.post('/api/qp/generate-questions', requireLogin, async (req, res) => {
  const { courseId, criteria } = req.body; // criteria is array of { coId, bloomId, difficultyId, marks }
  if (!courseId || !criteria || !Array.isArray(criteria)) {
    return res.status(400).json({ error: 'Course and criteria array are required' });
  }

  try {
    const generatedQuestions = [];
    const unsatisfied = [];

    for (let i = 0; i < criteria.length; i++) {
      const crit = criteria[i];
      // Find active questions matching the filter
      const matches = await allQuery(`
        SELECT q.id, q.text, q.marks, q.image_path, co.code as co_code, b.name as blooms_name, d.name as difficulty_name, u.name as unit_name
        FROM questions q
        JOIN course_outcomes co ON q.co_id = co.id
        JOIN blooms_levels b ON q.blooms_level_id = b.id
        JOIN difficulty_levels d ON q.difficulty_level_id = d.id
        JOIN units u ON q.unit_id = u.id
        WHERE q.course_id = ? AND q.status = 'active'
          AND q.co_id = ? 
          AND q.blooms_level_id = ? 
          AND q.difficulty_level_id = ? 
          AND q.marks = ?
      `, [courseId, crit.coId, crit.bloomId, crit.difficultyId, crit.marks]);

      if (matches.length > 0) {
        // Pick one randomly
        const randomIndex = Math.floor(Math.random() * matches.length);
        generatedQuestions.push({
          index: i + 1,
          question: matches[randomIndex]
        });
      } else {
        unsatisfied.push({
          index: i + 1,
          criteria: crit
        });
      }
    }

    res.json({
      success: unsatisfied.length === 0,
      questions: generatedQuestions,
      unsatisfied: unsatisfied
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save question paper
app.post('/api/qp/save', requireLogin, async (req, res) => {
  const { programId, courseId, assessmentType, dateOfExam, regulationId, year, semester, academicYear, structureJson, questionsJson } = req.body;

  if (!programId || !courseId || !assessmentType || !dateOfExam || !regulationId || !year || !semester || !academicYear || !structureJson || !questionsJson) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    await runQuery(`
      INSERT INTO question_papers (program_id, course_id, assessment_type, date_of_exam, regulation_id, year, semester, academic_year, structure_json, questions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      programId,
      courseId,
      assessmentType,
      dateOfExam,
      regulationId,
      year,
      semester,
      academicYear,
      JSON.stringify(structureJson),
      JSON.stringify(questionsJson)
    ]);

    res.json({ success: true, message: 'Question Paper saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// History of Question Papers
app.get('/api/qp/history', requireLogin, async (req, res) => {
  try {
    const qps = await allQuery(`
      SELECT qp.id, qp.assessment_type, qp.date_of_exam, qp.year, qp.semester, qp.academic_year, qp.saved_at,
             p.name as program_name, c.name as course_name, c.code as course_code, r.name as regulation_name
      FROM question_papers qp
      JOIN programs p ON qp.program_id = p.id
      JOIN courses c ON qp.course_id = c.id
      JOIN regulations r ON qp.regulation_id = r.id
      ORDER BY qp.saved_at DESC
    `);
    res.json(qps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single QP details
app.get('/api/qp/:id', requireLogin, async (req, res) => {
  try {
    const qp = await getQuery(`
      SELECT qp.*, p.name as program_name, c.name as course_name, c.code as course_code, r.name as regulation_name
      FROM question_papers qp
      JOIN programs p ON qp.program_id = p.id
      JOIN courses c ON qp.course_id = c.id
      JOIN regulations r ON qp.regulation_id = r.id
      WHERE qp.id = ?
    `, [req.params.id]);

    if (!qp) return res.status(404).json({ error: 'Question Paper not found' });

    res.json({
      ...qp,
      structure_json: JSON.parse(qp.structure_json),
      questions_json: JSON.parse(qp.questions_json)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Serve SPA Client Page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Database & Listen
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`WEBSAGA ERP is running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
  });
