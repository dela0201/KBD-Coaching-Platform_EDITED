const fs =
    require("fs");

const path =
    require("path");

const db =
    require("./database");


const backupDirectory =
    path.join(
        __dirname,
        "../database/backups"
    );


fs.mkdirSync(
    backupDirectory,
    {
        recursive:
            true
    }
);


const timestamp =
    new Date()
        .toISOString()
        .replaceAll(":", "-")
        .replaceAll(".", "-");


const backupPath =
    path.join(
        backupDirectory,
        `kbd-backup-${timestamp}.db`
    );


let backupStepError =
    null;


function closeDatabase() {

    db.close(error => {

        if (error) {

            console.error(
                "Unable to close the database:",
                error.message
            );


            process.exitCode = 1;

            return;

        }


        console.log(
            "Database connection closed successfully."
        );

    });

}


console.log(
    "Creating KBD database backup..."
);


const backup =
    db.backup(
        backupPath
    );


backup.step(
    -1,
    error => {

        if (error) {

            backupStepError =
                error;

        }

    }
);


backup.finish(
    error => {

        const backupError =
            error ||
            backupStepError;


        if (backupError) {

            console.error(
                "Unable to create database backup:",
                backupError.message
            );


            process.exitCode = 1;

        } else {

            console.log(
                "Database backup created successfully:"
            );


            console.log(
                backupPath
            );

        }


        closeDatabase();

    }
);
