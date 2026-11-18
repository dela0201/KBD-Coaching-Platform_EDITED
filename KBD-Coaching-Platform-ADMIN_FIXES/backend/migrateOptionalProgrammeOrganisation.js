const db = require("./database");

function closeDatabase() {
    db.close(error => {
        if (error) {
            console.error("Unable to close the database:", error.message);
            process.exitCode = 1;
        }
    });
}

function enableForeignKeysAndClose() {
    db.run("PRAGMA foreign_keys = ON", error => {
        if (error) {
            console.error("Unable to re-enable foreign keys:", error.message);
            process.exitCode = 1;
            closeDatabase();
            return;
        }

        db.all("PRAGMA foreign_key_check", [], (checkError, rows) => {
            if (checkError) {
                console.error("Unable to verify foreign keys:", checkError.message);
                process.exitCode = 1;
            } else if (rows.length) {
                console.error("Foreign-key problems were found:", rows);
                process.exitCode = 1;
            } else {
                console.log("Programme organisation migration completed successfully.");
            }

            closeDatabase();
        });
    });
}

function migrateProgrammes() {
    db.all("PRAGMA table_info(Programmes)", [], (error, columns) => {
        if (error) {
            console.error("Unable to inspect Programmes:", error.message);
            process.exitCode = 1;
            closeDatabase();
            return;
        }

        if (!columns.length) {
            console.error("Programmes table does not exist. Run npm run init-db first.");
            process.exitCode = 1;
            closeDatabase();
            return;
        }

        const organisationColumn = columns.find(
            column => column.name === "OrganisationID"
        );

        if (!organisationColumn) {
            console.error("Programmes.OrganisationID does not exist.");
            process.exitCode = 1;
            closeDatabase();
            return;
        }

        if (organisationColumn.notnull === 0) {
            console.log("Programmes.OrganisationID is already optional.");
            enableForeignKeysAndClose();
            return;
        }

        const migration = `
            PRAGMA foreign_keys = OFF;
            BEGIN IMMEDIATE TRANSACTION;

            CREATE TABLE Programmes_new (
                ProgrammeID INTEGER PRIMARY KEY AUTOINCREMENT,
                OrganisationID INTEGER,
                ProgrammeName TEXT NOT NULL,
                Description TEXT,
                StartDate DATE,
                EndDate DATE,
                Status TEXT NOT NULL DEFAULT 'Active' CHECK (
                    Status IN ('Draft', 'Active', 'Completed', 'Archived')
                ),
                CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CHECK (
                    StartDate IS NULL
                    OR EndDate IS NULL
                    OR EndDate >= StartDate
                ),
                FOREIGN KEY (OrganisationID)
                    REFERENCES Organisations(OrganisationID)
                    ON UPDATE CASCADE
                    ON DELETE SET NULL
            );

            INSERT INTO Programmes_new (
                ProgrammeID,
                OrganisationID,
                ProgrammeName,
                Description,
                StartDate,
                EndDate,
                Status,
                CreatedAt
            )
            SELECT
                ProgrammeID,
                OrganisationID,
                ProgrammeName,
                Description,
                StartDate,
                EndDate,
                Status,
                CreatedAt
            FROM Programmes;

            DROP TABLE Programmes;
            ALTER TABLE Programmes_new RENAME TO Programmes;

            CREATE INDEX IF NOT EXISTS idx_programmes_organisation
                ON Programmes (OrganisationID);

            COMMIT;
        `;

        db.exec(migration, migrationError => {
            if (migrationError) {
                console.error("Programme organisation migration failed:", migrationError.message);
                process.exitCode = 1;

                db.exec("ROLLBACK; PRAGMA foreign_keys = ON;", () => {
                    closeDatabase();
                });
                return;
            }

            enableForeignKeysAndClose();
        });
    });
}

migrateProgrammes();
