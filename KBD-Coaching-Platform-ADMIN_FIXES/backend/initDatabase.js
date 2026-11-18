const fs =
    require("fs");

const path =
    require("path");

const db =
    require("./database");


const schemaPath =
    path.join(
        __dirname,
        "../database/schema.sql"
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


function initialiseDatabase() {

    let schema;


    try {

        if (!fs.existsSync(schemaPath)) {

            throw new Error(
                `Schema file not found: ${schemaPath}`
            );

        }


        schema =
            fs.readFileSync(
                schemaPath,
                "utf8"
            );


        if (!schema.trim()) {

            throw new Error(
                "The database schema file is empty."
            );

        }

    }

    catch (error) {

        console.error(
            "Unable to read database schema:",
            error.message
        );


        process.exitCode = 1;

        closeDatabase();

        return;

    }


    db.exec(
        "BEGIN TRANSACTION;",
        beginError => {

            if (beginError) {

                console.error(
                    "Error starting schema transaction:",
                    beginError.message
                );


                process.exitCode = 1;

                closeDatabase();

                return;

            }


            db.exec(
                schema,
                schemaError => {

                    if (schemaError) {

                        console.error(
                            "Error creating database tables:",
                            schemaError.message
                        );


                        process.exitCode = 1;


                        db.exec(
                            "ROLLBACK;",
                            rollbackError => {

                                if (rollbackError) {

                                    console.error(
                                        "Error rolling back schema transaction:",
                                        rollbackError.message
                                    );

                                }


                                closeDatabase();

                            }
                        );

                        return;

                    }


                    db.exec(
                        "COMMIT;",
                        commitError => {

                            if (commitError) {

                                console.error(
                                    "Error committing schema transaction:",
                                    commitError.message
                                );


                                process.exitCode = 1;


                                db.exec(
                                    "ROLLBACK;",
                                    () => {

                                        closeDatabase();

                                    }
                                );

                                return;

                            }


                            console.log(
                                "Database tables created successfully!"
                            );


                            closeDatabase();

                        }
                    );

                }
            );

        }
    );

}


initialiseDatabase();
