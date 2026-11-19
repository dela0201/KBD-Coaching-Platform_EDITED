const db = require("./database");

function all(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, parameters, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
}

function get(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, parameters, (error, row) => {
            if (error) reject(error);
            else resolve(row);
        });
    });
}

function exec(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function closeDatabase() {
    return new Promise(resolve => {
        db.close(error => {
            if (error) {
                console.error("Unable to close the database:", error.message);
                process.exitCode = 1;
            }
            resolve();
        });
    });
}

async function createProgrammeIndex() {
    await exec(`
        CREATE INDEX IF NOT EXISTS idx_uploaded_files_programme
        ON UploadedFiles (ProgrammeID);
    `);
}

async function migrateProgrammeFiles() {
    let transactionStarted = false;

    try {
        const uploadedFilesTable = await get(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'UploadedFiles'
        `);

        if (!uploadedFilesTable) {
            throw new Error(
                "UploadedFiles does not exist. Run npm run init-db before this migration."
            );
        }

        const unfinishedMigration = await get(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'UploadedFiles_ProgrammeMigration'
        `);

        if (unfinishedMigration) {
            throw new Error(
                "UploadedFiles_ProgrammeMigration already exists. Restore the database backup before retrying."
            );
        }

        const columns = await all("PRAGMA table_info(UploadedFiles)");
        const programmeColumnExists = columns.some(
            column => column.name === "ProgrammeID"
        );

        if (programmeColumnExists) {
            await createProgrammeIndex();
            console.log("UploadedFiles.ProgrammeID already exists.");
            console.log("Programme file migration is already complete.");
            return;
        }

        await exec("BEGIN IMMEDIATE TRANSACTION;");
        transactionStarted = true;

        await exec(`
            ALTER TABLE UploadedFiles
            RENAME TO UploadedFiles_ProgrammeMigration;

            CREATE TABLE UploadedFiles (
                UploadedFileID INTEGER PRIMARY KEY AUTOINCREMENT,
                ProgrammeID INTEGER,
                ActionID INTEGER,
                AssessmentID INTEGER,
                MaterialID INTEGER,
                UploadedBy INTEGER NOT NULL,
                OriginalFileName TEXT NOT NULL,
                StoredFileName TEXT NOT NULL,
                MimeType TEXT NOT NULL,
                FileSize INTEGER NOT NULL CHECK (FileSize > 0),
                StorageKey TEXT NOT NULL UNIQUE,
                CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ProgrammeID)
                    REFERENCES Programmes(ProgrammeID)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE,
                FOREIGN KEY (ActionID)
                    REFERENCES Actions(ActionID)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE,
                FOREIGN KEY (AssessmentID)
                    REFERENCES Assessments(AssessmentID)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE,
                FOREIGN KEY (MaterialID)
                    REFERENCES LearningMaterials(MaterialID)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE,
                FOREIGN KEY (UploadedBy)
                    REFERENCES Users(UserID)
                    ON UPDATE CASCADE
                    ON DELETE RESTRICT,
                CHECK (
                    (ProgrammeID IS NOT NULL) +
                    (ActionID IS NOT NULL) +
                    (AssessmentID IS NOT NULL) +
                    (MaterialID IS NOT NULL) = 1
                )
            );

            INSERT INTO UploadedFiles (
                UploadedFileID,
                ProgrammeID,
                ActionID,
                AssessmentID,
                MaterialID,
                UploadedBy,
                OriginalFileName,
                StoredFileName,
                MimeType,
                FileSize,
                StorageKey,
                CreatedAt
            )
            SELECT
                UploadedFileID,
                NULL,
                ActionID,
                AssessmentID,
                MaterialID,
                UploadedBy,
                OriginalFileName,
                StoredFileName,
                MimeType,
                FileSize,
                StorageKey,
                CreatedAt
            FROM UploadedFiles_ProgrammeMigration;

            DROP TABLE UploadedFiles_ProgrammeMigration;

            CREATE INDEX IF NOT EXISTS idx_uploaded_files_programme
            ON UploadedFiles (ProgrammeID);

            CREATE INDEX IF NOT EXISTS idx_uploaded_files_action
            ON UploadedFiles (ActionID);

            CREATE INDEX IF NOT EXISTS idx_uploaded_files_assessment
            ON UploadedFiles (AssessmentID);

            CREATE INDEX IF NOT EXISTS idx_uploaded_files_material
            ON UploadedFiles (MaterialID);

            CREATE INDEX IF NOT EXISTS idx_uploaded_files_uploader
            ON UploadedFiles (UploadedBy, CreatedAt);

            COMMIT;
        `);

        transactionStarted = false;

        const foreignKeyProblems = await all("PRAGMA foreign_key_check");
        if (foreignKeyProblems.length) {
            throw new Error(
                `Migration completed but foreign-key validation found ${foreignKeyProblems.length} problem(s).`
            );
        }

        const migratedColumns = await all("PRAGMA table_info(UploadedFiles)");
        if (!migratedColumns.some(column => column.name === "ProgrammeID")) {
            throw new Error("ProgrammeID was not created successfully.");
        }

        console.log("UploadedFiles.ProgrammeID added successfully.");
        console.log("Existing uploaded-file records were preserved.");
        console.log("Programme file migration completed successfully.");
    } catch (error) {
        if (transactionStarted) {
            try {
                await exec("ROLLBACK;");
            } catch (rollbackError) {
                console.error("Unable to roll back migration:", rollbackError.message);
            }
        }

        console.error("Programme file migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

migrateProgrammeFiles();
