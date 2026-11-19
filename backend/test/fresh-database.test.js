const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } =
    require("node:child_process");
const sqlite3 =
    require("sqlite3").verbose();

const backendDirectory = path.resolve(
    __dirname,
    ".."
);

function runScript(scriptName, environment) {
    const result = spawnSync(
        process.execPath,
        [scriptName],
        {
            cwd: backendDirectory,
            env: environment,
            encoding: "utf8"
        }
    );

    if (result.stdout) {
        process.stdout.write(result.stdout);
    }

    if (result.stderr) {
        process.stderr.write(result.stderr);
    }

    assert.equal(
        result.status,
        0,
        `${scriptName} failed.`
    );
}

function openDatabase(databasePath) {
    return new Promise((resolve, reject) => {
        const database =
            new sqlite3.Database(
                databasePath,
                error => {
                    if (error) reject(error);
                    else resolve(database);
                }
            );
    });
}

function databaseAll(
    database,
    sql,
    parameters = []
) {
    return new Promise((resolve, reject) => {
        database.all(
            sql,
            parameters,
            (error, rows) => {
                if (error) reject(error);
                else resolve(rows);
            }
        );
    });
}

function closeDatabase(database) {
    return new Promise((resolve, reject) => {
        database.close(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

test(
    "fresh database initialises successfully",
    async () => {
        const temporaryDirectory =
            fs.mkdtempSync(
                path.join(
                    os.tmpdir(),
                    "kbd-fresh-database-"
                )
            );

        const databasePath = path.join(
            temporaryDirectory,
            "kbd-test.db"
        );

        const environment = {
            ...process.env,
            KBD_DATABASE_PATH:
                databasePath,
            KBD_ADMIN_FIRST_NAME:
                "Automated",
            KBD_ADMIN_LAST_NAME:
                "Test",
            KBD_ADMIN_EMAIL:
                "automated-admin@kbd.test",
            KBD_ADMIN_PASSWORD:
                "AutomatedTestPassword123!",
            KBD_SYNC_ADMIN_PASSWORDS:
                "false"
        };

        const scripts = [
            "initDatabase.js",
            "migrateUserAccountStatus.js",
            "migrateAuditLogs.js",
            "migrateOptionalProgrammeOrganisation.js",
            "migrateProgrammeFiles.js",
            "migrateAuthenticationRecovery.js",
            "migrateCoachInvitations.js",
            "createAdminAccounts.js"
        ];

        let database;

        try {
            scripts.forEach(script => {
                runScript(
                    script,
                    environment
                );
            });

            assert.equal(
                fs.existsSync(databasePath),
                true,
                "The database file was not created."
            );

            database = await openDatabase(
                databasePath
            );

            const tables = await databaseAll(
                database,
                `SELECT name
                 FROM sqlite_master
                 WHERE type = 'table'`
            );

            const tableNames = new Set(
                tables.map(row => row.name)
            );

            [
                "Users",
                "Programmes",
                "Sessions",
                "Actions",
                "Assessments",
                "LearningMaterials",
                "AuditLogs",
                "TermsAcceptances",
                "UploadedFiles",
                "CoachInvitations"
            ].forEach(tableName => {
                assert.equal(
                    tableNames.has(tableName),
                    true,
                    `${tableName} was not created.`
                );
            });

            const userColumns =
                await databaseAll(
                    database,
                    "PRAGMA table_info(Users)"
                );

            const userColumnNames =
                new Set(
                    userColumns.map(
                        column => column.name
                    )
                );

            [
                "AccountStatus",
                "DeactivatedAt",
                "DeletionRequestedAt"
            ].forEach(columnName => {
                assert.equal(
                    userColumnNames.has(
                        columnName
                    ),
                    true,
                    `Users.${columnName} is missing.`
                );
            });

            const auditColumns =
                await databaseAll(
                    database,
                    "PRAGMA table_info(AuditLogs)"
                );

            const auditColumnNames =
                new Set(
                    auditColumns.map(
                        column => column.name
                    )
                );

            [
                "Details",
                "IPAddress",
                "UserAgent"
            ].forEach(columnName => {
                assert.equal(
                    auditColumnNames.has(
                        columnName
                    ),
                    true,
                    `AuditLogs.${columnName} is missing.`
                );
            });

            const administrators =
                await databaseAll(
                    database,
                    `SELECT
                        Email,
                        Role,
                        AccountStatus
                     FROM Users
                     WHERE Role = 'Admin'`
                );

            assert.equal(
                administrators.length,
                1
            );

            assert.equal(
                administrators[0].Email,
                "automated-admin@kbd.test"
            );

            assert.equal(
                administrators[0]
                    .AccountStatus,
                "Active"
            );

            const violations =
                await databaseAll(
                    database,
                    "PRAGMA foreign_key_check"
                );

            assert.deepEqual(
                violations,
                []
            );
        } finally {
            if (database) {
                await closeDatabase(database);
            }

            fs.rmSync(
                temporaryDirectory,
                {
                    recursive: true,
                    force: true
                }
            );
        }
    }
);
