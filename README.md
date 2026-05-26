# WEBSAGA - Academic ERP & Automated Question Paper Generator

**WEBSAGA** is a centralized, secure, responsive, and aesthetically designed web-based academic ERP system. It integrates program administration, course allocation, faculty mapping, course outcome (CO) definition, question repository management, and automated question paper (QP) generation.

---

## 🛠️ Technology Stack

- **Backend**: Node.js & Express
- **Database**: SQLite (`sqlite3`) for relational mappings and local data storage
- **Security**: Passwords hashed with `bcryptjs` and session tracking via `express-session`
- **Frontend**: Vanilla HTML5, modern responsive CSS3 (featuring a bright, educational-friendly theme), and Chart.js for data visualizations
- **Exporting**: Browser print styling (`@media print` in Times New Roman) and client-side PDF export support

---

## 📂 Project Structure

```text
├── database.js          # SQLite schema definition and seeding configuration
├── server.js            # Express server and REST API implementation
├── verify.js            # Database and seeding validation script
├── package.json         # Project dependency configuration
├── websaga.db           # SQLite database file (created on first run)
└── public/              # Frontend static directory
    ├── index.html       # Single page dashboard shell and modal definitions
    ├── styles.css       # Clean educational styling layout
    ├── app.js           # Client-side SPA router and controller logic
    └── uploads/         # Destination directory for uploaded question images
```

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).

### 1. Install Dependencies
Run the following command in the project root folder to install required packages:
```bash
npm install
```

### 2. Verify Database Schema (Optional)
Run the verification script to compile database tables and check standard seed data:
```bash
node verify.js
```

### 3. Start the Server
Launch the local web server:
```bash
npm start
```
The application will boot up and be accessible at: **[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Default Login Credentials

Standard seeds are pre-populated upon initial database startup:

### 1. System Administrator
- **Email**: `admin@websaga.com`
- **Password**: `admin123`

### 2. Seeded Course Data
- **Course**: `CS2101` (Python Programming)
- **Branch**: `CSE` (Code: 05) under `B.Tech` program
- **Regulation**: `AR23`
- **Questions Bank**: Pre-loaded with 4 active sample questions matching units, Bloom's levels, and outcomes (CO1/CO2) ready for test generation.

---

## 🔍 How to Inspect the SQLite Database

All application data is stored in the local file `websaga.db`. You can view, search, and edit database records using any of the following methods:

### Method 1: SQLite Viewer Extensions (VS Code)
If you are using Visual Studio Code, this is the easiest visual method:
1. Open the Extensions sidebar in VS Code (`Ctrl+Shift+X`).
2. Search for **SQLite Viewer** (by Florian Klampfer) and click **Install**.
3. Open your file explorer and click directly on **`websaga.db`** in the root workspace.
4. VS Code will open an interactive table inspector allowing you to browse all tables (e.g. `faculties`, `courses`, `questions`) and run SQL queries.

### Method 2: DB Browser for SQLite (Desktop GUI)
For a powerful standalone interface, download DB Browser for SQLite (free and open-source):
1. Download it from the [official website](https://sqlitebrowser.org/) and install it.
2. Open DB Browser, click **Open Database**, and locate your **`websaga.db`** file.
3. Click the **Database Structure** tab to see table columns and indexes.
4. Click the **Browse Data** tab to view rows inside any table.
5. Go to **Execute SQL** tab to run custom scripts, e.g.:
   ```sql
   SELECT * FROM faculties WHERE user_type = 'Faculty';
   ```

### Method 3: sqlite3 Command Line Tool (CLI)
If you prefer checking via the terminal, use the native SQLite utility:
1. Open your terminal in the project directory and run:
   ```bash
   sqlite3 websaga.db
   ```
2. Once the SQLite prompt opens (`sqlite>`), run these command utilities:
   - To list all tables:
     ```text
     .tables
     ```
   - To show a table's creation schema:
     ```text
     .schema faculties
     ```
   - To show rows cleanly formatted in columns:
     ```text
     .headers on
     .mode column
     SELECT id, name, email, user_type FROM faculties;
     ```
   - To exit the utility:
     ```text
     .exit
     ```
