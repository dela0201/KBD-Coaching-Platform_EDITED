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
        "PRAGMA table_info(AuditLogs)"
    );

    return columns.some(
        column => column.name === columnName
    );
}

async function migrateAuditLogs() {
    try {
        if (
            !(await columnExists("Details"))
        ) {
            await databaseRun(
                `ALTER TABLE AuditLogs
                 ADD COLUMN Details TEXT`
            );

            console.log(
                "AuditLogs.Details added."
            );
        }

        if (
            !(await columnExists("IPAddress"))
        ) {
            await databaseRun(
                `ALTER TABLE AuditLogs
                 ADD COLUMN IPAddress TEXT`
            );

            console.log(
                "AuditLogs.IPAddress added."
            );
        }

        if (
            !(await columnExists("UserAgent"))
        ) {
            await databaseRun(
                `ALTER TABLE AuditLogs
                 ADD COLUMN UserAgent TEXT`
            );

            console.log(
                "AuditLogs.UserAgent added."
            );
        }

        await databaseRun(
            `CREATE INDEX IF NOT EXISTS
                idx_audit_logs_resource
             ON AuditLogs (
                ResourceType,
                ResourceID,
                CreatedAt
             )`
        );

        console.log(
            "Audit-log migration completed successfully."
        );
    } catch (error) {
        console.error(
            "Audit-log migration failed:",
            error.message
        );

        process.exitCode = 1;
    } finally {
        closeDatabase();
    }
}

migrateAuditLogs();
