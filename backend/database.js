const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const defaultDatabasePath = path.join(
    __dirname,
    "../database/kbd.db"
);

const configuredDatabasePath = String(
    process.env.KBD_DATABASE_PATH || ""
).trim();

const dbPath = configuredDatabasePath
    ? path.resolve(configuredDatabasePath)
    : defaultDatabasePath;

fs.mkdirSync(
    path.dirname(dbPath),
    {
        recursive: true
    }
);

console.log(
    `Using KBD database: ${dbPath}`
);

const db = new sqlite3.Database(
    dbPath,
    error => {
        if (error) {
            console.error(
                "Error connecting to the KBD database:",
                error.message
            );

            process.exitCode = 1;
            return;
        }

        console.log(
            "Connected to the KBD SQLite database!"
        );
    }
);

db.configure("busyTimeout", 5000);

db.serialize(() => {
    db.run(
        "PRAGMA foreign_keys = ON",
        error => {
            if (error) {
                console.error(
                    "Error enabling foreign keys:",
                    error.message
                );

                process.exitCode = 1;
                return;
            }

            console.log(
                "SQLite foreign keys enabled!"
            );
        }
    );

    db.get(
        "PRAGMA foreign_keys",
        [],
        (error, result) => {
            if (error) {
                console.error(
                    "Error verifying foreign keys:",
                    error.message
                );

                process.exitCode = 1;
                return;
            }

            if (
                !result ||
                result.foreign_keys !== 1
            ) {
                console.error(
                    "SQLite foreign keys could not be enabled."
                );

                process.exitCode = 1;
                return;
            }

            console.log(
                "SQLite foreign-key setting verified!"
            );
        }
    );
});

module.exports = db;
