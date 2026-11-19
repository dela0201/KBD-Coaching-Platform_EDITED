require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./database");

const coach = {
    FirstName: "Dela",
    LastName: "Abotsi",
    Email: "dela@kbd.test",
    Role: "Coach"
};

function getExistingUser(email) {
    return new Promise((resolve, reject) => {
        db.get(
            `
                SELECT UserID, Role
                FROM Users
                WHERE LOWER(Email) = LOWER(?)
            `,
            [email],
            (error, user) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(user);
            }
        );
    });
}

function insertCoach(passwordHash) {
    return new Promise((resolve, reject) => {
        db.run(
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
                VALUES (?, ?, ?, ?, ?, NULL)
            `,
            [
                coach.FirstName,
                coach.LastName,
                coach.Email,
                passwordHash,
                coach.Role
            ],
            function (error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(this.lastID);
            }
        );
    });
}

function updateCoach(userID, passwordHash) {
    return new Promise((resolve, reject) => {
        db.run(
            `
                UPDATE Users
                SET
                    FirstName = ?,
                    LastName = ?,
                    Email = ?,
                    PasswordHash = ?,
                    Role = ?,
                    OrganisationID = NULL
                WHERE UserID = ?
                  AND Role = 'Coach'
            `,
            [
                coach.FirstName,
                coach.LastName,
                coach.Email,
                passwordHash,
                coach.Role,
                userID
            ],
            function (error) {
                if (error) {
                    reject(error);
                    return;
                }

                if (this.changes !== 1) {
                    reject(
                        new Error(
                            "Coach account could not be updated."
                        )
                    );
                    return;
                }

                resolve();
            }
        );
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

async function createInitialCoach() {
    const password =
        process.env.KBD_INITIAL_PASSWORD;

    if (!password || password.length < 8) {
        throw new Error(
            "KBD_INITIAL_PASSWORD must contain at least 8 characters."
        );
    }

    const normalisedEmail =
        coach.Email.trim().toLowerCase();

    coach.Email = normalisedEmail;

    const existingUser =
        await getExistingUser(normalisedEmail);

    if (
        existingUser &&
        existingUser.Role !== coach.Role
    ) {
        throw new Error(
            `The email ${normalisedEmail} already belongs to a ${existingUser.Role} account.`
        );
    }

    const passwordHash =
        await bcrypt.hash(password, 12);

    if (existingUser) {
        await updateCoach(
            existingUser.UserID,
            passwordHash
        );

        console.log(
            "Existing Dela Coach account updated successfully."
        );
    } else {
        const userID =
            await insertCoach(passwordHash);

        console.log(
            "Dela Coach account created successfully."
        );
        console.log(`User ID: ${userID}`);
    }

    console.log(`Login email: ${normalisedEmail}`);
}

async function main() {
    try {
        await createInitialCoach();
    } catch (error) {
        console.error(
            "Unable to create Coach account:",
            error.message
        );
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

main();
