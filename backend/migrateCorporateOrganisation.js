require("dotenv").config();

const db = require("./database");

const corporateEmail = String(
    process.env.KBD_CORPORATE_EMAIL ||
    "lisa@company.test"
)
    .trim()
    .toLowerCase();

const organisationID = Number(
    process.env.KBD_CORPORATE_ORGANISATION_ID ||
    1
);

function databaseGet(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, parameters, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

function databaseAll(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, parameters, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

function databaseRun(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parameters, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                changes: this.changes,
                lastID: this.lastID
            });
        });
    });
}

function closeDatabase() {
    return new Promise(resolve => {
        db.close(error => {
            if (error) {
                console.error(
                    "Error closing database:",
                    error.message
                );
                process.exitCode = 1;
            }

            resolve();
        });
    });
}

async function verifyRequiredTables() {
    const tables = await databaseAll(`
        SELECT name
        FROM sqlite_master
        WHERE
            type = 'table'
            AND name IN ('Users', 'Organisations')
    `);

    const tableNames = new Set(
        tables.map(table => table.name)
    );

    const missingTables = [
        "Users",
        "Organisations"
    ].filter(table => !tableNames.has(table));

    if (missingTables.length > 0) {
        throw new Error(
            `Missing required tables: ${missingTables.join(", ")}. Run the database initialisation first.`
        );
    }
}

async function organisationColumnExists() {
    const columns = await databaseAll(
        "PRAGMA table_info(Users)"
    );

    return columns.some(
        column => column.name === "OrganisationID"
    );
}

async function runMigration() {
    const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(corporateEmail)) {
        throw new Error(
            "A valid Corporate email address is required."
        );
    }

    if (
        !Number.isInteger(organisationID) ||
        organisationID <= 0
    ) {
        throw new Error(
            "A valid Corporate organisation ID is required."
        );
    }

    await verifyRequiredTables();

    let transactionStarted = false;

    try {
        await databaseRun(
            "BEGIN IMMEDIATE TRANSACTION"
        );
        transactionStarted = true;

        if (await organisationColumnExists()) {
            console.log(
                "Users.OrganisationID already exists."
            );
        } else {
            await databaseRun(`
                ALTER TABLE Users
                ADD COLUMN OrganisationID INTEGER
                REFERENCES Organisations(OrganisationID)
            `);

            console.log(
                "Users.OrganisationID added successfully."
            );
        }

        const organisation = await databaseGet(
            `
                SELECT
                    OrganisationID,
                    OrganisationName
                FROM Organisations
                WHERE OrganisationID = ?
            `,
            [organisationID]
        );

        if (!organisation) {
            throw new Error(
                `Organisation ${organisationID} does not exist.`
            );
        }

        console.log(
            `Organisation found: ${organisation.OrganisationName}`
        );

        const user = await databaseGet(
            `
                SELECT
                    UserID,
                    Email,
                    Role,
                    OrganisationID
                FROM Users
                WHERE LOWER(Email) = LOWER(?)
            `,
            [corporateEmail]
        );

        if (!user) {
            throw new Error(
                `Corporate account not found: ${corporateEmail}`
            );
        }

        if (user.Role !== "Corporate") {
            throw new Error(
                `The account ${corporateEmail} is not a Corporate account.`
            );
        }

        if (user.OrganisationID === organisationID) {
            console.log(
                "Corporate account is already linked correctly."
            );
        } else {
            const updateResult = await databaseRun(
                `
                    UPDATE Users
                    SET OrganisationID = ?
                    WHERE
                        UserID = ?
                        AND Role = 'Corporate'
                `,
                [organisationID, user.UserID]
            );

            if (updateResult.changes !== 1) {
                throw new Error(
                    "No Corporate account was updated."
                );
            }

            console.log(
                "Corporate account linked successfully."
            );
            console.log(`Email: ${corporateEmail}`);
            console.log(
                `Organisation ID: ${organisationID}`
            );
        }

        await databaseRun("COMMIT");
        transactionStarted = false;
    } catch (error) {
        if (transactionStarted) {
            try {
                await databaseRun("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Corporate migration rollback failed:",
                    rollbackError.message
                );
            }
        }

        throw error;
    }
}

async function main() {
    try {
        await runMigration();
    } catch (error) {
        console.error(
            "Corporate organisation migration failed:",
            error.message
        );
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

main();
