const db = require("./database");

function databaseAll(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, parameters, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
}

function databaseRun(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parameters, function (error) {
            if (error) reject(error);
            else {
                resolve({
                    changes: this.changes,
                    lastID: this.lastID
                });
            }
        });
    });
}

function closeDatabase() {
    db.close(error => {
        if (error) {
            console.error(
                "Unable to close the database:",
                error.message
            );

            process.exitCode = 1;
        }
    });
}

async function columnExists(columnName) {
    const columns = await databaseAll(
        "PRAGMA table_info(Users)"
    );

    return columns.some(
        column => column.name === columnName
    );
}

async function migrateUserAccountStatus() {
    try {
        if (
            !(await columnExists(
                "AccountStatus"
            ))
        ) {
            await databaseRun(
                `ALTER TABLE Users
                 ADD COLUMN AccountStatus TEXT
                 NOT NULL DEFAULT 'Active'
                 CHECK (
                    AccountStatus IN (
                        'Active',
                        'Deactivated',
                        'PendingDeletion'
                    )
                 )`
            );

            console.log(
                "Users.AccountStatus added."
            );
        } else {
            console.log(
                "Users.AccountStatus already exists."
            );
        }

        if (
            !(await columnExists(
                "DeactivatedAt"
            ))
        ) {
            await databaseRun(
                `ALTER TABLE Users
                 ADD COLUMN DeactivatedAt DATETIME`
            );

            console.log(
                "Users.DeactivatedAt added."
            );
        } else {
            console.log(
                "Users.DeactivatedAt already exists."
            );
        }

        if (
            !(await columnExists(
                "DeletionRequestedAt"
            ))
        ) {
            await databaseRun(
                `ALTER TABLE Users
                 ADD COLUMN DeletionRequestedAt DATETIME`
            );

            console.log(
                "Users.DeletionRequestedAt added."
            );
        } else {
            console.log(
                "Users.DeletionRequestedAt already exists."
            );
        }

        await databaseRun(
            `CREATE INDEX IF NOT EXISTS
                idx_users_account_status
             ON Users (
                AccountStatus,
                DeletionRequestedAt
             )`
        );

        console.log(
            "User account-status migration completed successfully."
        );
    } catch (error) {
        console.error(
            "User account-status migration failed:",
            error.message
        );

        process.exitCode = 1;
    } finally {
        closeDatabase();
    }
}

migrateUserAccountStatus();
