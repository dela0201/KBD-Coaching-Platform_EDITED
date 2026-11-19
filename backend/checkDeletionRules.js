const db = require("./database");

const tables = [
    "ProgrammeParticipants",
    "ProgrammeCoaches",
    "Sessions",
    "SessionNotes",
    "Actions",
    "Assessments",
    "AssessmentResponses",
    "LearningMaterials",
    "Progress",
    "UploadedFiles"
];

function databaseAll(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.all(
            sql,
            parameters,
            (error, rows) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(rows);
            }
        );
    });
}

async function checkDeletionRules() {
    try {
        const results = [];

        for (const table of tables) {
            const foreignKeys =
                await databaseAll(
                    `PRAGMA foreign_key_list(${table})`
                );

            for (const foreignKey of foreignKeys) {
                results.push({
                    Table: table,
                    Column: foreignKey.from,
                    ReferencesTable: foreignKey.table,
                    ReferencesColumn: foreignKey.to,
                    OnUpdate: foreignKey.on_update,
                    OnDelete: foreignKey.on_delete
                });
            }
        }

        console.log(
            "\nKBD foreign-key deletion rules:\n"
        );

        console.table(results);

        const violations =
            await databaseAll(
                "PRAGMA foreign_key_check"
            );

        if (violations.length) {
            console.error(
                "\nForeign-key violations found:\n"
            );

            console.table(violations);
            process.exitCode = 1;
        } else {
            console.log(
                "\nNo foreign-key violations found."
            );
        }
    } catch (error) {
        console.error(
            "Unable to check deletion rules:",
            error.message
        );

        process.exitCode = 1;
    } finally {
        db.close(error => {
            if (error) {
                console.error(
                    "Unable to close database:",
                    error.message
                );

                process.exitCode = 1;
            }
        });
    }
}

checkDeletionRules();
