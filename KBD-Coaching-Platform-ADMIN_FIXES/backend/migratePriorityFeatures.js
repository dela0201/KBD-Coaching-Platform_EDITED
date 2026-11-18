const db = require("./database");

const migration = `
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
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
        ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (AssignedAdminID) REFERENCES Users(UserID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (ReviewedBy) REFERENCES Users(UserID)
        ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (InvitationID) REFERENCES CoachInvitations(InvitationID)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS UploadedFiles (
    UploadedFileID INTEGER PRIMARY KEY AUTOINCREMENT,
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
    FOREIGN KEY (ActionID) REFERENCES Actions(ActionID)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (AssessmentID) REFERENCES Assessments(AssessmentID)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (MaterialID) REFERENCES LearningMaterials(MaterialID)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (UploadedBy) REFERENCES Users(UserID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK (
        (ActionID IS NOT NULL) +
        (AssessmentID IS NOT NULL) +
        (MaterialID IS NOT NULL) = 1
    )
);

CREATE TABLE IF NOT EXISTS AuditLogs (
    AuditLogID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER,
    Action TEXT NOT NULL,
    ResourceType TEXT,
    ResourceID INTEGER,
    Outcome TEXT NOT NULL CHECK (
        Outcome IN ('Success', 'Denied', 'Failure')
    ),
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
        ON UPDATE CASCADE ON DELETE SET NULL
);

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
`;

db.exec("BEGIN TRANSACTION;", beginError => {
    if (beginError) return finish("Unable to start migration:", beginError);

    db.exec(migration, migrationError => {
        if (migrationError) {
            return db.exec("ROLLBACK;", () => {
                finish("Priority-features migration failed:", migrationError);
            });
        }

        db.exec("COMMIT;", commitError => {
            if (commitError) return finish("Unable to commit migration:", commitError);

            console.log("Coach requests and file-upload tables created successfully.");
            closeDatabase();
        });
    });
});

function finish(message, error) {
    console.error(message, error.message);
    process.exitCode = 1;
    closeDatabase();
}

function closeDatabase() {
    db.close(error => {
        if (error) {
            console.error("Unable to close database:", error.message);
            process.exitCode = 1;
        }
    });
}
