require("dotenv").config();

const multer = require("multer");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./database");

const SQLiteStore = require("connect-sqlite3")(session);

const configuredDatabasePath = String(
    process.env.KBD_DATABASE_PATH || ""
).trim();

const databaseDirectory = process.env.KBD_DATABASE_DIR
    ? path.resolve(process.env.KBD_DATABASE_DIR)
    : configuredDatabasePath
        ? path.dirname(path.resolve(configuredDatabasePath))
        : path.join(__dirname, "../database");


const sessionStore =
    new SQLiteStore({

        db:
            "kbd-sessions.db",

        dir:
            databaseDirectory,

        table:
            "UserSessions",

        createDirIfNotExists:
            true,

        concurrentDB:
            true

    });

const app = express();
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}
const PORT = Number(process.env.PORT) || 5000;
const CURRENT_TERMS_VERSION =
    "2026-11-03";
const frontendPath = path.join(__dirname, "../frontend");

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        error:
            "Too many unsuccessful login attempts. Please wait 15 minutes and try again."
    }
});

const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        error:
            "Too many registration attempts. Please wait before trying again."
    }
});

const coachInvitationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        error:
            "Too many Coach activation attempts. Please wait 15 minutes and try again."
    }
});

const defaultUploadDirectory = path.join(
    __dirname,
    "../uploads"
);

const configuredUploadDirectory = String(
    process.env.KBD_UPLOAD_DIRECTORY || ""
).trim();

const uploadDirectory =
    configuredUploadDirectory
        ? path.resolve(
            configuredUploadDirectory
        )
        : defaultUploadDirectory;

fs.mkdirSync(
    uploadDirectory,
    {
        recursive: true
    }
);

console.log(
    `Using upload directory: ${uploadDirectory}`
);

fs.mkdirSync(uploadDirectory, { recursive: true });

const permittedUploads = new Map([
    [".pdf", ["application/pdf"]],
    [".doc", ["application/msword"]],
    [
        ".docx",
        ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    ],
    [".xls", ["application/vnd.ms-excel"]],
    [
        ".xlsx",
        ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
    ],
    [".jpg", ["image/jpeg"]],
    [".jpeg", ["image/jpeg"]],
    [".png", ["image/png"]],
    [".webp", ["image/webp"]]
]);

const uploadStorage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
    },

    filename: (req, file, callback) => {
        const extension =
            path.extname(file.originalname).toLowerCase();

        callback(
            null,
            `${crypto.randomUUID()}${extension}`
        );
    }
});

const secureFileUpload = multer({
    storage: uploadStorage,

    limits: {
        files: 1,
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, callback) => {
        const extension =
            path.extname(file.originalname).toLowerCase();

        const permittedMimeTypes =
            permittedUploads.get(extension);

        if (
            !permittedMimeTypes ||
            !permittedMimeTypes.includes(file.mimetype)
        ) {
            return callback(
                new Error(
                    "Only PDF, Word, Excel and supported image files are allowed."
                )
            );
        }

        callback(null, true);
    }
});

const passwordRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        error:
            "Too many password requests. Please wait before trying again."
    }
});


if (!process.env.SESSION_SECRET) {
    console.error("SESSION_SECRET is required.");
    process.exit(1);
}

app.disable("x-powered-by");
app.use(
    helmet({

        contentSecurityPolicy: {

            directives: {

                defaultSrc: [
                    "'self'"
                ],

                scriptSrc: [
                    "'self'"
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'"
                ],

                imgSrc: [
                    "'self'",
                    "data:"
                ],

                connectSrc: [
                    "'self'"
                ],

                fontSrc: [
                    "'self'"
                ],

                objectSrc: [
                    "'none'"
                ],

                baseUri: [
                    "'self'"
                ],

                formAction: [
                    "'self'"
                ],

                frameAncestors: [
                    "'none'"
                ]

            }

        },

        strictTransportSecurity:
            process.env.NODE_ENV ===
            "production"
                ? undefined
                : false

    })
);
const allowedOrigins = new Set(
    String(process.env.KBD_ALLOWED_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
);

if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:5000");
    allowedOrigins.add("http://127.0.0.1:5000");
    allowedOrigins.add("http://localhost:5500");
    allowedOrigins.add("http://127.0.0.1:5500");
}

const renderExternalHostname = String(
    process.env.RENDER_EXTERNAL_HOSTNAME || ""
).trim();

if (renderExternalHostname) {
    allowedOrigins.add(`https://${renderExternalHostname}`);
}

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        const error = new Error("Origin not allowed.");
        error.code = "CORS_ORIGIN_DENIED";
        callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"]
}));

app.use((error, req, res, next) => {
    if (error.code === "CORS_ORIGIN_DENIED") {
        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
        return res.status(403).json({
            error: "This website is not permitted to access the KBD API."
        });
    }

    next(error);
});

app.use(express.json({ limit: "100kb" }));
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
        return res.status(400).json({ error: "The request contains invalid JSON." });
    }
    next(error);
});
app.use(
    session({

        name:
            "kbd.sid",

        store:
            sessionStore,

        secret:
            process.env.SESSION_SECRET,

        resave:
            false,

        saveUninitialized:
            false,

        rolling:
            true,

        cookie: {

            httpOnly:
                true,

            sameSite:
                "lax",

            secure:
                process.env.NODE_ENV ===
                "production",

            maxAge:
                1000 * 60 * 60 * 8

        }

    })
);

const stateChangingMethods = new Set([
    "POST",
    "PUT",
    "PATCH",
    "DELETE"
]);

app.use((req, res, next) => {
    if (!stateChangingMethods.has(req.method)) {
        return next();
    }

    const origin = req.get("Origin");
    const fetchSite = req.get("Sec-Fetch-Site");

    if (origin && !allowedOrigins.has(origin)) {
        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
        return res.status(403).json({
            error: "Cross-site request blocked."
        });
    }

    if (fetchSite === "cross-site") {
        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
        return res.status(403).json({
            error: "Cross-site request blocked."
        });
    }

    next();
});

app.use(express.static(frontendPath));

function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

function getAuditUserID(req) {
    const userID = Number(
        req.session?.user?.UserID
    );

    return (
        Number.isInteger(userID) &&
        userID > 0
    )
        ? userID
        : null;
}

async function requireAuthentication(
    req,
    res,
    next
) {
    const userID = getAuditUserID(req);

    if (!userID) {
        return res.status(401).json({
            error:
                "Authentication is required.",
            code:
                "AUTHENTICATION_REQUIRED"
        });
    }

    try {
        const account = await databaseGet(
            `SELECT
                UserID,
                AccountStatus
             FROM Users
             WHERE UserID = ?`,
            [userID]
        );

        if (!account) {
            req.session.destroy(() => {});

            return res.status(401).json({
                error:
                    "The user account no longer exists.",
                code:
                    "AUTHENTICATION_REQUIRED"
            });
        }

        if (
            account.AccountStatus !==
            "Active"
        ) {
            writeAuditLog(
                req,
                "ACCOUNT_ACCESS",
                "User",
                userID,
                "Denied"
            );

            req.session.destroy(() => {});

            return res.status(403).json({
                error:
                    "This account is not currently active.",
                code:
                    "ACCOUNT_INACTIVE"
            });
        }

        next();
    } catch (error) {
        console.error(
            "Unable to verify user account:",
            error.message
        );

        res.status(500).json({
            error:
                "The user account could not be verified."
        });
    }
}

async function requireCurrentTermsAcceptance(
    req,
    res,
    next
) {
    const userID = getAuditUserID(req);

    if (!userID) {
        return res.status(401).json({
            error:
                "Authentication is required.",
            code:
                "AUTHENTICATION_REQUIRED"
        });
    }

    try {
        const acceptance = await databaseGet(
            `SELECT AcceptanceID
             FROM TermsAcceptances
             WHERE UserID = ?
               AND TermsVersion = ?
             LIMIT 1`,
            [
                userID,
                CURRENT_TERMS_VERSION
            ]
        );

        if (!acceptance) {
            writeAuditLog(
                req,
                "TERMS_ACCESS_DENIED",
                "User",
                userID,
                "Denied"
            );

            return res.status(403).json({
                error:
                    "You must accept the current Terms and Conditions.",
                code:
                    "TERMS_ACCEPTANCE_REQUIRED",
                TermsVersion:
                    CURRENT_TERMS_VERSION
            });
        }

        next();
    } catch (error) {
        console.error(
            "Unable to verify Terms acceptance:",
            error.message
        );

        res.status(500).json({
            error:
                "Terms acceptance could not be verified."
        });
    }
}

function requireCompletedPasswordChange(
    req,
    res,
    next
) {

    if (
        req.session.user
            ?.UsingTemporaryPassword
    ) {

        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
        return res.status(403).json({

            error:
                "You must create a permanent password before continuing.",

            code:
                "PASSWORD_CHANGE_REQUIRED"

        });

    }


    next();

}

function databaseGet(
    sql,
    parameters = []
) {

    return new Promise(
        (resolve, reject) => {

            db.get(
                sql,
                parameters,
                (error, row) => {

                    if (error) {

                        reject(error);

                    } else {

                        resolve(row);

                    }

                }
            );

        }
    );

}


function databaseRun(
    sql,
    parameters = []
) {

    return new Promise(
        (resolve, reject) => {

            db.run(
                sql,
                parameters,
                function (error) {

                    if (error) {

                        reject(error);

                    } else {

                        resolve({
                            lastID:
                                this.lastID,

                            changes:
                                this.changes
                        });

                    }

                }
            );

        }
    );

}

function databaseAll(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, parameters, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

// ========================================
// AUTO-ENROL PARTICIPANTS IN ACTIVE PROGRAMMES
// ========================================
// Every Active programme is visible to every active participant.
// Participants are enrolled in ProgrammeParticipants so that the
// existing access checks (sessions, materials, progress, coach access)
// keep working. Organisation rule matches assignParticipant: a
// participant linked to an organisation only joins that organisation's
// programmes. INSERT OR IGNORE never re-adds a Withdrawn enrolment.

async function enrolParticipantsInActiveProgrammes({
    userID = null,
    programmeID = null
} = {}) {
    const filters = [userID, userID, programmeID, programmeID];

    await databaseRun(
        `INSERT OR IGNORE INTO ProgrammeParticipants
            (ProgrammeID, UserID, Status)
         SELECT P.ProgrammeID, U.UserID, 'Active'
         FROM Programmes P
         INNER JOIN Users U
            ON U.Role = 'Participant'
           AND U.AccountStatus = 'Active'
           AND (U.OrganisationID IS NULL
                OR U.OrganisationID = P.OrganisationID)
         WHERE P.Status = 'Active'
           AND (? IS NULL OR U.UserID = ?)
           AND (? IS NULL OR P.ProgrammeID = ?)`,
        filters
    );

    await databaseRun(
        `INSERT OR IGNORE INTO Progress
            (ProgrammeID, UserID, ProgressPercentage, Status)
         SELECT PP.ProgrammeID, PP.UserID, 0, 'Not Started'
         FROM ProgrammeParticipants PP
         INNER JOIN Programmes P
            ON P.ProgrammeID = PP.ProgrammeID
         WHERE PP.Status = 'Active'
           AND P.Status = 'Active'
           AND (? IS NULL OR PP.UserID = ?)
           AND (? IS NULL OR PP.ProgrammeID = ?)`,
        filters
    );
}

async function tryEnrolParticipants(options) {
    try {
        await enrolParticipantsInActiveProgrammes(options);
    } catch (error) {
        console.error(
            "Unable to auto-enrol participants:",
            error.message
        );
    }
}

// ========================================
// ACCESS-CONTROL HELPERS
// ========================================

function sendForbidden(req, res) {
    writeAuditLog(
        req,
        "ACCESS_DENIED",
        null,
        null,
        "Denied"
    );

    return res.status(403).json({
        error:
            "You do not have permission to access this resource."
    });
}


async function coachCanAccessProgramme(
    coachID,
    programmeID
) {

    const assignment =
        await databaseGet(
            `
                SELECT
                    ProgrammeCoachID

                FROM ProgrammeCoaches

                WHERE
                    UserID = ?

                    AND ProgrammeID = ?

                    AND Status = 'Active'

                LIMIT 1
            `,
            [
                coachID,
                programmeID
            ]
        );


    return Boolean(assignment);

}


async function coachCanAccessParticipant(
    coachID,
    participantID
) {

    const assignment =
        await databaseGet(
            `
                SELECT
                    PC.ProgrammeCoachID

                FROM ProgrammeCoaches PC

                INNER JOIN ProgrammeParticipants PP
                    ON PP.ProgrammeID =
                       PC.ProgrammeID

                INNER JOIN Users Participant
                    ON Participant.UserID =
                       PP.UserID

                WHERE
                    PC.UserID = ?

                    AND PP.UserID = ?

                    AND PC.Status = 'Active'

                    AND PP.Status IN
                    (
                        'Active',
                        'Completed'
                    )

                    AND Participant.Role =
                        'Participant'

                LIMIT 1
            `,
            [
                coachID,
                participantID
            ]
        );


    return Boolean(assignment);

}

async function coachCanManageParticipantInProgramme(
    coachID,
    participantID,
    programmeID
) {

    const assignment =
        await databaseGet(
            `
                SELECT
                    PC.ProgrammeCoachID

                FROM ProgrammeCoaches PC

                INNER JOIN ProgrammeParticipants PP
                    ON PP.ProgrammeID =
                       PC.ProgrammeID

                WHERE
                    PC.ProgrammeID = ?

                    AND PC.UserID = ?

                    AND PP.UserID = ?

                    AND PC.Status =
                        'Active'

                    AND PP.Status IN
                    (
                        'Active',
                        'Completed'
                    )

                LIMIT 1
            `,
            [
                programmeID,
                coachID,
                participantID
            ]
        );


    return Boolean(assignment);

}

async function corporateCanAccessParticipant(
    organisationID,
    participantID
) {

    const participant =
        await databaseGet(
            `
                SELECT
                    PP.ProgrammeParticipantID

                FROM ProgrammeParticipants PP

                INNER JOIN Programmes P
                    ON P.ProgrammeID =
                       PP.ProgrammeID

                INNER JOIN Users Participant
                    ON Participant.UserID =
                       PP.UserID

                WHERE
                    P.OrganisationID = ?

                    AND PP.UserID = ?

                    AND PP.Status IN
                    (
                        'Active',
                        'Completed'
                    )

                    AND Participant.Role =
                        'Participant'

                LIMIT 1
            `,
            [
                organisationID,
                participantID
            ]
        );


    return Boolean(participant);

}

function generateTemporaryPassword() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ" +
        "abcdefghijkmnopqrstuvwxyz" +
        "23456789";


    let password =
        "KBD-";


    for (
        let index = 0;
        index < 14;
        index += 1
    ) {

        password +=
            characters[
                crypto.randomInt(
                    0,
                    characters.length
                )
            ];

    }


    return password;

}

function generateCoachInvitationToken() {

    return crypto
        .randomBytes(32)
        .toString("base64url");

}


function hashCoachInvitationToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}

// ========================================
// PASSWORD RECOVERY MANAGEMENT
// ========================================

// View pending Participant requests
app.get(
    "/api/password-recovery/requests",
    requireRoles("Admin", "Coach"),
    async (req, res, next) => {
        const currentUser = req.session.user;

        try {
            let accessCondition = "";
            const parameters = [];

            if (currentUser.Role === "Coach") {
                accessCondition = `
                    AND EXISTS (
                        SELECT 1
                        FROM ProgrammeParticipants PP
                        INNER JOIN ProgrammeCoaches PC
                            ON PC.ProgrammeID =
                               PP.ProgrammeID
                        WHERE PP.UserID =
                              Recovery.UserID
                          AND PP.Status IN (
                              'Active',
                              'Completed'
                          )
                          AND PC.UserID = ?
                          AND PC.Status = 'Active'
                    )
                `;

                parameters.push(
                    currentUser.UserID
                );
            }

            const requests = await databaseAll(
                `
                    SELECT
                        Recovery.RequestID,
                        Recovery.UserID,
                        Recovery.Status,
                        Recovery.RequestedAt,
                        Users.FirstName,
                        Users.LastName,
                        Users.Email

                    FROM PasswordRecoveryRequests
                        AS Recovery

                    INNER JOIN Users
                        ON Users.UserID =
                           Recovery.UserID

                    WHERE Recovery.Status =
                          'Pending'

                      AND Users.Role =
                          'Participant'

                      ${accessCondition}

                    ORDER BY
                        Recovery.RequestedAt ASC
                `,
                parameters
            );

            res.json(requests);
        } catch (error) {
            next(error);
        }
    }
);

async function canAccessActionFiles(user, action, manage = false) {
    if (user.Role === "Admin") return true;
    if (user.Role === "Coach") {
        return coachCanManageParticipantInProgramme(
            user.UserID,
            action.AssignedTo,
            action.ProgrammeID
        );
    }
    return !manage && user.Role === "Participant" &&
        Number(action.AssignedTo) === Number(user.UserID);
}


async function authoriseActionFileUpload(req, res, next) {
    try {
        const actionID = positiveInteger(req.params.id);

        if (!actionID) {
            return res.status(400).json({
                error: "Invalid action ID."
            });
        }

        const action = await databaseGet(
            `SELECT ActionID, ProgrammeID, AssignedTo
             FROM Actions
             WHERE ActionID = ?`,
            [actionID]
        );

        if (!action) {
            return res.status(404).json({
                error: "Action not found."
            });
        }

        const user = req.session.user;

        if (user.Role === "Admin") {
            req.authorisedAction = action;
            return next();
        }

        if (
            user.Role === "Coach" &&
            await coachCanManageParticipantInProgramme(
                user.UserID,
                action.AssignedTo,
                action.ProgrammeID
            )
        ) {
            req.authorisedAction = action;
            return next();
        }

        writeAuditLog(
            req,
            "ACTION_FILE_UPLOAD",
            "Action",
            actionID,
            "Denied"
        );

        res.status(403).json({
            error: "You cannot upload files to this action."
        });
    } catch (error) {
        next(error);
    }
}

app.post(
    "/api/materials/:id/files",
    requireRoles("Admin", "Coach"),
    authoriseMaterialFileUpload,
    secureFileUpload.single("File"),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                error: "Select a file to upload."
            });
        }

        try {
            const result = await databaseRun(
                `INSERT INTO UploadedFiles (
                    MaterialID,
                    UploadedBy,
                    OriginalFileName,
                    StoredFileName,
                    MimeType,
                    FileSize,
                    StorageKey
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.authorisedMaterial.MaterialID,
                    req.session.user.UserID,
                    req.file.originalname,
                    req.file.filename,
                    req.file.mimetype,
                    req.file.size,
                    req.file.filename
                ]
            );

            writeAuditLog(
                req,
                "MATERIAL_FILE_UPLOADED",
                "UploadedFile",
                result.lastID,
                "Success"
            );

            res.status(201).json({
                message: "Learning material file uploaded successfully.",
                file: {
                    UploadedFileID: result.lastID,
                    MaterialID: req.authorisedMaterial.MaterialID,
                    OriginalFileName: req.file.originalname,
                    MimeType: req.file.mimetype,
                    FileSize: req.file.size
                }
            });
        } catch (error) {
            try {
                await fs.promises.unlink(req.file.path);
            } catch (deleteError) {
                if (deleteError.code !== "ENOENT") {
                    console.error(
                        "Unable to remove failed material upload:",
                        deleteError
                    );
                }
            }

            console.error(
                "Learning material file upload failed:",
                error
            );

            res.status(500).json({
                error: "The learning material file could not be saved."
            });
        }
    }
);

app.delete(
    "/api/programmes/:id",
    requireRoles("Admin"),
    async (req, res, next) => {
        try {
            const programmeID = positiveInteger(req.params.id);

            if (!programmeID) {
                return res.status(400).json({
                    error: "Invalid Programme ID."
                });
            }

            const programme = await databaseGet(
                `SELECT ProgrammeID, ProgrammeName
                 FROM Programmes
                 WHERE ProgrammeID = ?`,
                [programmeID]
            );

            if (!programme) {
                return res.status(404).json({
                    error: "Programme not found."
                });
            }

            const files = await databaseAll(
                `SELECT DISTINCT StoredFileName
                 FROM UploadedFiles
                 WHERE ProgrammeID = ?
                    OR ActionID IN (
                        SELECT ActionID
                        FROM Actions
                        WHERE ProgrammeID = ?
                    )
                    OR AssessmentID IN (
                        SELECT AssessmentID
                        FROM Assessments
                        WHERE ProgrammeID = ?
                    )
                    OR MaterialID IN (
                        SELECT MaterialID
                        FROM LearningMaterials
                        WHERE ProgrammeID = ?
                    )`,
                [
                    programmeID,
                    programmeID,
                    programmeID,
                    programmeID
                ]
            );

            const result = await databaseRun(
                `DELETE FROM Programmes
                 WHERE ProgrammeID = ?`,
                [programmeID]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error: "Programme not found."
                });
            }

            for (const file of files) {
                try {
                    await fs.promises.unlink(
                        path.join(
                            uploadDirectory,
                            file.StoredFileName
                        )
                    );
                } catch (deleteError) {
                    if (deleteError.code !== "ENOENT") {
                        console.error(
                            "Unable to remove Programme file:",
                            deleteError
                        );
                    }
                }
            }

            writeAuditLog(
                req,
                "PROGRAMME_DELETED",
                "Programme",
                programmeID,
                "Success"
            );

            res.json({
                message: "Programme deleted successfully."
            });
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT") {
                return res.status(409).json({
                    error:
                        "The Programme could not be deleted because related records are not configured for automatic deletion."
                });
            }

            next(error);
        }
    }
);

app.delete(
    "/api/materials/:id",
    requireRoles("Admin", "Coach"),
    async (req, res, next) => {
        try {
            const materialID = positiveInteger(req.params.id);
            const user = req.session.user;

            if (!materialID) {
                return res.status(400).json({
                    error: "Invalid Learning Material ID."
                });
            }

            const material = await databaseGet(
                `SELECT MaterialID, ProgrammeID, Title
                 FROM LearningMaterials
                 WHERE MaterialID = ?`,
                [materialID]
            );

            if (!material) {
                return res.status(404).json({
                    error: "Learning Material not found."
                });
            }

            if (user.Role === "Coach") {
                const assignment = await databaseGet(
                    `SELECT ProgrammeCoachID
                     FROM ProgrammeCoaches
                     WHERE ProgrammeID = ?
                       AND UserID = ?
                       AND Status = 'Active'`,
                    [material.ProgrammeID, user.UserID]
                );

                if (!assignment) {
                    return res.status(403).json({
                        error: "You are not assigned to this programme."
                    });
                }
            }


            const files = await databaseAll(
                `SELECT StoredFileName
                 FROM UploadedFiles
                 WHERE MaterialID = ?`,
                [materialID]
            );

            const result = await databaseRun(
                `DELETE FROM LearningMaterials
                 WHERE MaterialID = ?`,
                [materialID]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error: "Learning Material not found."
                });
            }

            for (const file of files) {
                try {
                    await fs.promises.unlink(
                        path.join(
                            uploadDirectory,
                            file.StoredFileName
                        )
                    );
                } catch (deleteError) {
                    if (deleteError.code !== "ENOENT") {
                        console.error(
                            "Unable to remove Learning Material file:",
                            deleteError
                        );
                    }
                }
            }

            writeAuditLog(
                req,
                "MATERIAL_DELETED",
                "LearningMaterial",
                materialID,
                "Success"
            );

            res.json({
                message:
                    "Learning Material deleted successfully."
            });
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT") {
                return res.status(409).json({
                    error:
                        "The Learning Material could not be deleted because related records still exist."
                });
            }

            next(error);
        }
    }
);

// Generate a seven-day temporary password
app.post(
    "/api/password-recovery/requests/:id/generate",
    requireRoles(
        "Admin",
        "Coach"
    ),
    async (req, res) => {

        const requestID =
            positiveInteger(
                req.params.id
            );


        if (!requestID) {

            writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
            return res.status(400).json({
                error:
                    "A valid recovery request is required."
            });

        }


        let transactionStarted =
            false;


        try {

            const initialRequest =
                await databaseGet(
                    `
                        SELECT
                            Recovery.RequestID,
                            Recovery.UserID,
                            Recovery.Status,

                            Users.FirstName,
                            Users.LastName,
                            Users.Email,
                            Users.Role

                        FROM PasswordRecoveryRequests
                            AS Recovery

                        INNER JOIN Users
                            ON Recovery.UserID =
                               Users.UserID

                        WHERE Recovery.RequestID = ?
                    `,
                    [requestID]
                );


            if (
                !initialRequest ||
                initialRequest.Role !==
                    "Participant"
            ) {

                writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                return res.status(404).json({
                    error:
                        "Password recovery request not found."
                });

            }

            if (req.session.user.Role === "Coach") {
    const hasAccess =
        await coachCanAccessParticipant(
            req.session.user.UserID,
            initialRequest.UserID
        );

    if (!hasAccess) {
        writeAuditLog(
            req,
            "PASSWORD_RECOVERY_ACCESS_DENIED",
            "PasswordRecoveryRequest",
            requestID,
            "Denied"
        );

        return sendForbidden(req, res);
    }
}

            if (
                initialRequest.Status !==
                "Pending"
            ) {

                writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                return res.status(409).json({
                    error:
                        "This password request has already been processed."
                });

            }


            const temporaryPassword =
                generateTemporaryPassword();


            const passwordHash =
                await bcrypt.hash(
                    temporaryPassword,
                    12
                );


            const expiresAt =
                new Date(
                    Date.now() +
                    7 * 24 * 60 * 60 * 1000
                ).toISOString();


            await databaseRun(
                "BEGIN IMMEDIATE TRANSACTION"
            );


            transactionStarted =
                true;


            const currentRequest =
                await databaseGet(
                    `
                        SELECT
                            RequestID,
                            UserID,
                            Status

                        FROM PasswordRecoveryRequests

                        WHERE RequestID = ?
                    `,
                    [requestID]
                );


            if (
                !currentRequest ||
                currentRequest.Status !==
                    "Pending"
            ) {

                const conflictError =
                    new Error(
                        "This password request has already been processed."
                    );


                conflictError.statusCode =
                    409;


                throw conflictError;

            }


            // Revoke any previous active
            // temporary passwords for this user.
            await databaseRun(
                `
                    UPDATE TemporaryPasswords

                    SET RevokedAt =
                        CURRENT_TIMESTAMP

                    WHERE
                        UserID = ?

                        AND UsedAt IS NULL

                        AND RevokedAt IS NULL
                `,
                [
                    currentRequest.UserID
                ]
            );


            await databaseRun(
                `
                    INSERT INTO TemporaryPasswords
                    (
                        UserID,
                        PasswordHash,
                        CreatedBy,
                        ExpiresAt
                    )
                    VALUES (?, ?, ?, ?)
                `,
                [
                    currentRequest.UserID,
                    passwordHash,
                    req.session.user.UserID,
                    expiresAt
                ]
            );


            const updateResult =
                await databaseRun(
                    `
                        UPDATE PasswordRecoveryRequests

                        SET
                            Status =
                                'Fulfilled',

                            FulfilledAt =
                                CURRENT_TIMESTAMP,

                            FulfilledBy = ?

                        WHERE
                            RequestID = ?

                            AND Status =
                                'Pending'
                    `,
                    [
                        req.session.user.UserID,
                        requestID
                    ]
                );


            if (
                updateResult.changes !== 1
            ) {

                throw new Error(
                    "The recovery request could not be updated."
                );

            }


            await databaseRun(
                "COMMIT"
            );


            transactionStarted =
                false;


            res.json({

                message:
                    "Temporary password generated successfully.",

                request: {

                    RequestID:
                        requestID,

                    ParticipantName:
                        `${initialRequest.FirstName} ${initialRequest.LastName}`,

                    Email:
                        initialRequest.Email,

                    TemporaryPassword:
                        temporaryPassword,

                    ExpiresAt:
                        expiresAt

                }

            });

        }

        catch (error) {

            if (transactionStarted) {

                try {

                    await databaseRun(
                        "ROLLBACK"
                    );

                }

                catch (rollbackError) {

                    console.error(
                        "Password recovery rollback failed:",
                        rollbackError.message
                    );

                }

            }


            console.error(
                "Temporary password generation failed:",
                error.message
            );


            res.status(
                error.statusCode ||
                500
            ).json({

                error:
                    error.statusCode
                        ? error.message
                        : "Unable to generate a temporary password."

            });

        }

    }
);

function requireRoles(...allowedRoles) {
    return (req, res, next) => {
        const currentUser =
            req.session?.user;

        if (!currentUser) {
            writeAuditLog(
                req,
                "ACCESS_DENIED",
                "User",
                null,
                "Denied"
            );

            return res.status(401).json({
                error:
                    "Authentication required.",
                code:
                    "AUTHENTICATION_REQUIRED"
            });
        }

        if (
            !allowedRoles.includes(
                currentUser.Role
            )
        ) {
            writeAuditLog(
                req,
                "ACCESS_DENIED",
                "User",
                currentUser.UserID,
                "Denied"
            );

            return res.status(403).json({
                error:
                    "You do not have permission to perform this action.",
                code:
                    "ACCESS_DENIED"
            });
        }

        next();
    };
}

function corporateOrganisation(req, res) {
    if (req.session.user.Role === "Corporate" && !req.session.user.OrganisationID) {
        writeAuditLog(req, "LOGIN", "User", req.session.user.UserID, "Denied");
        res.status(403).json({ error: "Corporate organisation access is not configured." });
        return null;
    }
    return req.session.user.OrganisationID;
}

// ========================================
// LOGIN
// ========================================

app.post(
    "/api/auth/login",
    loginLimiter,
    (req, res) => {

        const email =
            String(
                req.body.Email || ""
            )
                .trim()
                .toLowerCase();

        const password =
            String(
                req.body.Password || ""
            );


        if (!email || !password) {

            writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
            return res.status(400).json({
                error:
                    "Email and password are required."
            });

        }


        db.get(
            `
                SELECT
                    UserID,
                    FirstName,
                    LastName,
                    Email,
                    PasswordHash,
                    Role,
                    OrganisationID,
                    AccountStatus

                FROM Users

                WHERE LOWER(Email) =
                      LOWER(?)
            `,
            [email],
            async (error, user) => {

                if (error) {

                    console.error(
                        "Error retrieving login user:",
                        error.message
                    );

                    writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                    return res.status(500).json({
                        error:
                            "Login failed."
                    });

                }


                if (!user) {

                    writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                    return res.status(401).json({
                        error:
                            "Incorrect email or password."
                    });

                }

                if (
    user.AccountStatus !== "Active"
) {
    writeAuditLog(
        req,
        "LOGIN",
        "User",
        user.UserID,
        "Denied"
    );

    return res.status(403).json({
        error:
            "This account is not currently active.",
        code:
            "ACCOUNT_INACTIVE"
    });
}

                try {

                    const permanentPasswordMatches =
                        await bcrypt.compare(
                            password,
                            user.PasswordHash
                        );


                    let temporaryPasswordMatches =
                        false;

                    let temporaryPasswordID =
                        null;


                    /*
                     * Only Participant accounts may use
                     * temporary passwords.
                     */
                    if (
                        !permanentPasswordMatches &&
                        user.Role ===
                            "Participant"
                    ) {

                        const temporaryPassword =
                            await databaseGet(
                                `
                                    SELECT
                                        TemporaryPasswordID,
                                        PasswordHash,
                                        ExpiresAt

                                    FROM TemporaryPasswords

                                    WHERE
                                        UserID = ?

                                        AND UsedAt IS NULL

                                        AND RevokedAt IS NULL

                                        AND datetime(ExpiresAt) >
                                            datetime('now')

                                    ORDER BY
                                        CreatedAt DESC,
                                        TemporaryPasswordID DESC

                                    LIMIT 1
                                `,
                                [user.UserID]
                            );


                        if (temporaryPassword) {

                            temporaryPasswordMatches =
                                await bcrypt.compare(
                                    password,
                                    temporaryPassword.PasswordHash
                                );


                            if (
                                temporaryPasswordMatches
                            ) {

                                temporaryPasswordID =
                                    temporaryPassword
                                        .TemporaryPasswordID;

                            }

                        }

                    }


                    if (
                        !permanentPasswordMatches &&
                        !temporaryPasswordMatches
                    ) {

                        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                        return res.status(401).json({
                            error:
                                "Incorrect email or password."
                        });

                    }


                    if (
                        user.Role ===
                            "Corporate" &&
                        !user.OrganisationID
                    ) {

                        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                        return res.status(403).json({
                            error:
                                "This Corporate account is not linked to an organisation."
                        });

                    }


                    /*
                     * If the Participant remembered their
                     * permanent password, recovery is no
                     * longer required.
                     */
                    if (
                        permanentPasswordMatches &&
                        user.Role ===
                            "Participant"
                    ) {

                        await databaseRun(
                            `
                                UPDATE TemporaryPasswords

                                SET RevokedAt =
                                    CURRENT_TIMESTAMP

                                WHERE
                                    UserID = ?

                                    AND UsedAt IS NULL

                                    AND RevokedAt IS NULL
                            `,
                            [user.UserID]
                        );


                        await databaseRun(
                            `
                                UPDATE PasswordRecoveryRequests

                                SET
                                    Status =
                                        'Resolved',

                                    ResolvedAt =
                                        CURRENT_TIMESTAMP

                                WHERE
                                    UserID = ?

                                    AND Status IN
                                    (
                                        'Pending',
                                        'Fulfilled'
                                    )
                            `,
                            [user.UserID]
                        );

                    }


                    const usingTemporaryPassword =
                        temporaryPasswordMatches;


                    req.session.user = {

                        UserID:
                            user.UserID,

                        FirstName:
                            user.FirstName,

                        LastName:
                            user.LastName,

                        Email:
                            user.Email,

                        Role:
                            user.Role,

                        OrganisationID:
                            user.OrganisationID,

                        UsingTemporaryPassword:
                            usingTemporaryPassword

                    };

                    writeAuditLog(req, "LOGIN", "User", user.UserID, "Success");

                    if (usingTemporaryPassword) {

                        req.session
                            .temporaryPasswordID =
                                temporaryPasswordID;

                    } else {

                        delete req.session
                            .temporaryPasswordID;

                    }


                    req.session.save(
                        saveError => {

                            if (saveError) {

                                console.error(
                                    "Error saving login session:",
                                    saveError.message
                                );

                                writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                                return res.status(500).json({
                                    error:
                                        "Login failed."
                                });

                            }


                            res.json({

                                message:
                                    usingTemporaryPassword
                                        ? "Temporary password accepted. You must create a new password."
                                        : "Login successful.",

                                requiresPasswordChange:
                                    usingTemporaryPassword,

                                user:
                                    req.session.user

                            });

                        }
                    );

                }

                catch (passwordError) {

                    console.error(
                        "Error checking password:",
                        passwordError.message
                    );


                    res.status(500).json({
                        error:
                            "Login failed."
                    });

                }

            }
        );

    }
);

app.get("/api/auth/me", (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({
            error: "Not authenticated.",
            code: "AUTHENTICATION_REQUIRED"
        });
    }

    res.json({
        user: req.session.user
    });
});

app.post(
    "/api/auth/logout",
    requireAuthentication,
    (req, res) => {
        const userID =
            req.session.user.UserID;

        writeAuditLog(
            req,
            "LOGOUT",
            "User",
            userID,
            "Success"
        );

        req.session.destroy(error => {
            if (error) {
                console.error(
                    "Logout failed:",
                    error.message
                );

                return res.status(500).json({
                    error:
                        "Unable to sign out."
                });
            }

            res.clearCookie(
                "kbd.sid",
                {
                    httpOnly: true,
                    sameSite: "lax",
                    secure:
                        process.env.NODE_ENV ===
                        "production",
                    path: "/"
                }
            );

            res.json({
                message:
                    "Signed out successfully."
            });
        });
    }
);

app.get("/api/health", (req, res) => res.json({ message: "KBD Coaching Platform API is running!" }));

// ========================================
// COMPLETE TEMPORARY PASSWORD RECOVERY
// ========================================

app.post(
    "/api/auth/temporary-password/change",
    requireRoles(
        "Participant"
    ),
    async (req, res) => {

        const user =
            req.session.user;

        const temporaryPasswordID =
            positiveInteger(
                req.session
                    .temporaryPasswordID
            );

        const newPassword =
            String(
                req.body.NewPassword || ""
            );


        if (
            !user.UsingTemporaryPassword ||
            !temporaryPasswordID
        ) {

            writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
            return res.status(403).json({
                error:
                    "This account is not using a temporary password."
            });

        }


        if (!newPassword) {

            writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
            return res.status(400).json({
                error:
                    "A new password is required."
            });

        }


        if (newPassword.length < 8) {

            writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
            return res.status(400).json({
                error:
                    "The new password must contain at least 8 characters."
            });

        }


        let transactionStarted =
            false;


        try {

            const temporaryPassword =
                await databaseGet(
                    `
                        SELECT
                            TemporaryPasswordID,
                            UserID,
                            PasswordHash,
                            ExpiresAt

                        FROM TemporaryPasswords

                        WHERE
                            TemporaryPasswordID = ?

                            AND UserID = ?

                            AND UsedAt IS NULL

                            AND RevokedAt IS NULL

                            AND datetime(ExpiresAt) >
                                datetime('now')
                    `,
                    [
                        temporaryPasswordID,
                        user.UserID
                    ]
                );


            if (!temporaryPassword) {

                writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                return res.status(401).json({
                    error:
                        "The temporary password has expired or is no longer valid."
                });

            }


            const matchesTemporaryPassword =
                await bcrypt.compare(
                    newPassword,
                    temporaryPassword.PasswordHash
                );


            if (matchesTemporaryPassword) {

                writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                return res.status(400).json({
                    error:
                        "Your permanent password must be different from the temporary password."
                });

            }


            const newPasswordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );


            await databaseRun(
                "BEGIN IMMEDIATE TRANSACTION"
            );


            transactionStarted =
                true;


            const currentTemporaryPassword =
                await databaseGet(
                    `
                        SELECT
                            TemporaryPasswordID

                        FROM TemporaryPasswords

                        WHERE
                            TemporaryPasswordID = ?

                            AND UserID = ?

                            AND UsedAt IS NULL

                            AND RevokedAt IS NULL

                            AND datetime(ExpiresAt) >
                                datetime('now')
                    `,
                    [
                        temporaryPasswordID,
                        user.UserID
                    ]
                );


            if (!currentTemporaryPassword) {

                writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                const expiredError =
                    new Error(
                        "The temporary password has expired or is no longer valid."
                    );


                expiredError.statusCode =
                    401;


                throw expiredError;

            }


            const passwordUpdate =
                await databaseRun(
                    `
                        UPDATE Users

                        SET PasswordHash = ?

                        WHERE
                            UserID = ?

                            AND Role =
                                'Participant'
                    `,
                    [
                        newPasswordHash,
                        user.UserID
                    ]
                );


            if (
                passwordUpdate.changes !== 1
            ) {

                throw new Error(
                    "The Participant password could not be updated."
                );

            }


            const temporaryPasswordUpdate =
                await databaseRun(
                    `
                        UPDATE TemporaryPasswords

                        SET UsedAt =
                            CURRENT_TIMESTAMP

                        WHERE
                            TemporaryPasswordID = ?

                            AND UserID = ?

                            AND UsedAt IS NULL

                            AND RevokedAt IS NULL
                    `,
                    [
                        temporaryPasswordID,
                        user.UserID
                    ]
                );


            if (
                temporaryPasswordUpdate
                    .changes !== 1
            ) {

                throw new Error(
                    "The temporary password could not be completed."
                );

            }


            // Revoke any other unused recovery
            // passwords belonging to this user.
            await databaseRun(
                `
                    UPDATE TemporaryPasswords

                    SET RevokedAt =
                        CURRENT_TIMESTAMP

                    WHERE
                        UserID = ?

                        AND TemporaryPasswordID != ?

                        AND UsedAt IS NULL

                        AND RevokedAt IS NULL
                `,
                [
                    user.UserID,
                    temporaryPasswordID
                ]
            );


            await databaseRun(
                `
                    UPDATE PasswordRecoveryRequests

                    SET
                        Status =
                            'Resolved',

                        ResolvedAt =
                            CURRENT_TIMESTAMP

                    WHERE
                        UserID = ?

                        AND Status IN
                        (
                            'Pending',
                            'Fulfilled'
                        )
                `,
                [user.UserID]
            );


            await databaseRun(
                "COMMIT"
            );


            transactionStarted =
                false;


            req.session.user
                .UsingTemporaryPassword =
                    false;


            delete req.session
                .temporaryPasswordID;


            req.session.save(
                saveError => {

                    if (saveError) {

                        console.error(
                            "Unable to save completed recovery session:",
                            saveError.message
                        );

                        writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                        return res.status(500).json({
                            error:
                                "Your password was changed, but the session could not be refreshed. Please sign in again."
                        });

                    }


                    res.json({

                        message:
                            "Your permanent password was created successfully.",

                        user:
                            req.session.user

                    });

                }
            );

        }

        catch (error) {

            if (transactionStarted) {

                try {

                    await databaseRun(
                        "ROLLBACK"
                    );

                }

                catch (rollbackError) {

                    console.error(
                        "Password-change rollback failed:",
                        rollbackError.message
                    );

                }

            }


            console.error(
                "Temporary password completion failed:",
                error.message
            );


            res.status(
                error.statusCode ||
                500
            ).json({

                error:
                    error.statusCode
                        ? error.message
                        : "Unable to create the permanent password."

            });

        }

    }
);

app.use(
    "/api",
    requireCompletedPasswordChange
);

// ========================================
// LIST COACH INVITATIONS
// ========================================

app.get(
    "/api/coach-invitations",
    requireRoles("Admin"),
    (req, res) => {

        db.all(
            `
                SELECT
                    Invitation.InvitationID,
                    Invitation.Email,
                    Invitation.ExpiresAt,
                    Invitation.AcceptedAt,
                    Invitation.RevokedAt,
                    Invitation.CreatedAt,
                    Invitation.OrganisationID,

                    Organisation.OrganisationName,

                    Inviter.FirstName
                        AS InviterFirstName,

                    Inviter.LastName
                        AS InviterLastName,

                    CASE

                        WHEN
                            Invitation.AcceptedAt
                                IS NOT NULL
                            THEN 'Accepted'

                        WHEN
                            Invitation.RevokedAt
                                IS NOT NULL
                            THEN 'Revoked'

                        WHEN
                            datetime(
                                Invitation.ExpiresAt
                            ) <= datetime('now')
                            THEN 'Expired'

                        ELSE 'Pending'

                    END AS InvitationStatus

                FROM CoachInvitations
                    AS Invitation

                LEFT JOIN Organisations
                    AS Organisation

                    ON Organisation.OrganisationID =
                       Invitation.OrganisationID

                INNER JOIN Users
                    AS Inviter

                    ON Inviter.UserID =
                       Invitation.InvitedBy

                ORDER BY
                    Invitation.CreatedAt DESC,
                    Invitation.InvitationID DESC
            `,
            [],
            (error, invitations) => {

                if (error) {

                    console.error(
                        "Unable to retrieve Coach invitations:",
                        error.message
                    );

                    writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
                    return res.status(500).json({
                        error:
                            "Unable to retrieve Coach invitations."
                    });

                }


                res.json(
                    invitations
                );

            }
        );

    }
);

// ========================================
// CREATE COACH INVITATION
// ========================================

app.post(
    "/api/coach-invitations",
    requireRoles("Admin"),
    async (req, res) => {

        const email =
            String(
                req.body.Email || ""
            )
                .trim()
                .toLowerCase();


        const organisationID =
            req.body.OrganisationID ===
                null ||
            req.body.OrganisationID ===
                undefined ||
            req.body.OrganisationID ===
                ""

                ? null

                : positiveInteger(
                    req.body.OrganisationID
                );


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailPattern.test(email)) {

            writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
            return res.status(400).json({
                error:
                    "Enter a valid Coach email address."
            });

        }


        if (
            req.body.OrganisationID !==
                null &&
            req.body.OrganisationID !==
                undefined &&
            req.body.OrganisationID !==
                "" &&
            !organisationID
        ) {

            writeAuditLog(req, "LOGIN", "User", getAuditUserID(req), "Denied");
            return res.status(400).json({
                error:
                    "Enter a valid organisation ID."
            });

        }


        try {

            const existingUser =
                await databaseGet(
                    `
                        SELECT
                            UserID,
                            Role

                        FROM Users

                        WHERE LOWER(Email) =
                              LOWER(?)
                    `,
                    [email]
                );


            if (existingUser) {

                return res.status(409).json({
                    error:
                        "An account with this email address already exists."
                });

            }


            if (organisationID) {

                const organisation =
                    await databaseGet(
                        `
                            SELECT OrganisationID

                            FROM Organisations

                            WHERE OrganisationID = ?
                        `,
                        [organisationID]
                    );


                if (!organisation) {

                    return res.status(404).json({
                        error:
                            "The selected organisation was not found."
                    });

                }

            }


            await databaseRun(
                `
                    UPDATE CoachInvitations

                    SET RevokedAt =
                        CURRENT_TIMESTAMP

                    WHERE
                        LOWER(Email) =
                            LOWER(?)

                        AND AcceptedAt IS NULL

                        AND RevokedAt IS NULL
                `,
                [email]
            );


            const invitationToken =
                generateCoachInvitationToken();


            const invitationTokenHash =
                hashCoachInvitationToken(
                    invitationToken
                );


            const expiresAt =
                new Date(
                    Date.now() +
                    48 * 60 * 60 * 1000
                ).toISOString();


            const result =
                await databaseRun(
                    `
                        INSERT INTO CoachInvitations
                        (
                            Email,
                            InvitationTokenHash,
                            InvitedBy,
                            OrganisationID,
                            ExpiresAt
                        )
                        VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        email,
                        invitationTokenHash,
                        req.session.user.UserID,
                        organisationID,
                        expiresAt
                    ]
                );


            const activationURL =
                `${req.protocol}://${req.get("host")}` +
                `/pages/coach-activation.html?token=` +
                encodeURIComponent(
                    invitationToken
                );


            res.status(201).json({

                message:
                    "Coach invitation created successfully.",

                invitation: {

                    InvitationID:
                        result.lastID,

                    Email:
                        email,

                    ExpiresAt:
                        expiresAt,

                    ActivationURL:
                        activationURL

                }

            });

        }

        catch (error) {

            console.error(
                "Coach invitation creation failed:",
                error.message
            );


            res.status(500).json({
                error:
                    "Unable to create the Coach invitation."
            });

        }

    }
);

// ========================================
// VALIDATE COACH INVITATION
// ========================================

app.get(
    "/api/coach-invitations/validate",
    coachInvitationLimiter,
    async (req, res) => {

        const token =
            String(
                req.query.token || ""
            ).trim();


        if (!token) {

            return res.status(400).json({
                error:
                    "A Coach invitation token is required."
            });

        }


        if (token.length > 500) {

            return res.status(400).json({
                error:
                    "The Coach invitation token is invalid."
            });

        }


        try {

            const tokenHash =
                hashCoachInvitationToken(
                    token
                );


            const invitation =
                await databaseGet(
                    `
                        SELECT
                            Invitation.InvitationID,
                            Invitation.Email,
                            Invitation.ExpiresAt,
                            Invitation.OrganisationID,

                            Organisation.OrganisationName

                        FROM CoachInvitations
                            AS Invitation

                        LEFT JOIN Organisations
                            AS Organisation

                            ON Organisation.OrganisationID =
                               Invitation.OrganisationID

                        WHERE
                            Invitation.InvitationTokenHash = ?

                            AND Invitation.AcceptedAt IS NULL

                            AND Invitation.RevokedAt IS NULL

                            AND datetime(
                                Invitation.ExpiresAt
                            ) > datetime('now')

                        LIMIT 1
                    `,
                    [tokenHash]
                );


            if (!invitation) {

                return res.status(404).json({
                    error:
                        "This Coach invitation is invalid, expired or has already been used."
                });

            }


            res.json({

                valid:
                    true,

                invitation: {

                    Email:
                        invitation.Email,

                    ExpiresAt:
                        invitation.ExpiresAt,

                    OrganisationID:
                        invitation.OrganisationID,

                    OrganisationName:
                        invitation.OrganisationName

                }

            });

        }

        catch (error) {

            console.error(
                "Coach invitation validation failed:",
                error.message
            );


            res.status(500).json({
                error:
                    "Unable to validate the Coach invitation."
            });

        }

    }
);


// ========================================
// ACTIVATE COACH ACCOUNT
// ========================================

app.post(
    "/api/auth/coach-activate",
    coachInvitationLimiter,
    async (req, res) => {

        const token =
            String(
                req.body.Token || ""
            ).trim();

        const firstName =
            String(
                req.body.FirstName || ""
            ).trim();

        const lastName =
            String(
                req.body.LastName || ""
            ).trim();

        const password =
            String(
                req.body.Password || ""
            );

        const confirmPassword =
            String(
                req.body.ConfirmPassword || ""
            );


        if (
            !token ||
            !firstName ||
            !lastName ||
            !password ||
            !confirmPassword
        ) {

            return res.status(400).json({
                error:
                    "First name, last name, password and invitation token are required."
            });

        }


        if (token.length > 500) {

            return res.status(400).json({
                error:
                    "The Coach invitation token is invalid."
            });

        }


        if (password.length < 8) {

            return res.status(400).json({
                error:
                    "Password must contain at least 8 characters."
            });

        }


        if (password !== confirmPassword) {

            return res.status(400).json({
                error:
                    "The passwords do not match."
            });

        }


        let transactionStarted =
            false;


        try {

            const tokenHash =
                hashCoachInvitationToken(
                    token
                );


            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            await databaseRun(
                "BEGIN IMMEDIATE TRANSACTION"
            );


            transactionStarted =
                true;


            const invitation =
                await databaseGet(
                    `
                        SELECT
                            InvitationID,
                            Email,
                            OrganisationID

                        FROM CoachInvitations

                        WHERE
                            InvitationTokenHash = ?

                            AND AcceptedAt IS NULL

                            AND RevokedAt IS NULL

                            AND datetime(ExpiresAt) >
                                datetime('now')

                        LIMIT 1
                    `,
                    [tokenHash]
                );


            if (!invitation) {

                const invitationError =
                    new Error(
                        "This Coach invitation is invalid, expired or has already been used."
                    );


                invitationError.statusCode =
                    404;


                throw invitationError;

            }


            const existingUser =
                await databaseGet(
                    `
                        SELECT UserID

                        FROM Users

                        WHERE LOWER(Email) =
                              LOWER(?)
                    `,
                    [invitation.Email]
                );


            if (existingUser) {

                const accountError =
                    new Error(
                        "An account with the invited email address already exists."
                    );


                accountError.statusCode =
                    409;


                throw accountError;

            }


            const userResult =
                await databaseRun(
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
                        VALUES (?, ?, ?, ?, 'Coach', ?)
                    `,
                    [
                        firstName,
                        lastName,
                        invitation.Email,
                        passwordHash,
                        invitation.OrganisationID
                    ]
                );


            const invitationResult =
                await databaseRun(
                    `
                        UPDATE CoachInvitations

                        SET AcceptedAt =
                            CURRENT_TIMESTAMP

                        WHERE
                            InvitationID = ?

                            AND AcceptedAt IS NULL

                            AND RevokedAt IS NULL

                            AND datetime(ExpiresAt) >
                                datetime('now')
                    `,
                    [invitation.InvitationID]
                );


            if (
                invitationResult.changes !== 1
            ) {

                throw new Error(
                    "The Coach invitation could not be completed."
                );

            }


            await databaseRun(
                "COMMIT"
            );


            transactionStarted =
                false;


            const user = {

                UserID:
                    userResult.lastID,

                FirstName:
                    firstName,

                LastName:
                    lastName,

                Email:
                    invitation.Email,

                Role:
                    "Coach",

                OrganisationID:
                    invitation.OrganisationID,

                UsingTemporaryPassword:
                    false

            };


            req.session.user =
                user;


            req.session.save(
                saveError => {

                    if (saveError) {

                        console.error(
                            "Coach activation session save failed:",
                            saveError.message
                        );


                        return res.status(500).json({
                            error:
                                "Your Coach account was created, but automatic sign-in failed. Please use the login page."
                        });

                    }


                    res.status(201).json({

                        message:
                            "Coach account activated successfully.",

                        user

                    });

                }
            );

        }

        catch (error) {

            if (transactionStarted) {

                try {

                    await databaseRun(
                        "ROLLBACK"
                    );

                }

                catch (rollbackError) {

                    console.error(
                        "Coach activation rollback failed:",
                        rollbackError.message
                    );

                }

            }


            console.error(
                "Coach account activation failed:",
                error.message
            );


            const constraintError =
                error.code ===
                    "SQLITE_CONSTRAINT";


            res.status(
                error.statusCode ||
                (constraintError ? 409 : 500)
            ).json({

                error:
                    error.statusCode
                        ? error.message
                        : constraintError
                            ? "A Coach account with this email address already exists."
                            : "Unable to activate the Coach account."

            });

        }

    }
);

// ========================================
// PARTICIPANT REGISTRATION
// ========================================

app.post(
    "/api/auth/register",
    registrationLimiter,
    async (req, res) => {

        const firstName =
            String(
                req.body.FirstName || ""
            ).trim();

        const lastName =
            String(
                req.body.LastName || ""
            ).trim();

        const email =
            String(
                req.body.Email || ""
            )
                .trim()
                .toLowerCase();

        const password =
            String(
                req.body.Password || ""
            );


        if (
            !firstName ||
            !lastName ||
            !email ||
            !password
        ) {

            return res.status(400).json({
                error:
                    "First name, last name, email and password are required."
            });

        }


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailPattern.test(email)) {

            return res.status(400).json({
                error:
                    "Enter a valid email address."
            });

        }


        if (password.length < 8) {

            return res.status(400).json({
                error:
                    "Password must contain at least 8 characters."
            });

        }


        db.get(
            `
                SELECT UserID

                FROM Users

                WHERE LOWER(Email) =
                      LOWER(?)
            `,
            [email],
            async (findError, existingUser) => {

                if (findError) {

                    console.error(
                        "Registration email check failed:",
                        findError.message
                    );


                    return res.status(500).json({
                        error:
                            "Unable to complete registration."
                    });

                }


                if (existingUser) {

                    return res.status(409).json({
                        error:
                            "An account with this email already exists. Please sign in."
                    });

                }


                try {

                    const passwordHash =
                        await bcrypt.hash(
                            password,
                            12
                        );


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
                            VALUES (?, ?, ?, ?, 'Participant', NULL)
                        `,
                        [
                            firstName,
                            lastName,
                            email,
                            passwordHash
                        ],
                        function (insertError) {

                            if (insertError) {

                                console.error(
                                    "Participant registration failed:",
                                    insertError.message
                                );


                                if (
                                    insertError.code ===
                                    "SQLITE_CONSTRAINT"
                                ) {

                                    return res.status(409).json({
                                        error:
                                            "An account with this email already exists. Please sign in."
                                    });

                                }


                                return res.status(500).json({
                                    error:
                                        "Unable to complete registration."
                                });

                            }


                            const user = {

                                UserID:
                                    this.lastID,

                                FirstName:
                                    firstName,

                                LastName:
                                    lastName,

                                Email:
                                    email,

                                Role:
                                    "Participant",

                                OrganisationID:
                                    null,

                                UsingTemporaryPassword:
                                    false

                            };


                            req.session.user =
                                user;


                            req.session.save(
                                saveError => {

                                    if (saveError) {

                                        console.error(
                                            "Registration session save failed:",
                                            saveError.message
                                        );


                                        return res.status(500).json({
                                            error:
                                                "Your account was created, but automatic sign-in failed. Please use the login page."
                                        });

                                    }


                                    res.status(201).json({

                                        message:
                                            "Participant account created successfully.",

                                        user

                                    });

                                }
                            );

                        }
                    );

                }

                catch (error) {

                    console.error(
                        "Registration password hashing failed:",
                        error.message
                    );


                    res.status(500).json({
                        error:
                            "Unable to secure the account password."
                    });

                }

            }
        );

    }
);

// ========================================
// REQUEST TEMPORARY PASSWORD
// ========================================

app.post(
    "/api/auth/password-request",
    passwordRequestLimiter,
    (req, res) => {

        const email =
            String(
                req.body.Email || ""
            )
                .trim()
                .toLowerCase();


        if (!email) {

            return res.status(400).json({
                error:
                    "Email address is required."
            });

        }


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailPattern.test(email)) {

            return res.status(400).json({
                error:
                    "Enter a valid email address."
            });

        }


        const acceptedResponse = {

            message:
                "If a Participant account exists for this email, the request has been sent to the Coach."

        };


        db.get(
            `
                SELECT
                    UserID,
                    Role

                FROM Users

                WHERE LOWER(Email) =
                      LOWER(?)
            `,
            [email],
            (findError, user) => {

                if (findError) {

                    console.error(
                        "Password request account lookup failed:",
                        findError.message
                    );


                    return res.status(500).json({
                        error:
                            "Unable to submit the password request."
                    });

                }


                /*
                 * Return the same response when the account
                 * does not exist or is not a Participant.
                 * This prevents account discovery.
                 */
                if (
                    !user ||
                    user.Role !==
                        "Participant"
                ) {

                    return res
                        .status(202)
                        .json(
                            acceptedResponse
                        );

                }


                db.run(
                    `
                        INSERT INTO PasswordRecoveryRequests
                        (
                            UserID,
                            Status
                        )

                        SELECT
                            ?,
                            'Pending'

                        WHERE NOT EXISTS
                        (
                            SELECT 1

                            FROM PasswordRecoveryRequests

                            WHERE
                                UserID = ?

                                AND Status =
                                    'Pending'
                        )
                    `,
                    [
                        user.UserID,
                        user.UserID
                    ],
                    function (insertError) {

                        if (insertError) {

                            console.error(
                                "Password request creation failed:",
                                insertError.message
                            );


                            return res.status(500).json({
                                error:
                                    "Unable to submit the password request."
                            });

                        }


                        if (this.changes > 0) {

                            console.log(
                                `Password recovery request created for UserID ${user.UserID}.`
                            );

                        }


                        res.status(202).json(
                            acceptedResponse
                        );

                    }
                );

            }
        );

    }
);

// ========================================
// SETTINGS
// ========================================

// Update the logged-in user's profile
app.put(
    "/api/settings/profile",
    requireAuthentication,
    (req, res) => {

    const userID =
        req.session.user.UserID;

    const firstName =
        String(
            req.body.FirstName || ""
        ).trim();

    const lastName =
        String(
            req.body.LastName || ""
        ).trim();

    const email =
        String(
            req.body.Email || ""
        ).trim().toLowerCase();


    if (!firstName || !lastName || !email) {

        return res.status(400).json({
            error:
                "First name, last name and email are required."
        });

    }


    const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (!emailPattern.test(email)) {

        return res.status(400).json({
            error:
                "Enter a valid email address."
        });

    }


    db.get(
        `
            SELECT UserID

            FROM Users

            WHERE
                LOWER(Email) = LOWER(?)

                AND UserID != ?
        `,
        [
            email,
            userID
        ],
        (findError, existingUser) => {

            if (findError) {

                console.error(
                    "Error checking profile email:",
                    findError.message
                );

                return res.status(500).json({
                    error:
                        "Unable to update the profile."
                });

            }


            if (existingUser) {

                return res.status(409).json({
                    error:
                        "That email address is already in use."
                });

            }


            db.run(
                `
                    UPDATE Users

                    SET
                        FirstName = ?,
                        LastName = ?,
                        Email = ?

                    WHERE UserID = ?
                `,
                [
                    firstName,
                    lastName,
                    email,
                    userID
                ],
                function (updateError) {

                    if (updateError) {

                        console.error(
                            "Error updating profile:",
                            updateError.message
                        );

                        return res.status(500).json({
                            error:
                                "Unable to update the profile."
                        });

                    }


                    req.session.user.FirstName =
                        firstName;

                    req.session.user.LastName =
                        lastName;

                    req.session.user.Email =
                        email;


                    req.session.save(
                        saveError => {

                            if (saveError) {

                                console.error(
                                    "Error saving updated session:",
                                    saveError.message
                                );

                                return res.status(500).json({
                                    error:
                                        "Profile updated, but the session could not be refreshed."
                                });

                            }


                            res.json({
                                message:
                                    "Profile updated successfully.",

                                user:
                                    req.session.user
                            });

                        }
                    );

                }
            );

        }
    );

    }
);

app.post(
    "/api/account/deactivation-request",
    requireRoles(
        "Coach",
        "Participant",
        "Corporate"
    ),
    async (req, res) => {
        const userID = positiveInteger(
            getAuditUserID(req)
        );

        if (!userID) {
            return res.status(401).json({
                error:
                    "Authentication is required."
            });
        }

        try {
            const account = await databaseGet(
                `SELECT
                    UserID,
                    AccountStatus
                 FROM Users
                 WHERE UserID = ?`,
                [userID]
            );

            if (!account) {
                return res.status(404).json({
                    error:
                        "The user account was not found."
                });
            }

            if (
                account.AccountStatus ===
                "PendingDeletion"
            ) {
                return res.status(409).json({
                    error:
                        "Account closure has already been requested."
                });
            }

            if (
                account.AccountStatus !==
                "Active"
            ) {
                return res.status(409).json({
                    error:
                        "This account is not currently active."
                });
            }

            const result = await databaseRun(
                `UPDATE Users
                 SET AccountStatus =
                        'PendingDeletion',
                     DeletionRequestedAt =
                        CURRENT_TIMESTAMP,
                     DeactivatedAt =
                        CURRENT_TIMESTAMP
                 WHERE UserID = ?
                   AND AccountStatus =
                        'Active'`,
                [userID]
            );

            if (!result.changes) {
                return res.status(409).json({
                    error:
                        "The account status could not be changed."
                });
            }

            writeAuditLog(
                req,
                "ACCOUNT_CLOSURE_REQUESTED",
                "User",
                userID,
                "Success"
            );

            req.session.destroy(error => {
                if (error) {
                    console.error(
                        "Unable to destroy the session after account closure request:",
                        error.message
                    );
                }

                res.json({
                    message:
                        "Your account closure request was submitted. You have been signed out."
                });
            });
        } catch (error) {
            console.error(
                "Unable to request account closure:",
                error.message
            );

            res.status(500).json({
                error:
                    "The account closure request could not be completed."
            });
        }
    }
);

app.get(
    "/api/admin/account-closure-requests",
    requireRoles("Admin"),
    async (req, res) => {
        try {
            const requests = await databaseAll(
                `SELECT
                    UserID,
                    FirstName,
                    LastName,
                    Email,
                    Role,
                    AccountStatus,
                    DeletionRequestedAt
                 FROM Users
                 WHERE AccountStatus =
                        'PendingDeletion'
                   AND Role != 'Admin'
                 ORDER BY
                    DeletionRequestedAt ASC`
            );

            res.json(requests);
        } catch (error) {
            console.error(
                "Unable to retrieve account closure requests:",
                error.message
            );

            res.status(500).json({
                error:
                    "Account closure requests could not be retrieved."
            });
        }
    }
);

app.put(
    "/api/admin/account-closure-requests/:id/restore",
    requireRoles("Admin"),
    async (req, res) => {
        const userID = positiveInteger(
            req.params.id
        );

        if (!userID) {
            return res.status(400).json({
                error: "Invalid user ID."
            });
        }

        try {
            const result = await databaseRun(
                `UPDATE Users
                 SET AccountStatus = 'Active',
                     DeactivatedAt = NULL,
                     DeletionRequestedAt = NULL
                 WHERE UserID = ?
                   AND Role != 'Admin'
                   AND AccountStatus =
                        'PendingDeletion'`,
                [userID]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error:
                        "Pending account closure request not found."
                });
            }

            writeAuditLog(
                req,
                "ACCOUNT_CLOSURE_REJECTED",
                "User",
                userID,
                "Success"
            );

            res.json({
                message:
                    "The account has been restored."
            });
        } catch (error) {
            console.error(
                "Unable to restore account:",
                error.message
            );

            res.status(500).json({
                error:
                    "The account could not be restored."
            });
        }
    }
);

app.put(
    "/api/admin/account-closure-requests/:id/deactivate",
    requireRoles("Admin"),
    async (req, res) => {
        const userID = positiveInteger(
            req.params.id
        );

        if (!userID) {
            return res.status(400).json({
                error: "Invalid user ID."
            });
        }

        try {
            const result = await databaseRun(
                `UPDATE Users
                 SET AccountStatus = 'Deactivated',
                     DeactivatedAt =
                        COALESCE(
                            DeactivatedAt,
                            CURRENT_TIMESTAMP
                        )
                 WHERE UserID = ?
                   AND Role != 'Admin'
                   AND AccountStatus =
                        'PendingDeletion'`,
                [userID]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error:
                        "Pending account closure request not found."
                });
            }

            writeAuditLog(
                req,
                "ACCOUNT_DEACTIVATED",
                "User",
                userID,
                "Success"
            );

            res.json({
                message:
                    "The account has been deactivated."
            });
        } catch (error) {
            console.error(
                "Unable to deactivate account:",
                error.message
            );

            res.status(500).json({
                error:
                    "The account could not be deactivated."
            });
        }
    }
);

// Change the logged-in user's password
app.put(
    "/api/settings/password",
    requireAuthentication,
    async (req, res) => {

    const userID =
        req.session.user.UserID;

    const currentPassword =
        String(
            req.body.CurrentPassword || ""
        );

    const newPassword =
        String(
            req.body.NewPassword || ""
        );


    if (!currentPassword || !newPassword) {

        return res.status(400).json({
            error:
                "Current password and new password are required."
        });

    }


    if (newPassword.length < 8) {

        return res.status(400).json({
            error:
                "The new password must contain at least 8 characters."
        });

    }


    if (currentPassword === newPassword) {

        return res.status(400).json({
            error:
                "The new password must be different from the current password."
        });

    }


    db.get(
        `
            SELECT PasswordHash

            FROM Users

            WHERE UserID = ?
        `,
        [userID],
        async (findError, user) => {

            if (findError) {

                console.error(
                    "Error retrieving account password:",
                    findError.message
                );

                return res.status(500).json({
                    error:
                        "Unable to change the password."
                });

            }

            if (!user) {

                return res.status(404).json({
                    error:
                        "User account not found."
                });

            }


            try {

                const passwordMatches =
                    await bcrypt.compare(
                        currentPassword,
                        user.PasswordHash
                    );


                if (!passwordMatches) {

                    return res.status(401).json({
                        error:
                            "The current password is incorrect."
                    });

                }


                const passwordHash =
                    await bcrypt.hash(
                        newPassword,
                        12
                    );


                db.run(
                    `
                        UPDATE Users

                        SET PasswordHash = ?

                        WHERE UserID = ?
                    `,
                    [
                        passwordHash,
                        userID
                    ],
                    function (updateError) {

                        if (updateError) {

                            console.error(
                                "Error updating password:",
                                updateError.message
                            );

                            return res.status(500).json({
                                error:
                                    "Unable to change the password."
                            });

                        }


                        res.json({
                            message:
                                "Password changed successfully."
                        });

                    }
                );

            }

            catch (error) {

                console.error(
                    "Password update error:",
                    error.message
                );

                res.status(500).json({
                    error:
                        "Unable to change the password."
                });

            }

        }
    );

    }
);

const coachRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many Coach access requests. Please try again later."
    }
});

app.post("/api/coach-access-requests", coachRequestLimiter, async (req, res) => {
    try {
        const firstName = String(req.body.FirstName || "").trim();
        const lastName = String(req.body.LastName || "").trim();
        const email = String(req.body.Email || "").trim().toLowerCase();
        const reason = String(req.body.Reason || "").trim();
        const adminEmail = String(
            process.env.KBD_COACH_REQUEST_ADMIN_EMAIL || "dela@bbopex.com"
        ).trim().toLowerCase();

        if (!firstName || !lastName || !email) {
            return res.status(400).json({
                error: "First name, last name and email address are required."
            });
        }

        if (firstName.length > 100 || lastName.length > 100) {
            return res.status(400).json({
                error: "The supplied name is too long."
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                error: "Enter a valid email address."
            });
        }

        if (reason.length > 1000) {
            return res.status(400).json({
                error: "The reason must not exceed 1,000 characters."
            });
        }

        const admin = await databaseGet(
            `SELECT UserID FROM Users
             WHERE Email = ? AND Role = 'Admin'`,
            [adminEmail]
        );

        if (!admin) {
            return res.status(503).json({
                error: "Coach access requests are temporarily unavailable."
            });
        }

        const existingUser = await databaseGet(
            `SELECT UserID, Role FROM Users WHERE Email = ?`,
            [email]
        );

        if (existingUser && ["Admin", "Coach"].includes(existingUser.Role)) {
            return res.status(409).json({
                error: "This account already has staff access."
            });
        }

        if (existingUser && existingUser.Role !== "Participant") {
            return res.status(409).json({
                error: "This account cannot request Coach access online."
            });
        }

        const pendingRequest = await databaseGet(
            `SELECT CoachRequestID FROM CoachAccessRequests
             WHERE Email = ? AND Status = 'Pending'`,
            [email]
        );

        if (pendingRequest) {
            return res.status(409).json({
                error: "A pending Coach access request already exists for this email address."
            });
        }

        const result = await databaseRun(
            `INSERT INTO CoachAccessRequests
             (UserID, FirstName, LastName, Email, Reason, AssignedAdminID)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                existingUser?.UserID || null,
                firstName,
                lastName,
                email,
                reason || null,
                admin.UserID
            ]
        );

        writeAuditLog(
            req,
            "COACH_ACCESS_REQUEST_CREATED",
            "CoachAccessRequest",
            result.lastID,
            "Success"
        );

        res.status(201).json({
            message: "Your Coach access request has been sent to the administrator.",
            requestID: result.lastID
        });
    } catch (error) {
        console.error("Unable to create Coach access request:", error);

        if (error.code === "SQLITE_CONSTRAINT") {
            return res.status(409).json({
                error: "A pending Coach access request already exists."
            });
        }

        res.status(500).json({
            error: "The Coach access request could not be submitted."
        });
    }
});

// Users
app.post(
    "/api/users",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        const currentUser = req.session.user;
        const firstName = String(req.body.FirstName || "").trim();
        const lastName = String(req.body.LastName || "").trim();
        const email = String(req.body.Email || "").trim().toLowerCase();
        const password = String(req.body.Password || "");
        const role = String(req.body.Role || "Participant").trim();

        let organisationID = null;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                error: "First name, last name, email and password are required."
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                error: "Enter a valid email address."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "Password must contain at least 8 characters."
            });
        }

        if (!["Participant", "Corporate"].includes(role)) {
            return res.status(400).json({
                error: "Coach accounts require an invitation. Admin accounts cannot be created here."
            });
        }

        if (currentUser.Role === "Coach" && role !== "Participant") {
            return sendForbidden(req, res);
        }

        if (role === "Corporate") {
            organisationID = positiveInteger(req.body.OrganisationID);

            if (!organisationID) {
                return res.status(400).json({
                    error: "Corporate accounts require an organisation."
                });
            }
        } else if (currentUser.Role === "Coach") {
            organisationID = currentUser.OrganisationID || null;
        } else {
            organisationID =
                positiveInteger(req.body.OrganisationID) || null;
        }

        try {
            const existing = await databaseGet(
                "SELECT UserID FROM Users WHERE Email = ?",
                [email]
            );

            if (existing) {
                return res.status(409).json({
                    error: "A user with this email already exists."
                });
            }

            if (organisationID) {
                const organisation = await databaseGet(
                    `SELECT OrganisationID
                     FROM Organisations
                     WHERE OrganisationID = ?`,
                    [organisationID]
                );

                if (!organisation) {
                    return res.status(404).json({
                        error: "Organisation not found."
                    });
                }
            }

            if (
                currentUser.Role === "Coach" &&
                organisationID &&
                organisationID !== currentUser.OrganisationID
            ) {
                return sendForbidden(req, res);
            }

            const passwordHash = await bcrypt.hash(password, 12);

            const result = await databaseRun(
                `INSERT INTO Users
                    (FirstName, LastName, Email, PasswordHash,
                     Role, OrganisationID)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    firstName,
                    lastName,
                    email,
                    passwordHash,
                    role,
                    organisationID
                ]
            );

            res.status(201).json({
                message: "User created successfully.",
                user: {
                    UserID: result.lastID,
                    FirstName: firstName,
                    LastName: lastName,
                    Email: email,
                    Role: role,
                    OrganisationID: organisationID
                }
            });
        } catch (error) {
            console.error("Unable to create user:", error.message);
            res.status(500).json({
                error: "Failed to create user."
            });
        }
    }
);

app.use("/api", requireAuthentication);

function prepareAuditDetails(details) {
    if (
        details === null ||
        details === undefined
    ) {
        return null;
    }

    try {
        const value =
            typeof details === "string"
                ? details
                : JSON.stringify(details);

        return value.slice(0, 2000);
    } catch {
        return "Audit details could not be serialised.";
    }
}

function getRequestIPAddress(req) {
    const address =
        req.ip ||
        req.socket?.remoteAddress ||
        null;

    return address
        ? String(address).slice(0, 100)
        : null;
}

function writeAuditLog(
    req,
    action,
    resourceType = null,
    resourceID = null,
    outcome = "Success",
    details = null
) {
    try {
        const sessionUserID = Number(
            req?.session?.user?.UserID
        );

        const userID =
            Number.isInteger(sessionUserID) &&
            sessionUserID > 0
                ? sessionUserID
                : null;

        const allowedOutcomes = [
            "Success",
            "Denied",
            "Failure"
        ];

        const safeOutcome =
            allowedOutcomes.includes(outcome)
                ? outcome
                : "Failure";

        const userAgent =
            req?.get?.("user-agent");

        db.run(
            `INSERT INTO AuditLogs (
                UserID,
                Action,
                ResourceType,
                ResourceID,
                Outcome,
                Details,
                IPAddress,
                UserAgent
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userID,
                String(action || "UNKNOWN")
                    .slice(0, 100),
                resourceType
                    ? String(resourceType)
                        .slice(0, 100)
                    : null,
                positiveInteger(resourceID),
                safeOutcome,
                prepareAuditDetails(details),
                getRequestIPAddress(req),
                userAgent
                    ? String(userAgent)
                        .slice(0, 500)
                    : null
            ],
            error => {
                if (error) {
                    console.error(
                        "Unable to write audit log:",
                        error.message
                    );
                }
            }
        );
    } catch (error) {
        console.error(
            "Audit logging failed safely:",
            error.message
        );
    }
}

app.get(
    "/api/terms/acceptance",
    async (req, res, next) => {
        try {
            const acceptance =
                await databaseGet(
                    `SELECT
                        TermsVersion,
                        AcceptedAt
                     FROM TermsAcceptances
                     WHERE UserID = ?
                       AND TermsVersion = ?
                     LIMIT 1`,
                    [
                        req.session.user.UserID,
                        CURRENT_TERMS_VERSION
                    ]
                );

            res.json({
                Accepted:
                    Boolean(acceptance),
                TermsVersion:
                    CURRENT_TERMS_VERSION,
                AcceptedAt:
                    acceptance?.AcceptedAt ||
                    null
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    "/api/terms/acceptance",
    async (req, res, next) => {
        const termsVersion =
            String(
                req.body.TermsVersion ||
                ""
            ).trim();

        if (
            termsVersion !==
            CURRENT_TERMS_VERSION
        ) {
            return res.status(400).json({
                error:
                    "The current Terms and Conditions must be accepted."
            });
        }

        try {
            await databaseRun(
                `INSERT OR IGNORE INTO TermsAcceptances (
                    UserID,
                    TermsVersion
                 )
                 VALUES (?, ?)`,
                [
                    req.session.user.UserID,
                    termsVersion
                ]
            );

            const acceptance =
                await databaseGet(
                    `SELECT
                        AcceptanceID,
                        TermsVersion,
                        AcceptedAt
                     FROM TermsAcceptances
                     WHERE UserID = ?
                       AND TermsVersion = ?
                     LIMIT 1`,
                    [
                        req.session.user.UserID,
                        termsVersion
                    ]
                );

            writeAuditLog(
                req,
                "TERMS_ACCEPTED",
                "TermsAcceptance",
                acceptance.AcceptanceID,
                "Success"
            );

            res.json({
                message:
                    "Terms acceptance recorded successfully.",
                acceptance
            });
        } catch (error) {
            next(error);
        }
    }
);

app.use(
    "/api",
    requireCurrentTermsAcceptance
);

// ========================================
// GET ACCESSIBLE USERS
// ========================================

app.get(
    "/api/users",
    async (req, res) => {

        const currentUser =
            req.session.user;


        try {

            // ========================================
            // ADMIN
            // ========================================

            if (
                currentUser.Role ===
                "Admin"
            ) {

                const users =
                    await new Promise(
                        (resolve, reject) => {

                            db.all(
                                `
                                    SELECT
                                        UserID,
                                        FirstName,
                                        LastName,
                                        Email,
                                        Role,
                                        OrganisationID,
                                        CreatedAt

                                    FROM Users

                                    ORDER BY
                                        LastName,
                                        FirstName
                                `,
                                [],
                                (error, rows) => {

                                    if (error) {

                                        reject(error);

                                    } else {

                                        resolve(rows);

                                    }

                                }
                            );

                        }
                    );


                return res.json(users);

            }


            // ========================================
            // COACH
            // ========================================

            if (
                currentUser.Role ===
                "Coach"
            ) {

                const users =
                    await new Promise(
                        (resolve, reject) => {

                            db.all(
                                `
                                    SELECT DISTINCT
                                        U.UserID,
                                        U.FirstName,
                                        U.LastName,
                                        U.Email,
                                        U.Role,
                                        U.OrganisationID,
                                        U.CreatedAt

                                    FROM Users U

                                    WHERE
                                        U.UserID = ?

                                        OR
                                        (
                                            U.Role =
                                                'Participant'

                                            AND EXISTS
                                            (
                                                SELECT 1

                                                FROM ProgrammeParticipants PP

                                                INNER JOIN ProgrammeCoaches PC
                                                    ON PC.ProgrammeID =
                                                       PP.ProgrammeID

                                                WHERE
                                                    PP.UserID =
                                                        U.UserID

                                                    AND PC.UserID = ?

                                                    AND PC.Status =
                                                        'Active'

                                                    AND PP.Status IN
                                                    (
                                                        'Active',
                                                        'Completed'
                                                    )
                                            )
                                        )

                                    ORDER BY
                                        U.LastName,
                                        U.FirstName
                                `,
                                [
                                    currentUser.UserID,
                                    currentUser.UserID
                                ],
                                (error, rows) => {

                                    if (error) {

                                        reject(error);

                                    } else {

                                        resolve(rows);

                                    }

                                }
                            );

                        }
                    );


                return res.json(users);

            }


            // ========================================
            // PARTICIPANT
            // ========================================

            if (
                currentUser.Role ===
                "Participant"
            ) {

                const user =
                    await databaseGet(
                        `
                            SELECT
                                UserID,
                                FirstName,
                                LastName,
                                Email,
                                Role,
                                OrganisationID,
                                CreatedAt

                            FROM Users

                            WHERE UserID = ?
                        `,
                        [
                            currentUser.UserID
                        ]
                    );


                return res.json(
                    user
                        ? [user]
                        : []
                );

            }


            // ========================================
            // CORPORATE
            // ========================================

            if (
                currentUser.Role ===
                "Corporate"
            ) {

                const organisationID =
                    corporateOrganisation(
                        req,
                        res
                    );


                if (!organisationID) {

                    return;

                }


                const participants =
                    await new Promise(
                        (resolve, reject) => {

                            db.all(
                                `
                                    SELECT DISTINCT
                                        U.UserID,
                                        U.FirstName,
                                        U.LastName,
                                        U.Role

                                    FROM Users U

                                    INNER JOIN ProgrammeParticipants PP
                                        ON PP.UserID =
                                           U.UserID

                                    INNER JOIN Programmes P
                                        ON P.ProgrammeID =
                                           PP.ProgrammeID

                                    WHERE
                                        P.OrganisationID = ?

                                        AND U.Role =
                                            'Participant'

                                        AND PP.Status IN
                                        (
                                            'Active',
                                            'Completed'
                                        )

                                    ORDER BY
                                        U.LastName,
                                        U.FirstName
                                `,
                                [
                                    organisationID
                                ],
                                (error, rows) => {

                                    if (error) {

                                        reject(error);

                                    } else {

                                        resolve(rows);

                                    }

                                }
                            );

                        }
                    );


                return res.json(
                    participants
                );

            }


            return sendForbidden(req, res);

        }

        catch (error) {

            console.error(
                "Unable to retrieve accessible users:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to retrieve users."

            });

        }

    }
);

// ========================================
// GET ACCESSIBLE USER PROFILE
// ========================================

app.get(
    "/api/users/:id",
    async (req, res) => {

        const requestedUserID =
            positiveInteger(
                req.params.id
            );


        const currentUser =
            req.session.user;


        if (!requestedUserID) {

            return res.status(400).json({

                error:
                    "Invalid user ID."

            });

        }


        try {

            // ========================================
            // ADMIN
            // ========================================

            if (
                currentUser.Role ===
                "Admin"
            ) {

                const user =
                    await databaseGet(
                        `
                            SELECT
                                UserID,
                                FirstName,
                                LastName,
                                Email,
                                Role,
                                OrganisationID,
                                CreatedAt

                            FROM Users

                            WHERE UserID = ?
                        `,
                        [
                            requestedUserID
                        ]
                    );


                if (!user) {

                    return res.status(404).json({

                        error:
                            "User not found."

                    });

                }


                return res.json(user);

            }


            // ========================================
            // PARTICIPANT
            // ========================================

            if (
                currentUser.Role ===
                "Participant"
            ) {

                if (
                    currentUser.UserID !==
                    requestedUserID
                ) {

                    return sendForbidden(req, res);

                }


                const user =
                    await databaseGet(
                        `
                            SELECT
                                UserID,
                                FirstName,
                                LastName,
                                Email,
                                Role,
                                OrganisationID,
                                CreatedAt

                            FROM Users

                            WHERE
                                UserID = ?

                                AND Role =
                                    'Participant'
                        `,
                        [
                            requestedUserID
                        ]
                    );


                if (!user) {

                    return res.status(404).json({

                        error:
                            "User profile not found."

                    });

                }


                return res.json(user);

            }


            // ========================================
            // COACH
            // ========================================

            if (
                currentUser.Role ===
                "Coach"
            ) {

                const viewingOwnProfile =
                    currentUser.UserID ===
                    requestedUserID;


                const hasParticipantAccess =
                    viewingOwnProfile

                        ? true

                        : await coachCanAccessParticipant(
                            currentUser.UserID,
                            requestedUserID
                        );


                if (!hasParticipantAccess) {

                    return sendForbidden(req, res);

                }


                const user =
                    await databaseGet(
                        `
                            SELECT
                                UserID,
                                FirstName,
                                LastName,
                                Email,
                                Role,
                                OrganisationID,
                                CreatedAt

                            FROM Users

                            WHERE
                                UserID = ?

                                AND
                                (
                                    UserID = ?

                                    OR Role =
                                        'Participant'
                                )
                        `,
                        [
                            requestedUserID,
                            currentUser.UserID
                        ]
                    );


                if (!user) {

                    return res.status(404).json({

                        error:
                            "User profile not found."

                    });

                }


                return res.json(user);

            }


            // ========================================
            // CORPORATE
            // ========================================

            if (
                currentUser.Role ===
                "Corporate"
            ) {

                const organisationID =
                    corporateOrganisation(
                        req,
                        res
                    );


                if (!organisationID) {

                    return;

                }


                const hasParticipantAccess =
                    await corporateCanAccessParticipant(
                        organisationID,
                        requestedUserID
                    );


                if (!hasParticipantAccess) {

                    return sendForbidden(req, res);

                }


                // Corporate users receive only
                // limited directory information.

                const participant =
                    await databaseGet(
                        `
                            SELECT
                                UserID,
                                FirstName,
                                LastName,
                                Role

                            FROM Users

                            WHERE
                                UserID = ?

                                AND Role =
                                    'Participant'
                        `,
                        [
                            requestedUserID
                        ]
                    );


                if (!participant) {

                    return res.status(404).json({

                        error:
                            "Participant not found."

                    });

                }


                return res.json(
                    participant
                );

            }


            return sendForbidden(req, res);

        }

        catch (error) {

            console.error(
                "Unable to retrieve user profile:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to retrieve the user profile."

            });

        }

    }
);

// ========================================
// GET PARTICIPANT PROGRAMMES
// ========================================

app.get(
    "/api/users/:id/programmes",
    async (req, res) => {

        const requestedUserID =
            positiveInteger(
                req.params.id
            );


        const currentUser =
            req.session.user;


        if (!requestedUserID) {

            return res.status(400).json({

                error:
                    "Invalid user ID."

            });

        }


        try {

            let accessCondition = "";

            let parameters = [
                requestedUserID
            ];


            // ========================================
            // PARTICIPANT
            // ========================================

            if (
                currentUser.Role ===
                "Participant"
            ) {

                if (
                    currentUser.UserID !==
                    requestedUserID
                ) {

                    return sendForbidden(req, res);

                }

                await tryEnrolParticipants({
                    userID: requestedUserID
                });

            }


            // ========================================
            // COACH
            // ========================================

            else if (
                currentUser.Role ===
                "Coach"
            ) {

                const hasAccess =
                    await coachCanAccessParticipant(
                        currentUser.UserID,
                        requestedUserID
                    );


                if (!hasAccess) {

                    return sendForbidden(req, res);

                }


                accessCondition = `

                    AND EXISTS
                    (
                        SELECT 1

                        FROM ProgrammeCoaches PC

                        WHERE
                            PC.ProgrammeID =
                                P.ProgrammeID

                            AND PC.UserID = ?

                            AND PC.Status =
                                'Active'
                    )
                `;


                parameters.push(
                    currentUser.UserID
                );

            }


            // ========================================
            // CORPORATE
            // ========================================

            else if (
                currentUser.Role ===
                "Corporate"
            ) {

                const organisationID =
                    corporateOrganisation(
                        req,
                        res
                    );


                if (!organisationID) {

                    return;

                }


                const hasAccess =
                    await corporateCanAccessParticipant(
                        organisationID,
                        requestedUserID
                    );


                if (!hasAccess) {

                    return sendForbidden(req, res);

                }


                accessCondition = `

                    AND P.OrganisationID = ?
                `;


                parameters.push(
                    organisationID
                );

            }


            // ========================================
            // ADMIN
            // ========================================

            else if (
                currentUser.Role !==
                "Admin"
            ) {

                return sendForbidden(req, res);

            }


            const programmes =
                await new Promise(
                    (resolve, reject) => {

                        db.all(
                            `
                                SELECT
                                    P.ProgrammeID,
                                    P.ProgrammeName,
                                    P.Description,
                                    P.StartDate,
                                    P.EndDate,

                                    P.Status
                                        AS ProgrammeStatus,

                                    PP.EnrollmentDate,

                                    PP.Status
                                        AS EnrollmentStatus

                                FROM ProgrammeParticipants PP

                                INNER JOIN Programmes P
                                    ON P.ProgrammeID =
                                       PP.ProgrammeID

                                WHERE
                                    PP.UserID = ?

                                    ${accessCondition}

                                ORDER BY
                                    P.StartDate DESC,
                                    P.ProgrammeName
                            `,
                            parameters,
                            (error, rows) => {

                                if (error) {

                                    reject(error);

                                } else {

                                    resolve(rows);

                                }

                            }
                        );

                    }
                );


            return res.json(
                programmes
            );

        }

        catch (error) {

            console.error(
                "Unable to retrieve participant programmes:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to retrieve participant programmes."

            });

        }

    }
);

// Organisations and programmes
app.get("/api/organisations", async (req, res) => {
    const currentUser = req.session.user;
    let accessCondition = "";
    let parameters = [];

    if (currentUser.Role === "Coach") {
        accessCondition = `
            WHERE O.OrganisationID = ?
               OR EXISTS (
                    SELECT 1
                    FROM Programmes P
                    INNER JOIN ProgrammeCoaches PC
                        ON PC.ProgrammeID = P.ProgrammeID
                    WHERE P.OrganisationID = O.OrganisationID
                      AND PC.UserID = ?
                      AND PC.Status = 'Active'
               )
        `;
        parameters = [
            currentUser.OrganisationID || 0,
            currentUser.UserID
        ];
    } else if (currentUser.Role === "Corporate") {
        const organisationID = corporateOrganisation(req, res);
        if (!organisationID) return;

        accessCondition = "WHERE O.OrganisationID = ?";
        parameters = [organisationID];
    } else if (currentUser.Role === "Participant") {
        return sendForbidden(req, res);
    } else if (currentUser.Role !== "Admin") {
        return sendForbidden(req, res);
    }

    try {
        const organisations = await new Promise((resolve, reject) => {
            db.all(
                `
                    SELECT
                        O.OrganisationID,
                        O.OrganisationName,
                        O.ContactName,
                        O.ContactEmail,
                        O.CreatedAt
                    FROM Organisations O
                    ${accessCondition}
                    ORDER BY O.OrganisationName
                `,
                parameters,
                (error, rows) => error
                    ? reject(error)
                    : resolve(rows)
            );
        });

        res.json(organisations);
    } catch (error) {
        console.error(
            "Unable to retrieve organisations:",
            error.message
        );

        res.status(500).json({
            error: "Failed to retrieve organisations."
        });
    }
});

app.get("/api/programmes", async (req, res) => {
    const user = req.session.user;

    if (user.Role === "Participant") {
        await tryEnrolParticipants({ userID: user.UserID });
    }

    let accessJoin = "";
    let where = "";
    let parameters = [];

    if (user.Role === "Coach") {
        accessJoin = `
            JOIN ProgrammeCoaches PC
                ON PC.ProgrammeID = P.ProgrammeID
        `;
        where = `
            WHERE PC.UserID = ?
              AND PC.Status = 'Active'
        `;
        parameters = [user.UserID];
    } else if (user.Role === "Participant") {
        accessJoin = `
            JOIN ProgrammeParticipants PP
                ON PP.ProgrammeID = P.ProgrammeID
        `;
        where = `
            WHERE PP.UserID = ?
              AND PP.Status IN ('Active', 'Completed')
        `;
        parameters = [user.UserID];
    } else if (user.Role === "Corporate") {
        if (!corporateOrganisation(req, res)) return;

        where = `
            WHERE P.OrganisationID = ?
        `;
        parameters = [user.OrganisationID];
    }

    db.all(
        `
            SELECT DISTINCT
                P.*,
                O.OrganisationName

            FROM Programmes P

            LEFT JOIN Organisations O
                ON O.OrganisationID = P.OrganisationID

            ${accessJoin}
            ${where}

            ORDER BY
                P.StartDate IS NULL,
                P.StartDate,
                P.ProgrammeName
        `,
        parameters,
        (error, rows) => {
            if (error) {
                console.error(
                    "Unable to retrieve programmes:",
                    error.message
                );

                return res.status(500).json({
                    error: "Failed to retrieve programmes."
                });
            }

            res.json(rows);
        }
    );
});

app.post(
    "/api/programmes",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        const currentUser = req.session.user;
        const name = String(req.body.ProgrammeName || "").trim();
        const description = String(req.body.Description || "").trim() || null;
        const startDate = req.body.StartDate || null;
        const endDate = req.body.EndDate || null;
        const status = String(req.body.Status || "Active").trim();
        const allowedStatuses = [
            "Draft",
            "Active",
            "Completed",
            "Archived"
        ];

        if (!name) {
            return res.status(400).json({
                error: "Programme name is required."
            });
        }

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                error: "Invalid programme status."
            });
        }

        if (startDate && endDate && endDate < startDate) {
            return res.status(400).json({
                error: "End date cannot be earlier than start date."
            });
        }

        if (
            name.length > 255 ||
            (description && description.length > 10000)
        ) {
            return res.status(400).json({
                error: "Programme name or description is too long."
            });
        }

        try {
            const result = await databaseRun(
                `INSERT INTO Programmes (
                    OrganisationID,
                    ProgrammeName,
                    Description,
                    StartDate,
                    EndDate,
                    Status
                )
                VALUES (NULL, ?, ?, ?, ?, ?)`,
                [
                    name,
                    description,
                    startDate,
                    endDate,
                    status
                ]
            );

            if (currentUser.Role === "Coach") {
                try {
                    await databaseRun(
                        `INSERT INTO ProgrammeCoaches (
                            ProgrammeID,
                            UserID,
                            Status
                        )
                        VALUES (?, ?, 'Active')`,
                        [
                            result.lastID,
                            currentUser.UserID
                        ]
                    );
                } catch (assignmentError) {
                    await databaseRun(
                        `DELETE FROM Programmes
                         WHERE ProgrammeID = ?`,
                        [result.lastID]
                    );

                    throw assignmentError;
                }
            }

            if (status === "Active") {
                await tryEnrolParticipants({
                    programmeID: result.lastID
                });
            }

            res.status(201).json({
                message: "Programme created successfully.",
                ProgrammeID: result.lastID
            });
        } catch (error) {
            console.error(
                "Unable to create programme:",
                error.message
            );

            res.status(500).json({
                error: "Failed to create programme."
            });
        }
    }
);

app.put(
    "/api/programmes/:id/status",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        const currentUser = req.session.user;
        const programmeID = positiveInteger(req.params.id);
        const status = String(req.body.Status || "").trim();
        const allowedStatuses = ["Draft", "Active", "Completed", "Archived"];

        if (!programmeID) {
            return res.status(400).json({
                error: "Invalid programme ID."
            });
        }

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                error: "Invalid programme status."
            });
        }

        try {
            const programme = await databaseGet(
                `SELECT ProgrammeID, Status
                 FROM Programmes
                 WHERE ProgrammeID = ?`,
                [programmeID]
            );

            if (!programme) {
                return res.status(404).json({
                    error: "Programme not found."
                });
            }

            if (currentUser.Role === "Coach") {
                const hasAccess = await coachCanAccessProgramme(
                    currentUser.UserID,
                    programmeID
                );

                if (!hasAccess) return sendForbidden(req, res);

                if (status === "Archived") {
                    return res.status(403).json({
                        error: "Only an Admin can archive a programme."
                    });
                }

                if (programme.Status === "Archived") {
                    return res.status(403).json({
                        error: "Only an Admin can reopen an archived programme."
                    });
                }
            }

            const result = await databaseRun(
                `UPDATE Programmes
                 SET Status = ?
                 WHERE ProgrammeID = ?`,
                [status, programmeID]
            );

            if (!result.changes) {
                return res.status(500).json({
                    error: "The programme status could not be updated."
                });
            }

            if (status === "Active") {
                await tryEnrolParticipants({ programmeID });
            }

            res.json({
                message: "Programme status updated successfully.",
                ProgrammeID: programmeID,
                Status: status
            });
        } catch (error) {
            console.error(
                "Unable to update programme status:",
                error.message
            );

            res.status(500).json({
                error: "Failed to update programme status."
            });
        }
    }
);

async function authoriseMaterialFileUpload(req, res, next) {
    try {
        const materialID = positiveInteger(req.params.id);

        if (!materialID) {
            return res.status(400).json({
                error: "Invalid learning material ID."
            });
        }

        const material = await databaseGet(
            `SELECT MaterialID, ProgrammeID
             FROM LearningMaterials
             WHERE MaterialID = ?`,
            [materialID]
        );

        if (!material) {
            return res.status(404).json({
                error: "Learning material not found."
            });
        }

        const user = req.session.user;

        if (user.Role === "Admin") {
            req.authorisedMaterial = material;
            return next();
        }

        if (
            user.Role === "Coach" &&
            await coachCanAccessProgramme(
                user.UserID,
                material.ProgrammeID
            )
        ) {
            req.authorisedMaterial = material;
            return next();
        }

        writeAuditLog(
            req,
            "MATERIAL_FILE_UPLOAD",
            "LearningMaterial",
            materialID,
            "Denied"
        );

        res.status(403).json({
            error: "You cannot upload files to this learning material."
        });
    } catch (error) {
        next(error);
    }
}

async function authoriseAssessmentFileUpload(req, res, next) {
    try {
        const assessmentID = positiveInteger(req.params.id);

        if (!assessmentID) {
            return res.status(400).json({
                error: "Invalid assessment ID."
            });
        }

        const assessment = await databaseGet(
            `SELECT AssessmentID, ProgrammeID
             FROM Assessments
             WHERE AssessmentID = ?`,
            [assessmentID]
        );

        if (!assessment) {
            return res.status(404).json({
                error: "Assessment not found."
            });
        }

        const user = req.session.user;

        if (user.Role === "Admin") {
            req.authorisedAssessment = assessment;
            return next();
        }

        if (
            user.Role === "Coach" &&
            await coachCanAccessProgramme(
                user.UserID,
                assessment.ProgrammeID
            )
        ) {
            req.authorisedAssessment = assessment;
            return next();
        }

        writeAuditLog(
            req,
            "ASSESSMENT_FILE_UPLOAD",
            "Assessment",
            assessmentID,
            "Denied"
        );

        res.status(403).json({
            error: "You cannot upload files to this assessment."
        });
    } catch (error) {
        next(error);
    }
}

async function assignParticipant(req, res) {
    const currentUser = req.session.user;
    const programmeID = positiveInteger(
        req.params.id || req.body.ProgrammeID
    );
    const participantID = positiveInteger(req.body.UserID);

    if (!programmeID || !participantID) {
        return res.status(400).json({
            error: "Valid programme and participant IDs are required."
        });
    }

    try {
        const programme = await databaseGet(
            `SELECT ProgrammeID, OrganisationID, Status
             FROM Programmes
             WHERE ProgrammeID = ?`,
            [programmeID]
        );

        if (!programme) {
            return res.status(404).json({
                error: "Programme not found."
            });
        }

        if (programme.Status === "Archived") {
            return res.status(400).json({
                error: "Participants cannot be assigned to an archived programme."
            });
        }

        if (currentUser.Role === "Coach") {
            const hasAccess = await coachCanAccessProgramme(
                currentUser.UserID,
                programmeID
            );

            if (!hasAccess) return sendForbidden(req, res);
        }

        const participant = await databaseGet(
            `SELECT UserID, Role, OrganisationID
             FROM Users
             WHERE UserID = ?`,
            [participantID]
        );

        if (!participant || participant.Role !== "Participant") {
            return res.status(400).json({
                error: "A valid participant account is required."
            });
        }

        if (
            participant.OrganisationID &&
            participant.OrganisationID !== programme.OrganisationID
        ) {
            return sendForbidden(req, res);
        }

        const existing = await databaseGet(
            `SELECT ProgrammeParticipantID
             FROM ProgrammeParticipants
             WHERE ProgrammeID = ?
               AND UserID = ?`,
            [programmeID, participantID]
        );

        if (existing) {
            return res.status(409).json({
                error: "This participant is already assigned to the programme."
            });
        }

        await databaseRun("BEGIN TRANSACTION");

        try {
            const enrolment = await databaseRun(
                `INSERT INTO ProgrammeParticipants
                    (ProgrammeID, UserID, Status)
                 VALUES (?, ?, 'Active')`,
                [programmeID, participantID]
            );

            await databaseRun(
                `INSERT OR IGNORE INTO Progress
                    (ProgrammeID, UserID, ProgressPercentage, Status)
                 VALUES (?, ?, 0, 'Not Started')`,
                [programmeID, participantID]
            );

            await databaseRun("COMMIT");

            res.status(201).json({
                message: "Participant assigned successfully.",
                ProgrammeParticipantID: enrolment.lastID
            });
        } catch (error) {
            await databaseRun("ROLLBACK");
            throw error;
        }
    } catch (error) {
        console.error(
            "Unable to assign participant:",
            error.message
        );

        res.status(500).json({
            error: "Failed to assign participant."
        });
    }
}
app.post("/api/programmes/:id/participants", requireRoles("Admin", "Coach"), assignParticipant);
app.post("/api/programme-participants", requireRoles("Admin", "Coach"), assignParticipant);

// Sessions
// ========================================
// GET ACCESSIBLE SESSIONS
// ========================================

app.get(
    "/api/sessions",
    async (req, res) => {

        const currentUser =
            req.session.user;


        try {

            let accessCondition = "";

            let parameters = [];


            // ========================================
            // ADMIN
            // ========================================

            if (
                currentUser.Role ===
                "Admin"
            ) {

                // Admin may retrieve all sessions.
                accessCondition = "";

            }


            // ========================================
            // COACH
            // ========================================

            else if (
                currentUser.Role ===
                "Coach"
            ) {

                accessCondition = `

                    WHERE
                        S.CoachID = ?

                        AND EXISTS
                        (
                            SELECT 1

                            FROM ProgrammeCoaches PC

                            WHERE
                                PC.ProgrammeID =
                                    S.ProgrammeID

                                AND PC.UserID =
                                    S.CoachID

                                AND PC.Status =
                                    'Active'
                        )
                `;


                parameters = [
                    currentUser.UserID
                ];

            }


            // ========================================
            // PARTICIPANT
            // ========================================

            else if (
                currentUser.Role ===
                "Participant"
            ) {

                accessCondition = `

                    WHERE
                        S.ParticipantID = ?

                        AND EXISTS
                        (
                            SELECT 1

                            FROM ProgrammeParticipants PP

                            WHERE
                                PP.ProgrammeID =
                                    S.ProgrammeID

                                AND PP.UserID =
                                    S.ParticipantID

                                AND PP.Status IN
                                (
                                    'Active',
                                    'Completed'
                                )
                        )
                `;


                parameters = [
                    currentUser.UserID
                ];

            }


            // ========================================
            // CORPORATE
            // ========================================

            else if (
                currentUser.Role ===
                "Corporate"
            ) {

                return sendForbidden(req, res);

            }


            else {

                return sendForbidden(req, res);

            }


            const sessions =
                await new Promise(
                    (resolve, reject) => {

                        db.all(
                            `
                                SELECT
                                    S.SessionID,
                                    S.ProgrammeID,
                                    S.CoachID,
                                    S.ParticipantID,
                                    S.SessionDate,
                                    S.StartTime,
                                    S.EndTime,
                                    S.SessionType,
                                    S.Status,
                                    S.CreatedAt,

                                    P.ProgrammeName,

                                    Coach.FirstName
                                        AS CoachFirstName,

                                    Coach.LastName
                                        AS CoachLastName,

                                    Participant.FirstName
                                        AS ParticipantFirstName,

                                    Participant.LastName
                                        AS ParticipantLastName

                                FROM Sessions S

                                INNER JOIN Programmes P
                                    ON P.ProgrammeID =
                                       S.ProgrammeID

                                INNER JOIN Users Coach
                                    ON Coach.UserID =
                                       S.CoachID

                                INNER JOIN Users Participant
                                    ON Participant.UserID =
                                       S.ParticipantID

                                ${accessCondition}

                                ORDER BY
                                    S.SessionDate,
                                    S.StartTime
                            `,
                            parameters,
                            (error, rows) => {

                                if (error) {

                                    reject(error);

                                } else {

                                    resolve(rows);

                                }

                            }
                        );

                    }
                );


            return res.json(
                sessions
            );

        }

        catch (error) {

            console.error(
                "Failed to retrieve accessible sessions:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to retrieve sessions."

            });

        }

    }
);

app.post(
    "/api/sessions",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        const currentUser = req.session.user;
        const programmeID = positiveInteger(req.body.ProgrammeID);
        const participantID = positiveInteger(req.body.ParticipantID);
        const coachID = currentUser.Role === "Coach"
            ? currentUser.UserID
            : positiveInteger(req.body.CoachID);
        const sessionDate = String(req.body.SessionDate || "").trim();
        const startTime = String(req.body.StartTime || "").trim() || null;
        const endTime = String(req.body.EndTime || "").trim() || null;
        const sessionType =
            String(req.body.SessionType || "Coaching").trim();

        if (!programmeID || !participantID || !coachID || !sessionDate) {
            return res.status(400).json({
                error: "Programme, Coach, participant and date are required."
            });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
            return res.status(400).json({
                error: "Session date must use YYYY-MM-DD format."
            });
        }

        if (
            (startTime && !/^\d{2}:\d{2}$/.test(startTime)) ||
            (endTime && !/^\d{2}:\d{2}$/.test(endTime))
        ) {
            return res.status(400).json({
                error: "Session times must use HH:MM format."
            });
        }

        if (startTime && endTime && endTime <= startTime) {
            return res.status(400).json({
                error: "End time must be later than start time."
            });
        }

        if (sessionType.length > 100) {
            return res.status(400).json({
                error: "Session type is too long."
            });
        }

        try {
            const programme = await databaseGet(
                `SELECT ProgrammeID, Status
                 FROM Programmes
                 WHERE ProgrammeID = ?`,
                [programmeID]
            );

            if (!programme) {
                return res.status(404).json({
                    error: "Programme not found."
                });
            }

            if (programme.Status === "Archived") {
                return res.status(400).json({
                    error: "Sessions cannot be added to an archived programme."
                });
            }

            const assignment = await databaseGet(
                `
                    SELECT P.ProgrammeID
                    FROM Programmes P
                    WHERE P.ProgrammeID = ?
                      AND EXISTS (
                          SELECT 1
                          FROM ProgrammeCoaches PC
                          INNER JOIN Users C
                              ON C.UserID = PC.UserID
                          WHERE PC.ProgrammeID = P.ProgrammeID
                            AND PC.UserID = ?
                            AND PC.Status = 'Active'
                            AND C.Role = 'Coach'
                      )
                      AND EXISTS (
                          SELECT 1
                          FROM ProgrammeParticipants PP
                          INNER JOIN Users U
                              ON U.UserID = PP.UserID
                          WHERE PP.ProgrammeID = P.ProgrammeID
                            AND PP.UserID = ?
                            AND PP.Status = 'Active'
                            AND U.Role = 'Participant'
                      )
                `,
                [programmeID, coachID, participantID]
            );

            if (!assignment) return sendForbidden(req, res);

            const conflict = await databaseGet(
                `
                    SELECT SessionID
                    FROM Sessions
                    WHERE SessionDate = ?
                      AND StartTime = ?
                      AND Status IN ('Scheduled', 'Rescheduled')
                      AND (CoachID = ? OR ParticipantID = ?)
                    LIMIT 1
                `,
                [sessionDate, startTime, coachID, participantID]
            );

            if (startTime && conflict) {
                return res.status(409).json({
                    error: "The Coach or participant already has a session at this time."
                });
            }

            const result = await databaseRun(
                `INSERT INTO Sessions
                    (ProgrammeID, CoachID, ParticipantID, SessionDate,
                     StartTime, EndTime, SessionType, Status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled')`,
                [
                    programmeID,
                    coachID,
                    participantID,
                    sessionDate,
                    startTime,
                    endTime,
                    sessionType
                ]
            );

            res.status(201).json({
                message: "Session scheduled successfully.",
                SessionID: result.lastID
            });
        } catch (error) {
            console.error("Unable to schedule session:", error.message);
            res.status(500).json({
                error: "Failed to schedule session."
            });
        }
    }
);

// ========================================
// GET SESSION NOTES
// ========================================

app.get(
    "/api/sessions/:id/notes",

    requireRoles(
        "Admin",
        "Coach"
    ),

    async (req, res) => {

        const sessionID =
            positiveInteger(
                req.params.id
            );


        const currentUser =
            req.session.user;


        if (!sessionID) {

            return res.status(400).json({

                error:
                    "Invalid session ID."

            });

        }


        try {

            const sessionRecord =
                await databaseGet(
                    `
                        SELECT
                            SessionID,
                            ProgrammeID,
                            CoachID,
                            ParticipantID

                        FROM Sessions

                        WHERE SessionID = ?
                    `,
                    [
                        sessionID
                    ]
                );


            if (!sessionRecord) {

                return res.status(404).json({

                    error:
                        "Session not found."

                });

            }


            if (
                currentUser.Role ===
                "Coach"
            ) {

                if (
                    sessionRecord.CoachID !==
                    currentUser.UserID
                ) {

                    return sendForbidden(req, res);

                }


                const hasProgrammeAccess =
                    await coachCanAccessProgramme(
                        currentUser.UserID,
                        sessionRecord.ProgrammeID
                    );


                if (!hasProgrammeAccess) {

                    return sendForbidden(req, res);

                }

            }


            const notes =
                await new Promise(
                    (resolve, reject) => {

                        db.all(
                            `
                                SELECT
                                    N.SessionNoteID,
                                    N.SessionID,
                                    N.CoachID,
                                    N.Notes,
                                    N.CreatedAt,
                                    N.UpdatedAt,

                                    Coach.FirstName
                                        AS CoachFirstName,

                                    Coach.LastName
                                        AS CoachLastName

                                FROM SessionNotes N

                                INNER JOIN Users Coach
                                    ON Coach.UserID =
                                       N.CoachID

                                WHERE
                                    N.SessionID = ?

                                ORDER BY
                                    N.CreatedAt DESC
                            `,
                            [
                                sessionID
                            ],
                            (error, rows) => {

                                if (error) {

                                    reject(error);

                                } else {

                                    resolve(rows);

                                }

                            }
                        );

                    }
                );


            return res.json(notes);

        }

        catch (error) {

            console.error(
                "Unable to retrieve session notes:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to retrieve session notes."

            });

        }

    }
);

// ========================================
// UPDATE SESSION STATUS
// ========================================

app.put(
    "/api/sessions/:id/status",

    requireRoles(
        "Admin",
        "Coach"
    ),

    async (req, res) => {

        const sessionID =
            positiveInteger(
                req.params.id
            );


        const requestedStatus =
            String(
                req.body.Status || ""
            ).trim();


        const currentUser =
            req.session.user;


        const allowedStatuses = [

            "Scheduled",
            "Completed",
            "Cancelled",
            "Rescheduled"

        ];


        if (!sessionID) {

            return res.status(400).json({

                error:
                    "Invalid session ID."

            });

        }


        if (
            !allowedStatuses.includes(
                requestedStatus
            )
        ) {

            return res.status(400).json({

                error:
                    "Invalid session status."

            });

        }


        try {

            const sessionRecord =
                await databaseGet(
                    `
                        SELECT
                            SessionID,
                            ProgrammeID,
                            CoachID,
                            ParticipantID,
                            Status

                        FROM Sessions

                        WHERE SessionID = ?
                    `,
                    [
                        sessionID
                    ]
                );


            if (!sessionRecord) {

                return res.status(404).json({

                    error:
                        "Session not found."

                });

            }


            // A Coach may update only a session
            // that is assigned directly to them.

            if (
                currentUser.Role ===
                "Coach"
            ) {

                if (
                    sessionRecord.CoachID !==
                    currentUser.UserID
                ) {

                    return sendForbidden(req, res);

                }


                const hasProgrammeAccess =
                    await coachCanAccessProgramme(
                        currentUser.UserID,
                        sessionRecord.ProgrammeID
                    );


                if (!hasProgrammeAccess) {

                    return sendForbidden(req, res);

                }

            }


            const updateResult =
                await databaseRun(
                    `
                        UPDATE Sessions

                        SET Status = ?

                        WHERE SessionID = ?
                    `,
                    [
                        requestedStatus,
                        sessionID
                    ]
                );


            if (
                updateResult.changes === 0
            ) {

                return res.status(500).json({

                    error:
                        "The session status could not be updated."

                });

            }


            return res.json({

                message:
                    "Session status updated successfully.",

                SessionID:
                    sessionID,

                Status:
                    requestedStatus

            });

        }

        catch (error) {

            console.error(
                "Unable to update session status:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to update session status."

            });

        }

    }
);

// ========================================
// CREATE SESSION NOTE
// ========================================

app.post(
    "/api/sessions/:id/notes",

    requireRoles(
        "Coach"
    ),

    async (req, res) => {

        const sessionID =
            positiveInteger(
                req.params.id
            );


        const notes =
            String(
                req.body.Notes || ""
            ).trim();


        const currentUser =
            req.session.user;


        if (!sessionID) {

            return res.status(400).json({

                error:
                    "Invalid session ID."

            });

        }


        if (!notes) {

            return res.status(400).json({

                error:
                    "Session notes are required."

            });

        }


        if (
            notes.length > 10000
        ) {

            return res.status(400).json({

                error:
                    "Session notes must not exceed 10,000 characters."

            });

        }


        try {

            const sessionRecord =
                await databaseGet(
                    `
                        SELECT
                            SessionID,
                            ProgrammeID,
                            CoachID,
                            ParticipantID,
                            Status

                        FROM Sessions

                        WHERE SessionID = ?
                    `,
                    [
                        sessionID
                    ]
                );


            if (!sessionRecord) {

                return res.status(404).json({

                    error:
                        "Session not found."

                });

            }


            if (
                sessionRecord.CoachID !==
                currentUser.UserID
            ) {

                return sendForbidden(req, res);

            }


            const hasProgrammeAccess =
                await coachCanAccessProgramme(
                    currentUser.UserID,
                    sessionRecord.ProgrammeID
                );


            if (!hasProgrammeAccess) {

                return sendForbidden(req, res);

            }


            const insertResult =
                await databaseRun(
                    `
                        INSERT INTO SessionNotes
                        (
                            SessionID,
                            CoachID,
                            Notes
                        )

                        VALUES (?, ?, ?)
                    `,
                    [
                        sessionID,
                        currentUser.UserID,
                        notes
                    ]
                );


            return res.status(201).json({

                message:
                    "Session note created successfully.",

                SessionNoteID:
                    insertResult.lastID

            });

        }

        catch (error) {

            console.error(
                "Unable to create session note:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to create session note."

            });

        }

    }
);

// Actions
// ========================================
// GET ACCESSIBLE ACTIONS
// ========================================

app.get(
    "/api/actions",
    async (req, res) => {

        const currentUser =
            req.session.user;


        try {

            let accessCondition = "";

            let parameters = [];


            // ========================================
            // ADMIN
            // ========================================

            if (
                currentUser.Role ===
                "Admin"
            ) {

                accessCondition = "";

            }


            // ========================================
            // COACH
            // ========================================

            else if (
                currentUser.Role ===
                "Coach"
            ) {

                accessCondition = `

                    WHERE
                        A.AssignedBy = ?

                        AND EXISTS
                        (
                            SELECT 1

                            FROM ProgrammeCoaches PC

                            WHERE
                                PC.ProgrammeID =
                                    A.ProgrammeID

                                AND PC.UserID = ?

                                AND PC.Status =
                                    'Active'
                        )
                `;


                parameters = [

                    currentUser.UserID,
                    currentUser.UserID

                ];

            }


            // ========================================
            // PARTICIPANT
            // ========================================

            else if (
                currentUser.Role ===
                "Participant"
            ) {

                accessCondition = `

                    WHERE
                        A.AssignedTo = ?

                        AND EXISTS
                        (
                            SELECT 1

                            FROM ProgrammeParticipants PP

                            WHERE
                                PP.ProgrammeID =
                                    A.ProgrammeID

                                AND PP.UserID =
                                    A.AssignedTo

                                AND PP.Status IN
                                (
                                    'Active',
                                    'Completed'
                                )
                        )
                `;


                parameters = [
                    currentUser.UserID
                ];

            }


            // ========================================
            // CORPORATE
            // ========================================

            else if (
                currentUser.Role ===
                "Corporate"
            ) {

                return sendForbidden(req, res);

            }


            else {

                return sendForbidden(req, res);

            }


            const actions =
                await new Promise(
                    (resolve, reject) => {

                        db.all(
                            `
                                SELECT
                                    A.ActionID,
                                    A.ProgrammeID,
                                    A.SessionID,
                                    A.AssignedTo,
                                    A.AssignedBy,
                                    A.Title,
                                    A.Description,
                                    A.DueDate,
                                    A.Status,
                                    A.CompletedAt,
                                    A.CreatedAt,

                                    P.ProgrammeName,

                                    Participant.FirstName
                                        AS ParticipantFirstName,

                                    Participant.LastName
                                        AS ParticipantLastName,

                                    Coach.FirstName
                                        AS CoachFirstName,

                                    Coach.LastName
                                        AS CoachLastName

                                FROM Actions A

                                INNER JOIN Programmes P
                                    ON P.ProgrammeID =
                                       A.ProgrammeID

                                INNER JOIN Users Participant
                                    ON Participant.UserID =
                                       A.AssignedTo

                                INNER JOIN Users Coach
                                    ON Coach.UserID =
                                       A.AssignedBy

                                ${accessCondition}

                                ORDER BY
                                    CASE
                                        WHEN A.DueDate IS NULL
                                            THEN 1
                                        ELSE 0
                                    END,

                                    A.DueDate,
                                    A.CreatedAt DESC
                            `,
                            parameters,
                            (error, rows) => {

                                if (error) {

                                    reject(error);

                                } else {

                                    resolve(rows);

                                }

                            }
                        );

                    }
                );


            return res.json(actions);

        }

        catch (error) {

            console.error(
                "Unable to retrieve accessible actions:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to retrieve actions."

            });

        }

    }
);

app.post("/api/actions", requireRoles("Admin", "Coach"), (req, res) => {
    const user = req.session.user;
    const programmeID = positiveInteger(req.body.ProgrammeID);
    const participantID = positiveInteger(req.body.AssignedTo);
    const coachID = user.Role === "Coach" ? user.UserID : positiveInteger(req.body.AssignedBy);
    const sessionID = req.body.SessionID ? positiveInteger(req.body.SessionID) : null;
    const title = String(req.body.Title || "").trim();
    if (!programmeID || !participantID || !coachID || !title || (req.body.SessionID && !sessionID)) {
        return res.status(400).json({ error: "Valid programme, participant, coach, session and title values are required." });
    }
    db.get(`SELECT P.ProgrammeID FROM Programmes P WHERE P.ProgrammeID = ?
            AND EXISTS (SELECT 1 FROM ProgrammeCoaches PC WHERE PC.ProgrammeID = P.ProgrammeID AND PC.UserID = ? AND PC.Status = 'Active')
            AND EXISTS (SELECT 1 FROM ProgrammeParticipants PP WHERE PP.ProgrammeID = P.ProgrammeID AND PP.UserID = ? AND PP.Status = 'Active')
            AND (? IS NULL OR EXISTS (SELECT 1 FROM Sessions S WHERE S.SessionID = ? AND S.ProgrammeID = P.ProgrammeID
                                      AND S.CoachID = ? AND S.ParticipantID = ?))`,
        [programmeID, coachID, participantID, sessionID, sessionID, coachID, participantID], (error, row) => {
            if (error) return res.status(500).json({ error: "Failed to verify action details." });
            if (!row) return res.status(403).json({ error: "The programme, participant or session is not available to this Coach." });
            db.run(`INSERT INTO Actions (ProgrammeID, SessionID, AssignedTo, AssignedBy, Title, Description, DueDate, Status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`, [programmeID, sessionID, participantID, coachID, title,
                String(req.body.Description || "").trim() || null, req.body.DueDate || null], function (insertError) {
                if (insertError) return res.status(500).json({ error: "Failed to create action." });
                res.status(201).json({ message: "Action created successfully.", ActionID: this.lastID });
            });
        });
});

app.post(
    "/api/actions/:id/files",
    requireRoles("Admin", "Coach"),
    authoriseActionFileUpload,
    secureFileUpload.single("File"),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                error: "Select a file to upload."
            });
        }

        try {
            const result = await databaseRun(
                `INSERT INTO UploadedFiles (
                    ActionID,
                    UploadedBy,
                    OriginalFileName,
                    StoredFileName,
                    MimeType,
                    FileSize,
                    StorageKey
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.authorisedAction.ActionID,
                    req.session.user.UserID,
                    req.file.originalname,
                    req.file.filename,
                    req.file.mimetype,
                    req.file.size,
                    req.file.filename
                ]
            );

            writeAuditLog(
                req,
                "ACTION_FILE_UPLOADED",
                "UploadedFile",
                result.lastID,
                "Success"
            );

            res.status(201).json({
                message: "Action file uploaded successfully.",
                file: {
                    UploadedFileID: result.lastID,
                    ActionID: req.authorisedAction.ActionID,
                    OriginalFileName: req.file.originalname,
                    MimeType: req.file.mimetype,
                    FileSize: req.file.size
                }
            });
        } catch (error) {
            try {
                await fs.promises.unlink(req.file.path);
            } catch (deleteError) {
                if (deleteError.code !== "ENOENT") {
                    console.error(
                        "Unable to remove failed Action upload:",
                        deleteError
                    );
                }
            }

            console.error("Action file upload failed:", error);

            res.status(500).json({
                error: "The Action file could not be saved."
            });
        }
    }
);

app.get(
    "/api/actions/:id/files",
    requireRoles("Admin", "Coach", "Participant"),
    async (req, res, next) => {
        try {
            const actionID = positiveInteger(req.params.id);
            if (!actionID) return res.status(400).json({ error: "Invalid action ID." });

            const action = await databaseGet(
                `SELECT ActionID, ProgrammeID, AssignedTo FROM Actions WHERE ActionID = ?`,
                [actionID]
            );
            if (!action) return res.status(404).json({ error: "Action not found." });

            if (!await canAccessActionFiles(req.session.user, action)) {
                writeAuditLog(req, "ACTION_FILES_VIEW", "Action", actionID, "Denied");
                return res.status(403).json({ error: "You cannot view files for this action." });
            }

            const files = await databaseAll(
                `SELECT UploadedFileID, ActionID, OriginalFileName, MimeType, FileSize, CreatedAt
                 FROM UploadedFiles
                 WHERE ActionID = ?
                 ORDER BY CreatedAt DESC, UploadedFileID DESC`,
                [actionID]
            );
            res.json(files);
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    "/api/action-files/:id/download",
    requireRoles("Admin", "Coach", "Participant"),
    async (req, res, next) => {
        try {
            const fileID = positiveInteger(req.params.id);
            if (!fileID) return res.status(400).json({ error: "Invalid file ID." });

            const file = await databaseGet(
                `SELECT file.UploadedFileID, file.OriginalFileName, file.StorageKey,
                        action.ActionID, action.ProgrammeID, action.AssignedTo
                 FROM UploadedFiles AS file
                 JOIN Actions AS action ON action.ActionID = file.ActionID
                 WHERE file.UploadedFileID = ? AND file.ActionID IS NOT NULL`,
                [fileID]
            );
            if (!file) return res.status(404).json({ error: "Action file not found." });

            if (!await canAccessActionFiles(req.session.user, file)) {
                writeAuditLog(req, "ACTION_FILE_DOWNLOAD", "UploadedFile", fileID, "Denied");
                return res.status(403).json({ error: "You cannot download this action file." });
            }

            if (path.basename(file.StorageKey) !== file.StorageKey) {
                return res.status(500).json({ error: "The stored file path is invalid." });
            }

            const filePath = path.join(uploadDirectory, file.StorageKey);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: "The stored file is unavailable." });
            }

            writeAuditLog(req, "ACTION_FILE_DOWNLOADED", "UploadedFile", fileID, "Success");
            res.download(filePath, file.OriginalFileName, error => {
                if (error && !res.headersSent) next(error);
            });
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    "/api/action-files/:id",
    requireRoles("Admin", "Coach"),
    async (req, res, next) => {
        try {
            const fileID = positiveInteger(req.params.id);
            if (!fileID) return res.status(400).json({ error: "Invalid file ID." });

            const file = await databaseGet(
                `SELECT file.UploadedFileID, file.StorageKey,
                        action.ActionID, action.ProgrammeID, action.AssignedTo
                 FROM UploadedFiles AS file
                 JOIN Actions AS action ON action.ActionID = file.ActionID
                 WHERE file.UploadedFileID = ? AND file.ActionID IS NOT NULL`,
                [fileID]
            );
            if (!file) return res.status(404).json({ error: "Action file not found." });

            if (!await canAccessActionFiles(req.session.user, file, true)) {
                writeAuditLog(req, "ACTION_FILE_DELETE", "UploadedFile", fileID, "Denied");
                return res.status(403).json({ error: "You cannot delete this action file." });
            }

            if (path.basename(file.StorageKey) !== file.StorageKey) {
                return res.status(500).json({ error: "The stored file path is invalid." });
            }

            const result = await databaseRun(
                `DELETE FROM UploadedFiles WHERE UploadedFileID = ? AND ActionID IS NOT NULL`,
                [fileID]
            );
            if (!result.changes) return res.status(404).json({ error: "Action file not found." });

            try {
                await fs.promises.unlink(path.join(uploadDirectory, file.StorageKey));
            } catch (error) {
                if (error.code !== "ENOENT") {
                    console.error("Unable to remove Action file:", error);
                }
            }

            writeAuditLog(req, "ACTION_FILE_DELETED", "UploadedFile", fileID, "Success");
            res.json({ message: "Action file deleted successfully." });
        } catch (error) {
            next(error);
        }
    }
);

// ========================================
// UPDATE ACTION STATUS
// ========================================

app.put(
    "/api/actions/:id",

    requireRoles(
        "Admin",
        "Coach",
        "Participant"
    ),

    async (req, res) => {

        const actionID =
            positiveInteger(
                req.params.id
            );


        const requestedStatus =
            String(
                req.body.Status || ""
            ).trim();


        const currentUser =
            req.session.user;


        const allowedStatuses = [

            "Pending",
            "In Progress",
            "Completed",
            "Cancelled"

        ];


        if (!actionID) {

            return res.status(400).json({

                error:
                    "Invalid action ID."

            });

        }


        if (
            !allowedStatuses.includes(
                requestedStatus
            )
        ) {

            return res.status(400).json({

                error:
                    "Invalid action status."

            });

        }


        try {

            const action =
                await databaseGet(
                    `
                        SELECT
                            ActionID,
                            ProgrammeID,
                            SessionID,
                            AssignedTo,
                            AssignedBy,
                            Status

                        FROM Actions

                        WHERE ActionID = ?
                    `,
                    [
                        actionID
                    ]
                );


            if (!action) {

                return res.status(404).json({

                    error:
                        "Action not found."

                });

            }


            // ========================================
            // PARTICIPANT ACCESS
            // ========================================

            if (
                currentUser.Role ===
                "Participant"
            ) {

                if (
                    action.AssignedTo !==
                    currentUser.UserID
                ) {

                    return sendForbidden(req, res);

                }


                if (
                    requestedStatus ===
                    "Cancelled"
                ) {

                    return res.status(403).json({

                        error:
                            "Participants cannot cancel actions."

                    });

                }

            }


            // ========================================
            // COACH ACCESS
            // ========================================

            else if (
                currentUser.Role ===
                "Coach"
            ) {

                const hasAccess =
                    await coachCanManageParticipantInProgramme(
                        currentUser.UserID,
                        action.AssignedTo,
                        action.ProgrammeID
                    );


                if (!hasAccess) {

                    return sendForbidden(req, res);

                }

            }


            // ========================================
            // ADMIN ACCESS
            // ========================================

            else if (
                currentUser.Role !==
                "Admin"
            ) {

                return sendForbidden(req, res);

            }


            const completedAt =
                requestedStatus ===
                    "Completed"

                    ? new Date()
                        .toISOString()

                    : null;


            const updateResult =
                await databaseRun(
                    `
                        UPDATE Actions

                        SET
                            Status = ?,
                            CompletedAt = ?

                        WHERE ActionID = ?
                    `,
                    [
                        requestedStatus,
                        completedAt,
                        actionID
                    ]
                );


            if (
                updateResult.changes === 0
            ) {

                return res.status(500).json({

                    error:
                        "The action could not be updated."

                });

            }


            return res.json({

                message:
                    "Action status updated successfully.",

                ActionID:
                    actionID,

                Status:
                    requestedStatus,

                CompletedAt:
                    completedAt

            });

        }

        catch (error) {

            console.error(
                "Unable to update action status:",
                error.message
            );


            return res.status(500).json({

                error:
                    "Failed to update action."

            });

        }

    }
);

app.delete(
    "/api/actions/:id",
    requireRoles("Admin", "Coach"),
    async (req, res, next) => {
        try {
            const actionID = positiveInteger(req.params.id);
            const user = req.session.user;

            if (!actionID) {
                return res.status(400).json({
                    error: "Invalid Action ID."
                });
            }

            let actionSQL = `
                SELECT ActionID, AssignedBy, Title
                FROM Actions
                WHERE ActionID = ?
            `;

            const actionParameters = [actionID];

            if (user.Role === "Coach") {
                actionSQL += " AND AssignedBy = ?";
                actionParameters.push(user.UserID);
            }

            const action = await databaseGet(
                actionSQL,
                actionParameters
            );

            if (!action) {
                return res.status(404).json({
                    error:
                        "Action not found or you do not have permission to delete it."
                });
            }

            const files = await databaseAll(
                `SELECT StoredFileName
                 FROM UploadedFiles
                 WHERE ActionID = ?`,
                [actionID]
            );

            let deleteSQL = `
                DELETE FROM Actions
                WHERE ActionID = ?
            `;

            const deleteParameters = [actionID];

            if (user.Role === "Coach") {
                deleteSQL += " AND AssignedBy = ?";
                deleteParameters.push(user.UserID);
            }

            const result = await databaseRun(
                deleteSQL,
                deleteParameters
            );

            if (!result.changes) {
                return res.status(404).json({
                    error:
                        "Action not found or you do not have permission to delete it."
                });
            }

            for (const file of files) {
                try {
                    await fs.promises.unlink(
                        path.join(
                            uploadDirectory,
                            file.StoredFileName
                        )
                    );
                } catch (deleteError) {
                    if (deleteError.code !== "ENOENT") {
                        console.error(
                            "Unable to remove Action file:",
                            deleteError
                        );
                    }
                }
            }

            writeAuditLog(
                req,
                "ACTION_DELETED",
                "Action",
                actionID,
                "Success"
            );

            res.json({
                message: "Action deleted successfully."
            });
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT") {
                return res.status(409).json({
                    error:
                        "The Action could not be deleted because related records still exist."
                });
            }

            next(error);
        }
    }
);

app.get(
    "/api/assessments",
    requireRoles("Admin", "Coach", "Participant"),
    async (req, res, next) => {
        const user = req.session.user;
        let accessCondition = "";
        const parameters = [];

        if (user.Role === "Coach") {
            accessCondition = `
                WHERE EXISTS (
                    SELECT 1
                    FROM ProgrammeCoaches PC
                    WHERE PC.ProgrammeID = A.ProgrammeID
                      AND PC.UserID = ?
                      AND PC.Status = 'Active'
                )
            `;
            parameters.push(user.UserID);
        } else if (user.Role === "Participant") {
            accessCondition = `
                WHERE EXISTS (
                    SELECT 1
                    FROM ProgrammeParticipants PP
                    WHERE PP.ProgrammeID = A.ProgrammeID
                      AND PP.UserID = ?
                      AND PP.Status IN ('Active', 'Completed')
                )
            `;
            parameters.push(user.UserID);
        }

        try {
            const assessments = await databaseAll(
                `SELECT A.AssessmentID, A.ProgrammeID, A.AssessmentName,
                        A.Description, A.Type, A.CreatedAt, P.ProgrammeName
                 FROM Assessments A
                 INNER JOIN Programmes P ON P.ProgrammeID = A.ProgrammeID
                 ${accessCondition}
                 ORDER BY A.CreatedAt DESC, A.AssessmentID DESC`,
                parameters
            );
            res.json(assessments);
        } catch (error) {
            next(error);
        }
    }
);

app.post("/api/assessments", requireRoles("Admin", "Coach"), (req, res) => {
    const programmeID = positiveInteger(req.body.ProgrammeID);
    const name = String(req.body.AssessmentName || "").trim();
    if (!programmeID || !name) return res.status(400).json({ error: "Programme and assessment name are required." });
    let sql = "SELECT ProgrammeID FROM Programmes WHERE ProgrammeID = ?";
    const parameters = [programmeID];
    if (req.session.user.Role === "Coach") {
        sql += ` AND EXISTS (SELECT 1 FROM ProgrammeCoaches PC WHERE PC.ProgrammeID = Programmes.ProgrammeID
                             AND PC.UserID = ? AND PC.Status = 'Active')`;
        parameters.push(req.session.user.UserID);
    }
    db.get(sql, parameters, (error, row) => {
        if (error) return res.status(500).json({ error: "Failed to verify programme." });
        if (!row) return res.status(404).json({ error: "Programme not found or access denied." });
        db.run(`INSERT INTO Assessments (ProgrammeID, AssessmentName, Description, Type) VALUES (?, ?, ?, ?)`,
            [programmeID, name, String(req.body.Description || "").trim() || null, String(req.body.Type || "General").trim()], function (insertError) {
                if (insertError) return res.status(500).json({ error: "Failed to create assessment." });
                res.status(201).json({ message: "Assessment created successfully.", AssessmentID: this.lastID });
            });
    });
});

function assessmentResponseAccess(user) {
    if (user.Role === "Coach") {
        return {
            clause: `
                AND EXISTS (
                    SELECT 1
                    FROM ProgrammeCoaches PC
                    WHERE PC.ProgrammeID = A.ProgrammeID
                      AND PC.UserID = ?
                      AND PC.Status = 'Active'
                )
                AND EXISTS (
                    SELECT 1
                    FROM ProgrammeParticipants PP
                    WHERE PP.ProgrammeID = A.ProgrammeID
                      AND PP.UserID = R.UserID
                      AND PP.Status IN ('Active', 'Completed')
                )
            `,
            parameters: [user.UserID]
        };
    }

    if (user.Role === "Participant") {
        return {
            clause: `
                AND R.UserID = ?
                AND EXISTS (
                    SELECT 1
                    FROM ProgrammeParticipants PP
                    WHERE PP.ProgrammeID = A.ProgrammeID
                      AND PP.UserID = ?
                      AND PP.Status IN ('Active', 'Completed')
                )
            `,
            parameters: [user.UserID, user.UserID]
        };
    }

    return {
        clause: "",
        parameters: []
    };
}

app.get("/api/assessment-responses", async (req, res) => {
    const currentUser = req.session.user;

    if (currentUser.Role === "Corporate") {
        return sendForbidden(req, res);
    }

    if (!["Admin", "Coach", "Participant"].includes(currentUser.Role)) {
        return sendForbidden(req, res);
    }

    const access = assessmentResponseAccess(currentUser);

    try {
        const responses = await new Promise((resolve, reject) => {
            db.all(
                `
                    SELECT
                        R.ResponseID,
                        R.AssessmentID,
                        R.UserID,
                        R.Question,
                        R.Answer,
                        R.Score,
                        R.CompletedAt,
                        A.AssessmentName,
                        A.ProgrammeID,
                        P.ProgrammeName,
                        U.FirstName,
                        U.LastName
                    FROM AssessmentResponses R
                    INNER JOIN Assessments A
                        ON A.AssessmentID = R.AssessmentID
                    INNER JOIN Programmes P
                        ON P.ProgrammeID = A.ProgrammeID
                    INNER JOIN Users U
                        ON U.UserID = R.UserID
                    WHERE 1 = 1
                    ${access.clause}
                    ORDER BY R.CompletedAt DESC
                `,
                access.parameters,
                (error, rows) => error
                    ? reject(error)
                    : resolve(rows)
            );
        });

        res.json(responses);
    } catch (error) {
        console.error(
            "Unable to retrieve assessment responses:",
            error.message
        );

        res.status(500).json({
            error: "Failed to retrieve assessment responses."
        });
    }
});

app.delete(
    "/api/assessments/:id",
    requireRoles("Admin", "Coach"),
    async (req, res, next) => {
        try {
            const assessmentID = positiveInteger(req.params.id);
            const user = req.session.user;

            if (!assessmentID) {
                return res.status(400).json({
                    error: "Invalid assessment ID."
                });
            }

            const assessment = await databaseGet(
    `SELECT
        AssessmentID,
        ProgrammeID,
        AssessmentName
     FROM Assessments
     WHERE AssessmentID = ?`,
    [assessmentID]
);

            if (!assessment) {
                return res.status(404).json({
                    error: "Assessment not found."
                });
            }

            if (user.Role === "Coach") {
                const assignment = await databaseGet(
                    `SELECT ProgrammeCoachID
                     FROM ProgrammeCoaches
                     WHERE ProgrammeID = ?
                       AND UserID = ?
                       AND Status = 'Active'`,
                    [assessment.ProgrammeID, user.UserID]
                );

                if (!assignment) return sendForbidden(req, res);
            }

            const files = await databaseAll(
                `SELECT StoredFileName
                 FROM UploadedFiles
                 WHERE AssessmentID = ?`,
                [assessmentID]
            );

            const result = await databaseRun(
                `DELETE FROM Assessments
                 WHERE AssessmentID = ?`,
                [assessmentID]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error: "Assessment not found."
                });
            }

            for (const file of files) {
                try {
                    await fs.promises.unlink(
                        path.join(
                            uploadDirectory,
                            file.StoredFileName
                        )
                    );
                } catch (deleteError) {
                    if (deleteError.code !== "ENOENT") {
                        console.error(
                            "Unable to remove Assessment file:",
                            deleteError
                        );
                    }
                }
            }

            writeAuditLog(
                req,
                "ASSESSMENT_DELETED",
                "Assessment",
                assessmentID,
                "Success"
            );

            res.json({
                message: "Assessment deleted successfully."
            });
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT") {
                return res.status(409).json({
                    error:
                        "The Assessment could not be deleted because related records still exist."
                });
            }

            next(error);
        }
    }
);

app.get("/api/assessments/:id/responses", async (req, res) => {
    const assessmentID = positiveInteger(req.params.id);
    const currentUser = req.session.user;

    if (!assessmentID) {
        return res.status(400).json({
            error: "Invalid assessment ID."
        });
    }

    if (currentUser.Role === "Corporate") {
        return sendForbidden(req, res);
    }

    if (!["Admin", "Coach", "Participant"].includes(currentUser.Role)) {
        return sendForbidden(req, res);
    }

    const access = assessmentResponseAccess(currentUser);
    const parameters = [assessmentID, ...access.parameters];

    try {
        const assessment = await databaseGet(
            "SELECT AssessmentID FROM Assessments WHERE AssessmentID = ?",
            [assessmentID]
        );

        if (!assessment) {
            return res.status(404).json({
                error: "Assessment not found."
            });
        }

        const responses = await new Promise((resolve, reject) => {
            db.all(
                `
                    SELECT
                        R.ResponseID,
                        R.AssessmentID,
                        R.UserID,
                        R.Question,
                        R.Answer,
                        R.Score,
                        R.CompletedAt,
                        A.AssessmentName,
                        U.FirstName,
                        U.LastName
                    FROM AssessmentResponses R
                    INNER JOIN Assessments A
                        ON A.AssessmentID = R.AssessmentID
                    INNER JOIN Users U
                        ON U.UserID = R.UserID
                    WHERE R.AssessmentID = ?
                    ${access.clause}
                    ORDER BY U.LastName, U.FirstName, R.ResponseID
                `,
                parameters,
                (error, rows) => error
                    ? reject(error)
                    : resolve(rows)
            );
        });

        res.json(responses);
    } catch (error) {
        console.error(
            "Unable to retrieve assessment responses:",
            error.message
        );

        res.status(500).json({
            error: "Failed to retrieve assessment responses."
        });
    }
});

app.post(
    "/api/assessment-responses",
    requireRoles("Admin", "Coach", "Participant"),
    async (req, res) => {
        const currentUser = req.session.user;
        const assessmentID = positiveInteger(req.body.AssessmentID);
        const respondentID = currentUser.Role === "Participant"
            ? currentUser.UserID
            : positiveInteger(req.body.UserID);
        const question = String(req.body.Question || "").trim();
        const answer = String(req.body.Answer || "").trim() || null;
        const score = [undefined, null, ""].includes(req.body.Score)
            ? null
            : Number(req.body.Score);

        if (!assessmentID || !respondentID || !question) {
            return res.status(400).json({
                error: "Assessment, participant and question are required."
            });
        }

        if (question.length > 2000 || (answer && answer.length > 10000)) {
            return res.status(400).json({
                error: "The question or answer exceeds the allowed length."
            });
        }

        if (score !== null && !Number.isFinite(score)) {
            return res.status(400).json({
                error: "Score must be a valid number."
            });
        }

        try {
            const assessment = await databaseGet(
                `SELECT AssessmentID, ProgrammeID
                 FROM Assessments
                 WHERE AssessmentID = ?`,
                [assessmentID]
            );

            if (!assessment) {
                return res.status(404).json({
                    error: "Assessment not found."
                });
            }

            const participant = await databaseGet(
                `SELECT U.UserID
                 FROM Users U
                 INNER JOIN ProgrammeParticipants PP
                    ON PP.UserID = U.UserID
                 WHERE U.UserID = ?
                   AND U.Role = 'Participant'
                   AND PP.ProgrammeID = ?
                   AND PP.Status IN ('Active', 'Completed')
                 LIMIT 1`,
                [respondentID, assessment.ProgrammeID]
            );

            if (!participant) return sendForbidden(req, res);

            if (currentUser.Role === "Coach") {
                const hasAccess = await coachCanManageParticipantInProgramme(
                    currentUser.UserID,
                    respondentID,
                    assessment.ProgrammeID
                );

                if (!hasAccess) return sendForbidden(req, res);
            }

            const result = await databaseRun(
                `INSERT INTO AssessmentResponses
                    (AssessmentID, UserID, Question, Answer, Score)
                 VALUES (?, ?, ?, ?, ?)`,
                [assessmentID, respondentID, question, answer, score]
            );

            res.status(201).json({
                message: "Assessment response saved successfully.",
                ResponseID: result.lastID
            });
        } catch (error) {
            console.error(
                "Unable to save assessment response:",
                error.message
            );

            res.status(500).json({
                error: "Failed to save assessment response."
            });
        }
    }
);

async function canAccessProgrammeFiles(user, programmeID) {
    const validProgrammeID = positiveInteger(programmeID);

    if (!user || !validProgrammeID) return false;

    let sql = `
        SELECT P.ProgrammeID
        FROM Programmes P
        WHERE P.ProgrammeID = ?
    `;

    const parameters = [validProgrammeID];

    if (user.Role === "Admin") {
        // Administrators can access every programme.
    } else if (user.Role === "Coach") {
        sql += `
            AND EXISTS (
                SELECT 1
                FROM ProgrammeCoaches PC
                WHERE PC.ProgrammeID = P.ProgrammeID
                  AND PC.UserID = ?
                  AND PC.Status = 'Active'
            )
        `;

        parameters.push(user.UserID);
    } else if (user.Role === "Participant") {
        sql += `
            AND EXISTS (
                SELECT 1
                FROM ProgrammeParticipants PP
                WHERE PP.ProgrammeID = P.ProgrammeID
                  AND PP.UserID = ?
                  AND PP.Status IN ('Active', 'Completed')
            )
        `;

        parameters.push(user.UserID);
    } else {
        return false;
    }

    const programme = await databaseGet(sql, parameters);

    return Boolean(programme);
}

app.post(
    "/api/assessments/:id/files",
    requireRoles("Admin", "Coach"),
    authoriseAssessmentFileUpload,
    secureFileUpload.single("File"),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                error: "Select a file to upload."
            });
        }

        try {
            const result = await databaseRun(
                `INSERT INTO UploadedFiles (
                    AssessmentID,
                    UploadedBy,
                    OriginalFileName,
                    StoredFileName,
                    MimeType,
                    FileSize,
                    StorageKey
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.authorisedAssessment.AssessmentID,
                    req.session.user.UserID,
                    req.file.originalname,
                    req.file.filename,
                    req.file.mimetype,
                    req.file.size,
                    req.file.filename
                ]
            );

            writeAuditLog(
                req,
                "ASSESSMENT_FILE_UPLOADED",
                "UploadedFile",
                result.lastID,
                "Success"
            );

            res.status(201).json({
                message: "Assessment file uploaded successfully.",
                file: {
                    UploadedFileID: result.lastID,
                    AssessmentID:
                        req.authorisedAssessment.AssessmentID,
                    OriginalFileName: req.file.originalname,
                    MimeType: req.file.mimetype,
                    FileSize: req.file.size
                }
            });
        } catch (error) {
            try {
                await fs.promises.unlink(req.file.path);
            } catch (deleteError) {
                if (deleteError.code !== "ENOENT") {
                    console.error(
                        "Unable to remove failed upload:",
                        deleteError
                    );
                }
            }

            console.error(
                "Assessment file upload failed:",
                error
            );

            res.status(500).json({
                error: "The assessment file could not be saved."
            });
        }
    }
);

async function canAccessAssessmentFiles(user, programmeID) {
    if (user.Role === "Admin") return true;

    if (user.Role === "Coach") {
        return coachCanAccessProgramme(
            user.UserID,
            programmeID
        );
    }

    if (user.Role === "Participant") {
        const enrollment = await databaseGet(
            `SELECT ProgrammeParticipantID
             FROM ProgrammeParticipants
             WHERE ProgrammeID = ?
               AND UserID = ?
               AND Status IN ('Active', 'Completed')`,
            [programmeID, user.UserID]
        );

        return Boolean(enrollment);
    }

    return false;
}

app.get(
    "/api/assessments/:id/files",
    requireAuthentication,
    async (req, res) => {
        try {
            const assessmentID =
                positiveInteger(req.params.id);

            if (!assessmentID) {
                return res.status(400).json({
                    error: "Invalid assessment ID."
                });
            }

            const assessment = await databaseGet(
                `SELECT AssessmentID, ProgrammeID
                 FROM Assessments
                 WHERE AssessmentID = ?`,
                [assessmentID]
            );

            if (!assessment) {
                return res.status(404).json({
                    error: "Assessment not found."
                });
            }

            const permitted =
                await canAccessProgrammeFiles(
                    req.session.user,
                    assessment.ProgrammeID
                );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "ASSESSMENT_FILES_VIEWED",
                    "Assessment",
                    assessmentID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot access files for this assessment."
                });
            }

            const files = await databaseAll(
                `SELECT
                    file.UploadedFileID,
                    file.AssessmentID,
                    file.OriginalFileName,
                    file.MimeType,
                    file.FileSize,
                    file.CreatedAt,
                    uploader.FirstName AS UploaderFirstName,
                    uploader.LastName AS UploaderLastName
                 FROM UploadedFiles AS file
                 JOIN Users AS uploader
                    ON uploader.UserID = file.UploadedBy
                 WHERE file.AssessmentID = ?
                 ORDER BY file.CreatedAt DESC`,
                [assessmentID]
            );

            res.json(files);
        } catch (error) {
            console.error(
                "Unable to retrieve assessment files:",
                error
            );

            res.status(500).json({
                error: "Failed to retrieve assessment files."
            });
        }
    }
);

app.get(
    "/api/assessment-files/:id/download",
    requireAuthentication,
    async (req, res, next) => {
        try {
            const fileID =
                positiveInteger(req.params.id);

            if (!fileID) {
                return res.status(400).json({
                    error: "Invalid file ID."
                });
            }

            const file = await databaseGet(
                `SELECT
                    file.UploadedFileID,
                    file.OriginalFileName,
                    file.StorageKey,
                    assessment.ProgrammeID
                 FROM UploadedFiles AS file
                 JOIN Assessments AS assessment
                    ON assessment.AssessmentID =
                       file.AssessmentID
                 WHERE file.UploadedFileID = ?
                   AND file.AssessmentID IS NOT NULL`,
                [fileID]
            );

            if (!file) {
                return res.status(404).json({
                    error: "Assessment file not found."
                });
            }

            const permitted =
                await canAccessAssessmentFiles(
                    req.session.user,
                    file.ProgrammeID
                );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "ASSESSMENT_FILE_DOWNLOADED",
                    "UploadedFile",
                    fileID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot download this assessment file."
                });
            }

            if (
                path.basename(file.StorageKey) !==
                file.StorageKey
            ) {
                return res.status(500).json({
                    error: "The stored file path is invalid."
                });
            }

            const filePath =
                path.join(
                    uploadDirectory,
                    file.StorageKey
                );

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    error: "The stored file is unavailable."
                });
            }

            writeAuditLog(
                req,
                "ASSESSMENT_FILE_DOWNLOADED",
                "UploadedFile",
                fileID,
                "Success"
            );

            res.download(
                filePath,
                file.OriginalFileName,
                error => {
                    if (error && !res.headersSent) {
                        next(error);
                    }
                }
            );
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    "/api/assessment-files/:id",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        try {
            const fileID =
                positiveInteger(req.params.id);

            if (!fileID) {
                return res.status(400).json({
                    error: "Invalid file ID."
                });
            }

            const file = await databaseGet(
                `SELECT
                    file.UploadedFileID,
                    file.StorageKey,
                    assessment.ProgrammeID
                 FROM UploadedFiles AS file
                 JOIN Assessments AS assessment
                    ON assessment.AssessmentID =
                       file.AssessmentID
                 WHERE file.UploadedFileID = ?
                   AND file.AssessmentID IS NOT NULL`,
                [fileID]
            );

            if (!file) {
                return res.status(404).json({
                    error: "Assessment file not found."
                });
            }

            const user = req.session.user;

            const permitted =
                user.Role === "Admin" ||
                (
                    user.Role === "Coach" &&
                    await coachCanAccessProgramme(
                        user.UserID,
                        file.ProgrammeID
                    )
                );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "ASSESSMENT_FILE_DELETED",
                    "UploadedFile",
                    fileID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot delete this assessment file."
                });
            }

            const result = await databaseRun(
                `DELETE FROM UploadedFiles
                 WHERE UploadedFileID = ?
                   AND AssessmentID IS NOT NULL`,
                [fileID]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error: "Assessment file not found."
                });
            }

            if (
                path.basename(file.StorageKey) ===
                file.StorageKey
            ) {
                const filePath =
                    path.join(
                        uploadDirectory,
                        file.StorageKey
                    );

                try {
                    await fs.promises.unlink(filePath);
                } catch (error) {
                    if (error.code !== "ENOENT") {
                        console.error(
                            "Unable to remove uploaded file:",
                            error
                        );
                    }
                }
            }

            writeAuditLog(
                req,
                "ASSESSMENT_FILE_DELETED",
                "UploadedFile",
                fileID,
                "Success"
            );

            res.json({
                message: "Assessment file deleted successfully."
            });
        } catch (error) {
            console.error(
                "Assessment file deletion failed:",
                error
            );

            res.status(500).json({
                error: "The assessment file could not be deleted."
            });
        }
    }
);

// Learning materials
app.get("/api/materials", async (req, res) => {
    const currentUser = req.session.user;
    let accessCondition = "";
    let parameters = [];

    if (currentUser.Role === "Coach") {
        accessCondition = `
            WHERE EXISTS (
                SELECT 1
                FROM ProgrammeCoaches PC
                WHERE PC.ProgrammeID = M.ProgrammeID
                  AND PC.UserID = ?
                  AND PC.Status = 'Active'
            )
        `;
        parameters = [currentUser.UserID];
    } else if (currentUser.Role === "Participant") {
        accessCondition = `
            WHERE EXISTS (
                SELECT 1
                FROM ProgrammeParticipants PP
                WHERE PP.ProgrammeID = M.ProgrammeID
                  AND PP.UserID = ?
                  AND PP.Status IN ('Active', 'Completed')
            )
        `;
        parameters = [currentUser.UserID];
    } else if (currentUser.Role === "Corporate") {
        return sendForbidden(req, res);
    } else if (currentUser.Role !== "Admin") {
        return sendForbidden(req, res);
    }

    try {
        const materials = await new Promise((resolve, reject) => {
            db.all(
                `
                    SELECT
                        M.MaterialID,
                        M.ProgrammeID,
                        M.Title,
                        M.Description,
                        M.MaterialType,
                        M.FileURL,
                        M.CreatedAt,
                        P.ProgrammeName
                    FROM LearningMaterials M
                    INNER JOIN Programmes P
                        ON P.ProgrammeID = M.ProgrammeID
                    ${accessCondition}
                    ORDER BY M.Title
                `,
                parameters,
                (error, rows) => error
                    ? reject(error)
                    : resolve(rows)
            );
        });

        res.json(materials);
    } catch (error) {
        console.error(
            "Unable to retrieve learning materials:",
            error.message
        );

        res.status(500).json({
            error: "Failed to retrieve learning materials."
        });
    }
});

app.get(
    "/api/materials/:id/files",
    requireAuthentication,
    async (req, res) => {
        try {
            const materialID = positiveInteger(req.params.id);

            if (!materialID) {
                return res.status(400).json({
                    error: "Invalid learning material ID."
                });
            }

            const material = await databaseGet(
                `SELECT MaterialID, ProgrammeID
                 FROM LearningMaterials
                 WHERE MaterialID = ?`,
                [materialID]
            );

            if (!material) {
                return res.status(404).json({
                    error: "Learning material not found."
                });
            }

            const permitted = await canAccessProgrammeFiles(
                req.session.user,
                material.ProgrammeID
            );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "MATERIAL_FILES_VIEWED",
                    "LearningMaterial",
                    materialID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot access files for this learning material."
                });
            }

            const files = await databaseAll(
                `SELECT
                    file.UploadedFileID,
                    file.MaterialID,
                    file.OriginalFileName,
                    file.MimeType,
                    file.FileSize,
                    file.CreatedAt,
                    uploader.FirstName AS UploaderFirstName,
                    uploader.LastName AS UploaderLastName
                 FROM UploadedFiles AS file
                 JOIN Users AS uploader
                    ON uploader.UserID = file.UploadedBy
                 WHERE file.MaterialID = ?
                 ORDER BY file.CreatedAt DESC`,
                [materialID]
            );

            res.json(files);
        } catch (error) {
            console.error(
                "Unable to retrieve learning material files:",
                error
            );

            res.status(500).json({
                error: "Failed to retrieve learning material files."
            });
        }
    }
);

app.get(
    "/api/material-files/:id/download",
    requireAuthentication,
    async (req, res, next) => {
        try {
            const fileID = positiveInteger(req.params.id);

            if (!fileID) {
                return res.status(400).json({
                    error: "Invalid file ID."
                });
            }

            const file = await databaseGet(
                `SELECT
                    file.UploadedFileID,
                    file.OriginalFileName,
                    file.StorageKey,
                    material.ProgrammeID
                 FROM UploadedFiles AS file
                 JOIN LearningMaterials AS material
                    ON material.MaterialID = file.MaterialID
                 WHERE file.UploadedFileID = ?
                   AND file.MaterialID IS NOT NULL`,
                [fileID]
            );

            if (!file) {
                return res.status(404).json({
                    error: "Learning material file not found."
                });
            }

            const permitted = await canAccessProgrammeFiles(
                req.session.user,
                file.ProgrammeID
            );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "MATERIAL_FILE_DOWNLOADED",
                    "UploadedFile",
                    fileID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot download this learning material file."
                });
            }

            if (path.basename(file.StorageKey) !== file.StorageKey) {
                return res.status(500).json({
                    error: "The stored file path is invalid."
                });
            }

            const filePath = path.join(
                uploadDirectory,
                file.StorageKey
            );

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    error: "The stored file is unavailable."
                });
            }

            writeAuditLog(
                req,
                "MATERIAL_FILE_DOWNLOADED",
                "UploadedFile",
                fileID,
                "Success"
            );

            res.download(
                filePath,
                file.OriginalFileName,
                error => {
                    if (error && !res.headersSent) {
                        next(error);
                    }
                }
            );
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    "/api/material-files/:id",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        try {
            const fileID = positiveInteger(req.params.id);

            if (!fileID) {
                return res.status(400).json({
                    error: "Invalid file ID."
                });
            }

            const file = await databaseGet(
                `SELECT
                    file.StorageKey,
                    material.ProgrammeID
                 FROM UploadedFiles AS file
                 JOIN LearningMaterials AS material
                    ON material.MaterialID = file.MaterialID
                 WHERE file.UploadedFileID = ?
                   AND file.MaterialID IS NOT NULL`,
                [fileID]
            );

            if (!file) {
                return res.status(404).json({
                    error: "Learning material file not found."
                });
            }

            const user = req.session.user;

            const permitted =
                user.Role === "Admin" ||
                (
                    user.Role === "Coach" &&
                    await coachCanAccessProgramme(
                        user.UserID,
                        file.ProgrammeID
                    )
                );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "MATERIAL_FILE_DELETED",
                    "UploadedFile",
                    fileID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot delete this learning material file."
                });
            }

            const result = await databaseRun(
                `DELETE FROM UploadedFiles
                 WHERE UploadedFileID = ?
                   AND MaterialID IS NOT NULL`,
                [fileID]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error: "Learning material file not found."
                });
            }

            if (path.basename(file.StorageKey) === file.StorageKey) {
                try {
                    await fs.promises.unlink(
                        path.join(uploadDirectory, file.StorageKey)
                    );
                } catch (error) {
                    if (error.code !== "ENOENT") {
                        console.error(
                            "Unable to remove material file:",
                            error
                        );
                    }
                }
            }

            writeAuditLog(
                req,
                "MATERIAL_FILE_DELETED",
                "UploadedFile",
                fileID,
                "Success"
            );

            res.json({
                message: "Learning material file deleted successfully."
            });
        } catch (error) {
            console.error(
                "Learning material file deletion failed:",
                error
            );

            res.status(500).json({
                error: "The learning material file could not be deleted."
            });
        }
    }
);

app.post(
    "/api/materials",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        const currentUser = req.session.user;
        const programmeID = positiveInteger(req.body.ProgrammeID);
        const title = String(req.body.Title || "").trim();
        const description = String(req.body.Description || "").trim() || null;
        const materialType = String(req.body.MaterialType || "").trim();
        const fileURL = String(req.body.FileURL || "").trim() || null;

        if (!programmeID || !title || !materialType) {
            return res.status(400).json({
                error: "Programme, title and material type are required."
            });
        }

        if (
            title.length > 255 ||
            materialType.length > 100 ||
            (description && description.length > 10000) ||
            (fileURL && fileURL.length > 2000)
        ) {
            return res.status(400).json({
                error: "One or more material fields exceed the allowed length."
            });
        }

        try {
            const programme = await databaseGet(
                "SELECT ProgrammeID FROM Programmes WHERE ProgrammeID = ?",
                [programmeID]
            );

            if (!programme) {
                return res.status(404).json({
                    error: "Programme not found."
                });
            }

            if (currentUser.Role === "Coach") {
                const hasAccess = await coachCanAccessProgramme(
                    currentUser.UserID,
                    programmeID
                );

                if (!hasAccess) return sendForbidden(req, res);
            }

            const result = await databaseRun(
                `INSERT INTO LearningMaterials
                    (ProgrammeID, Title, Description, MaterialType, FileURL)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    programmeID,
                    title,
                    description,
                    materialType,
                    fileURL
                ]
            );

            res.status(201).json({
                message: "Learning material created successfully.",
                MaterialID: result.lastID
            });
        } catch (error) {
            console.error(
                "Unable to create learning material:",
                error.message
            );

            res.status(500).json({
                error: "Failed to create learning material."
            });
        }
    }
);

// Progress
app.get("/api/progress", async (req, res) => {
    const currentUser = req.session.user;
    let accessCondition = "";
    let parameters = [];

    if (currentUser.Role === "Coach") {
        accessCondition = `
            WHERE EXISTS (
                SELECT 1
                FROM ProgrammeCoaches PC
                WHERE PC.ProgrammeID = G.ProgrammeID
                  AND PC.UserID = ?
                  AND PC.Status = 'Active'
            )
            AND EXISTS (
                SELECT 1
                FROM ProgrammeParticipants PP
                WHERE PP.ProgrammeID = G.ProgrammeID
                  AND PP.UserID = G.UserID
                  AND PP.Status IN ('Active', 'Completed')
            )
        `;
        parameters = [currentUser.UserID];
    } else if (currentUser.Role === "Participant") {
        accessCondition = "WHERE G.UserID = ?";
        parameters = [currentUser.UserID];
    } else if (currentUser.Role === "Corporate") {
        return sendForbidden(req, res);
    } else if (currentUser.Role !== "Admin") {
        return sendForbidden(req, res);
    }

    try {
        const progress = await new Promise((resolve, reject) => {
            db.all(
                `
                    SELECT
                        G.ProgressID,
                        G.ProgrammeID,
                        G.UserID,
                        G.ProgressPercentage,
                        G.Status,
                        G.LastUpdated,
                        U.FirstName,
                        U.LastName,
                        P.ProgrammeName
                    FROM Progress G
                    INNER JOIN Users U
                        ON U.UserID = G.UserID
                    INNER JOIN Programmes P
                        ON P.ProgrammeID = G.ProgrammeID
                    ${accessCondition}
                    ORDER BY G.ProgressPercentage DESC
                `,
                parameters,
                (error, rows) => error
                    ? reject(error)
                    : resolve(rows)
            );
        });

        res.json(progress);
    } catch (error) {
        console.error("Unable to retrieve progress:", error.message);
        res.status(500).json({
            error: "Failed to retrieve progress."
        });
    }
});

app.put(
    "/api/progress/:id",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        const progressID = positiveInteger(req.params.id);
        const percentage = Number(req.body.ProgressPercentage);
        const currentUser = req.session.user;

        if (!progressID) {
            return res.status(400).json({
                error: "Invalid progress ID."
            });
        }

        if (
            !Number.isFinite(percentage) ||
            percentage < 0 ||
            percentage > 100
        ) {
            return res.status(400).json({
                error: "Progress percentage must be between 0 and 100."
            });
        }

        try {
            const progress = await databaseGet(
                `SELECT ProgressID, ProgrammeID, UserID
                 FROM Progress
                 WHERE ProgressID = ?`,
                [progressID]
            );

            if (!progress) {
                return res.status(404).json({
                    error: "Progress record not found."
                });
            }

            if (currentUser.Role === "Coach") {
                const hasAccess =
                    await coachCanManageParticipantInProgramme(
                        currentUser.UserID,
                        progress.UserID,
                        progress.ProgrammeID
                    );

                if (!hasAccess) return sendForbidden(req, res);
            }

            const status = percentage === 100
                ? "Completed"
                : percentage > 0
                    ? "In Progress"
                    : "Not Started";

            const result = await databaseRun(
                `UPDATE Progress
                 SET ProgressPercentage = ?,
                     Status = ?,
                     LastUpdated = CURRENT_TIMESTAMP
                 WHERE ProgressID = ?`,
                [percentage, status, progressID]
            );

            if (!result.changes) {
                return res.status(500).json({
                    error: "The progress record could not be updated."
                });
            }

            res.json({
                message: "Progress updated successfully.",
                ProgressID: progressID,
                ProgressPercentage: percentage,
                Status: status
            });
        } catch (error) {
            console.error("Unable to update progress:", error.message);
            res.status(500).json({
                error: "Failed to update progress."
            });
        }
    }
);

// Reports
app.get(
    "/api/reports/summary",
    requireRoles("Admin", "Coach", "Corporate"),
    async (req, res) => {
        const currentUser = req.session.user;
        let accessibleProgrammes =
            "SELECT ProgrammeID FROM Programmes";
        let parameters = [];

        if (currentUser.Role === "Coach") {
            accessibleProgrammes = `
                SELECT ProgrammeID
                FROM ProgrammeCoaches
                WHERE UserID = ?
                  AND Status = 'Active'
            `;
            parameters = [currentUser.UserID];
        } else if (currentUser.Role === "Corporate") {
            const organisationID = corporateOrganisation(req, res);
            if (!organisationID) return;

            accessibleProgrammes = `
                SELECT ProgrammeID
                FROM Programmes
                WHERE OrganisationID = ?
            `;
            parameters = [organisationID];
        }

        try {
            const report = await databaseGet(
                `
                    WITH AccessibleProgrammes AS (
                        ${accessibleProgrammes}
                    )
                    SELECT
                        (
                            SELECT COUNT(*)
                            FROM AccessibleProgrammes
                        ) AS TotalProgrammes,

                        (
                            SELECT COUNT(*)
                            FROM Programmes P
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = P.ProgrammeID
                            WHERE P.Status = 'Active'
                        ) AS ActiveProgrammes,

                        (
                            SELECT COUNT(DISTINCT PP.UserID)
                            FROM ProgrammeParticipants PP
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = PP.ProgrammeID
                            WHERE PP.Status IN ('Active', 'Completed')
                        ) AS TotalParticipants,

                        (
                            SELECT COUNT(*)
                            FROM Sessions S
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = S.ProgrammeID
                        ) AS TotalSessions,

                        (
                            SELECT COUNT(*)
                            FROM Sessions S
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = S.ProgrammeID
                            WHERE S.Status = 'Completed'
                        ) AS CompletedSessions,

                        (
                            SELECT COUNT(*)
                            FROM Actions A
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = A.ProgrammeID
                        ) AS TotalActions,

                        (
                            SELECT COUNT(*)
                            FROM Actions A
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = A.ProgrammeID
                            WHERE A.Status = 'Completed'
                        ) AS CompletedActions,

                        (
                            SELECT COUNT(*)
                            FROM Actions A
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = A.ProgrammeID
                            WHERE A.Status IN ('Pending', 'In Progress')
                        ) AS OutstandingActions,

                        (
                            SELECT COALESCE(
                                ROUND(AVG(G.ProgressPercentage), 1),
                                0
                            )
                            FROM Progress G
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = G.ProgrammeID
                        ) AS AverageProgress,

                        (
                            SELECT COUNT(*)
                            FROM Assessments A
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = A.ProgrammeID
                        ) AS TotalAssessments,

                        (
                            SELECT COUNT(*)
                            FROM AssessmentResponses R
                            INNER JOIN Assessments A
                                ON A.AssessmentID = R.AssessmentID
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = A.ProgrammeID
                        ) AS TotalAssessmentResponses,

                        (
                            SELECT COUNT(*)
                            FROM LearningMaterials M
                            INNER JOIN AccessibleProgrammes AP
                                ON AP.ProgrammeID = M.ProgrammeID
                        ) AS TotalMaterials
                `,
                parameters
            );

            const totalSessions = Number(report.TotalSessions) || 0;
            const completedSessions =
                Number(report.CompletedSessions) || 0;
            const totalActions = Number(report.TotalActions) || 0;
            const completedActions =
                Number(report.CompletedActions) || 0;

            res.json({
                TotalProgrammes:
                    Number(report.TotalProgrammes) || 0,
                ActiveProgrammes:
                    Number(report.ActiveProgrammes) || 0,
                TotalParticipants:
                    Number(report.TotalParticipants) || 0,
                TotalSessions: totalSessions,
                CompletedSessions: completedSessions,
                SessionCompletionRate: totalSessions
                    ? Math.round(completedSessions / totalSessions * 100)
                    : 0,
                TotalActions: totalActions,
                CompletedActions: completedActions,
                OutstandingActions:
                    Number(report.OutstandingActions) || 0,
                ActionCompletionRate: totalActions
                    ? Math.round(completedActions / totalActions * 100)
                    : 0,
                AverageProgress:
                    Number(report.AverageProgress) || 0,
                TotalAssessments:
                    Number(report.TotalAssessments) || 0,
                TotalAssessmentResponses:
                    Number(report.TotalAssessmentResponses) || 0,
                TotalMaterials:
                    Number(report.TotalMaterials) || 0
            });
        } catch (error) {
            console.error("Unable to generate report:", error.message);
            res.status(500).json({
                error: "Failed to generate report."
            });
        }
    }
);

app.put(
    "/api/admin/coach-access-requests/:id/approve",
    requireRoles("Admin"),
    async (req, res) => {
        const requestID = positiveInteger(req.params.id);
        const adminID = req.session.user.UserID;
        let transactionStarted = false;

        if (!requestID) {
            return res.status(400).json({
                error: "Invalid Coach request ID."
            });
        }

        try {
            const request = await databaseGet(
                `SELECT *
                 FROM CoachAccessRequests
                 WHERE CoachRequestID = ?`,
                [requestID]
            );

            if (!request) {
                return res.status(404).json({
                    error: "Coach access request not found."
                });
            }

            if (request.AssignedAdminID !== adminID) {
                writeAuditLog(
                    req,
                    "COACH_ACCESS_REQUEST_APPROVED",
                    "CoachAccessRequest",
                    requestID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot manage this Coach access request."
                });
            }

            if (request.Status !== "Pending") {
                return res.status(409).json({
                    error: "Only pending Coach access requests can be approved."
                });
            }

            const existingUser = await databaseGet(
                `SELECT UserID, Role
                 FROM Users
                 WHERE LOWER(Email) = LOWER(?)`,
                [request.Email]
            );

            if (existingUser) {
                return res.status(409).json({
                    error: "An account with this email address already exists."
                });
            }

            const invitationToken = generateCoachInvitationToken();
            const invitationTokenHash =
                hashCoachInvitationToken(invitationToken);

            const expiresAt = new Date(
                Date.now() + 48 * 60 * 60 * 1000
            ).toISOString();

            await databaseRun("BEGIN IMMEDIATE TRANSACTION");
            transactionStarted = true;

            await databaseRun(
                `UPDATE CoachInvitations
                 SET RevokedAt = CURRENT_TIMESTAMP
                 WHERE LOWER(Email) = LOWER(?)
                   AND AcceptedAt IS NULL
                   AND RevokedAt IS NULL`,
                [request.Email]
            );

            const invitationResult = await databaseRun(
                `INSERT INTO CoachInvitations
                 (Email, InvitationTokenHash, InvitedBy, OrganisationID, ExpiresAt)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    request.Email,
                    invitationTokenHash,
                    adminID,
                    null,
                    expiresAt
                ]
            );

            await databaseRun(
                `UPDATE CoachAccessRequests
                 SET Status = 'Approved',
                     ReviewedBy = ?,
                     ReviewedAt = CURRENT_TIMESTAMP,
                     InvitationID = ?
                 WHERE CoachRequestID = ?
                   AND Status = 'Pending'`,
                [
                    adminID,
                    invitationResult.lastID,
                    requestID
                ]
            );

            await databaseRun("COMMIT");
            transactionStarted = false;

            const activationURL =
                `${req.protocol}://${req.get("host")}` +
                `/pages/coach-activation.html?token=` +
                encodeURIComponent(invitationToken);

            writeAuditLog(
                req,
                "COACH_ACCESS_REQUEST_APPROVED",
                "CoachAccessRequest",
                requestID,
                "Success"
            );

            res.json({
                message: "Coach request approved and invitation created.",
                invitation: {
                    InvitationID: invitationResult.lastID,
                    Email: request.Email,
                    ExpiresAt: expiresAt,
                    ActivationURL: activationURL
                }
            });
        } catch (error) {
            if (transactionStarted) {
                try {
                    await databaseRun("ROLLBACK");
                } catch (rollbackError) {
                    console.error(
                        "Coach-request rollback failed:",
                        rollbackError
                    );
                }
            }

            console.error("Unable to approve Coach request:", error);

            res.status(500).json({
                error: "The Coach request could not be approved."
            });
        }
    }
);

async function authoriseProgrammeFileUpload(req, res, next) {
    const programmeID = positiveInteger(req.params.id);

    if (!programmeID) {
        return res.status(400).json({
            error: "Invalid programme ID."
        });
    }

    try {
        const permitted = await canAccessProgrammeFiles(
            req.session.user,
            programmeID
        );

        if (!permitted) {
            writeAuditLog(
                req,
                "PROGRAMME_FILE_UPLOAD",
                "Programme",
                programmeID,
                "Denied"
            );

            return res.status(403).json({
                error: "You do not have access to this programme."
            });
        }

        req.authorisedProgrammeID = programmeID;
        next();
    } catch (error) {
        console.error(
            "Unable to authorise programme upload:",
            error.message
        );

        res.status(500).json({
            error: "Unable to verify programme access."
        });
    }
}

app.put(
    "/api/admin/coach-access-requests/:id/reject",
    requireRoles("Admin"),
    async (req, res) => {
        try {
            const requestID = positiveInteger(req.params.id);
            const adminID = req.session.user.UserID;

            if (!requestID) {
                return res.status(400).json({
                    error: "Invalid Coach request ID."
                });
            }

            const request = await databaseGet(
                `SELECT CoachRequestID, AssignedAdminID, Status
                 FROM CoachAccessRequests
                 WHERE CoachRequestID = ?`,
                [requestID]
            );

            if (!request) {
                return res.status(404).json({
                    error: "Coach access request not found."
                });
            }

            if (request.AssignedAdminID !== adminID) {
                writeAuditLog(
                    req,
                    "COACH_ACCESS_REQUEST_REJECTED",
                    "CoachAccessRequest",
                    requestID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You cannot manage this Coach access request."
                });
            }

            if (request.Status !== "Pending") {
                return res.status(409).json({
                    error: "Only pending Coach access requests can be rejected."
                });
            }

            await databaseRun(
                `UPDATE CoachAccessRequests
                 SET Status = 'Rejected',
                     ReviewedBy = ?,
                     ReviewedAt = CURRENT_TIMESTAMP
                 WHERE CoachRequestID = ?
                   AND Status = 'Pending'`,
                [adminID, requestID]
            );

            writeAuditLog(
                req,
                "COACH_ACCESS_REQUEST_REJECTED",
                "CoachAccessRequest",
                requestID,
                "Success"
            );

            res.json({
                message: "Coach access request rejected successfully."
            });
        } catch (error) {
            console.error("Unable to reject Coach access request:", error);

            res.status(500).json({
                error: "The Coach access request could not be rejected."
            });
        }
    }
);

// ========================================
// LIST PROGRAMME DOCUMENTS
// ========================================

app.get("/api/programmes/:id/files", async (req, res) => {
    const programmeID = positiveInteger(req.params.id);

    if (!programmeID) {
        return res.status(400).json({
            error: "Invalid programme ID."
        });
    }

    try {
        const permitted = await canAccessProgrammeFiles(
            req.session.user,
            programmeID
        );

        if (!permitted) {
            writeAuditLog(
                req,
                "PROGRAMME_FILES_VIEWED",
                "Programme",
                programmeID,
                "Denied"
            );

            return res.status(403).json({
                error: "You do not have access to these documents."
            });
        }

        db.all(
            `
                SELECT
                    F.UploadedFileID,
                    F.ProgrammeID,
                    F.OriginalFileName,
                    F.MimeType,
                    F.FileSize,
                    F.CreatedAt,
                    U.FirstName AS UploaderFirstName,
                    U.LastName AS UploaderLastName

                FROM UploadedFiles F

                LEFT JOIN Users U
                    ON U.UserID = F.UploadedBy

                WHERE F.ProgrammeID = ?

                ORDER BY F.CreatedAt DESC
            `,
            [programmeID],
            (error, files) => {
                if (error) {
                    console.error(
                        "Unable to retrieve programme documents:",
                        error.message
                    );

                    return res.status(500).json({
                        error: "Failed to retrieve programme documents."
                    });
                }

                res.json(files);
            }
        );
    } catch (error) {
        console.error(
            "Unable to check programme document access:",
            error.message
        );

        res.status(500).json({
            error: "Failed to retrieve programme documents."
        });
    }
});

// ========================================
// UPLOAD PROGRAMME DOCUMENT
// ========================================

app.post(
    "/api/programmes/:id/files",
    requireRoles("Admin", "Coach"),
    authoriseProgrammeFileUpload,
    secureFileUpload.single("File"),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                error: "Select a document to upload."
            });
        }

        try {
            const result = await databaseRun(
                `
                    INSERT INTO UploadedFiles (
                        ProgrammeID,
                        UploadedBy,
                        OriginalFileName,
                        StoredFileName,
                        MimeType,
                        FileSize,
                        StorageKey
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    req.authorisedProgrammeID,
                    req.session.user.UserID,
                    req.file.originalname,
                    req.file.filename,
                    req.file.mimetype,
                    req.file.size,
                    req.file.filename
                ]
            );

            writeAuditLog(
                req,
                "PROGRAMME_FILE_UPLOADED",
                "UploadedFile",
                result.lastID,
                "Success"
            );

            res.status(201).json({
                message: "Programme document uploaded successfully.",
                file: {
                    UploadedFileID: result.lastID,
                    ProgrammeID: req.authorisedProgrammeID,
                    OriginalFileName: req.file.originalname,
                    MimeType: req.file.mimetype,
                    FileSize: req.file.size
                }
            });
        } catch (error) {
            try {
                await fs.promises.unlink(req.file.path);
            } catch (deleteError) {
                if (deleteError.code !== "ENOENT") {
                    console.error(
                        "Unable to remove failed programme upload:",
                        deleteError.message
                    );
                }
            }

            console.error(
                "Programme document upload failed:",
                error.message
            );

            writeAuditLog(
                req,
                "PROGRAMME_FILE_UPLOADED",
                "Programme",
                req.authorisedProgrammeID,
                "Failure"
            );

            res.status(500).json({
                error: "The programme document could not be saved."
            });
        }
    }
);

// ========================================
// DOWNLOAD PROGRAMME DOCUMENT
// ========================================

app.get(
    "/api/programme-files/:id/download",
    async (req, res) => {
        const fileID = positiveInteger(req.params.id);

        if (!fileID) {
            return res.status(400).json({
                error: "Invalid document ID."
            });
        }

        try {
            const file = await databaseGet(
                `
                    SELECT
                        UploadedFileID,
                        ProgrammeID,
                        OriginalFileName,
                        StoredFileName

                    FROM UploadedFiles

                    WHERE UploadedFileID = ?
                      AND ProgrammeID IS NOT NULL
                `,
                [fileID]
            );

            if (!file) {
                return res.status(404).json({
                    error: "Programme document not found."
                });
            }

            const permitted = await canAccessProgrammeFiles(
                req.session.user,
                file.ProgrammeID
            );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "PROGRAMME_FILE_DOWNLOADED",
                    "UploadedFile",
                    fileID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You do not have access to this document."
                });
            }

            const filePath = path.join(
                uploadDirectory,
                path.basename(file.StoredFileName)
            );

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    error: "The stored document could not be found."
                });
            }

            writeAuditLog(
                req,
                "PROGRAMME_FILE_DOWNLOADED",
                "UploadedFile",
                fileID,
                "Success"
            );

            res.download(
                filePath,
                file.OriginalFileName
            );
        } catch (error) {
            console.error(
                "Unable to download programme document:",
                error.message
            );

            res.status(500).json({
                error: "The programme document could not be downloaded."
            });
        }
    }
);

// ========================================
// DELETE PROGRAMME DOCUMENT
// ========================================

app.delete(
    "/api/programme-files/:id",
    requireRoles("Admin", "Coach"),
    async (req, res) => {
        const fileID = positiveInteger(req.params.id);

        if (!fileID) {
            return res.status(400).json({
                error: "Invalid document ID."
            });
        }

        try {
            const file = await databaseGet(
                `
                    SELECT
                        UploadedFileID,
                        ProgrammeID,
                        StoredFileName

                    FROM UploadedFiles

                    WHERE UploadedFileID = ?
                      AND ProgrammeID IS NOT NULL
                `,
                [fileID]
            );

            if (!file) {
                return res.status(404).json({
                    error: "Programme document not found."
                });
            }

            const permitted = await canAccessProgrammeFiles(
                req.session.user,
                file.ProgrammeID
            );

            if (!permitted) {
                writeAuditLog(
                    req,
                    "PROGRAMME_FILE_DELETED",
                    "UploadedFile",
                    fileID,
                    "Denied"
                );

                return res.status(403).json({
                    error: "You do not have permission to delete this document."
                });
            }

            const result = await databaseRun(
                `
                    DELETE FROM UploadedFiles
                    WHERE UploadedFileID = ?
                      AND ProgrammeID = ?
                `,
                [
                    fileID,
                    file.ProgrammeID
                ]
            );

            if (!result.changes) {
                return res.status(404).json({
                    error: "Programme document not found."
                });
            }

            const filePath = path.join(
                uploadDirectory,
                path.basename(file.StoredFileName)
            );

            try {
                await fs.promises.unlink(filePath);
            } catch (deleteError) {
                if (deleteError.code !== "ENOENT") {
                    console.error(
                        "Unable to remove programme document:",
                        deleteError.message
                    );
                }
            }

            writeAuditLog(
                req,
                "PROGRAMME_FILE_DELETED",
                "UploadedFile",
                fileID,
                "Success"
            );

            res.json({
                message: "Programme document deleted successfully."
            });
        } catch (error) {
            console.error(
                "Unable to delete programme document:",
                error.message
            );

            res.status(500).json({
                error: "The programme document could not be deleted."
            });
        }
    }
);

app.delete(
    "/api/sessions/:id",
    requireRoles("Admin", "Coach"),
    async (req, res, next) => {
        try {
            const sessionID = positiveInteger(req.params.id);
            const user = req.session.user;

            if (!sessionID) {
                return res.status(400).json({
                    error: "Invalid Session ID."
                });
            }

            let sessionSQL = `
                SELECT
                    SessionID,
                    ProgrammeID,
                    CoachID,
                    ParticipantID,
                    SessionDate
                FROM Sessions
                WHERE SessionID = ?
            `;

            const sessionParameters = [sessionID];

            if (user.Role === "Coach") {
                sessionSQL += " AND CoachID = ?";
                sessionParameters.push(user.UserID);
            }

            const session = await databaseGet(
                sessionSQL,
                sessionParameters
            );

            if (!session) {
                return res.status(404).json({
                    error:
                        "Session not found or you do not have permission to delete it."
                });
            }

            let deleteSQL = `
                DELETE FROM Sessions
                WHERE SessionID = ?
            `;

            const deleteParameters = [sessionID];

            if (user.Role === "Coach") {
                deleteSQL += " AND CoachID = ?";
                deleteParameters.push(user.UserID);
            }

            const result = await databaseRun(
                deleteSQL,
                deleteParameters
            );

            if (!result.changes) {
                return res.status(404).json({
                    error:
                        "Session not found or you do not have permission to delete it."
                });
            }

            writeAuditLog(
                req,
                "SESSION_DELETED",
                "Session",
                sessionID,
                "Success"
            );

            res.json({
                message: "Session deleted successfully."
            });
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT") {
                return res.status(409).json({
                    error:
                        "The Session could not be deleted because related records still exist."
                });
            }

            next(error);
        }
    }
);

app.get(
    "/api/admin/coach-access-requests",
    requireRoles("Admin"),
    async (req, res) => {
        try {
            const adminID = req.session.user.UserID;
            const requestedStatus = String(req.query.status || "Pending").trim();

            const allowedStatuses = [
                "Pending",
                "Approved",
                "Rejected",
                "Cancelled",
                "All"
            ];

            if (!allowedStatuses.includes(requestedStatus)) {
                return res.status(400).json({
                    error: "Invalid Coach request status."
                });
            }

            let sql = `
                SELECT
                    request.CoachRequestID,
                    request.UserID,
                    request.FirstName,
                    request.LastName,
                    request.Email,
                    request.Reason,
                    request.Status,
                    request.InvitationID,
                    request.CreatedAt,
                    request.ReviewedAt,
                    reviewer.FirstName AS ReviewerFirstName,
                    reviewer.LastName AS ReviewerLastName
                FROM CoachAccessRequests AS request
                LEFT JOIN Users AS reviewer
                    ON reviewer.UserID = request.ReviewedBy
                WHERE request.AssignedAdminID = ?
            `;

            const parameters = [adminID];

            if (requestedStatus !== "All") {
                sql += " AND request.Status = ?";
                parameters.push(requestedStatus);
            }

            sql += `
                ORDER BY
                    CASE request.Status
                        WHEN 'Pending' THEN 1
                        WHEN 'Approved' THEN 2
                        WHEN 'Rejected' THEN 3
                        ELSE 4
                    END,
                    request.CreatedAt DESC
            `;

            const requests = await databaseAll(sql, parameters);
            res.json(requests);
        } catch (error) {
            console.error("Unable to retrieve Coach access requests:", error);

            res.status(500).json({
                error: "Failed to retrieve Coach access requests."
            });
        }
    }
);

// ========================================
// REVOKE COACH INVITATION
// ========================================

app.delete(
    "/api/coach-invitations/:id",
    requireRoles("Admin"),
    (req, res) => {

        const invitationID =
            positiveInteger(
                req.params.id
            );


        if (!invitationID) {

            return res.status(400).json({
                error:
                    "Enter a valid Coach invitation ID."
            });

        }


        db.run(
            `
                UPDATE CoachInvitations

                SET RevokedAt =
                    CURRENT_TIMESTAMP

                WHERE
                    InvitationID = ?

                    AND AcceptedAt IS NULL

                    AND RevokedAt IS NULL

                    AND datetime(ExpiresAt) >
                        datetime('now')
            `,
            [invitationID],
            function (error) {

                if (error) {

                    console.error(
                        "Unable to revoke Coach invitation:",
                        error.message
                    );


                    return res.status(500).json({
                        error:
                            "Unable to revoke the Coach invitation."
                    });

                }


                if (this.changes === 0) {

                    return res.status(404).json({
                        error:
                            "The invitation was not found, has expired, was already accepted or was already revoked."
                    });

                }


                res.json({
                    message:
                        "Coach invitation revoked successfully."
                });

            }
        );

    }
);

app.use("/api", (req, res) => {
    res.status(404).json({
        error: "API route not found."
    });
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                error: "The selected file must not exceed 10 MB."
            });
        }

        return res.status(400).json({
            error: "The selected file could not be uploaded."
        });
    }

    if (
        error?.message ===
        "Only PDF, Word, Excel and supported image files are allowed."
    ) {
        return res.status(415).json({
            error: error.message
        });
    }

    next(error);
});

app.use((error, req, res, next) => {
    console.error("Unhandled server error:", {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        stack: error?.stack
    });

    if (res.headersSent) {
        return next(error);
    }

    const status =
        Number.isInteger(error?.status) &&
        error.status >= 400 &&
        error.status <= 599
            ? error.status
            : 500;

    const publicMessage =
        status >= 500
            ? "An unexpected server error occurred."
            : error.message ||
              "The request could not be completed.";

    res.status(status).json({
        error: publicMessage
    });
});

app.use((req, res) => {

    res.status(404).sendFile(
        path.join(
            frontendPath,
            "pages",
            "not-found.html"
        )
    );

});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`KBD Coaching Platform is running on port ${PORT}`);
});
