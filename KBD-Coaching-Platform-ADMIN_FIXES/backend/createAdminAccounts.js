require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./database");

const syncExistingAdmins =
    String(process.env.KBD_SYNC_ADMIN_PASSWORDS || "")
        .trim()
        .toLowerCase() === "true";

function databaseGet(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, parameters, (error, row) => {
            if (error) reject(error);
            else resolve(row);
        });
    });
}

function databaseRun(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parameters, function (error) {
            if (error) reject(error);
            else {
                resolve({
                    lastID: this.lastID,
                    changes: this.changes
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

function readAdminAccount(suffix, label) {
    const prefix = `KBD_ADMIN${suffix}`;

    const firstName = String(
        process.env[`${prefix}_FIRST_NAME`] || ""
    ).trim();

    const lastName = String(
        process.env[`${prefix}_LAST_NAME`] || ""
    ).trim();

    const email = String(
        process.env[`${prefix}_EMAIL`] || ""
    )
        .trim()
        .toLowerCase();

    const password = String(
        process.env[`${prefix}_PASSWORD`] || ""
    );

    if (!firstName && !lastName && !email && !password) {
        return null;
    }

    return {
        label,
        FirstName: firstName,
        LastName: lastName,
        Email: email,
        Password: password
    };
}

function getConfiguredAdmins() {
    const administrators = [];

    const primaryAdmin = readAdminAccount(
        "",
        "Primary Admin"
    );

    if (primaryAdmin) {
        administrators.push(primaryAdmin);
    }

    const numberedIndexes = Object.keys(process.env)
        .map(key => {
            const match = key.match(
                /^KBD_ADMIN_(\d+)_(FIRST_NAME|LAST_NAME|EMAIL|PASSWORD)$/
            );

            return match
                ? Number(match[1])
                : null;
        })
        .filter(Number.isInteger);

    const uniqueIndexes = [
        ...new Set(numberedIndexes)
    ].sort((first, second) => first - second);

    uniqueIndexes.forEach(index => {
        const administrator = readAdminAccount(
            `_${index}`,
            `Admin ${index}`
        );

        if (administrator) {
            administrators.push(administrator);
        }
    });

    return administrators;
}

function validateAdministrators(administrators) {
    if (administrators.length === 0) {
        throw new Error(
            "No Admin credentials were found in the environment."
        );
    }

    const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const configuredEmails = new Set();

    administrators.forEach(administrator => {
        if (
            !administrator.FirstName ||
            !administrator.LastName ||
            !administrator.Email ||
            !administrator.Password
        ) {
            throw new Error(
                `${administrator.label} has incomplete credentials.`
            );
        }

        if (
            administrator.FirstName.length > 100 ||
            administrator.LastName.length > 100
        ) {
            throw new Error(
                `${administrator.label} has an invalid name.`
            );
        }

        if (
            administrator.Email.length > 254 ||
            !emailPattern.test(administrator.Email)
        ) {
            throw new Error(
                `${administrator.label} has an invalid email address.`
            );
        }

        if (administrator.Password.length < 12) {
            throw new Error(
                `${administrator.label} password must contain at least 12 characters.`
            );
        }

        if (administrator.Password.length > 128) {
            throw new Error(
                `${administrator.label} password is too long.`
            );
        }

        if (configuredEmails.has(administrator.Email)) {
            throw new Error(
                `The Admin email ${administrator.Email} is configured more than once.`
            );
        }

        configuredEmails.add(administrator.Email);
    });
}

async function createOrUpdateAdmin(administrator) {
    const existingUser = await databaseGet(
        `SELECT
            UserID,
            FirstName,
            LastName,
            Role,
            PasswordHash
         FROM Users
         WHERE LOWER(Email) = LOWER(?)`,
        [administrator.Email]
    );

    if (
        existingUser &&
        existingUser.Role !== "Admin"
    ) {
        throw new Error(
            `${administrator.Email} already belongs to a ${existingUser.Role} account. It was not promoted automatically.`
        );
    }

    if (existingUser && !syncExistingAdmins) {
        return {
            action: "already exists",
            UserID: existingUser.UserID
        };
    }

    if (existingUser) {
        const passwordMatches = await bcrypt.compare(
            administrator.Password,
            existingUser.PasswordHash
        );

        const namesMatch =
            existingUser.FirstName ===
                administrator.FirstName &&
            existingUser.LastName ===
                administrator.LastName;

        if (passwordMatches && namesMatch) {
            return {
                action: "already up to date",
                UserID: existingUser.UserID
            };
        }

        const passwordHash = passwordMatches
            ? existingUser.PasswordHash
            : await bcrypt.hash(
                administrator.Password,
                12
            );

        await databaseRun(
            `UPDATE Users
             SET FirstName = ?,
                 LastName = ?,
                 PasswordHash = ?,
                 Role = 'Admin',
                 OrganisationID = NULL
             WHERE UserID = ?`,
            [
                administrator.FirstName,
                administrator.LastName,
                passwordHash,
                existingUser.UserID
            ]
        );

        return {
            action: "updated",
            UserID: existingUser.UserID
        };
    }

    const passwordHash = await bcrypt.hash(
        administrator.Password,
        12
    );

    const result = await databaseRun(
        `INSERT INTO Users (
            FirstName,
            LastName,
            Email,
            PasswordHash,
            Role,
            OrganisationID
         )
         VALUES (?, ?, ?, ?, 'Admin', NULL)`,
        [
            administrator.FirstName,
            administrator.LastName,
            administrator.Email,
            passwordHash
        ]
    );

    return {
        action: "created",
        UserID: result.lastID
    };
}

async function createAdminAccounts() {
    let transactionStarted = false;

    try {
        const administrators =
            getConfiguredAdmins();

        validateAdministrators(administrators);

        await databaseRun(
            "BEGIN IMMEDIATE TRANSACTION"
        );

        transactionStarted = true;

        const results = [];

        for (const administrator of administrators) {
            const result = await createOrUpdateAdmin(
                administrator
            );

            results.push({
                Email: administrator.Email,
                ...result
            });
        }

        await databaseRun("COMMIT");
        transactionStarted = false;

        results.forEach(result => {
            console.log(
                `Admin account ${result.action}: ${result.Email}`
            );
        });

        console.log(
            `${results.length} Admin account(s) prepared successfully.`
        );
    } catch (error) {
        if (transactionStarted) {
            try {
                await databaseRun("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Admin-account rollback failed:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Unable to prepare Admin accounts:",
            error.message
        );

        process.exitCode = 1;
    } finally {
        closeDatabase();
    }
}

createAdminAccounts();
