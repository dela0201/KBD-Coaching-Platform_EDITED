# KBD Coaching Platform

A role-based coaching management platform for managing programmes, participants, coaching sessions, actions, assessments, learning materials, progress and reports.

## Technology

- Node.js
- Express
- SQLite
- HTML
- CSS
- JavaScript
- Express Session
- bcrypt
- Helmet

## Project Structure

```text
kbd-coaching-platform/
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── initDatabase.js
│   ├── seedDatabase.js
│   ├── checkDatabase.js
│   ├── createInitialCoach.js
│   ├── createTestAccounts.js
│   ├── migrateCorporateOrganisation.js
│   ├── backupDatabase.js
│   ├── package.json
│   ├── .env
│   └── .env.example
│
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   └── kbd.db
│
└── frontend/
    ├── index.html
    ├── css/
    │   └── style.css
    ├── images/
    │   └── kbd-logo.png
    ├── js/
    └── pages/
```

## Requirements

Install Node.js 20 or later.

Confirm the installation:

```bash
node --version
npm --version
```

## Installation

Open a terminal in the backend folder:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Windows Command Prompt:

```cmd
copy .env.example .env
```

Configure `.env`:

```env
NODE_ENV=development
PORT=5000
SESSION_SECRET=replace-with-a-long-random-secret
KBD_INITIAL_PASSWORD=replace-with-a-secure-password
KBD_TEST_PASSWORD=replace-with-a-test-password
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

For local Admin sign-in, set `KBD_ADMIN_FIRST_NAME`, `KBD_ADMIN_LAST_NAME`,
`KBD_ADMIN_EMAIL` and `KBD_ADMIN_PASSWORD` in `.env`. Use a password of at
least 12 characters. `npm start` creates the database and the configured
Admin account on first start. Demonstration data and development accounts
are optional. Open the app at `http://localhost:5000`, accept the Terms and
choose the Coach access option to sign in with the Admin credentials.

Never commit `.env` or share its secrets.

## New Database Setup

Create the database tables:

```bash
npm run init-db
```

Insert the demonstration data only once:

```bash
npm run seed-db
```

Apply the Corporate organisation migration:

```bash
npm run migrate:corporate
```

Create or update the initial Coach account:

```bash
npm run create-coach
```

Create development test accounts:

```bash
npm run create-test-accounts
```

Verify the database:

```bash
npm run check-db
```

Do not rerun the seed command on an existing populated database.

## Start the Platform

Start normally:

```bash
npm start
```

Start in development watch mode:

```bash
npm run dev
```

Open:

```text
http://localhost:5000
```

Do not open the frontend through VS Code Live Server. The frontend and API must use the Express server on port 5000.

## Test Accounts

The initial Coach account uses:

```text
Email: dela@kbd.test
Password: KBD_INITIAL_PASSWORD from .env
```

Development test accounts use `KBD_TEST_PASSWORD`:

```text
Admin:       admin@kbd.test
Participant: john@kbd.test
Corporate:   lisa@company.test
```

Do not include test accounts in a production database.

## Roles

### Admin

Has full platform management access.

### Coach

Can manage participants, programmes, sessions, notes, actions, assessments, materials and reports.

### Participant

Can access permitted personal programme, session, action, assessment and learning information.

### Corporate

Can view information and reports belonging to its linked organisation.

## Useful Commands

Check server syntax:

```bash
npm run check-server
```

Check database integrity:

```bash
npm run check-db
```

Create a database backup:

```bash
npm run backup-db
```

Create or reset the initial Coach:

```bash
npm run create-coach
```

Prepare development test accounts:

```bash
npm run create-test-accounts
```

## Database Backups

Backups are created in:

```text
database/backups/
```

Create a backup before:

- Database migrations
- Major application changes
- Deployment
- Importing new data
- Replacing the database

Keep at least one backup outside the project folder.

## Security

The platform includes:

- bcrypt password hashing
- Session-based authentication
- SQLite-backed persistent sessions
- Role-based API authorization
- Login rate limiting
- Secure HTTP headers
- HTTP-only session cookies
- Request validation
- Parameterised SQL queries
- Content Security Policy
- Protected environment variables

For production, use HTTPS and set:

```env
NODE_ENV=production
```

## Troubleshooting

### Login request cannot be completed

Confirm that the platform was opened using:

```text
http://localhost:5000/pages/login.html
```

Do not use port 5500 or a `file:///` address.

### Incorrect email or password

Run:

```bash
npm run create-coach
```

Then use the password stored in `KBD_INITIAL_PASSWORD`.

### Database column missing

Run:

```bash
npm run migrate:corporate
```

Then:

```bash
npm run check-db
```

### Port 5000 already in use

Stop the other process using port 5000 or change `PORT` in `.env`.

### Session disappears

Confirm that this file is created after login:

```text
database/kbd-sessions.db
```

### Frontend data does not load

Check:

1. The backend terminal for errors.
2. The browser Console.
3. The browser Network tab.
4. The response status and JSON error message.

## Demonstration Flow

1. Sign in as Coach.
2. View the dashboard.
3. Create a participant.
4. Create a programme.
5. Assign the participant.
6. Schedule a coaching session.
7. Add a session note.
8. Create an action.
9. Update progress.
10. View the reports.
11. Update account settings.
12. Log out.

## License

This project is intended for the KBD Coaching Platform demonstration and internal development.

## Integrated Coach workspace

Coach accounts open `/coach/index.html` after signing in. Admin accounts
open `/pages/dashboard.html`. Use the Coach sign-in option for both roles.

The Coach workspace uses the existing KBD SQLite database. `server.js`
loads `coachWorkspace.js`, which creates the additional tables for metrics,
messages and workspace details on startup. Existing records remain
available through the appropriate programme assignments. New Coach
participants receive the password entered in the creation form.

Standalone Coach demo records in browser session storage require manual
re-entry. The integrated workspace stores records through authenticated
API requests. Programme archiving is managed by Admin.

Use the Documents links for existing programme/action document controls
and Notes & documents for the existing session screen. Existing settings,
assessments, materials and password recovery screens remain accessible
from the Coach navigation. Participants can open Messages from their
sidebar and reply to their assigned Coaches.

Messages refresh every 10 seconds while the conversation is open.
Attachments are limited to 5 MB. Microphone recording requires HTTPS or
localhost and browser permission. PDF reports use Print / Save as PDF.

The database and uploaded files require persistent storage on the host.
Set `KBD_DATABASE_PATH`, `KBD_DATABASE_DIR` and `KBD_UPLOAD_DIRECTORY`
to your existing persistent locations when upgrading a deployment.

Run the Coach integration regression with `npm run test:coach` from
`backend`. It creates an isolated temporary database and test server,
checks migration, shared records, access restrictions, concurrent retries,
attachments and persistence, then removes its temporary test data.


## Participant and updated Coach integration

The 19 November merge applies Participant_edited and the updated Coach
interface to the existing project. Admin uses the existing management
screens, Coach uses `/coach/index.html`, and Participant uses
`/pages/dashboard.html` with personal pages and navigation.

Coach action forms support participant tasks and Coach-only tasks. Client
visibility is determined by the actual assignee stored in Actions.
Session location, meeting URL and agenda are visible to authorised session
viewers. Private session notes remain in SessionNotes. Missed attendance
uses the workspace metadata alongside the compatible core session state.
The native session API and all role views expose the attendance label.

The goal workspace uses CoachingMetrics plus CoachingGoalMeasurements.
Existing metrics receive initial history entries when the app starts.
Coaches can record increasing/decreasing goals, progress measurements,
target dates and update frequency. Participants have a read-only My Goals
page. Frequency is used for goal attention status. Reports export the
latest measurements as CSV or through the browser print dialog.

`npm run test:coach` covers goal histories, zero values, Coach-only actions,
session details, attendance, cross-role permissions and restart persistence
in an isolated database. `npm run test:fresh-db` checks initialisation.
The ZIP excludes runtime secrets, installed dependencies and live data.
Keep your existing .env, database and uploads when applying the source update.
