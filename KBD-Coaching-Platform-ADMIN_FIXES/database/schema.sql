PRAGMA foreign_keys = ON;

-- ========================================
-- ORGANISATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS Organisations (
    OrganisationID INTEGER PRIMARY KEY AUTOINCREMENT,
    OrganisationName TEXT NOT NULL,
    ContactName TEXT,
    ContactEmail TEXT,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- USERS
-- ========================================

CREATE TABLE IF NOT EXISTS Users (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    FirstName TEXT NOT NULL,
    LastName TEXT NOT NULL,
    Email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    PasswordHash TEXT NOT NULL,
    Role TEXT NOT NULL CHECK (
        Role IN ('Admin', 'Coach', 'Participant', 'Corporate')
    ),
    OrganisationID INTEGER,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    AccountStatus TEXT NOT NULL DEFAULT 'Active'
    CHECK (
        AccountStatus IN (
            'Active',
            'Deactivated',
            'PendingDeletion'
        )
    ),

DeactivatedAt DATETIME,

DeletionRequestedAt DATETIME,
    FOREIGN KEY (OrganisationID)
        REFERENCES Organisations(OrganisationID)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ========================================
-- PROGRAMMES
-- ========================================

CREATE TABLE IF NOT EXISTS Programmes (
    ProgrammeID INTEGER PRIMARY KEY AUTOINCREMENT,
    OrganisationID INTEGER,
    ProgrammeName TEXT NOT NULL,
    Description TEXT,
    StartDate DATE,
    EndDate DATE,
    Status TEXT NOT NULL DEFAULT 'Active' CHECK (
        Status IN ('Draft', 'Active', 'Completed', 'Archived')
    ),
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        StartDate IS NULL
        OR EndDate IS NULL
        OR EndDate >= StartDate
    ),
    FOREIGN KEY (OrganisationID)
        REFERENCES Organisations(OrganisationID)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ========================================
-- PROGRAMME PARTICIPANTS
-- ========================================

CREATE TABLE IF NOT EXISTS ProgrammeParticipants (
    ProgrammeParticipantID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER NOT NULL,
    UserID INTEGER NOT NULL,
    EnrollmentDate DATE NOT NULL DEFAULT CURRENT_DATE,
    Status TEXT NOT NULL DEFAULT 'Active' CHECK (
        Status IN ('Active', 'Completed', 'Withdrawn')
    ),
    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    UNIQUE (ProgrammeID, UserID)
);

-- ========================================
-- PROGRAMME COACHES
-- ========================================

CREATE TABLE IF NOT EXISTS ProgrammeCoaches (
    ProgrammeCoachID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER NOT NULL,
    UserID INTEGER NOT NULL,
    AssignedDate DATE NOT NULL DEFAULT CURRENT_DATE,
    Status TEXT NOT NULL DEFAULT 'Active' CHECK (
        Status IN ('Active', 'Inactive')
    ),
    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    UNIQUE (ProgrammeID, UserID)
);

-- ========================================
-- SESSIONS
-- ========================================

CREATE TABLE IF NOT EXISTS Sessions (
    SessionID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER NOT NULL,
    CoachID INTEGER NOT NULL,
    ParticipantID INTEGER NOT NULL,
    SessionDate DATE NOT NULL,
    StartTime TIME,
    EndTime TIME,
    SessionType TEXT NOT NULL DEFAULT 'Coaching',
    Status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (
        Status IN ('Scheduled', 'Completed', 'Cancelled', 'Rescheduled')
    ),
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        StartTime IS NULL
        OR EndTime IS NULL
        OR EndTime > StartTime
    ),
    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (CoachID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (ParticipantID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- ========================================
-- SESSION NOTES
-- ========================================

CREATE TABLE IF NOT EXISTS SessionNotes (
    SessionNoteID INTEGER PRIMARY KEY AUTOINCREMENT,
    SessionID INTEGER NOT NULL,
    CoachID INTEGER NOT NULL,
    Notes TEXT NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SessionID)
        REFERENCES Sessions(SessionID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (CoachID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- ========================================
-- ACTIONS
-- ========================================

CREATE TABLE IF NOT EXISTS Actions (
    ActionID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER NOT NULL,
    SessionID INTEGER,
    AssignedTo INTEGER NOT NULL,
    AssignedBy INTEGER NOT NULL,
    Title TEXT NOT NULL,
    Description TEXT,
    DueDate DATE,
    Status TEXT NOT NULL DEFAULT 'Pending' CHECK (
        Status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')
    ),
    CompletedAt DATETIME,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (SessionID)
        REFERENCES Sessions(SessionID)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    FOREIGN KEY (AssignedTo)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (AssignedBy)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- ========================================
-- ASSESSMENTS
-- ========================================

CREATE TABLE IF NOT EXISTS Assessments (
    AssessmentID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER NOT NULL,
    AssessmentName TEXT NOT NULL,
    Description TEXT,
    Type TEXT NOT NULL DEFAULT 'General',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- ========================================
-- ASSESSMENT RESPONSES
-- ========================================

CREATE TABLE IF NOT EXISTS AssessmentResponses (
    ResponseID INTEGER PRIMARY KEY AUTOINCREMENT,
    AssessmentID INTEGER NOT NULL,
    UserID INTEGER NOT NULL,
    Question TEXT NOT NULL,
    Answer TEXT,
    Score REAL,
    CompletedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AssessmentID)
        REFERENCES Assessments(AssessmentID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- ========================================
-- LEARNING MATERIALS
-- ========================================

CREATE TABLE IF NOT EXISTS LearningMaterials (
    MaterialID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER NOT NULL,
    Title TEXT NOT NULL,
    Description TEXT,
    MaterialType TEXT NOT NULL,
    FileURL TEXT,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- ========================================
-- PROGRESS
-- ========================================

CREATE TABLE IF NOT EXISTS Progress (
    ProgressID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER NOT NULL,
    UserID INTEGER NOT NULL,
    ProgressPercentage REAL NOT NULL DEFAULT 0 CHECK (
        ProgressPercentage >= 0
        AND ProgressPercentage <= 100
    ),
    Status TEXT NOT NULL DEFAULT 'Not Started' CHECK (
        Status IN ('Not Started', 'In Progress', 'Completed')
    ),
    LastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    UNIQUE (ProgrammeID, UserID)
);

-- ========================================
-- PASSWORD RECOVERY REQUESTS
-- ========================================

CREATE TABLE IF NOT EXISTS PasswordRecoveryRequests (
    RequestID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER NOT NULL,
    Status TEXT NOT NULL DEFAULT 'Pending' CHECK (
        Status IN ('Pending', 'Fulfilled', 'Resolved', 'Cancelled')
    ),
    RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FulfilledAt DATETIME,
    ResolvedAt DATETIME,
    FulfilledBy INTEGER,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (FulfilledBy)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ========================================
-- TEMPORARY PASSWORDS
-- ========================================

CREATE TABLE IF NOT EXISTS TemporaryPasswords (
    TemporaryPasswordID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER NOT NULL,
    PasswordHash TEXT NOT NULL,
    CreatedBy INTEGER NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt DATETIME NOT NULL,
    UsedAt DATETIME,
    RevokedAt DATETIME,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (CreatedBy)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- ========================================
-- INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_users_role
    ON Users (Role);

CREATE INDEX IF NOT EXISTS idx_programmes_organisation
    ON Programmes (OrganisationID);

CREATE INDEX IF NOT EXISTS idx_programme_participants_user
    ON ProgrammeParticipants (UserID, Status);

CREATE INDEX IF NOT EXISTS idx_programme_coaches_user
    ON ProgrammeCoaches (UserID, Status);

CREATE INDEX IF NOT EXISTS idx_sessions_coach_date
    ON Sessions (CoachID, SessionDate, StartTime);

CREATE INDEX IF NOT EXISTS idx_sessions_participant_date
    ON Sessions (ParticipantID, SessionDate, StartTime);

CREATE INDEX IF NOT EXISTS idx_actions_assigned_to_status
    ON Actions (AssignedTo, Status);

CREATE INDEX IF NOT EXISTS idx_assessment_responses_user
    ON AssessmentResponses (UserID, AssessmentID);

CREATE INDEX IF NOT EXISTS idx_materials_programme
    ON LearningMaterials (ProgrammeID);

CREATE INDEX IF NOT EXISTS idx_progress_user
    ON Progress (UserID, ProgrammeID);

CREATE INDEX IF NOT EXISTS idx_recovery_user_status
    ON PasswordRecoveryRequests (UserID, Status);

CREATE INDEX IF NOT EXISTS idx_temporary_password_user
    ON TemporaryPasswords (UserID, ExpiresAt);

CREATE INDEX IF NOT EXISTS idx_users_account_status
ON Users (
    AccountStatus,
    DeletionRequestedAt
);
-- ========================================
-- COACH INVITATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS CoachInvitations (
    InvitationID INTEGER PRIMARY KEY AUTOINCREMENT,
    Email TEXT NOT NULL COLLATE NOCASE,
    InvitationTokenHash TEXT NOT NULL UNIQUE,
    InvitedBy INTEGER NOT NULL,
    OrganisationID INTEGER,
    ExpiresAt DATETIME NOT NULL,
    AcceptedAt DATETIME,
    RevokedAt DATETIME,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (InvitedBy)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (OrganisationID)
        REFERENCES Organisations(OrganisationID)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CHECK (
        AcceptedAt IS NULL
        OR RevokedAt IS NULL
    )
);

-- ========================================
-- COACH ACCESS REQUESTS
-- ========================================

CREATE TABLE IF NOT EXISTS CoachAccessRequests (
    CoachRequestID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER,
    FirstName TEXT NOT NULL,
    LastName TEXT NOT NULL,
    Email TEXT NOT NULL COLLATE NOCASE,
    Reason TEXT,
    AssignedAdminID INTEGER NOT NULL,
    Status TEXT NOT NULL DEFAULT 'Pending' CHECK (
        Status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')
    ),
    ReviewedBy INTEGER,
    ReviewedAt DATETIME,
    InvitationID INTEGER,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    FOREIGN KEY (AssignedAdminID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (ReviewedBy)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    FOREIGN KEY (InvitationID)
        REFERENCES CoachInvitations(InvitationID)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ========================================
-- UPLOADED FILES
-- ========================================

CREATE TABLE IF NOT EXISTS UploadedFiles (
    UploadedFileID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProgrammeID INTEGER,
    ActionID INTEGER,
    AssessmentID INTEGER,
    MaterialID INTEGER,
    UploadedBy INTEGER NOT NULL,
    OriginalFileName TEXT NOT NULL,
    StoredFileName TEXT NOT NULL,
    MimeType TEXT NOT NULL,
    FileSize INTEGER NOT NULL CHECK (FileSize > 0),
    StorageKey TEXT NOT NULL UNIQUE,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ProgrammeID)
        REFERENCES Programmes(ProgrammeID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (ActionID)
        REFERENCES Actions(ActionID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (AssessmentID)
        REFERENCES Assessments(AssessmentID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (MaterialID)
        REFERENCES LearningMaterials(MaterialID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (UploadedBy)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CHECK (
    (ProgrammeID IS NOT NULL) +
    (ActionID IS NOT NULL) +
    (AssessmentID IS NOT NULL) +
    (MaterialID IS NOT NULL) = 1
)
);

-- ========================================
-- TERMS ACCEPTANCES
-- ========================================

CREATE TABLE IF NOT EXISTS TermsAcceptances (
    AcceptanceID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER NOT NULL,
    TermsVersion TEXT NOT NULL,
    AcceptedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    UNIQUE (UserID, TermsVersion)
);

-- ========================================
-- AUDIT LOGS
-- ========================================

CREATE TABLE IF NOT EXISTS AuditLogs (
    AuditLogID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER,
    Action TEXT NOT NULL,
    ResourceType TEXT,
    ResourceID INTEGER,
    Details TEXT,
IPAddress TEXT,
UserAgent TEXT,
    Outcome TEXT NOT NULL CHECK (
        Outcome IN ('Success', 'Denied', 'Failure')
    ),
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ========================================
-- ADDITIONAL INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_coach_invitations_email
ON CoachInvitations (Email, ExpiresAt);

CREATE INDEX IF NOT EXISTS idx_coach_invitations_status
ON CoachInvitations (AcceptedAt, RevokedAt, ExpiresAt);

CREATE INDEX IF NOT EXISTS idx_coach_requests_admin_status
ON CoachAccessRequests (AssignedAdminID, Status, CreatedAt);

CREATE INDEX IF NOT EXISTS idx_coach_requests_email
ON CoachAccessRequests (Email, Status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_requests_pending_email
ON CoachAccessRequests (Email)
WHERE Status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_uploaded_files_action
ON UploadedFiles (ActionID);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_assessment
ON UploadedFiles (AssessmentID);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_material
ON UploadedFiles (MaterialID);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_uploader
ON UploadedFiles (UploadedBy, CreatedAt);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
ON AuditLogs (UserID, CreatedAt);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
ON AuditLogs (Action, CreatedAt);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user
ON TermsAcceptances (UserID, AcceptedAt);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
ON AuditLogs (
    ResourceType,
    ResourceID,
    CreatedAt
);
