const db = require("./database");

const migration = `
    CREATE TABLE IF NOT EXISTS PasswordRecoveryRequests
    (
        RequestID INTEGER PRIMARY KEY AUTOINCREMENT,

        UserID INTEGER NOT NULL,

        Status TEXT NOT NULL DEFAULT 'Pending'
            CHECK (
                Status IN (
                    'Pending',
                    'Fulfilled',
                    'Resolved',
                    'Cancelled'
                )
            ),

        RequestedAt DATETIME NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        FulfilledAt DATETIME,
        ResolvedAt DATETIME,
        FulfilledBy INTEGER,

        FOREIGN KEY (UserID)
            REFERENCES Users(UserID),

        FOREIGN KEY (FulfilledBy)
            REFERENCES Users(UserID)
    );

    CREATE TABLE IF NOT EXISTS TemporaryPasswords
    (
        TemporaryPasswordID INTEGER PRIMARY KEY AUTOINCREMENT,

        UserID INTEGER NOT NULL,
        PasswordHash TEXT NOT NULL,
        CreatedBy INTEGER NOT NULL,

        CreatedAt DATETIME NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        ExpiresAt DATETIME NOT NULL,
        UsedAt DATETIME,
        RevokedAt DATETIME,

        FOREIGN KEY (UserID)
            REFERENCES Users(UserID),

        FOREIGN KEY (CreatedBy)
            REFERENCES Users(UserID)
    );

    CREATE INDEX IF NOT EXISTS
        idx_recovery_user_status
    ON PasswordRecoveryRequests
        (UserID, Status);

    CREATE INDEX IF NOT EXISTS
        idx_temporary_password_user
    ON TemporaryPasswords
        (UserID, ExpiresAt);
`;

function execute(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, error => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function closeDatabase() {
    return new Promise(resolve => {
        db.close(error => {
            if (error) {
                console.error(
                    "Unable to close the database:",
                    error.message
                );
                process.exitCode = 1;
            }

            resolve();
        });
    });
}

async function migrateAuthentication() {
    let transactionStarted = false;

    try {
        await execute("BEGIN IMMEDIATE TRANSACTION;");
        transactionStarted = true;

        await execute(migration);
        await execute("COMMIT;");
        transactionStarted = false;

        console.log(
            "Authentication recovery tables created successfully."
        );
    } catch (error) {
        if (transactionStarted) {
            try {
                await execute("ROLLBACK;");
            } catch (rollbackError) {
                console.error(
                    "Authentication migration rollback failed:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Authentication recovery migration failed:",
            error.message
        );
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

migrateAuthentication();
