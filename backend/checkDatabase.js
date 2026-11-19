const db = require("./database");

function getAll(query, parameters = []) {
    return new Promise((resolve, reject) => {
        db.all(query, parameters, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

function getOne(query, parameters = []) {
    return new Promise((resolve, reject) => {
        db.get(query, parameters, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
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

async function checkDatabase() {
    let hasProblems = false;

    function reportResult(records, successMessage, errorMessage) {
        if (records.length > 0) {
            hasProblems = true;
            console.error(`âœ— ${errorMessage}`, records);
            return;
        }

        console.log(`âœ“ ${successMessage}`);
    }

    try {
        console.log("\nChecking KBD database...\n");

        const requiredTables = [
            "Users",
            "Organisations",
            "Programmes",
            "ProgrammeParticipants",
            "ProgrammeCoaches",
            "Sessions",
            "SessionNotes",
            "Actions",
            "Assessments",
            "AssessmentResponses",
            "LearningMaterials",
            "Progress",
            "PasswordRecoveryRequests",
            "TemporaryPasswords",
            "CoachInvitations"
        ];

        const tableRows = await getAll(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
        `);

        const existingTables = new Set(
            tableRows.map(table => table.name)
        );

        const missingTables = requiredTables.filter(
            table => !existingTables.has(table)
        );

        if (missingTables.length > 0) {
            console.error(
                "âœ— Missing tables:",
                missingTables.join(", ")
            );
            process.exitCode = 1;
            return;
        }

        console.log("âœ“ All required tables exist.");

        const foreignKeySetting = await getOne(
            "PRAGMA foreign_keys"
        );

        if (foreignKeySetting?.foreign_keys !== 1) {
            hasProblems = true;
            console.error(
                "âœ— SQLite foreign-key enforcement is disabled."
            );
        } else {
            console.log(
                "âœ“ SQLite foreign-key enforcement is enabled."
            );
        }

        const integrityResults = await getAll(
            "PRAGMA integrity_check"
        );

        const integrityPassed =
            integrityResults.length === 1 &&
            integrityResults[0].integrity_check === "ok";

        if (!integrityPassed) {
            hasProblems = true;
            console.error(
                "âœ— Database integrity check failed:",
                integrityResults
            );
        } else {
            console.log("âœ“ SQLite integrity check passed.");
        }

        reportResult(
            await getAll("PRAGMA foreign_key_check"),
            "No broken foreign-key relationships.",
            "Broken foreign-key relationships:"
        );

        reportResult(
            await getAll(`
                SELECT
                    LOWER(Email) AS Email,
                    COUNT(*) AS DuplicateCount
                FROM Users
                GROUP BY LOWER(Email)
                HAVING COUNT(*) > 1
            `),
            "No duplicate email addresses.",
            "Duplicate email addresses:"
        );

        reportResult(
            await getAll(`
                SELECT
                    ProgrammeID,
                    UserID,
                    COUNT(*) AS DuplicateCount
                FROM ProgrammeParticipants
                GROUP BY ProgrammeID, UserID
                HAVING COUNT(*) > 1
            `),
            "No duplicate participant enrolments.",
            "Duplicate participant enrolments:"
        );

        reportResult(
            await getAll(`
                SELECT
                    ProgrammeID,
                    UserID,
                    COUNT(*) AS DuplicateCount
                FROM ProgrammeCoaches
                GROUP BY ProgrammeID, UserID
                HAVING COUNT(*) > 1
            `),
            "No duplicate Coach assignments.",
            "Duplicate Coach assignments:"
        );

        reportResult(
            await getAll(`
                SELECT
                    PP.ProgrammeParticipantID,
                    PP.ProgrammeID,
                    U.UserID,
                    U.Email,
                    U.Role
                FROM ProgrammeParticipants AS PP
                INNER JOIN Users AS U
                    ON U.UserID = PP.UserID
                WHERE U.Role != 'Participant'
            `),
            "All enrolled users are Participants.",
            "Non-participant users found in programme enrolments:"
        );

        reportResult(
            await getAll(`
                SELECT
                    PC.ProgrammeCoachID,
                    PC.ProgrammeID,
                    U.UserID,
                    U.Email,
                    U.Role
                FROM ProgrammeCoaches AS PC
                INNER JOIN Users AS U
                    ON U.UserID = PC.UserID
                WHERE U.Role != 'Coach'
            `),
            "All programme Coach assignments are valid.",
            "Non-Coach users found in Coach assignments:"
        );

        reportResult(
            await getAll(`
                SELECT
                    ProgressID,
                    ProgressPercentage,
                    Status
                FROM Progress
                WHERE
                    ProgressPercentage IS NULL
                    OR ProgressPercentage < 0
                    OR ProgressPercentage > 100
                    OR Status IS NULL
                    OR Status NOT IN (
                        'Not Started',
                        'In Progress',
                        'Completed'
                    )
                    OR (
                        ProgressPercentage = 0
                        AND Status != 'Not Started'
                    )
                    OR (
                        ProgressPercentage > 0
                        AND ProgressPercentage < 100
                        AND Status != 'In Progress'
                    )
                    OR (
                        ProgressPercentage = 100
                        AND Status != 'Completed'
                    )
            `),
            "Progress records are valid.",
            "Invalid or inconsistent progress records:"
        );

        reportResult(
            await getAll(`
                SELECT
                    U.UserID,
                    U.FirstName,
                    U.LastName,
                    U.Email,
                    U.OrganisationID
                FROM Users AS U
                LEFT JOIN Organisations AS O
                    ON O.OrganisationID = U.OrganisationID
                WHERE
                    U.Role = 'Corporate'
                    AND (
                        U.OrganisationID IS NULL
                        OR O.OrganisationID IS NULL
                    )
            `),
            "Corporate accounts are linked to valid organisations.",
            "Invalid Corporate organisation links:"
        );

        reportResult(
            await getAll(`
                SELECT UserID, Email, Role
                FROM Users
                WHERE
                    Role IS NULL
                    OR Role NOT IN (
                        'Admin',
                        'Coach',
                        'Participant',
                        'Corporate'
                    )
            `),
            "All user roles are valid.",
            "Invalid user roles:"
        );

        reportResult(
            await getAll(`
                SELECT ActionID, Status, CompletedAt
                FROM Actions
                WHERE
                    (Status = 'Completed' AND CompletedAt IS NULL)
                    OR
                    (Status != 'Completed' AND CompletedAt IS NOT NULL)
            `),
            "Action completion timestamps are consistent.",
            "Inconsistent action completion timestamps:"
        );

        reportResult(
            await getAll(`
                SELECT
                    RequestID,
                    UserID,
                    Status,
                    RequestedAt,
                    FulfilledAt,
                    ResolvedAt,
                    FulfilledBy
                FROM PasswordRecoveryRequests
                WHERE
                    Status NOT IN (
                        'Pending',
                        'Fulfilled',
                        'Resolved',
                        'Cancelled'
                    )
                    OR (
                        Status = 'Pending'
                        AND (
                            FulfilledAt IS NOT NULL
                            OR FulfilledBy IS NOT NULL
                            OR ResolvedAt IS NOT NULL
                        )
                    )
                    OR (
                        Status = 'Fulfilled'
                        AND (
                            FulfilledAt IS NULL
                            OR FulfilledBy IS NULL
                        )
                    )
                    OR (
                        Status = 'Resolved'
                        AND ResolvedAt IS NULL
                    )
            `),
            "Password recovery requests are valid.",
            "Invalid password recovery requests:"
        );

        reportResult(
            await getAll(`
                SELECT
                    UserID,
                    COUNT(*) AS PendingCount
                FROM PasswordRecoveryRequests
                WHERE Status = 'Pending'
                GROUP BY UserID
                HAVING COUNT(*) > 1
            `),
            "No duplicate pending recovery requests.",
            "Users with multiple pending recovery requests:"
        );

        reportResult(
            await getAll(`
                SELECT
                    TemporaryPasswordID,
                    UserID,
                    CreatedBy,
                    CreatedAt,
                    ExpiresAt,
                    UsedAt,
                    RevokedAt
                FROM TemporaryPasswords
                WHERE
                    PasswordHash IS NULL
                    OR TRIM(PasswordHash) = ''
                    OR ExpiresAt IS NULL
                    OR datetime(ExpiresAt) <= datetime(CreatedAt)
                    OR (
                        UsedAt IS NOT NULL
                        AND RevokedAt IS NOT NULL
                    )
            `),
            "Temporary password records are valid.",
            "Invalid temporary password records:"
        );

        reportResult(
            await getAll(`
                SELECT
                    UserID,
                    COUNT(*) AS ActivePasswordCount
                FROM TemporaryPasswords
                WHERE
                    UsedAt IS NULL
                    AND RevokedAt IS NULL
                    AND datetime(ExpiresAt) > datetime('now')
                GROUP BY UserID
                HAVING COUNT(*) > 1
            `),
            "No users have multiple active temporary passwords.",
            "Users with multiple active temporary passwords:"
        );

        console.log("");

        if (hasProblems) {
            console.error(
                "Database check completed with problems."
            );
            process.exitCode = 1;
        } else {
            console.log(
                "Database check passed successfully!"
            );
        }
    } catch (error) {
        console.error(
            "Unable to complete database check:",
            error.message
        );
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

checkDatabase();
