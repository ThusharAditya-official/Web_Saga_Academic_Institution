// Global State
let loginRole = 'Admin';
let currentUser = null;
let currentView = '';
let activeCourseId = null; // Used by faculty course details view
let qpFilters = null; // Stores COs, Blooms, Difficulties, Units for selected course
let generatedQpPaper = null; // Stores currently generated QP
let charts = {}; // Holds Chart.js instances

// Templates for CSV Downloads
const FACULTY_CSV_TEMPLATE = "UserType,BranchCode,Honorific,FacultyName,EMPID,PhoneNumber,Email\nFaculty,05,Mr.,Rajesh Kumar,EMP101,9876543211,rajesh@websaga.com\nFaculty,12,Dr.,Saraswathi Devi,EMP102,9876543212,saraswathi@websaga.com";
const QUESTION_CSV_TEMPLATE = "COCode,BloomsLevel,DifficultyLevel,UnitName,QuestionText,Marks\nCO1,Remember,Easy,Unit-1,What is the primary feature of Python?,5\nCO1,Understand,Moderate,Unit-1,Explain the difference between compiler and interpreter.,10\nCO2,Apply,Hard,Unit-2,Write a python program to sort a list using quicksort.,10";

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});

// ----------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------
function setLoginRole(role) {
  loginRole = role;
  document.getElementById('role-admin-btn').classList.toggle('active', role === 'Admin');
  document.getElementById('role-faculty-btn').classList.toggle('active', role === 'Faculty');
  
  const emailInput = document.getElementById('login-email');
  if (role === 'Admin') {
    emailInput.placeholder = 'e.g. admin@websaga.com';
  } else {
    emailInput.placeholder = 'e.g. faculty@websaga.com';
  }
}

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.loggedIn) {
      currentUser = data.user;
      showApp(currentUser);
    } else {
      showLogin();
    }
  } catch (err) {
    showToast('Failed to contact server', 'danger');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, userType: loginRole })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      currentUser = data.user;
      showToast('Logged in successfully', 'success');
      showApp(currentUser);
    } else {
      showToast(data.error || 'Login failed', 'danger');
    }
  } catch (err) {
    showToast('Server error during login', 'danger');
  }
}

async function handleLogout() {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    if (res.ok) {
      currentUser = null;
      showToast('Logged out successfully', 'success');
      showLogin();
    }
  } catch (err) {
    showToast('Failed to logout', 'danger');
  }
}

function showLogin() {
  document.getElementById('login-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  // Clear forms
  document.getElementById('login-form').reset();
}

function showApp(user) {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';

  document.getElementById('user-display-name').textContent = user.name;
  document.getElementById('user-display-role').textContent = user.userType;

  // Toggle menus
  const isAdmin = user.userType === 'Admin';
  document.getElementById('admin-menu').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('faculty-menu').style.display = isAdmin ? 'none' : 'block';

  // Load default dashboard
  if (isAdmin) {
    switchView('admin-dashboard');
  } else {
    switchView('faculty-dashboard');
  }
}

// ----------------------------------------------------
// NAVIGATION CONTROL
// ----------------------------------------------------
function switchView(viewName) {
  currentView = viewName;
  
  // Hide all sections
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  
  // Update sidebar links active class
  document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
  
  // Toggle sections
  const viewId = `view-${viewName}`;
  const targetSection = document.getElementById(viewId);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // Update headers and load data
  let title = 'Dashboard';
  switch (viewName) {
    case 'admin-dashboard':
      title = 'Admin Dashboard';
      loadAdminDashboard();
      break;
    case 'admin-programs':
      title = 'Programs Setup';
      loadPrograms();
      break;
    case 'admin-branches':
      title = 'Branches Setup';
      loadBranches();
      break;
    case 'admin-regulations':
      title = 'Regulations Setup';
      loadRegulations();
      break;
    case 'admin-pb-mappings':
      title = 'Program-Branch Mappings';
      loadPbMappings();
      break;
    case 'admin-courses':
      title = 'Courses Setup';
      loadCourses();
      break;
    case 'admin-bc-mappings':
      title = 'Branch-Course Mappings';
      loadBcMappings();
      break;
    case 'admin-faculties':
      title = 'Faculty Directory';
      loadFaculties();
      break;
    case 'admin-faculty-courses':
      title = 'Faculty Course Mappings';
      loadFacultyCourses();
      break;
    case 'admin-plugins':
      title = 'Course Plugins';
      switchPluginTab('blooms');
      break;
    case 'admin-qp-generator':
      title = 'Automated QP Generator';
      initQpWizard();
      break;
    case 'admin-qp-history':
      title = 'Question Paper Repository';
      loadQpHistory();
      break;
    case 'faculty-dashboard':
      title = 'Faculty Dashboard';
      loadFacultyDashboard();
      break;
    case 'faculty-courses':
      title = 'My Classes / Courses';
      loadFacultyCoursesGrid();
      break;
    case 'faculty-course-details':
      title = 'Course Sub-modules';
      // Mapped courses sub-views
      switchCourseDetailTab('cos');
      break;
    case 'faculty-password':
      title = 'Change Account Password';
      break;
  }
  
  document.getElementById('header-view-title').textContent = title;

  // Highlight current sidebar link
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  sidebarLinks.forEach(link => {
    const onClickAttr = link.getAttribute('onclick');
    if (onClickAttr && onClickAttr.includes(`'${viewName}'`)) {
      link.classList.add('active');
    }
  });
}

// ----------------------------------------------------
// TOAST NOTIFICATIONS
// ----------------------------------------------------
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  
  toast.className = `active ${type}`;
  toastText.textContent = message;
  
  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// Modal control
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ----------------------------------------------------
// CSV TEMPLATE DOWNLOADS
// ----------------------------------------------------
function downloadFacultyTemplate() {
  downloadFile(FACULTY_CSV_TEMPLATE, 'faculty_bulk_template.csv');
}
function downloadQuestionTemplate() {
  downloadFile(QUESTION_CSV_TEMPLATE, 'questions_bulk_template.csv');
}
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ----------------------------------------------------
// 1. ADMIN DASHBOARD
// ----------------------------------------------------
async function loadAdminDashboard() {
  try {
    const res = await fetch('/api/admin/dashboard');
    const data = await res.json();

    document.getElementById('stat-courses').textContent = data.stats.courses;
    document.getElementById('stat-programs').textContent = data.stats.programs;
    document.getElementById('stat-faculty').textContent = data.stats.faculty;
    document.getElementById('stat-qps').textContent = data.stats.qps;

    // Destroy old charts
    if (charts.courseChart) charts.courseChart.destroy();
    if (charts.bloomChart) charts.bloomChart.destroy();

    // Chart 1: Course types distribution
    const courseCtx = document.getElementById('admin-course-chart').getContext('2d');
    const typesLabels = data.charts.courseTypes.map(c => c.type);
    const typesCounts = data.charts.courseTypes.map(c => c.count);

    charts.courseChart = new Chart(courseCtx, {
      type: 'doughnut',
      data: {
        labels: typesLabels,
        datasets: [{
          data: typesCounts,
          backgroundColor: ['hsl(210, 90%, 50%)', 'hsl(175, 75%, 38%)', 'hsl(28, 95%, 53%)']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });

    // Chart 2: Question distribution by Bloom's level
    const bloomCtx = document.getElementById('admin-bloom-chart').getContext('2d');
    const bloomLabels = data.charts.bloomQCounts.map(b => b.name);
    const bloomCounts = data.charts.bloomQCounts.map(b => b.count);

    charts.bloomChart = new Chart(bloomCtx, {
      type: 'bar',
      data: {
        labels: bloomLabels,
        datasets: [{
          label: 'Number of Questions',
          data: bloomCounts,
          backgroundColor: 'hsl(175, 75%, 38%)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  } catch (err) {
    showToast('Failed to load dashboard metrics', 'danger');
  }
}

// ----------------------------------------------------
// 2. ADMIN PROGRAMS CRUD
// ----------------------------------------------------
async function loadPrograms() {
  try {
    const res = await fetch('/api/programs');
    const programs = await res.json();
    const tbody = document.getElementById('programs-table-body');
    tbody.innerHTML = '';

    programs.forEach(p => {
      tbody.innerHTML += `
        <tr>
          <td>${p.id}</td>
          <td><strong>${p.name}</strong></td>
          <td><span class="status-badge ${p.status}">${p.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editProgram(${p.id}, '${p.name}', '${p.status}')" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteProgram(${p.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load programs', 'danger');
  }
}

function openProgramModal() {
  document.getElementById('program-modal-title').textContent = 'Add Program';
  document.getElementById('program-form-id').value = '';
  document.getElementById('program-form').reset();
  openModal('program-modal');
}

function editProgram(id, name, status) {
  document.getElementById('program-modal-title').textContent = 'Edit Program';
  document.getElementById('program-form-id').value = id;
  document.getElementById('program-name').value = name;
  document.getElementById('program-status').value = status;
  openModal('program-modal');
}

async function saveProgram(e) {
  e.preventDefault();
  const id = document.getElementById('program-form-id').value;
  const name = document.getElementById('program-name').value;
  const status = document.getElementById('program-status').value;

  const url = id ? `/api/programs/${id}` : '/api/programs';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Program updated' : 'Program added', 'success');
      closeModal('program-modal');
      loadPrograms();
    } else {
      showToast(data.error || 'Failed to save program', 'danger');
    }
  } catch (err) {
    showToast('Error saving program', 'danger');
  }
}

async function deleteProgram(id) {
  if (!confirm('Are you sure you want to delete this program? All mapped courses and branches will be deleted too.')) return;
  try {
    const res = await fetch(`/api/programs/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Program deleted', 'success');
      loadPrograms();
    }
  } catch (err) {
    showToast('Failed to delete program', 'danger');
  }
}

// ----------------------------------------------------
// 3. ADMIN BRANCHES CRUD
// ----------------------------------------------------
async function loadBranches() {
  try {
    const res = await fetch('/api/branches');
    const branches = await res.json();
    const tbody = document.getElementById('branches-table-body');
    tbody.innerHTML = '';

    branches.forEach(b => {
      tbody.innerHTML += `
        <tr>
          <td>${b.id}</td>
          <td><strong>${b.code}</strong></td>
          <td>${b.name}</td>
          <td><span class="status-badge ${b.status}">${b.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editBranch(${b.id}, '${b.code}', '${b.name}', '${b.status}')" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteBranch(${b.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load branches', 'danger');
  }
}

function openBranchModal() {
  document.getElementById('branch-modal-title').textContent = 'Add Branch';
  document.getElementById('branch-form-id').value = '';
  document.getElementById('branch-form').reset();
  openModal('branch-modal');
}

function editBranch(id, code, name, status) {
  document.getElementById('branch-modal-title').textContent = 'Edit Branch';
  document.getElementById('branch-form-id').value = id;
  document.getElementById('branch-code').value = code;
  document.getElementById('branch-name').value = name;
  document.getElementById('branch-status').value = status;
  openModal('branch-modal');
}

async function saveBranch(e) {
  e.preventDefault();
  const id = document.getElementById('branch-form-id').value;
  const code = document.getElementById('branch-code').value;
  const name = document.getElementById('branch-name').value;
  const status = document.getElementById('branch-status').value;

  const url = id ? `/api/branches/${id}` : '/api/branches';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Branch updated' : 'Branch added', 'success');
      closeModal('branch-modal');
      loadBranches();
    } else {
      showToast(data.error || 'Failed to save branch', 'danger');
    }
  } catch (err) {
    showToast('Error saving branch', 'danger');
  }
}

async function deleteBranch(id) {
  if (!confirm('Are you sure you want to delete this branch? All mapped faculty, mappings and courses will be deleted.')) return;
  try {
    const res = await fetch(`/api/branches/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Branch deleted', 'success');
      loadBranches();
    }
  } catch (err) {
    showToast('Failed to delete branch', 'danger');
  }
}

// ----------------------------------------------------
// 4. ADMIN REGULATIONS CRUD
// ----------------------------------------------------
async function loadRegulations() {
  try {
    const res = await fetch('/api/regulations');
    const regulations = await res.json();
    const tbody = document.getElementById('regulations-table-body');
    tbody.innerHTML = '';

    regulations.forEach(r => {
      tbody.innerHTML += `
        <tr>
          <td>${r.id}</td>
          <td><strong>${r.name}</strong></td>
          <td><span class="status-badge ${r.status}">${r.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editRegulation(${r.id}, '${r.name}', '${r.status}')" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteRegulation(${r.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load regulations', 'danger');
  }
}

function openRegulationModal() {
  document.getElementById('regulation-modal-title').textContent = 'Add Regulation';
  document.getElementById('regulation-form-id').value = '';
  document.getElementById('regulation-form').reset();
  openModal('regulation-modal');
}

function editRegulation(id, name, status) {
  document.getElementById('regulation-modal-title').textContent = 'Edit Regulation';
  document.getElementById('regulation-form-id').value = id;
  document.getElementById('regulation-name').value = name;
  document.getElementById('regulation-status').value = status;
  openModal('regulation-modal');
}

async function saveRegulation(e) {
  e.preventDefault();
  const id = document.getElementById('regulation-form-id').value;
  const name = document.getElementById('regulation-name').value;
  const status = document.getElementById('regulation-status').value;

  const url = id ? `/api/regulations/${id}` : '/api/regulations';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Regulation updated' : 'Regulation added', 'success');
      closeModal('regulation-modal');
      loadRegulations();
    } else {
      showToast(data.error || 'Failed to save regulation', 'danger');
    }
  } catch (err) {
    showToast('Error saving regulation', 'danger');
  }
}

async function deleteRegulation(id) {
  if (!confirm('Are you sure you want to delete this regulation?')) return;
  try {
    const res = await fetch(`/api/regulations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Regulation deleted', 'success');
      loadRegulations();
    }
  } catch (err) {
    showToast('Failed to delete regulation', 'danger');
  }
}

// ----------------------------------------------------
// 5. PROGRAM-BRANCH MAPPINGS
// ----------------------------------------------------
async function loadPbMappings() {
  try {
    const res = await fetch('/api/pb-mappings');
    const mappings = await res.json();
    const tbody = document.getElementById('pb-mappings-table-body');
    tbody.innerHTML = '';

    mappings.forEach(m => {
      tbody.innerHTML += `
        <tr>
          <td>${m.id}</td>
          <td><strong>${m.program_name}</strong></td>
          <td>${m.branch_name}</td>
          <td><code style="background-color:var(--bg-main); padding: 2px 6px; border-radius: 4px;">${m.branch_code}</code></td>
          <td><span class="status-badge ${m.status}">${m.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editPbMapping(${m.id}, ${m.program_id}, ${m.branch_id}, '${m.status}')" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deletePbMapping(${m.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load P-B mappings', 'danger');
  }
}

async function populatePbDropdowns() {
  try {
    const progRes = await fetch('/api/programs');
    const branchRes = await fetch('/api/branches');
    
    const progs = (await progRes.json()).filter(p => p.status === 'active');
    const branches = (await branchRes.json()).filter(b => b.status === 'active');

    const progSelect = document.getElementById('pb-mapping-program');
    const branchSelect = document.getElementById('pb-mapping-branch');

    progSelect.innerHTML = '';
    branchSelect.innerHTML = '';

    progs.forEach(p => progSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`);
    branches.forEach(b => branchSelect.innerHTML += `<option value="${b.id}">${b.name} (${b.code})</option>`);
  } catch (err) {
    showToast('Failed to load dropdown mappings', 'danger');
  }
}

function openPbMappingModal() {
  document.getElementById('pb-mapping-modal-title').textContent = 'Add Program-Branch Mapping';
  document.getElementById('pb-mapping-form-id').value = '';
  document.getElementById('pb-mapping-form').reset();
  populatePbDropdowns().then(() => openModal('pb-mapping-modal'));
}

function editPbMapping(id, programId, branchId, status) {
  document.getElementById('pb-mapping-modal-title').textContent = 'Edit Program-Branch Mapping';
  document.getElementById('pb-mapping-form-id').value = id;
  populatePbDropdowns().then(() => {
    document.getElementById('pb-mapping-program').value = programId;
    document.getElementById('pb-mapping-branch').value = branchId;
    document.getElementById('pb-mapping-status').value = status;
    openModal('pb-mapping-modal');
  });
}

async function savePbMapping(e) {
  e.preventDefault();
  const id = document.getElementById('pb-mapping-form-id').value;
  const program_id = document.getElementById('pb-mapping-program').value;
  const branch_id = document.getElementById('pb-mapping-branch').value;
  const status = document.getElementById('pb-mapping-status').value;

  const url = id ? `/api/pb-mappings/${id}` : '/api/pb-mappings';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program_id, branch_id, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Mapping updated' : 'Mapping added', 'success');
      closeModal('pb-mapping-modal');
      loadPbMappings();
    } else {
      showToast(data.error || 'Failed to save mapping', 'danger');
    }
  } catch (err) {
    showToast('Error saving mapping', 'danger');
  }
}

async function deletePbMapping(id) {
  if (!confirm('Are you sure you want to delete this mapping?')) return;
  try {
    const res = await fetch(`/api/pb-mappings/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Mapping deleted', 'success');
      loadPbMappings();
    }
  } catch (err) {
    showToast('Failed to delete mapping', 'danger');
  }
}

// ----------------------------------------------------
// 6. ADMIN COURSES CRUD
// ----------------------------------------------------
async function loadCourses() {
  try {
    const res = await fetch('/api/courses');
    const courses = await res.json();
    const tbody = document.getElementById('courses-table-body');
    tbody.innerHTML = '';

    courses.forEach(c => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${c.code}</strong></td>
          <td>${c.name}</td>
          <td>${c.branch_name}</td>
          <td>${c.regulation_name}</td>
          <td>Year ${c.year} - Sem ${c.semester}</td>
          <td>${c.type}</td>
          <td><span style="font-size:11px; padding: 2px 6px; background-color: var(--bg-main); border-radius: 4px;">${c.elective_type}</span></td>
          <td><strong>${c.credits}</strong></td>
          <td><span class="status-badge ${c.status}">${c.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editCourse(${c.id})" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteCourse(${c.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load courses', 'danger');
  }
}

async function populateCourseDropdowns() {
  try {
    const branchRes = await fetch('/api/branches');
    const regRes = await fetch('/api/regulations');

    const branches = (await branchRes.json()).filter(b => b.status === 'active');
    const regulations = (await regRes.json()).filter(r => r.status === 'active');

    const branchSelect = document.getElementById('course-branch');
    const regSelect = document.getElementById('course-regulation');

    branchSelect.innerHTML = '';
    regSelect.innerHTML = '';

    branches.forEach(b => branchSelect.innerHTML += `<option value="${b.id}">${b.name} (${b.code})</option>`);
    regulations.forEach(r => regSelect.innerHTML += `<option value="${r.id}">${r.name}</option>`);
  } catch (err) {
    showToast('Failed to load course details list', 'danger');
  }
}

function openCourseModal() {
  document.getElementById('course-modal-title').textContent = 'Add Course';
  document.getElementById('course-form-id').value = '';
  document.getElementById('course-form').reset();
  populateCourseDropdowns().then(() => openModal('course-modal'));
}

async function editCourse(id) {
  document.getElementById('course-modal-title').textContent = 'Edit Course';
  document.getElementById('course-form-id').value = id;

  try {
    await populateCourseDropdowns();
    const res = await fetch('/api/courses');
    const courses = await res.json();
    const c = courses.find(item => item.id === id);

    if (c) {
      document.getElementById('course-code').value = c.code;
      document.getElementById('course-name').value = c.name;
      document.getElementById('course-branch').value = c.branch_id;
      document.getElementById('course-regulation').value = c.regulation_id;
      document.getElementById('course-year').value = c.year;
      document.getElementById('course-semester').value = c.semester;
      document.getElementById('course-type').value = c.type;
      document.getElementById('course-elective-type').value = c.elective_type;
      document.getElementById('course-credits').value = c.credits;
      document.getElementById('course-status').value = c.status;
      openModal('course-modal');
    }
  } catch (err) {
    showToast('Failed to load course details', 'danger');
  }
}

async function saveCourse(e) {
  e.preventDefault();
  const id = document.getElementById('course-form-id').value;
  const code = document.getElementById('course-code').value;
  const name = document.getElementById('course-name').value;
  const branch_id = document.getElementById('course-branch').value;
  const regulation_id = document.getElementById('course-regulation').value;
  const year = document.getElementById('course-year').value;
  const semester = document.getElementById('course-semester').value;
  const type = document.getElementById('course-type').value;
  const elective_type = document.getElementById('course-elective-type').value;
  const credits = document.getElementById('course-credits').value;
  const status = document.getElementById('course-status').value;

  const url = id ? `/api/courses/${id}` : '/api/courses';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, branch_id, regulation_id, year, semester, type, elective_type, credits, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Course updated' : 'Course added', 'success');
      closeModal('course-modal');
      loadCourses();
    } else {
      showToast(data.error || 'Failed to save course', 'danger');
    }
  } catch (err) {
    showToast('Error saving course', 'danger');
  }
}

async function deleteCourse(id) {
  if (!confirm('Are you sure you want to delete this course? All mappings and questions will be deleted.')) return;
  try {
    const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Course deleted', 'success');
      loadCourses();
    }
  } catch (err) {
    showToast('Failed to delete course', 'danger');
  }
}

// ----------------------------------------------------
// 7. BRANCH-COURSE MAPPINGS
// ----------------------------------------------------
async function loadBcMappings() {
  try {
    const res = await fetch('/api/bc-mappings');
    const mappings = await res.json();
    const tbody = document.getElementById('bc-mappings-table-body');
    tbody.innerHTML = '';

    mappings.forEach(m => {
      tbody.innerHTML += `
        <tr>
          <td>${m.id}</td>
          <td><strong>${m.program_name} - ${m.branch_name}</strong></td>
          <td>${m.regulation_name}</td>
          <td>${m.course_name} (<code style="font-size:11px;">${m.course_code}</code>)</td>
          <td><span class="status-badge ${m.status}">${m.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editBcMapping(${m.id}, ${m.pb_mapping_id}, ${m.regulation_id}, ${m.course_id}, '${m.status}')" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteBcMapping(${m.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load B-C mappings', 'danger');
  }
}

async function populateBcDropdowns() {
  try {
    const pbRes = await fetch('/api/pb-mappings');
    const regRes = await fetch('/api/regulations');
    const courseRes = await fetch('/api/courses');

    const pbs = (await pbRes.json()).filter(m => m.status === 'active');
    const regs = (await regRes.json()).filter(r => r.status === 'active');
    const courses = (await courseRes.json()).filter(c => c.status === 'active');

    const pbSelect = document.getElementById('bc-mapping-pb');
    const regSelect = document.getElementById('bc-mapping-regulation');
    const courseSelect = document.getElementById('bc-mapping-course');

    pbSelect.innerHTML = '';
    regSelect.innerHTML = '';
    courseSelect.innerHTML = '';

    pbs.forEach(m => pbSelect.innerHTML += `<option value="${m.id}">${m.program_name} - ${m.branch_name}</option>`);
    regs.forEach(r => regSelect.innerHTML += `<option value="${r.id}">${r.name}</option>`);
    courses.forEach(c => courseSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.code})</option>`);
  } catch (err) {
    showToast('Failed to load branch-course dropdown data', 'danger');
  }
}

function openBcMappingModal() {
  document.getElementById('bc-mapping-modal-title').textContent = 'Add Branch-Course Mapping';
  document.getElementById('bc-mapping-form-id').value = '';
  document.getElementById('bc-mapping-form').reset();
  populateBcDropdowns().then(() => openModal('bc-mapping-modal'));
}

function editBcMapping(id, pbMappingId, regulationId, courseId, status) {
  document.getElementById('bc-mapping-modal-title').textContent = 'Edit Branch-Course Mapping';
  document.getElementById('bc-mapping-form-id').value = id;
  populateBcDropdowns().then(() => {
    document.getElementById('bc-mapping-pb').value = pbMappingId;
    document.getElementById('bc-mapping-regulation').value = regulationId;
    document.getElementById('bc-mapping-course').value = courseId;
    document.getElementById('bc-mapping-status').value = status;
    openModal('bc-mapping-modal');
  });
}

async function saveBcMapping(e) {
  e.preventDefault();
  const id = document.getElementById('bc-mapping-form-id').value;
  const pb_mapping_id = document.getElementById('bc-mapping-pb').value;
  const regulation_id = document.getElementById('bc-mapping-regulation').value;
  const course_id = document.getElementById('bc-mapping-course').value;
  const status = document.getElementById('bc-mapping-status').value;

  const url = id ? `/api/bc-mappings/${id}` : '/api/bc-mappings';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pb_mapping_id, regulation_id, course_id, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Mapping updated' : 'Mapping added', 'success');
      closeModal('bc-mapping-modal');
      loadBcMappings();
    } else {
      showToast(data.error || 'Failed to save mapping', 'danger');
    }
  } catch (err) {
    showToast('Error saving mapping', 'danger');
  }
}

async function deleteBcMapping(id) {
  if (!confirm('Are you sure you want to delete this mapping?')) return;
  try {
    const res = await fetch(`/api/bc-mappings/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Mapping deleted', 'success');
      loadBcMappings();
    }
  } catch (err) {
    showToast('Failed to delete mapping', 'danger');
  }
}

// ----------------------------------------------------
// 8. ADMIN FACULTIES setup
// ----------------------------------------------------
async function loadFaculties() {
  try {
    const res = await fetch('/api/faculties');
    const faculties = await res.json();
    const tbody = document.getElementById('faculties-table-body');
    tbody.innerHTML = '';

    faculties.forEach(f => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${f.emp_id}</strong></td>
          <td>${f.honorific} ${f.name}</td>
          <td><span style="font-size:12px; font-weight: 600; color: ${f.user_type === 'Admin' ? 'var(--accent)' : 'var(--primary)'}">${f.user_type}</span></td>
          <td>${f.branch_name || '<em class="profile-role">All Branches</em>'}</td>
          <td>${f.email}</td>
          <td>${f.phone || '-'}</td>
          <td><span class="status-badge ${f.status}">${f.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editFaculty(${f.id})" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteFaculty(${f.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load faculty directory', 'danger');
  }
}

async function populateFacultyDropdowns() {
  try {
    const branchRes = await fetch('/api/branches');
    const branches = (await branchRes.json()).filter(b => b.status === 'active');
    
    const branchSelect = document.getElementById('faculty-branch');
    branchSelect.innerHTML = '<option value="">Choose Branch (N/A for Admin)</option>';
    branches.forEach(b => branchSelect.innerHTML += `<option value="${b.id}">${b.name} (${b.code})</option>`);
  } catch (err) {
    showToast('Failed to load branches lists', 'danger');
  }
}

function toggleFacultyBranchField(val) {
  const branchGroup = document.getElementById('faculty-branch-group');
  const branchSelect = document.getElementById('faculty-branch');
  if (val === 'Admin') {
    branchGroup.style.display = 'none';
    branchSelect.removeAttribute('required');
    branchSelect.value = '';
  } else {
    branchGroup.style.display = 'block';
    branchSelect.setAttribute('required', 'required');
  }
}

function openFacultyModal() {
  document.getElementById('faculty-modal-title').textContent = 'Add Faculty';
  document.getElementById('faculty-form-id').value = '';
  document.getElementById('faculty-form').reset();
  toggleFacultyBranchField('Faculty');
  populateFacultyDropdowns().then(() => openModal('faculty-modal'));
}

async function editFaculty(id) {
  document.getElementById('faculty-modal-title').textContent = 'Edit Faculty';
  document.getElementById('faculty-form-id').value = id;

  try {
    await populateFacultyDropdowns();
    const res = await fetch('/api/faculties');
    const faculties = await res.json();
    const f = faculties.find(item => item.id === id);

    if (f) {
      document.getElementById('faculty-usertype').value = f.user_type;
      toggleFacultyBranchField(f.user_type);
      document.getElementById('faculty-branch').value = f.branch_id || '';
      document.getElementById('faculty-honorific').value = f.honorific;
      document.getElementById('faculty-name').value = f.name;
      document.getElementById('faculty-empid').value = f.emp_id;
      document.getElementById('faculty-phone').value = f.phone;
      document.getElementById('faculty-email').value = f.email;
      document.getElementById('faculty-status').value = f.status;
      openModal('faculty-modal');
    }
  } catch (err) {
    showToast('Failed to load faculty information', 'danger');
  }
}

async function saveFaculty(e) {
  e.preventDefault();
  const id = document.getElementById('faculty-form-id').value;
  const user_type = document.getElementById('faculty-usertype').value;
  const branch_id = document.getElementById('faculty-branch').value;
  const honorific = document.getElementById('faculty-honorific').value;
  const name = document.getElementById('faculty-name').value;
  const emp_id = document.getElementById('faculty-empid').value;
  const phone = document.getElementById('faculty-phone').value;
  const email = document.getElementById('faculty-email').value;
  const status = document.getElementById('faculty-status').value;

  const url = id ? `/api/faculties/${id}` : '/api/faculties';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_type, branch_id, honorific, name, emp_id, phone, email, status })
    });
    const data = await res.json();
    if (res.ok) {
      closeModal('faculty-modal');
      loadFaculties();
      if (data.generatedPassword) {
        // Show modal or alert containing generated password
        alert(`Faculty Account Created!\nEmail: ${email}\nGenerated Password: ${data.generatedPassword}\n\nPlease share this password with the faculty member.`);
      } else {
        showToast('Faculty updated successfully');
      }
    } else {
      showToast(data.error || 'Failed to save faculty details', 'danger');
    }
  } catch (err) {
    showToast('Error saving faculty member', 'danger');
  }
}

async function deleteFaculty(id) {
  if (!confirm('Are you sure you want to delete this faculty member? All their allocated mappings will be removed.')) return;
  try {
    const res = await fetch(`/api/faculties/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Faculty deleted', 'success');
      loadFaculties();
    }
  } catch (err) {
    showToast('Failed to delete faculty', 'danger');
  }
}

// Bulk upload faculty
function openBulkFacultyModal() {
  document.getElementById('bulk-faculty-file').value = '';
  const log = document.getElementById('bulk-faculty-log');
  log.style.display = 'none';
  log.innerHTML = '';
  openModal('bulk-faculty-modal');
}

async function uploadBulkFaculty() {
  const fileInput = document.getElementById('bulk-faculty-file');
  if (fileInput.files.length === 0) {
    showToast('Please select a CSV file first', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch('/api/faculties/bulk-upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    
    if (res.ok && data.success) {
      showToast(`Bulk upload finished! Mapped ${data.created.length} accounts.`, 'success');
      loadFaculties();
      
      const log = document.getElementById('bulk-faculty-log');
      log.style.display = 'block';
      log.innerHTML = '';

      if (data.created.length > 0) {
        log.innerHTML += `<div class="log-success"><strong>Successfully Created Accounts:</strong></div>`;
        data.created.forEach(u => {
          log.innerHTML += `<div class="log-success">EMP: ${u.empId} | Name: ${u.name} | Pass: <span style="background:#fff; color:#000; padding:1px 4px; font-weight:bold;">${u.password}</span></div>`;
        });
      }

      if (data.errors.length > 0) {
        log.innerHTML += `<div class="log-error" style="margin-top:10px;"><strong>Errors:</strong></div>`;
        data.errors.forEach(err => {
          log.innerHTML += `<div class="log-error">${err}</div>`;
        });
      }
    } else {
      showToast(data.error || 'Bulk upload failed', 'danger');
    }
  } catch (err) {
    showToast('Error uploading bulk CSV file', 'danger');
  }
}

// ----------------------------------------------------
// 9. FACULTY - COURSE MAPPINGS CRUD
// ----------------------------------------------------
async function loadFacultyCourses() {
  try {
    const res = await fetch('/api/faculty-course-mappings');
    const mappings = await res.json();
    const tbody = document.getElementById('faculty-courses-table-body');
    tbody.innerHTML = '';

    mappings.forEach(m => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${m.faculty_name}</strong></td>
          <td><code style="font-size:12px;">${m.faculty_emp_id}</code></td>
          <td>${m.course_name} (<code style="font-size:11px;">${m.course_code}</code>)</td>
          <td>${m.course_type}</td>
          <td>Year ${m.year} - Sem ${m.semester}</td>
          <td><span style="background-color: var(--primary-light); color: var(--primary); padding: 4px 8px; border-radius: 4px; font-size:12px; font-weight:600;">${m.academic_year}</span></td>
          <td><span style="font-size:11px; padding: 2px 6px; background-color: var(--bg-main); border-radius: 4px;">${m.elective_type}</span></td>
          <td><span class="status-badge ${m.status}">${m.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editFacultyCourseMapping(${m.id}, ${m.faculty_id}, ${m.course_id}, '${m.status}')" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteFacultyCourseMapping(${m.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load faculty course allocations', 'danger');
  }
}

async function populateFacultyCourseDropdowns() {
  try {
    const facultyRes = await fetch('/api/faculties');
    const courseRes = await fetch('/api/courses');

    const faculties = (await facultyRes.json()).filter(f => f.status === 'active' && f.user_type === 'Faculty');
    const courses = (await courseRes.json()).filter(c => c.status === 'active');

    const facultySelect = document.getElementById('fc-mapping-faculty');
    const courseSelect = document.getElementById('fc-mapping-course');

    facultySelect.innerHTML = '';
    courseSelect.innerHTML = '';

    faculties.forEach(f => facultySelect.innerHTML += `<option value="${f.id}">${f.honorific} ${f.name} (${f.emp_id})</option>`);
    courses.forEach(c => courseSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.code})</option>`);
  } catch (err) {
    showToast('Failed to populate mapping selections', 'danger');
  }
}

function openFacultyCourseModal() {
  document.getElementById('faculty-course-modal-title').textContent = 'Map Faculty to Course';
  document.getElementById('faculty-course-form-id').value = '';
  document.getElementById('faculty-course-form').reset();
  populateFacultyCourseDropdowns().then(() => openModal('faculty-course-modal'));
}

function editFacultyCourseMapping(id, facultyId, courseId, status) {
  document.getElementById('faculty-course-modal-title').textContent = 'Edit Faculty Course Mapping';
  document.getElementById('faculty-course-form-id').value = id;
  populateFacultyCourseDropdowns().then(() => {
    document.getElementById('fc-mapping-faculty').value = facultyId;
    document.getElementById('fc-mapping-course').value = courseId;
    document.getElementById('fc-mapping-status').value = status;
    openModal('faculty-course-modal');
  });
}

async function saveFacultyCourseMapping(e) {
  e.preventDefault();
  const id = document.getElementById('faculty-course-form-id').value;
  const faculty_id = document.getElementById('fc-mapping-faculty').value;
  const course_id = document.getElementById('fc-mapping-course').value;
  const status = document.getElementById('fc-mapping-status').value;

  const url = id ? `/api/faculty-course-mappings/${id}` : '/api/faculty-course-mappings';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faculty_id, course_id, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Mapping updated' : 'Mapping added. Academic Year auto-assigned.', 'success');
      closeModal('faculty-course-modal');
      loadFacultyCourses();
    } else {
      showToast(data.error || 'Failed to save allocation', 'danger');
    }
  } catch (err) {
    showToast('Error saving faculty mapping', 'danger');
  }
}

async function deleteFacultyCourseMapping(id) {
  if (!confirm('Are you sure you want to remove this course allocation?')) return;
  try {
    const res = await fetch(`/api/faculty-course-mappings/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Course allocation removed', 'success');
      loadFacultyCourses();
    }
  } catch (err) {
    showToast('Failed to remove course allocation', 'danger');
  }
}

// ----------------------------------------------------
// 10. ADMIN PLUGINS (BLOOMS, DIFFICULTY, UNITS)
// ----------------------------------------------------
function switchPluginTab(tab) {
  document.querySelectorAll('.plugin-section').forEach(sec => sec.style.display = 'none');
  document.getElementById('plugin-tab-blooms').classList.remove('active');
  document.getElementById('plugin-tab-diff').classList.remove('active');
  document.getElementById('plugin-tab-units').classList.remove('active');

  document.getElementById(`plugin-sec-${tab}`).style.display = 'block';
  document.getElementById(`plugin-tab-${tab}`).classList.add('active');

  if (tab === 'blooms') loadBlooms();
  else if (tab === 'diff') loadDifficulties();
  else if (tab === 'units') loadUnits();
}

// Blooms Levels CRUD
async function loadBlooms() {
  try {
    const res = await fetch('/api/blooms');
    const data = await res.json();
    const tbody = document.getElementById('blooms-table-body');
    tbody.innerHTML = '';
    data.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td>${item.id}</td>
          <td><strong>${item.name}</strong></td>
          <td><span class="status-badge ${item.status}">${item.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editBloom(${item.id}, '${item.name}', '${item.status}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
              <button class="icon-btn delete" onclick="deleteBloom(${item.id})"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {}
}

function openBloomModal() {
  document.getElementById('bloom-modal-title').textContent = 'Add Bloom\'s Level';
  document.getElementById('bloom-form-id').value = '';
  document.getElementById('bloom-form').reset();
  openModal('bloom-modal');
}
function editBloom(id, name, status) {
  document.getElementById('bloom-modal-title').textContent = 'Edit Bloom\'s Level';
  document.getElementById('bloom-form-id').value = id;
  document.getElementById('bloom-name').value = name;
  document.getElementById('bloom-status').value = status;
  openModal('bloom-modal');
}
async function saveBloom(e) {
  e.preventDefault();
  const id = document.getElementById('bloom-form-id').value;
  const name = document.getElementById('bloom-name').value;
  const status = document.getElementById('bloom-status').value;
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/blooms/${id}` : '/api/blooms';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, status })
  });
  if (res.ok) {
    closeModal('bloom-modal');
    loadBlooms();
    showToast('Bloom\'s level saved');
  }
}
async function deleteBloom(id) {
  if (confirm('Delete this Bloom\'s Level?')) {
    await fetch(`/api/blooms/${id}`, { method: 'DELETE' });
    loadBlooms();
  }
}

// Difficulties CRUD
async function loadDifficulties() {
  try {
    const res = await fetch('/api/difficulties');
    const data = await res.json();
    const tbody = document.getElementById('diffs-table-body');
    tbody.innerHTML = '';
    data.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td>${item.id}</td>
          <td><strong>${item.name}</strong></td>
          <td><span class="status-badge ${item.status}">${item.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editDifficulty(${item.id}, '${item.name}', '${item.status}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
              <button class="icon-btn delete" onclick="deleteDifficulty(${item.id})"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {}
}
function openDifficultyModal() {
  document.getElementById('difficulty-modal-title').textContent = 'Add Difficulty Level';
  document.getElementById('difficulty-form-id').value = '';
  document.getElementById('difficulty-form').reset();
  openModal('difficulty-modal');
}
function editDifficulty(id, name, status) {
  document.getElementById('difficulty-modal-title').textContent = 'Edit Difficulty Level';
  document.getElementById('difficulty-form-id').value = id;
  document.getElementById('difficulty-name').value = name;
  document.getElementById('difficulty-status').value = status;
  openModal('difficulty-modal');
}
async function saveDifficulty(e) {
  e.preventDefault();
  const id = document.getElementById('difficulty-form-id').value;
  const name = document.getElementById('difficulty-name').value;
  const status = document.getElementById('difficulty-status').value;
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/difficulties/${id}` : '/api/difficulties';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, status })
  });
  if (res.ok) {
    closeModal('difficulty-modal');
    loadDifficulties();
    showToast('Difficulty level saved');
  }
}
async function deleteDifficulty(id) {
  if (confirm('Delete this Difficulty Level?')) {
    await fetch(`/api/difficulties/${id}`, { method: 'DELETE' });
    loadDifficulties();
  }
}

// Units CRUD
async function loadUnits() {
  try {
    const res = await fetch('/api/units');
    const data = await res.json();
    const tbody = document.getElementById('units-table-body');
    tbody.innerHTML = '';
    data.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td>${item.id}</td>
          <td><strong>${item.name}</strong></td>
          <td><span class="status-badge ${item.status}">${item.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editUnit(${item.id}, '${item.name}', '${item.status}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
              <button class="icon-btn delete" onclick="deleteUnit(${item.id})"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {}
}
function openUnitModal() {
  document.getElementById('unit-modal-title').textContent = 'Add Unit';
  document.getElementById('unit-form-id').value = '';
  document.getElementById('unit-form').reset();
  openModal('unit-modal');
}
function editUnit(id, name, status) {
  document.getElementById('unit-modal-title').textContent = 'Edit Unit';
  document.getElementById('unit-form-id').value = id;
  document.getElementById('unit-name').value = name;
  document.getElementById('unit-status').value = status;
  openModal('unit-modal');
}
async function saveUnit(e) {
  e.preventDefault();
  const id = document.getElementById('unit-form-id').value;
  const name = document.getElementById('unit-name').value;
  const status = document.getElementById('unit-status').value;
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/units/${id}` : '/api/units';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, status })
  });
  if (res.ok) {
    closeModal('unit-modal');
    loadUnits();
    showToast('Unit saved');
  }
}
async function deleteUnit(id) {
  if (confirm('Delete this Unit?')) {
    await fetch(`/api/units/${id}`, { method: 'DELETE' });
    loadUnits();
  }
}

// ----------------------------------------------------
// 11. QUESTION PAPER GENERATOR WIZARD
// ----------------------------------------------------
async function initQpWizard() {
  goToQpStep(1);
  
  // Populate Programs select
  try {
    const res = await fetch('/api/programs');
    const progs = (await res.json()).filter(p => p.status === 'active');
    const select = document.getElementById('qp-program');
    
    select.innerHTML = '<option value="">Select Program</option>';
    progs.forEach(p => select.innerHTML += `<option value="${p.id}">${p.name}</option>`);

    // Reset details
    document.getElementById('qp-course').innerHTML = '<option value="">Select Course</option>';
    resetQpCourseMeta();
  } catch (err) {}
}

function goToQpStep(step) {
  document.getElementById('qp-step-filters').classList.toggle('active', step === 1);
  document.getElementById('qp-step-builder').classList.toggle('active', step === 2);
}

async function loadQpCourses(programId) {
  if (!programId) {
    document.getElementById('qp-course').innerHTML = '<option value="">Select Course</option>';
    resetQpCourseMeta();
    return;
  }

  try {
    const res = await fetch(`/api/qp/courses-by-program/${programId}`);
    const courses = await res.json();
    
    const select = document.getElementById('qp-course');
    select.innerHTML = '<option value="">Select Course</option>';
    courses.forEach(c => select.innerHTML += `<option value="${c.id}">${c.name} (${c.code})</option>`);

    resetQpCourseMeta();
  } catch (err) {
    showToast('Failed to load courses for this program', 'danger');
  }
}

async function handleQpCourseSelection(courseId) {
  if (!courseId) {
    resetQpCourseMeta();
    return;
  }

  try {
    // Fetch courses list to get meta
    const res = await fetch('/api/courses');
    const courses = await res.json();
    const c = courses.find(item => item.id === parseInt(courseId));
    
    if (c) {
      document.getElementById('qp-regulation').value = c.regulation_name;
      document.getElementById('qp-year').value = c.year;
      document.getElementById('qp-semester').value = c.semester;
      
      // Auto academic year (June 2025 - May 2026 => 2025-2026)
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const academicYear = month >= 5 ? `${year}-${year+1}` : `${year-1}-${year}`;
      document.getElementById('qp-ac-year').value = academicYear;
    }
  } catch (err) {}
}

function resetQpCourseMeta() {
  document.getElementById('qp-regulation').value = '';
  document.getElementById('qp-year').value = '';
  document.getElementById('qp-semester').value = '';
  document.getElementById('qp-ac-year').value = '';
}

async function handleQpFilterSubmit(e) {
  e.preventDefault();
  const courseId = document.getElementById('qp-course').value;
  if (!courseId) return;

  try {
    // Fetch active filters (COs, Blooms, Difficulties, Units) for blueprint
    const res = await fetch(`/api/qp/active-filters/${courseId}`);
    qpFilters = await res.json();

    if (qpFilters.cos.length === 0) {
      showToast('This course has no defined outcomes (COs). Mapped faculty must create COs first.', 'warning');
      return;
    }

    // Reset Builder Panel
    document.getElementById('qp-criteria-list-container').innerHTML = '';
    document.getElementById('qp-preview-empty').style.display = 'block';
    document.getElementById('qp-preview-document').style.display = 'none';
    generatedQpPaper = null;

    // Add first blueprint row by default
    addQpCriteriaRow();

    goToQpStep(2);
  } catch (err) {
    showToast('Failed to load blueprints configuration', 'danger');
  }
}

function addQpCriteriaRow() {
  if (!qpFilters) return;

  const container = document.getElementById('qp-criteria-list-container');
  const index = container.children.length + 1;

  const row = document.createElement('div');
  row.className = 'criteria-item-card';
  row.id = `qp-crit-row-${index}`;
  
  // CO select options
  let coOptions = '';
  qpFilters.cos.forEach(co => coOptions += `<option value="${co.id}">${co.code}</option>`);

  // Blooms options
  let bloomOptions = '';
  qpFilters.blooms.forEach(b => bloomOptions += `<option value="${b.id}">${b.name}</option>`);

  // Difficulty options
  let diffOptions = '';
  qpFilters.difficulties.forEach(d => diffOptions += `<option value="${d.id}">${d.name}</option>`);

  row.innerHTML = `
    <h5>Question ${index}</h5>
    <button class="criteria-remove-btn" onclick="removeQpCriteriaRow(${index})">&times;</button>
    <div class="criteria-item-fields">
      <div class="form-group">
        <label>CO Outcome</label>
        <select class="form-control qp-input-co" required>${coOptions}</select>
      </div>
      <div class="form-group">
        <label>Bloom's Level</label>
        <select class="form-control qp-input-bloom" required>${bloomOptions}</select>
      </div>
    </div>
    <div class="criteria-item-fields">
      <div class="form-group">
        <label>Difficulty</label>
        <select class="form-control qp-input-diff" required>${diffOptions}</select>
      </div>
      <div class="form-group">
        <label>Marks</label>
        <input type="number" class="form-control qp-input-marks" min="1" max="50" value="5" required>
      </div>
    </div>
  `;

  container.appendChild(row);
}

function removeQpCriteriaRow(index) {
  const row = document.getElementById(`qp-crit-row-${index}`);
  if (row) {
    row.remove();
    // Reindex remaining rows title
    const container = document.getElementById('qp-criteria-list-container');
    Array.from(container.children).forEach((child, i) => {
      child.id = `qp-crit-row-${i + 1}`;
      child.querySelector('h5').textContent = `Question ${i + 1}`;
      child.querySelector('.criteria-remove-btn').setAttribute('onclick', `removeQpCriteriaRow(${i + 1})`);
    });
  }
}

async function generateQpQuestions() {
  const courseId = document.getElementById('qp-course').value;
  const container = document.getElementById('qp-criteria-list-container');
  
  if (container.children.length === 0) {
    showToast('Add at least one blueprint criteria row', 'warning');
    return;
  }

  // Parse criteria array
  const criteria = [];
  let valid = true;
  
  Array.from(container.children).forEach(row => {
    const coId = row.querySelector('.qp-input-co').value;
    const bloomId = row.querySelector('.qp-input-bloom').value;
    const difficultyId = row.querySelector('.qp-input-diff').value;
    const marks = parseInt(row.querySelector('.qp-input-marks').value);

    if (!coId || !bloomId || !difficultyId || isNaN(marks) || marks <= 0) {
      valid = false;
    } else {
      criteria.push({ coId, bloomId, difficultyId, marks });
    }
  });

  if (!valid) {
    showToast('Please check all blueprint fields', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/qp/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, criteria })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showToast('Question Paper generated successfully!', 'success');
      
      // Store paper details in global variable
      generatedQpPaper = {
        programId: document.getElementById('qp-program').value,
        courseId: courseId,
        assessmentType: document.getElementById('qp-assessment').value,
        dateOfExam: document.getElementById('qp-date').value,
        regulationId: null, // calculated in backend
        year: document.getElementById('qp-year').value,
        semester: document.getElementById('qp-semester').value,
        academicYear: document.getElementById('qp-ac-year').value,
        structureJson: criteria,
        questionsJson: data.questions
      };

      // Get Regulation name and details for display
      const regInput = document.getElementById('qp-regulation').value;
      const progText = document.getElementById('qp-program').options[document.getElementById('qp-program').selectedIndex].text;
      const courseText = document.getElementById('qp-course').options[document.getElementById('qp-course').selectedIndex].text;
      const courseCode = courseText.split('(')[1] ? courseText.split('(')[1].replace(')', '') : '';
      const courseNameOnly = courseText.split('(')[0].trim();

      renderQpDocument('qp-print-area', {
        program_name: progText,
        course_name: courseNameOnly,
        course_code: courseCode,
        assessment_type: generatedQpPaper.assessmentType,
        date_of_exam: formatDate(generatedQpPaper.dateOfExam),
        regulation_name: regInput,
        year: generatedQpPaper.year,
        semester: generatedQpPaper.semester,
        academic_year: generatedQpPaper.academicYear,
        questions_json: data.questions
      });

      document.getElementById('qp-preview-empty').style.display = 'none';
      document.getElementById('qp-preview-document').style.display = 'block';
    } else {
      // Show unsatisfying criteria row index
      const indices = data.unsatisfied.map(u => u.index).join(', ');
      alert(`Auto-generation failed: No active questions matching criteria for Question(s): [${indices}] in the repository. Please add matching questions in the Faculty portal first.`);
    }
  } catch (err) {
    showToast('Failed to contact generator engine', 'danger');
  }
}

function renderQpDocument(targetId, qp) {
  const target = document.getElementById(targetId);
  
  // Calculate total marks
  let totalMarks = 0;
  qp.questions_json.forEach(item => totalMarks += item.question.marks);

  let questionsHtml = '';
  qp.questions_json.forEach((item, idx) => {
    const q = item.question;
    const imgHtml = q.image_path ? `<img src="${q.image_path}" class="qp-question-image">` : '';
    
    questionsHtml += `
      <li class="qp-question-row">
        <span class="qp-question-num">Q${idx + 1}.</span>
        <div class="qp-question-text">
          <div>${q.text}</div>
          ${imgHtml}
          <div class="qp-question-tags">[Outcome: ${q.co_code} | Bloom: ${q.blooms_name} | Unit: ${q.unit_name} | Diff: ${q.difficulty_name}]</div>
        </div>
        <span class="qp-question-marks">[${q.marks} Marks]</span>
      </li>
    `;
  });

  target.innerHTML = `
    <div class="qp-paper">
      <div class="qp-paper-header">
        <h1>WEBSAGA ACADEMIC INSTITUTION</h1>
        <h2>${qp.assessment_type} EXAMINATION (${qp.academic_year})</h2>
        <h2 style="font-weight: normal; margin-top: 6px;">Course outcome-based evaluation paper</h2>
      </div>
      
      <table class="qp-paper-meta-table">
        <tr>
          <td style="width:15%">Program:</td>
          <td style="width:35%">${qp.program_name}</td>
          <td style="width:15%">Date of Exam:</td>
          <td style="width:35%">${qp.date_of_exam}</td>
        </tr>
        <tr>
          <td>Course Code:</td>
          <td>${qp.course_code || '-'}</td>
          <td>Course Name:</td>
          <td>${qp.course_name}</td>
        </tr>
        <tr>
          <td>Year/Sem:</td>
          <td>Year ${qp.year} - Sem ${qp.semester}</td>
          <td>Regulation:</td>
          <td>${qp.regulation_name}</td>
        </tr>
        <tr>
          <td>Total Marks:</td>
          <td>${totalMarks} Marks</td>
          <td>Time Duration:</td>
          <td>${qp.assessment_type.includes('MID') ? '1.5 Hours' : '3.0 Hours'}</td>
        </tr>
      </table>

      <div class="qp-section-title">ALL QUESTIONS ARE COMPULSORY</div>
      
      <ul class="qp-questions-list">
        ${questionsHtml}
      </ul>
    </div>
  `;
}

async function saveQp() {
  if (!generatedQpPaper) return;

  try {
    // We need to resolve regulation ID
    const regName = document.getElementById('qp-regulation').value;
    const regRes = await fetch('/api/regulations');
    const regs = await regRes.json();
    const regulation = regs.find(r => r.name === regName);
    
    if (!regulation) {
      showToast('Error mapping regulation', 'danger');
      return;
    }
    
    generatedQpPaper.regulationId = regulation.id;

    const res = await fetch('/api/qp/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(generatedQpPaper)
    });
    
    if (res.ok) {
      showToast('Question Paper saved into system archive!', 'success');
      // Go to QP History
      switchView('admin-qp-history');
    }
  } catch (err) {
    showToast('Failed to save paper', 'danger');
  }
}

function printQp() {
  window.print();
}

// ----------------------------------------------------
// 12. ADMIN QP HISTORY
// ----------------------------------------------------
async function loadQpHistory() {
  try {
    const res = await fetch('/api/qp/history');
    const qps = await res.json();
    const tbody = document.getElementById('qp-history-table-body');
    tbody.innerHTML = '';

    qps.forEach(qp => {
      tbody.innerHTML += `
        <tr>
          <td>${formatDate(qp.saved_at)}</td>
          <td><strong>${qp.program_name}</strong></td>
          <td>${qp.course_name} (<code style="font-size:11px;">${qp.course_code}</code>)</td>
          <td><span style="font-weight:600; color:var(--primary);">${qp.assessment_type}</span></td>
          <td>${formatDate(qp.date_of_exam)}</td>
          <td>${qp.regulation_name}</td>
          <td>Year ${qp.year} - Sem ${qp.semester}</td>
          <td>${qp.academic_year}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-outline btn-sm" onclick="viewQpDetails(${qp.id})">View & Print</button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Failed to load past QP archive', 'danger');
  }
}

async function viewQpDetails(id) {
  try {
    const res = await fetch(`/api/qp/${id}`);
    const qp = await res.json();

    renderQpDocument('view-qp-modal-body', qp);
    
    // Bind print button
    document.getElementById('view-qp-modal-print-btn').onclick = () => {
      // Trigger native browser printing of the modal contents
      const paperElement = document.getElementById('view-qp-modal-body').querySelector('.qp-paper');
      const printWin = window.open('', '_blank');
      printWin.document.write(`
        <html>
          <head>
            <title>Question Paper Print</title>
            <style>
              body { font-family: 'Times New Roman', serif; background: #fff; padding: 20px; }
              .qp-paper { border: none !important; }
              .qp-paper-header { text-align: center; border-bottom: 2px double #000; padding-bottom:12px; margin-bottom: 20px; }
              .qp-paper-header h1 { font-size: 20px; margin-bottom:2px; text-transform: uppercase; }
              .qp-paper-header h2 { font-size: 14px; margin-bottom: 2px; }
              .qp-paper-meta-table { width:100%; border-collapse: collapse; margin-bottom: 20px; }
              .qp-paper-meta-table td { font-size: 12px; padding: 4px 0; border: none; }
              .qp-paper-meta-table td:nth-child(even) { font-weight: bold; }
              .qp-section-title { text-align: center; font-weight: bold; text-transform: uppercase; margin: 15px 0; font-size: 13px; }
              .qp-questions-list { list-style: none; padding: 0; }
              .qp-question-row { display: flex; margin-bottom: 12px; font-size:12px; }
              .qp-question-num { width: 30px; font-weight: bold; }
              .qp-question-text { flex-grow: 1; }
              .qp-question-image { max-width: 140px; display: block; margin: 6px 0; border: 1px solid #ddd; }
              .qp-question-tags { font-size: 10px; color: #555; margin-top: 2px; font-style: italic; }
              .qp-question-marks { width: 70px; text-align: right; font-weight: bold; }
            </style>
          </head>
          <body>
            ${paperElement.outerHTML}
            <script>
              window.onload = function() {
                window.print();
                window.close();
              }
            </script>
          </body>
        </html>
      `);
      printWin.document.close();
    };

    openModal('view-qp-modal');
  } catch (err) {
    showToast('Failed to load question paper details', 'danger');
  }
}

// ----------------------------------------------------
// 13. FACULTY DASHBOARD & MY COURSES
// ----------------------------------------------------
async function loadFacultyDashboard() {
  try {
    const res = await fetch('/api/faculty/dashboard');
    const data = await res.json();

    document.getElementById('fac-stat-courses').textContent = data.stats.totalCourses;
    document.getElementById('fac-stat-questions').textContent = data.stats.totalQuestions;

    // Destroy old chart
    if (charts.facBloomChart) charts.facBloomChart.destroy();

    // Chart: Question distribution by Bloom's level
    const bloomCtx = document.getElementById('faculty-bloom-chart').getContext('2d');
    const bloomLabels = data.charts.bloomQCounts.map(b => b.name);
    const bloomCounts = data.charts.bloomQCounts.map(b => b.count);

    charts.facBloomChart = new Chart(bloomCtx, {
      type: 'bar',
      data: {
        labels: bloomLabels,
        datasets: [{
          label: 'Number of Questions',
          data: bloomCounts,
          backgroundColor: 'hsl(210, 90%, 50%)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  } catch (err) {
    showToast('Failed to load faculty metrics', 'danger');
  }
}

async function loadFacultyCoursesGrid() {
  try {
    const res = await fetch('/api/faculty/dashboard');
    const data = await res.json();
    
    const container = document.getElementById('faculty-courses-grid');
    container.innerHTML = '';

    if (data.courses.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No allocated courses found for this Academic Year.</div>`;
      return;
    }

    data.courses.forEach(c => {
      container.innerHTML += `
        <div class="course-card">
          <div class="course-card-header">
            <span class="course-code-badge">${c.code}</span>
            <h4>${c.name}</h4>
            <div class="course-card-meta">
              <span><strong>Branch:</strong> ${c.branch_name}</span>
              <span><strong>Regulation:</strong> ${c.regulation_name}</span>
              <span><strong>Semester:</strong> Year ${c.year} - Sem ${c.semester}</span>
              <span><strong>Course Type:</strong> ${c.type}</span>
              <span><strong>Elective:</strong> ${c.elective_type}</span>
              <span><strong>Credits:</strong> ${c.credits}</span>
            </div>
          </div>
          <div class="course-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="openFacultyCourseDetails(${c.id}, '${c.code}', '${c.name}', '${c.branch_name}', '${c.regulation_name}', '${c.year}', '${c.semester}')">
              Manage Repository &rarr;
            </button>
          </div>
        </div>
      `;
    });
  } catch (err) {
    showToast('Failed to load course allocations grid', 'danger');
  }
}

// Open Course details sub-module
function openFacultyCourseDetails(courseId, code, name, branchName, regulationName, year, semester) {
  activeCourseId = courseId;
  
  // Set headers
  document.getElementById('course-details-title').textContent = `${code} - ${name}`;
  document.getElementById('course-details-subtitle').textContent = `Branch: ${branchName} | Regulation: ${regulationName} | Year: ${year} | Sem: ${semester}`;

  // Direct switch
  switchView('faculty-course-details');
}

function switchCourseDetailTab(tab) {
  document.querySelectorAll('.course-detail-section').forEach(sec => sec.style.display = 'none');
  document.getElementById('course-detail-tab-cos').classList.remove('active');
  document.getElementById('course-detail-tab-questions').classList.remove('active');

  document.getElementById(`course-detail-sec-${tab}`).style.display = 'block';
  document.getElementById(`course-detail-tab-${tab}`).classList.add('active');

  if (tab === 'cos') loadCourseCos();
  else if (tab === 'questions') loadCourseQuestions();
}

// ----------------------------------------------------
// 14. COURSE OUTCOMES (COs) CRUD
// ----------------------------------------------------
async function loadCourseCos() {
  if (!activeCourseId) return;

  try {
    const res = await fetch(`/api/courses/${activeCourseId}/cos`);
    const cos = await res.json();
    const tbody = document.getElementById('cos-table-body');
    tbody.innerHTML = '';

    cos.forEach(co => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${co.code}</strong></td>
          <td>${co.description}</td>
          <td><span class="status-badge ${co.status}">${co.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editCo(${co.id}, '${co.code}', '${co.description.replace(/'/g, "\\'")}', '${co.status}')" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteCo(${co.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {}
}

function openCoModal() {
  document.getElementById('co-modal-title').textContent = 'Add Course Outcome (CO)';
  document.getElementById('co-form-id').value = '';
  document.getElementById('co-form').reset();
  openModal('co-modal');
}

function editCo(id, code, description, status) {
  document.getElementById('co-modal-title').textContent = 'Edit Course Outcome (CO)';
  document.getElementById('co-form-id').value = id;
  document.getElementById('co-code').value = code;
  document.getElementById('co-desc').value = description;
  document.getElementById('co-status').value = status;
  openModal('co-modal');
}

async function saveCo(e) {
  e.preventDefault();
  const id = document.getElementById('co-form-id').value;
  const code = document.getElementById('co-code').value;
  const description = document.getElementById('co-desc').value;
  const status = document.getElementById('co-status').value;

  const url = id ? `/api/cos/${id}` : `/api/courses/${activeCourseId}/cos`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, description, status })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(id ? 'Outcome updated' : 'Outcome added', 'success');
      closeModal('co-modal');
      loadCourseCos();
    } else {
      showToast(data.error || 'Failed to save outcome', 'danger');
    }
  } catch (err) {
    showToast('Error saving outcome', 'danger');
  }
}

async function deleteCo(id) {
  if (!confirm('Are you sure you want to delete this CO? Associated questions will be deleted.')) return;
  try {
    const res = await fetch(`/api/cos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Outcome deleted', 'success');
      loadCourseCos();
    }
  } catch (err) {
    showToast('Failed to delete outcome', 'danger');
  }
}

// ----------------------------------------------------
// 15. QUESTIONS CRUD
// ----------------------------------------------------
async function loadCourseQuestions() {
  if (!activeCourseId) return;

  try {
    const res = await fetch(`/api/courses/${activeCourseId}/questions`);
    const questions = await res.json();
    const tbody = document.getElementById('questions-table-body');
    tbody.innerHTML = '';

    questions.forEach(q => {
      const imgHtml = q.image_path ? `<a href="${q.image_path}" target="_blank"><img src="${q.image_path}" style="max-height: 40px; border-radius: 4px; border:1px solid var(--border);"></a>` : '<span class="profile-role">None</span>';
      
      tbody.innerHTML += `
        <tr>
          <td><strong>${q.co_code}</strong></td>
          <td>${q.blooms_name}</td>
          <td>${q.difficulty_name}</td>
          <td>${q.unit_name}</td>
          <td>${q.text}</td>
          <td>${imgHtml}</td>
          <td><strong>${q.marks}</strong></td>
          <td><span class="status-badge ${q.status}">${q.status}</span></td>
          <td>
            <div class="actions-cell">
              <button class="icon-btn edit" onclick="editQuestion(${q.id})" title="Edit">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button class="icon-btn delete" onclick="deleteQuestion(${q.id})" title="Delete">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {}
}

async function populateQuestionDropdowns() {
  try {
    const coRes = await fetch(`/api/courses/${activeCourseId}/cos`);
    const bloomRes = await fetch('/api/blooms');
    const diffRes = await fetch('/api/difficulties');
    const unitRes = await fetch('/api/units');

    const cos = (await coRes.json()).filter(c => c.status === 'active');
    const blooms = (await bloomRes.json()).filter(b => b.status === 'active');
    const diffs = (await diffRes.json()).filter(d => d.status === 'active');
    const units = (await unitRes.json()).filter(u => u.status === 'active');

    const coSelect = document.getElementById('q-co');
    const bloomSelect = document.getElementById('q-bloom');
    const diffSelect = document.getElementById('q-diff');
    const unitSelect = document.getElementById('q-unit');

    coSelect.innerHTML = '';
    bloomSelect.innerHTML = '';
    diffSelect.innerHTML = '';
    unitSelect.innerHTML = '';

    cos.forEach(co => coSelect.innerHTML += `<option value="${co.id}">${co.code}</option>`);
    blooms.forEach(b => bloomSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`);
    diffs.forEach(d => diffSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`);
    units.forEach(u => unitSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`);
  } catch (err) {
    showToast('Failed to populate question selector values', 'danger');
  }
}

function openQuestionModal() {
  document.getElementById('question-modal-title').textContent = 'Add Question';
  document.getElementById('question-form-id').value = '';
  document.getElementById('question-form').reset();
  document.getElementById('q-image-edit-notice').style.display = 'none';
  populateQuestionDropdowns().then(() => openModal('question-modal'));
}

async function editQuestion(id) {
  document.getElementById('question-modal-title').textContent = 'Edit Question';
  document.getElementById('question-form-id').value = id;
  document.getElementById('question-form').reset();
  document.getElementById('q-image-edit-notice').style.display = 'block';

  try {
    await populateQuestionDropdowns();
    const res = await fetch(`/api/courses/${activeCourseId}/questions`);
    const questions = await res.json();
    const q = questions.find(item => item.id === id);

    if (q) {
      document.getElementById('q-co').value = q.co_id;
      document.getElementById('q-bloom').value = q.blooms_level_id;
      document.getElementById('q-diff').value = q.difficulty_level_id;
      document.getElementById('q-unit').value = q.unit_id;
      document.getElementById('q-text').value = q.text;
      document.getElementById('q-marks').value = q.marks;
      document.getElementById('q-status').value = q.status;
      // Stash image path in hidden data or body parameter
      document.getElementById('question-form').dataset.imagePath = q.image_path || '';
      openModal('question-modal');
    }
  } catch (err) {
    showToast('Failed to load question details', 'danger');
  }
}

async function saveQuestion(e) {
  e.preventDefault();
  const id = document.getElementById('question-form-id').value;
  
  const formData = new FormData();
  formData.append('co_id', document.getElementById('q-co').value);
  formData.append('blooms_level_id', document.getElementById('q-bloom').value);
  formData.append('difficulty_level_id', document.getElementById('q-diff').value);
  formData.append('unit_id', document.getElementById('q-unit').value);
  formData.append('text', document.getElementById('q-text').value);
  formData.append('marks', document.getElementById('q-marks').value);
  formData.append('status', document.getElementById('q-status').value);

  const fileInput = document.getElementById('q-image');
  if (fileInput.files.length > 0) {
    formData.append('image', fileInput.files[0]);
  } else if (id) {
    // Keep old image
    formData.append('image_path', document.getElementById('question-form').dataset.imagePath || '');
  }

  const url = id ? `/api/questions/${id}` : `/api/courses/${activeCourseId}/questions`;
  
  // Custom fetch with multipart headers
  try {
    const res = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      body: formData
    });
    const data = await res.json();
    
    if (res.ok) {
      showToast(id ? 'Question updated' : 'Question added', 'success');
      closeModal('question-modal');
      loadCourseQuestions();
    } else {
      showToast(data.error || 'Failed to save question', 'danger');
    }
  } catch (err) {
    showToast('Server error during saving question', 'danger');
  }
}

async function deleteQuestion(id) {
  if (!confirm('Are you sure you want to delete this question?')) return;
  try {
    const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Question deleted', 'success');
      loadCourseQuestions();
    }
  } catch (err) {
    showToast('Failed to delete question', 'danger');
  }
}

// Bulk Upload Questions
function openBulkQuestionModal() {
  document.getElementById('bulk-question-file').value = '';
  const log = document.getElementById('bulk-question-log');
  log.style.display = 'none';
  log.innerHTML = '';
  openModal('bulk-question-modal');
}

async function uploadBulkQuestions() {
  const fileInput = document.getElementById('bulk-question-file');
  if (fileInput.files.length === 0) {
    showToast('Please select a CSV file first', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch(`/api/questions/${activeCourseId}/bulk-upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showToast(`Bulk upload finished! Created ${data.createdCount} questions.`, 'success');
      loadCourseQuestions();

      const log = document.getElementById('bulk-question-log');
      log.style.display = 'block';
      log.innerHTML = '';

      if (data.createdCount > 0) {
        log.innerHTML += `<div class="log-success">Successfully uploaded ${data.createdCount} questions into course bank.</div>`;
      }

      if (data.errors.length > 0) {
        log.innerHTML += `<div class="log-error" style="margin-top: 10px;"><strong>Errors:</strong></div>`;
        data.errors.forEach(err => {
          log.innerHTML += `<div class="log-error">${err}</div>`;
        });
      }
    } else {
      showToast(data.error || 'Bulk upload failed', 'danger');
    }
  } catch (err) {
    showToast('Failed to upload questions bulk CSV', 'danger');
  }
}

// ----------------------------------------------------
// 16. CHANGE PASSWORD
// ----------------------------------------------------
async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('pwd-current').value;
  const newPassword = document.getElementById('pwd-new').value;
  const confirmPassword = document.getElementById('pwd-confirm').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    
    if (res.ok) {
      showToast('Password updated successfully!', 'success');
      document.getElementById('change-password-form').reset();
    } else {
      showToast(data.error || 'Failed to update password', 'danger');
    }
  } catch (err) {
    showToast('Server connection error', 'danger');
  }
}

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
