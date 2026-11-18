const db =
    require("./database");


const migration = `
    CREATE TABLE IF NOT EXISTS CoachInvitations
    (
        InvitationID INTEGER PRIMARY KEY AUTOINCREMENT,

        Email TEXT NOT NULL COLLATE NOCASE,

        InvitationTokenHash TEXT NOT NULL UNIQUE,

        InvitedBy INTEGER NOT NULL,

        OrganisationID INTEGER,

        ExpiresAt DATETIME NOT NULL,

        AcceptedAt DATETIME,

        RevokedAt DATETIME,

        CreatedAt DATETIME NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (InvitedBy)
            REFERENCES Users(UserID),

        FOREIGN KEY (OrganisationID)
            REFERENCES Organisations(
                OrganisationID
            )
    );


    CREATE INDEX IF NOT EXISTS
        idx_coach_invitations_email

    ON CoachInvitations
        (
            Email,
            ExpiresAt
        );


    CREATE INDEX IF NOT EXISTS
        idx_coach_invitations_status

    ON CoachInvitations
        (
            AcceptedAt,
            RevokedAt
        );
`;


db.exec(
    migration,
    error => {

        if (error) {

            console.error(
                "Coach invitation migration failed:",
                error.message
            );


            process.exitCode = 1;

        } else {

            console.log(
                "Coach invitation table created successfully."
            );

        }


        db.close(
            closeError => {

                if (closeError) {

                    console.error(
                        "Unable to close the database:",
                        closeError.message
                    );


                    process.exitCode = 1;

                }

            }
        );

    }
);
