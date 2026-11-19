-- ========================================
-- ORGANISATION
-- ========================================

INSERT INTO Organisations (
    OrganisationName,
    ContactName,
    ContactEmail
)
VALUES (
    'ABC Corporation',
    'Lisa Williams',
    'lisa@company.test'
);

-- ========================================
-- USERS
-- ========================================

INSERT INTO Users (
    FirstName,
    LastName,
    Email,
    PasswordHash,
    Role,
    OrganisationID
)
VALUES
    (
        'KBD',
        'Administrator',
        'admin@kbd.test',
        '$2b$12$LIXRf1sfQAvdhOGLMB6sX.twgB3jMheIn8nlMvyIOdUyzhycIBC8m',
        'Admin',
        NULL
    ),
    (
        'Dela',
        'Abotsi',
        'dela@kbd.test',
        '$2b$12$LIXRf1sfQAvdhOGLMB6sX.twgB3jMheIn8nlMvyIOdUyzhycIBC8m',
        'Coach',
        NULL
    ),
    (
        'John',
        'Doe',
        'john@kbd.test',
        '$2b$12$LIXRf1sfQAvdhOGLMB6sX.twgB3jMheIn8nlMvyIOdUyzhycIBC8m',
        'Participant',
        NULL
    ),
    (
        'Jane',
        'Doe',
        'jane@kbd.test',
        '$2b$12$LIXRf1sfQAvdhOGLMB6sX.twgB3jMheIn8nlMvyIOdUyzhycIBC8m',
        'Participant',
        NULL
    ),
    (
        'Michael',
        'Brown',
        'michael@kbd.test',
        '$2b$12$LIXRf1sfQAvdhOGLMB6sX.twgB3jMheIn8nlMvyIOdUyzhycIBC8m',
        'Participant',
        NULL
    ),
    (
        'Lisa',
        'Williams',
        'lisa@company.test',
        '$2b$12$LIXRf1sfQAvdhOGLMB6sX.twgB3jMheIn8nlMvyIOdUyzhycIBC8m',
        'Corporate',
        (
            SELECT OrganisationID
            FROM Organisations
            WHERE OrganisationName = 'ABC Corporation'
            ORDER BY OrganisationID
            LIMIT 1
        )
    );

-- ========================================
-- PROGRAMME
-- ========================================

INSERT INTO Programmes (
    OrganisationID,
    ProgrammeName,
    Description,
    StartDate,
    EndDate,
    Status
)
SELECT
    OrganisationID,
    'Leadership Development Programme',
    'A coaching programme focused on leadership development and personal growth.',
    DATE('now', '-30 days'),
    DATE('now', '+90 days'),
    'Active'
FROM Organisations
WHERE OrganisationName = 'ABC Corporation'
ORDER BY OrganisationID
LIMIT 1;

-- ========================================
-- PROGRAMME PARTICIPANTS
-- ========================================

INSERT INTO ProgrammeParticipants (
    ProgrammeID,
    UserID,
    EnrollmentDate,
    Status
)
SELECT
    P.ProgrammeID,
    U.UserID,
    DATE('now', '-30 days'),
    'Active'
FROM Programmes P
CROSS JOIN Users U
WHERE P.ProgrammeName = 'Leadership Development Programme'
  AND U.Email IN (
      'john@kbd.test',
      'jane@kbd.test',
      'michael@kbd.test'
  );

-- ========================================
-- PROGRAMME COACH
-- ========================================

INSERT INTO ProgrammeCoaches (
    ProgrammeID,
    UserID,
    AssignedDate,
    Status
)
SELECT
    P.ProgrammeID,
    U.UserID,
    DATE('now', '-30 days'),
    'Active'
FROM Programmes P
JOIN Users U
    ON U.Email = 'dela@kbd.test'
WHERE P.ProgrammeName = 'Leadership Development Programme';

-- ========================================
-- SESSIONS
-- ========================================

INSERT INTO Sessions (
    ProgrammeID,
    CoachID,
    ParticipantID,
    SessionDate,
    StartTime,
    EndTime,
    SessionType,
    Status
)
SELECT
    P.ProgrammeID,
    C.UserID,
    U.UserID,
    CASE U.Email
        WHEN 'john@kbd.test' THEN DATE('now', '+7 days')
        WHEN 'jane@kbd.test' THEN DATE('now', '+14 days')
        WHEN 'michael@kbd.test' THEN DATE('now', '+21 days')
    END,
    CASE U.Email
        WHEN 'michael@kbd.test' THEN '14:00'
        ELSE '10:00'
    END,
    CASE U.Email
        WHEN 'michael@kbd.test' THEN '15:00'
        ELSE '11:00'
    END,
    'Coaching',
    'Scheduled'
FROM Programmes P
JOIN Users C
    ON C.Email = 'dela@kbd.test'
CROSS JOIN Users U
WHERE P.ProgrammeName = 'Leadership Development Programme'
  AND U.Email IN (
      'john@kbd.test',
      'jane@kbd.test',
      'michael@kbd.test'
  );

INSERT INTO Sessions (
    ProgrammeID,
    CoachID,
    ParticipantID,
    SessionDate,
    StartTime,
    EndTime,
    SessionType,
    Status
)
SELECT
    P.ProgrammeID,
    C.UserID,
    U.UserID,
    DATE('now', '-7 days'),
    '10:00',
    '11:00',
    'Coaching',
    'Completed'
FROM Programmes P
JOIN Users C
    ON C.Email = 'dela@kbd.test'
JOIN Users U
    ON U.Email = 'john@kbd.test'
WHERE P.ProgrammeName = 'Leadership Development Programme';

-- ========================================
-- SESSION NOTE
-- ========================================

INSERT INTO SessionNotes (
    SessionID,
    CoachID,
    Notes
)
SELECT
    S.SessionID,
    S.CoachID,
    'Discussed leadership strengths, communication style and areas for development. The participant identified delegation as an area for improvement.'
FROM Sessions S
JOIN Users U
    ON U.UserID = S.ParticipantID
WHERE U.Email = 'john@kbd.test'
  AND S.Status = 'Completed'
ORDER BY S.SessionID DESC
LIMIT 1;

-- ========================================
-- ACTION
-- ========================================

INSERT INTO Actions (
    ProgrammeID,
    SessionID,
    AssignedTo,
    AssignedBy,
    Title,
    Description,
    DueDate,
    Status
)
SELECT
    S.ProgrammeID,
    S.SessionID,
    S.ParticipantID,
    S.CoachID,
    'Leadership Reflection',
    'Complete a reflection on your current leadership strengths and identify two areas for development.',
    DATE('now', '+10 days'),
    'In Progress'
FROM Sessions S
JOIN Users U
    ON U.UserID = S.ParticipantID
WHERE U.Email = 'john@kbd.test'
  AND S.Status = 'Completed'
ORDER BY S.SessionID DESC
LIMIT 1;

-- ========================================
-- ASSESSMENT
-- ========================================

INSERT INTO Assessments (
    ProgrammeID,
    AssessmentName,
    Description,
    Type
)
SELECT
    ProgrammeID,
    'Leadership Self-Assessment',
    'A self-assessment designed to help participants reflect on their leadership capabilities.',
    'Self-Assessment'
FROM Programmes
WHERE ProgrammeName = 'Leadership Development Programme';

-- ========================================
-- ASSESSMENT RESPONSES
-- ========================================

INSERT INTO AssessmentResponses (
    AssessmentID,
    UserID,
    Question,
    Answer,
    Score
)
SELECT
    A.AssessmentID,
    U.UserID,
    'How confident are you when leading a team?',
    'I am reasonably confident but would like to improve my delegation skills.',
    7
FROM Assessments A
JOIN Users U
    ON U.Email = 'john@kbd.test'
WHERE A.AssessmentName = 'Leadership Self-Assessment';

INSERT INTO AssessmentResponses (
    AssessmentID,
    UserID,
    Question,
    Answer,
    Score
)
SELECT
    A.AssessmentID,
    U.UserID,
    'How effectively do you communicate expectations?',
    'I communicate clearly but sometimes assume others understand without checking.',
    6
FROM Assessments A
JOIN Users U
    ON U.Email = 'john@kbd.test'
WHERE A.AssessmentName = 'Leadership Self-Assessment';

-- ========================================
-- LEARNING MATERIALS
-- ========================================

INSERT INTO LearningMaterials (
    ProgrammeID,
    Title,
    Description,
    MaterialType,
    FileURL
)
SELECT
    ProgrammeID,
    'Leadership Development Guide',
    'Introductory material covering core leadership concepts.',
    'PDF',
    '/materials/leadership-guide.pdf'
FROM Programmes
WHERE ProgrammeName = 'Leadership Development Programme';

INSERT INTO LearningMaterials (
    ProgrammeID,
    Title,
    Description,
    MaterialType,
    FileURL
)
SELECT
    ProgrammeID,
    'Effective Communication',
    'Learning material focused on communication in leadership.',
    'Article',
    '/materials/effective-communication.html'
FROM Programmes
WHERE ProgrammeName = 'Leadership Development Programme';

-- ========================================
-- PARTICIPANT PROGRESS
-- ========================================

INSERT INTO Progress (
    ProgrammeID,
    UserID,
    ProgressPercentage,
    Status
)
SELECT
    P.ProgrammeID,
    U.UserID,
    CASE U.Email
        WHEN 'john@kbd.test' THEN 65
        WHEN 'jane@kbd.test' THEN 40
        WHEN 'michael@kbd.test' THEN 25
    END,
    'In Progress'
FROM Programmes P
CROSS JOIN Users U
WHERE P.ProgrammeName = 'Leadership Development Programme'
  AND U.Email IN (
      'john@kbd.test',
      'jane@kbd.test',
      'michael@kbd.test'
  );
