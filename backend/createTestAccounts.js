require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./database");

const testUsers = [
    {
        FirstName: "KBD",
        LastName: "Administrator",
        Email: "admin@kbd.test",
        Role: "Admin",
        OrganisationID: null
    },
    {
        FirstName: "John",
        LastName: "Doe",
        Email: "john@kbd.test",
        Role: "Participant",
        OrganisationID: null
    },
    {
        FirstName: "Lisa",
        LastName: "Williams",
        Email: "lisa@company.test",
        Role: "Corporate",
        OrganisationID: null
    }
];

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

function databaseRun(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parameters, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
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

async function getOrCreateTestOrganisation() {
    const existingOrganisation =
        await databaseGet(
            `
                SELECT OrganisationID
                FROM Organisations
                WHERE
                    LOWER(OrganisationName) = LOWER(?)
                    OR LOWER(ContactEmail) = LOWER(?)
                ORDER BY OrganisationID
                LIMIT 1
            `,
            [
                "ABC Corporation",
                "lisa@company.test"
            ]
        );

    if (existingOrganisation) {
        return existingOrganisation.OrganisationID;
    }

    const result = await databaseRun(
        `
            INSERT INTO Organisations
            (
                OrganisationName,
                ContactName,
                ContactEmail
            )
            VALUES (?, ?, ?)
        `,
        [
            "ABC Corporation",
            "Lisa Williams",
            "lisa@company.test"
        ]
    );

    return result.lastID;
}

async function createOrUpdateUser(user, passwordHash) {
    const email =
        user.Email.trim().toLowerCase();

    const existingUser =
        await databaseGet(
            `
                SELECT UserID
                FROM Users
                WHERE LOWER(Email) = LOWER(?)
            `,
            [email]
        );

    if (existingUser) {
        const result = await databaseRun(
            `
                UPDATE Users
                SET
                    FirstName = ?,
                    LastName = ?,
                    Email = ?,
                    PasswordHash = ?,
                    Role = ?,
                    OrganisationID = ?
                WHERE UserID = ?
            `,
            [
                user.FirstName,
                user.LastName,
                email,
                passwordHash,
                user.Role,
                user.OrganisationID,
                existingUser.UserID
            ]
        );

        if (result.changes !== 1) {
            throw new Error(
                `The ${user.Role} test account could not be updated.`
            );
        }

        return existingUser.UserID;
    }

    const result = await databaseRun(
        `
            INSERT INTO Users
            (
                FirstName,
                LastName,
                Email,
                PasswordHash,
                Role,
                OrganisationID
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            user.FirstName,
            user.LastName,
            email,
            passwordHash,
            user.Role,
            user.OrganisationID
        ]
    );

    return result.lastID;
}

async function createTestAccounts() {
    const testPassword =
        process.env.KBD_TEST_PASSWORD;

    if (
        process.env.NODE_ENV ===
        "production"
    ) {
        throw new Error(
            "Test accounts cannot be created in production."
        );
    }

    if (!testPassword || testPassword.length < 8) {
        throw new Error(
            "KBD_TEST_PASSWORD must contain at least 8 characters."
        );
    }

    const passwordHash =
        await bcrypt.hash(testPassword, 12);

    let transactionStarted = false;

    try {
        await databaseRun(
            "BEGIN IMMEDIATE TRANSACTION"
        );
        transactionStarted = true;

        const organisationID =
            await getOrCreateTestOrganisation();

        const usersToPrepare = testUsers.map(user => ({
            ...user,
            OrganisationID:
                user.Role === "Corporate"
                    ? organisationID
                    : null
        }));

        for (const user of usersToPrepare) {
            const userID =
                await createOrUpdateUser(
                    user,
                    passwordHash
                );

            console.log(
                `${user.Role} account ready: ${user.Email} (User ID: ${userID})`
            );
        }

        await databaseRun("COMMIT");
        transactionStarted = false;

        console.log(
            "All KBD test accounts were prepared successfully."
        );
    } catch (error) {
        if (transactionStarted) {
            try {
                await databaseRun("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Unable to roll back test-account changes:",
                    rollbackError.message
                );
            }
        }

        throw error;
    }
}

async function main() {
    try {
        await createTestAccounts();
    } catch (error) {
        console.error(
            "Unable to prepare test accounts:",
            error.message
        );
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

main();
