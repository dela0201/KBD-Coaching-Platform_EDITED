// ========================================
// KBD SESSIONS PAGE
// ========================================

const API_URL = "";
const SESSION_STATUSES = [
    "Scheduled",
    "Completed",
    "Rescheduled",
    "Cancelled"
];
let sessionsPageInitialised = false;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function canManageSessions() {
    return [
        "Admin",
        "Coach"
    ].includes(
        window.kbdCurrentUser?.Role
    );
}

async function readResponse(response) {
    if (window.KBDUI?.readResponse) {
        return KBDUI.readResponse(response);
    }

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.error || "The request could not be completed.");
    }

    return result;
}

async function fetchJSON(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            ...(options.headers || {})
        }
    });

    return readResponse(response);
}

function showMessage(elementID, message = "", type = "") {
    const element = document.getElementById(elementID);
    if (!element) return;

    element.textContent = message;
    element.className = type
        ? `form-message ${type}`
        : "form-message";
}

function showSessionsMessage(title, message) {
    const container = document.getElementById("sessions-container");
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function formatDate(dateString) {
    if (!dateString) return "No date";

    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "No date";

    return date.toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatNoteDate(dateString) {
    if (!dateString) return "Unknown date";

    const date = new Date(String(dateString).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "Unknown date";

    return date.toLocaleString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// ========================================
// LOAD AND DISPLAY SESSIONS
// ========================================

async function loadSessions() {
    const container = document.getElementById("sessions-container");
    if (!container) return;

    if (window.KBDUI?.showLoading) {
        KBDUI.showLoading("sessions-container", "Loading sessions...");
    } else {
        container.textContent = "Loading sessions...";
    }

    try {
        const sessions = await fetchJSON("/api/sessions");

        if (!Array.isArray(sessions)) {
            throw new Error("The server returned invalid session data.");
        }

        displaySessionsPage(sessions);
    } catch (error) {
        console.error("Error loading sessions:", error);

        if (window.KBDUI?.showError) {
            KBDUI.showError("sessions-container", error.message, loadSessions);
        } else {
            showSessionsMessage("Unable to load sessions", error.message);
        }
    }
}


function displaySessionsPage(sessions) {
    const container = document.getElementById("sessions-container");
    if (!container) return;

    container.innerHTML = "";

    if (sessions.length === 0) {
        if (window.KBDUI?.showEmpty) {
            KBDUI.showEmpty(
                "sessions-container",
                "No sessions found",
                "There are currently no coaching sessions available for your account."
            );
        } else {
            showSessionsMessage(
                "No sessions found",
                "There are currently no coaching sessions available for your account."
            );
        }
        return;
    }

    sessions.forEach(session => {
        const sessionID = Number(session.SessionID);
        if (!Number.isInteger(sessionID) || sessionID < 1) return;

        const participant = `${session.ParticipantFirstName || ""} ${
            session.ParticipantLastName || ""
        }`.trim();
        const coach = `${session.CoachFirstName || ""} ${
            session.CoachLastName || ""
        }`.trim();
        const currentStatus = SESSION_STATUSES.includes(session.Status)
            ? session.Status
            : "Scheduled";
        const sessionCard = document.createElement("article");

        sessionCard.className = "session-card";
        sessionCard.innerHTML = `
            <div class="session-card-date">
                <span>${escapeHTML(formatDate(session.SessionDate))}</span>
            </div>
${
    canManageSessions()
        ? `
            <div class="session-card-actions">
                <button
                    type="button"
                    class="danger-button delete-session-button"
                    data-session-id="${session.SessionID}"
                    data-session-label="${KBDUI.escapeHTML(
                        session.SessionType ||
                        "this Session"
                    )}"
                >
                    Delete Session
                </button>
            </div>
        `
        : ""
}
            <div class="session-card-info">
                <h3>${escapeHTML(session.SessionType || "Coaching Session")}</h3>
                <p>
                    <strong>Programme:</strong>
                    ${escapeHTML(session.ProgrammeName || "Not assigned")}
                </p>
                <p>
                    <strong>Participant:</strong>
                    ${escapeHTML(participant || "Not assigned")}
                </p>
                <p>
                    <strong>Coach:</strong>
                    ${escapeHTML(coach || "Not assigned")}
                </p>
                <p>
                    <strong>Time:</strong>
                    ${escapeHTML(session.StartTime || "â€“")}
                    â€“
                    ${escapeHTML(session.EndTime || "â€“")}
                </p>
            </div>

            <div class="session-card-status"></div>
        `;

        const statusContainer = sessionCard.querySelector(
            ".session-card-status"
        );

        if (canManageSessions()) {
            const statusSelect = document.createElement("select");
            statusSelect.className = "session-status-select";
            statusSelect.dataset.sessionId = sessionID;
            statusSelect.dataset.previousStatus = currentStatus;
            statusSelect.setAttribute(
                "aria-label",
                `Status for session ${sessionID}`
            );

            SESSION_STATUSES.forEach(status => {
                const option = document.createElement("option");
                option.value = status;
                option.textContent = status;
                option.selected = status === currentStatus;
                statusSelect.appendChild(option);
            });

            statusSelect.addEventListener("change", handleSessionStatusChange);

            const notesButton = document.createElement("button");
            notesButton.className = "view-session-notes";
            notesButton.type = "button";
            notesButton.textContent = "View Notes";
            notesButton.addEventListener("click", () => {
                loadSessionNotes(sessionID, participant || "Participant");
            });

            statusContainer.append(statusSelect, notesButton);
        } else {
            const status = document.createElement("span");
            status.className = "session-status";
            status.textContent = currentStatus;
            statusContainer.appendChild(status);
        }

        container.appendChild(sessionCard);
    });
}

async function deleteSession(
    sessionID,
    sessionLabel,
    button
) {
    const confirmed = window.confirm(
        `Delete "${sessionLabel}"?\n\n` +
        "Information belonging only to this Session may also be deleted. " +
        "This cannot be undone."
    );

    if (!confirmed) return;

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const response = await fetch(
            `/api/sessions/${sessionID}`,
            {
                method: "DELETE",
                credentials: "same-origin",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const result = await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error ||
                "The Session could not be deleted."
            );
        }

        await loadSessions();
    } catch (error) {
        console.error(
            "Unable to delete Session:",
            error
        );

        alert(error.message);

        button.disabled = false;
        button.textContent = originalText;
    }
}

// ========================================
// SESSION STATUS
// ========================================

async function handleSessionStatusChange(event) {
    const select = event.currentTarget;
    const sessionID = Number(select.dataset.sessionId);
    const previousStatus = select.dataset.previousStatus;
    const newStatus = select.value;

    select.disabled = true;

    try {
        await updateSessionStatus(sessionID, newStatus);
        select.dataset.previousStatus = newStatus;
    } catch (error) {
        console.error("Error updating session status:", error);
        select.value = previousStatus;
        window.alert(error.message);
    } finally {
        select.disabled = false;
    }
}

async function updateSessionStatus(sessionID, status) {
    if (!Number.isInteger(sessionID) || sessionID < 1) {
        throw new Error("Invalid session ID.");
    }

    if (!SESSION_STATUSES.includes(status)) {
        throw new Error("Invalid session status.");
    }

    return fetchJSON(`/api/sessions/${sessionID}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Status: status })
    });
}

// ========================================
// SESSION NOTES
// ========================================

async function loadSessionNotes(sessionID, participant) {
    const panel = document.getElementById("session-notes-panel");
    const title = document.getElementById("session-notes-title");
    const container = document.getElementById("session-notes-container");

    if (!panel || !title || !container || !canManageSessions()) return;

    panel.dataset.sessionId = sessionID;
    panel.dataset.participant = participant;
    panel.classList.remove("hidden");
    title.textContent = `Session Notes: ${participant}`;
    container.textContent = "Loading notes...";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
        const notes = await fetchJSON(`/api/sessions/${sessionID}/notes`);

        if (!Array.isArray(notes)) {
            throw new Error("The server returned invalid session-note data.");
        }

        displaySessionNotes(notes);
    } catch (error) {
        console.error("Error loading session notes:", error);
        container.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load notes</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function displaySessionNotes(notes) {
    const container = document.getElementById("session-notes-container");
    if (!container) return;

    container.innerHTML = "";

    if (notes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No session notes</h3>
                <p>No coaching notes have been recorded for this session.</p>
            </div>
        `;
        return;
    }

    notes.forEach(note => {
        const coach = `${note.CoachFirstName || ""} ${
            note.CoachLastName || ""
        }`.trim();
        const noteCard = document.createElement("article");

        noteCard.className = "session-note-card";
        noteCard.innerHTML = `
            <div class="session-note-heading">
                <div>
                    <strong>${escapeHTML(coach || "Coach")}</strong>
                    <span>${escapeHTML(formatNoteDate(note.CreatedAt))}</span>
                </div>
            </div>
            <p>${escapeHTML(note.Notes)}</p>
        `;

        container.appendChild(noteCard);
    });
}

async function submitSessionNote(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const panel = document.getElementById("session-notes-panel");
    const sessionID = Number(panel?.dataset.sessionId);
    const participant = panel?.dataset.participant || "Participant";
    const notes = String(new FormData(form).get("Notes") || "").trim();
    const submitButton = form.querySelector('button[type="submit"]');

    showMessage("session-note-message");

    if (!Number.isInteger(sessionID) || sessionID < 1) {
        showMessage(
            "session-note-message",
            "Please select a session first.",
            "error"
        );
        return;
    }

    if (!notes) {
        showMessage(
            "session-note-message",
            "Session notes are required.",
            "error"
        );
        return;
    }

    if (submitButton) submitButton.disabled = true;

    try {
        await fetchJSON(`/api/sessions/${sessionID}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Notes: notes })
        });

        form.reset();
        await loadSessionNotes(sessionID, participant);
        showMessage(
            "session-note-message",
            "Session note saved successfully.",
            "success"
        );
    } catch (error) {
        console.error("Error saving session note:", error);
        showMessage("session-note-message", error.message, "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

// ========================================
// SESSION FORM
// ========================================

async function loadSessionFormOptions() {
    if (!canManageSessions()) return;

    try {
        const [users, programmes] = await Promise.all([
            fetchJSON("/api/users"),
            fetchJSON("/api/programmes")
        ]);

        if (!Array.isArray(users) || !Array.isArray(programmes)) {
            throw new Error("The server returned invalid session-form data.");
        }

        populateSessionUsers(
            "session-participant",
            users.filter(user => user.Role === "Participant"),
            "Select a participant"
        );

        populateSessionUsers(
            "session-coach",
            users.filter(user => user.Role === "Coach"),
            "Select a coach"
        );

        const programmeSelect = document.getElementById("session-programme");
        if (programmeSelect) {
            programmeSelect.innerHTML =
                '<option value="">Select a programme</option>';

            programmes.forEach(programme => {
                const option = document.createElement("option");
                option.value = programme.ProgrammeID;
                option.textContent = programme.ProgrammeName;
                programmeSelect.appendChild(option);
            });
        }

        if (window.kbdCurrentUser?.Role === "Coach") {
            const coachSelect = document.getElementById("session-coach");
            if (coachSelect) {
                coachSelect.value = String(window.kbdCurrentUser.UserID);
                coachSelect.disabled = true;
                coachSelect.required = false;
            }
        }

        document.getElementById("session-note-coach")
            ?.closest(".form-group")
            ?.classList.add("hidden");
    } catch (error) {
        console.error("Error loading session options:", error);
        showMessage("session-form-message", error.message, "error");
    }
}

function populateSessionUsers(selectID, users, placeholder) {
    const select = document.getElementById(selectID);
    if (!select) return;

    select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>`;

    users.forEach(user => {
        const option = document.createElement("option");
        option.value = user.UserID;
        option.textContent = `${user.FirstName} ${user.LastName}`;
        select.appendChild(option);
    });
}

async function submitSession(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const user = window.kbdCurrentUser;
    const sessionData = {
        ProgrammeID: Number(formData.get("ProgrammeID")),
        ParticipantID: Number(formData.get("ParticipantID")),
        SessionDate: String(formData.get("SessionDate") || ""),
        StartTime: String(formData.get("StartTime") || "") || null,
        EndTime: String(formData.get("EndTime") || "") || null,
        SessionType: String(formData.get("SessionType") || "Coaching").trim()
    };
    const submitButton = form.querySelector('button[type="submit"]');

    if (user?.Role === "Admin") {
        sessionData.CoachID = Number(formData.get("CoachID"));
    }

    showMessage("session-form-message");

    if (
        !Number.isInteger(sessionData.ProgrammeID) ||
        sessionData.ProgrammeID < 1 ||
        !Number.isInteger(sessionData.ParticipantID) ||
        sessionData.ParticipantID < 1 ||
        !sessionData.SessionDate ||
        (user?.Role === "Admin" &&
            (!Number.isInteger(sessionData.CoachID) || sessionData.CoachID < 1))
    ) {
        showMessage(
            "session-form-message",
            "Programme, coach, participant and session date are required.",
            "error"
        );
        return;
    }

    if (
        sessionData.StartTime &&
        sessionData.EndTime &&
        sessionData.EndTime <= sessionData.StartTime
    ) {
        showMessage(
            "session-form-message",
            "End time must be later than start time.",
            "error"
        );
        return;
    }

    if (submitButton) submitButton.disabled = true;

    try {
        await fetchJSON("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionData)
        });

        showMessage(
            "session-form-message",
            "Session scheduled successfully.",
            "success"
        );
        form.reset();
        await loadSessions();
    } catch (error) {
        console.error("Error creating session:", error);
        showMessage("session-form-message", error.message, "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

const sessionsContainer =
    document.getElementById(
        "sessions-container"
    );

sessionsContainer?.addEventListener(
    "click",
    event => {
        const button =
            event.target.closest(
                ".delete-session-button"
            );

        if (!button) return;

        const sessionID =
            Number(
                button.dataset.sessionId
            );

        if (!Number.isInteger(sessionID)) {
            alert("Invalid Session ID.");
            return;
        }

        deleteSession(
            sessionID,
            button.dataset.sessionLabel ||
                "this Session",
            button
        );
    }
);

// ========================================
// START
// ========================================

async function initialiseSessionsPage() {
    if (sessionsPageInitialised) return;
    sessionsPageInitialised = true;

    const canManage = canManageSessions();
    const showFormButton = document.getElementById("show-session-form");
    const formPanel = document.getElementById("session-form-panel");
    const sessionForm = document.getElementById("session-form");
    const notesPanel = document.getElementById("session-notes-panel");
    const noteForm = document.getElementById("session-note-form");

    if (showFormButton) {
        showFormButton.hidden = !canManage;
        showFormButton.addEventListener("click", () => {
            formPanel?.classList.remove("hidden");
            formPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    if (!canManage) {
        formPanel?.classList.add("hidden");
        notesPanel?.classList.add("hidden");
    }

    document.getElementById("close-session-form")?.addEventListener(
        "click",
        () => {
            formPanel?.classList.add("hidden");
            sessionForm?.reset();
            showMessage("session-form-message");
        }
    );

    document.getElementById("close-session-notes")?.addEventListener(
        "click",
        () => {
            notesPanel?.classList.add("hidden");
            noteForm?.reset();
            showMessage("session-note-message");
            if (notesPanel) {
                delete notesPanel.dataset.sessionId;
                delete notesPanel.dataset.participant;
            }
        }
    );

    sessionForm?.addEventListener("submit", submitSession);
    noteForm?.addEventListener("submit", submitSessionNote);

    await loadSessions();
    if (canManage) await loadSessionFormOptions();
}

if (window.kbdCurrentUser) {
    initialiseSessionsPage();
} else {
    window.addEventListener(
        "kbd-auth-ready",
        initialiseSessionsPage,
        { once: true }
    );
}
