const fs =
    require("fs");

const path =
    require("path");

const db =
    require("./database");


const seedPath =
    path.join(
        __dirname,
        "../database/seed.sql"
    );


function closeDatabase() {

    db.close(error => {

        if (error) {

            console.error(
                "Error closing database:",
                error.message
            );

            process.exitCode = 1;

        }

    });

}


function fail(message, error) {

    console.error(
        message,
        error
            ? error.message
            : ""
    );


    process.exitCode = 1;

    closeDatabase();

}


function loadSeedFile() {

    try {

        if (!fs.existsSync(seedPath)) {

            throw new Error(
                `Seed file not found: ${seedPath}`
            );

        }


        const seed =
            fs.readFileSync(
                seedPath,
                "utf8"
            );


        if (!seed.trim()) {

            throw new Error(
                "The seed file is empty."
            );

        }


        return seed;

    }

    catch (error) {

        fail(
            "Unable to read seed file:",
            error
        );

        return null;

    }

}


function seedDatabase() {

    const seed =
        loadSeedFile();


    if (!seed) {

        return;

    }


    db.get(
        `
            SELECT COUNT(*) AS UserCount

            FROM Users
        `,
        [],
        (checkError, result) => {

            if (checkError) {

                fail(
                    "Unable to check existing database data:",
                    checkError
                );

                return;

            }


            if (
                result &&
                result.UserCount > 0
            ) {

                console.error(
                    "Seed cancelled: the database already contains users."
                );


                console.error(
                    "The seed script should only run against a new, empty database."
                );


                process.exitCode = 1;

                closeDatabase();

                return;

            }


            startSeedTransaction(seed);

        }
    );

}


function startSeedTransaction(seed) {

    db.exec(
        "BEGIN TRANSACTION;",
        beginError => {

            if (beginError) {

                fail(
                    "Error starting seed transaction:",
                    beginError
                );

                return;

            }


            db.exec(
                seed,
                seedError => {

                    if (seedError) {

                        console.error(
                            "Error inserting seed data:",
                            seedError.message
                        );


                        process.exitCode = 1;


                        db.exec(
                            "ROLLBACK;",
                            rollbackError => {

                                if (rollbackError) {

                                    console.error(
                                        "Error rolling back seed transaction:",
                                        rollbackError.message
                                    );

                                }


                                closeDatabase();

                            }
                        );

                        return;

                    }


                    commitSeedTransaction();

                }
            );

        }
    );

}


function commitSeedTransaction() {

    db.exec(
        "COMMIT;",
        commitError => {

            if (commitError) {

                console.error(
                    "Error committing seed data:",
                    commitError.message
                );


                process.exitCode = 1;


                db.exec(
                    "ROLLBACK;",
                    rollbackError => {

                        if (rollbackError) {

                            console.error(
                                "Error rolling back failed seed transaction:",
                                rollbackError.message
                            );

                        }


                        closeDatabase();

                    }
                );

                return;

            }


            console.log(
                "KBD test data inserted successfully!"
            );


            closeDatabase();

        }
    );

}


seedDatabase();
