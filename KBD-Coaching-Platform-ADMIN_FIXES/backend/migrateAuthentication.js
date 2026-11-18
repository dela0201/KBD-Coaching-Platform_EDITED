const db =
    require("./database");


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

        RequestedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
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

        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    (
        UserID,
        Status
    );


    CREATE INDEX IF NOT EXISTS
        idx_temporary_password_user

    ON TemporaryPasswords
    (
        UserID,
        ExpiresAt
    );
`;


db.exec(
    migration,
    error => {

        if (error) {

            console.error(
                "Authentication recovery migration failed:",
                error.message
            );

            process.exitCode = 1;

        } else {

            console.log(
                "Authentication recovery tables created successfully."
            );

        }


        db.close(
            closeError => {

                if (closeError) {

                    console.error(
                        "Unable to close the database:",
                        closeError.message
                    );

                    process.exitCode = 1;

                }

            }
        );

    }
);
