// ========================================
// KBD SESSIONS PAGE
// ========================================

const API_URL = "";
const SESSION_STATUSES = [
    "Scheduled",
    "Completed",
    "Rescheduled",
    "Cancelled",
    "Missed"
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
    if (window.kbdCurrentUser?.Role === "Participant") return;

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


// ========================================
// PARTICIPANT VIEW: SESSIONS
// ----------------------------------------
// Runs only for Participants on sessions.html. It shows a
// client-portal style page and hides the standard one.
// Coach, Admin and Corporate users see the page unchanged.
// Uses existing API routes only (no backend change).
// Styles: the participant sections at the end of CSS/style.css.
// To switch it off, delete this section.
// ========================================
(() => {
    let ppStarted = false;

    const PP_PAGE = (window.location.pathname.split("/").pop() || "")
        .replace(/\.html$/, "")
        .toLowerCase();


    // ========================================
    // HELPERS
    // ========================================

    function el(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = String(text);
        return element;
    }

    function today() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function parseDate(value) {
        if (!value) return null;
        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    function daysFromToday(value) {
        const date = parseDate(value);
        return date ? Math.round((date - today()) / 86400000) : null;
    }

    function formatDate(value, options) {
        const date = parseDate(value);
        if (!date) return "";
        return date.toLocaleDateString(
            "en-ZA",
            options || { day: "numeric", month: "short", year: "numeric" }
        );
    }

    function formatTime(value) {
        const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
        return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
    }

    function personName(first, last) {
        return `${first || ""} ${last || ""}`.trim();
    }

    function formatSize(bytes) {
        const size = Number(bytes || 0);
        if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`;
        if (size >= 1024) return `${Math.round(size / 1024)} KB`;
        return size ? `${size} B` : "";
    }

    async function readResponse(response) {
        if (window.KBDUI && typeof KBDUI.readResponse === "function") {
            return KBDUI.readResponse(response);
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(result.error || "The request could not be completed.");
            error.status = response.status;
            throw error;
        }

        return result;
    }

    async function getJSON(url) {
        const response = await fetch(url, {
            method: "GET",
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });

        if (response.status === 404) {
            const error = new Error("Not available.");
            error.status = 404;
            throw error;
        }

        return readResponse(response);
    }

    async function sendJSON(method, url, body) {
        const response = await fetch(url, {
            method,
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(body)
        });

        return readResponse(response);
    }

    async function loadAll(map) {
        const keys = Object.keys(map);
        const results = await Promise.allSettled(keys.map(key => getJSON(map[key])));
        const data = {};
        const failed = [];

        results.forEach((result, index) => {
            const key = keys[index];

            if (result.status === "fulfilled" && Array.isArray(result.value)) {
                data[key] = result.value;
            } else {
                data[key] = [];
                failed.push({ key, status: result.reason?.status });
                if (result.status === "rejected") {
                    console.error(`Unable to load ${key}:`, result.reason);
                }
            }
        });

        return { data, failed };
    }

    function queryParameter(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    // ========================================
    // SHARED COMPONENTS
    // ========================================

    function buildShell(options) {
        const standard = document.querySelector(".main-content > .dashboard");
        if (!standard) return null;

        document.body.classList.add("participant-portal");

        const heading = document.querySelector(".topbar h1");
        if (heading) heading.textContent = options.pageTitle;

        const shell = el("section", "pd pp");
        shell.id = "participant-page";

        const intro = el("div", "pp-intro");
        const introText = el("div", "pp-intro-text");
        introText.appendChild(el("p", "eyebrow", options.eyebrow));
        introText.appendChild(el("h2", "", options.heading));
        introText.appendChild(el("p", "", options.description));
        const summary = el("div", "pp-intro-stats");
        summary.id = "pp-summary";
        intro.append(introText, summary);

        const message = el("div", "pd-message");
        message.id = "pp-message";
        message.hidden = true;

        const toolbar = el("div", "pp-toolbar");
        toolbar.id = "pp-toolbar";

        const content = el("div", "pp-content");
        content.id = "pp-content";
        content.setAttribute("aria-live", "polite");
        content.appendChild(el("p", "pp-loading", "Loading..."));

        shell.append(intro, message, toolbar, content);
        standard.insertAdjacentElement("afterend", shell);

        return { shell, summary, toolbar, content };
    }

    function setSummary(container, items) {
        container.innerHTML = "";
        items.forEach(item => {
            const chip = el("div", "pp-summary-item");
            chip.appendChild(el("strong", "", item.value));
            chip.appendChild(el("span", "", item.label));
            container.appendChild(chip);
        });
    }

    function showMessage(text, type) {
        const box = document.getElementById("pp-message");
        if (!box) return;
        box.textContent = text || "";
        box.hidden = !text;
        box.classList.toggle("pp-message-info", type === "info");
    }

    function emptyState(title, text) {
        const box = el("div", "pd-empty");
        box.appendChild(el("strong", "", title));
        if (text) box.appendChild(el("span", "", text));
        return box;
    }

    function segmented(options, current, onChange, label) {
        const group = el("div", "pp-segmented");
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", label);

        options.forEach(option => {
            const button = el("button", "pp-segment", option.label);
            button.type = "button";
            button.setAttribute("aria-pressed", String(option.value === current));
            if (option.value === current) button.classList.add("is-active");
            button.addEventListener("click", () => {
                group.querySelectorAll(".pp-segment").forEach(other => {
                    other.classList.remove("is-active");
                    other.setAttribute("aria-pressed", "false");
                });
                button.classList.add("is-active");
                button.setAttribute("aria-pressed", "true");
                onChange(option.value);
            });
            group.appendChild(button);
        });

        return group;
    }

    function programmeSelect(programmes, current, onChange) {
        const wrapper = el("label", "pp-select");
        wrapper.appendChild(el("span", "pp-visually-hidden", "Filter by programme"));
        const select = el("select");
        select.appendChild(new Option("All programmes", ""));
        programmes.forEach(programme => {
            select.appendChild(new Option(programme.ProgrammeName, String(programme.ProgrammeID)));
        });
        select.value = current || "";
        select.addEventListener("change", () => onChange(select.value));
        wrapper.appendChild(select);
        return wrapper;
    }

    function searchBox(placeholder, onInput) {
        const wrapper = el("label", "pp-search");
        wrapper.appendChild(el("span", "pp-visually-hidden", placeholder));
        const input = el("input");
        input.type = "search";
        input.placeholder = placeholder;
        input.addEventListener("input", () => onInput(input.value.trim().toLowerCase()));
        wrapper.appendChild(input);
        return wrapper;
    }

    // A "Documents" toggle that lazy-loads a file list.
    function filesToggle(label, listURL, downloadURL) {
        const wrapper = el("div", "pp-files");
        const button = el("button", "pd-link-button", label);
        button.type = "button";
        button.setAttribute("aria-expanded", "false");
        const list = el("ul", "pp-file-list");
        list.hidden = true;
        let loaded = false;

        button.addEventListener("click", async () => {
            const open = list.hidden;
            list.hidden = !open;
            button.setAttribute("aria-expanded", String(open));
            if (!open || loaded) return;

            list.innerHTML = "";
            list.appendChild(el("li", "pp-file-note", "Loading documents..."));

            try {
                const files = await getJSON(listURL);
                loaded = true;
                list.innerHTML = "";

                if (!Array.isArray(files) || !files.length) {
                    list.appendChild(el("li", "pp-file-note", "No documents attached."));
                    return;
                }

                files.forEach(file => {
                    const item = el("li", "pp-file");
                    const link = el("a", "", file.OriginalFileName || "Document");
                    link.href = downloadURL(file.UploadedFileID);
                    link.setAttribute("download", "");
                    const meta = el("span", "pp-file-meta", [formatSize(file.FileSize), formatDate(file.CreatedAt)].filter(Boolean).join(" · "));
                    item.append(link, meta);
                    list.appendChild(item);
                });
            } catch (error) {
                list.innerHTML = "";
                list.appendChild(el("li", "pp-file-note", error.message || "Documents could not be loaded."));
            }
        });

        wrapper.append(button, list);
        return wrapper;
    }

    function progressBar(percent, label) {
        const bar = el("div", "pd-bar");
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(percent));
        bar.setAttribute("aria-label", label);
        const fill = el("span", "pd-bar-fill");
        fill.style.width = `${percent}%`;
        bar.appendChild(fill);
        return bar;
    }

    function dateBadge(value) {
        const date = parseDate(value);
        const badge = el("div", "pd-date-badge");
        badge.appendChild(el("span", "pd-date-month", date ? date.toLocaleDateString("en-ZA", { month: "short" }) : ""));
        badge.appendChild(el("strong", "pd-date-day", date ? date.getDate() : "?"));
        return badge;
    }

    function statusTag(text, tone) {
        return el("span", `pd-tag ${tone ? `pp-tag-${tone}` : ""}`.trim(), text);
    }

    // ========================================
    // SESSIONS
    // ========================================

    async function renderSessionsPage() {
        const ui = buildShell({
            pageTitle: "My Sessions",
            eyebrow: "AGENDA",
            heading: "Your coaching sessions",
            description: "See what's coming up and look back at the sessions you've had."
        });
        if (!ui) return;

        const { data, failed } = await loadAll({
            sessions: "/api/sessions",
            programmes: "/api/programmes"
        });

        if (failed.length) showMessage("Some information could not be loaded. Please refresh to try again.");

        const state = { view: "upcoming", programme: queryParameter("programme") || "" };

        const isUpcoming = s => ["Scheduled", "Rescheduled"].includes(s.Status) && (daysFromToday(s.SessionDate) ?? -1) >= 0;
        const upcoming = data.sessions.filter(isUpcoming);
        const completed = data.sessions.filter(s => s.Status === "Completed");

        setSummary(ui.summary, [
            { value: upcoming.length, label: "Upcoming" },
            { value: completed.length, label: "Completed" },
            { value: upcoming.filter(s => (daysFromToday(s.SessionDate) ?? 99) <= 7).length, label: "This week" }
        ]);

        ui.toolbar.append(
            segmented(
                [{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }],
                state.view,
                value => { state.view = value; draw(); },
                "Show sessions"
            ),
            programmeSelect(data.programmes, state.programme, value => { state.programme = value; draw(); })
        );

        function draw() {
            ui.content.innerHTML = "";

            let sessions = data.sessions.filter(s => !state.programme || String(s.ProgrammeID) === state.programme);
            sessions = state.view === "upcoming"
                ? sessions.filter(isUpcoming).sort((a, b) => `${a.SessionDate} ${a.StartTime || ""}`.localeCompare(`${b.SessionDate} ${b.StartTime || ""}`))
                : sessions.filter(s => !isUpcoming(s)).sort((a, b) => `${b.SessionDate} ${b.StartTime || ""}`.localeCompare(`${a.SessionDate} ${a.StartTime || ""}`));

            if (!sessions.length) {
                ui.content.appendChild(state.view === "upcoming"
                    ? emptyState("No upcoming sessions", "Your coach will schedule your next session.")
                    : emptyState("No past sessions yet", "Sessions you've had will show here."));
                return;
            }

            const panel = el("div", "panel pp-list-panel");
            let currentMonth = "";

            sessions.forEach(session => {
                const date = parseDate(session.SessionDate);
                const month = date ? date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : "No date";

                if (month !== currentMonth) {
                    currentMonth = month;
                    panel.appendChild(el("h4", "pd-group-title", month));
                }

                const row = el("div", "pp-session-row");
                row.appendChild(dateBadge(session.SessionDate));

                const body = el("div", "pd-session-body");
                const start = formatTime(session.StartTime);
                const end = formatTime(session.EndTime);
                const weekday = date ? date.toLocaleDateString("en-ZA", { weekday: "long" }) : "";
                body.appendChild(el("strong", "", `${session.SessionType || "Session"}${weekday ? ` · ${weekday}` : ""}`));
                body.appendChild(el("span", "", [start ? `${start}${end ? `–${end}` : ""}` : "", personName(session.CoachFirstName, session.CoachLastName) ? `with ${personName(session.CoachFirstName, session.CoachLastName)}` : ""].filter(Boolean).join(" · ")));
                if (session.ProgrammeName) body.appendChild(el("span", "", session.ProgrammeName));
                if (session.Title && session.Title !== session.SessionType) body.prepend(el("strong", "", session.Title));
                if (session.Location) body.appendChild(el("span", "", session.Location));
                if (session.Agenda) body.appendChild(el("p", "", session.Agenda));
                if (session.MeetingLink && /^https?:\/\//i.test(session.MeetingLink)) {
                    const join=el("a", "pd-link-button", "Join session");join.href=session.MeetingLink;join.target="_blank";join.rel="noopener noreferrer";body.appendChild(join);
                }

                row.appendChild(body);

                const tones = { Scheduled: "green", Rescheduled: "blue", Completed: "green", Cancelled: "red", Missed: "red" };
                row.appendChild(statusTag(session.Status, tones[session.Status]));

                panel.appendChild(row);
            });

            ui.content.appendChild(panel);
        }

        draw();
    }


    // ========================================
    // START (Participants on sessions.html only)
    // ========================================

    function start(user) {
        if (ppStarted || !user || user.Role !== "Participant") return;
        if (PP_PAGE !== "sessions") return;
        ppStarted = true;

        renderSessionsPage().catch(error => {
            console.error("Participant page error:", error);
            showMessage(error.message || "This page could not be loaded.");
        });
    }

    if (window.kbdCurrentUser) {
        start(window.kbdCurrentUser);
    } else {
        window.addEventListener(
            "kbd-auth-ready",
            event => start(event.detail || window.kbdCurrentUser),
            { once: true }
        );
    }
})();
