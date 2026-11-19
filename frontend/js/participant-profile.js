// ========================================
// KBD PARTICIPANT PROFILE
// ========================================

const API_URL = "";
const participantID = Number(
    new URLSearchParams(window.location.search).get("id")
);
let participantProfileInitialised = false;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

async function requestJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    return readResponse(response);
}

function showSectionLoading(containerID, message) {
    const container = document.getElementById(containerID);
    if (!container) return;

    if (window.KBDUI?.showLoading) {
        KBDUI.showLoading(containerID, message);
    } else {
        container.textContent = message;
    }
}

function showSectionEmpty(containerID, title, message) {
    const container = document.getElementById(containerID);
    if (!container) return;

    if (window.KBDUI?.showEmpty) {
        KBDUI.showEmpty(containerID, title, message);
    } else {
        container.innerHTML = `
            <div class="empty-state">
                <h3>${escapeHTML(title)}</h3>
                <p>${escapeHTML(message)}</p>
            </div>
        `;
    }
}

function showSectionError(containerID, error, retryFunction) {
    const container = document.getElementById(containerID);
    if (!container) return;

    if (window.KBDUI?.showError) {
        KBDUI.showError(containerID, error.message, retryFunction);
    } else {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Unable to load information</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function formatDate(dateString) {
    if (!dateString) return "No date";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "No date";

    return date.toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function clampPercentage(value) {
    const percentage = Number(value);
    return Number.isFinite(percentage)
        ? Math.min(100, Math.max(0, percentage))
        : 0;
}

function canManageParticipant() {
    return ["Admin", "Coach"].includes(window.kbdCurrentUser?.Role);
}

// ========================================
// LOAD PROFILE
// ========================================

async function loadParticipantProfile() {
    if (!Number.isInteger(participantID) || participantID < 1) {
        showProfileError("No valid participant was selected.");
        return;
    }

    try {
        const participant = await requestJSON(
            `${API_URL}/api/users/${participantID}`
        );

        if (participant.Role !== "Participant") {
            throw new Error("The selected account is not a participant.");
        }

        displayParticipantHeader(participant);

        await Promise.allSettled([
            loadParticipantProgrammes(),
            loadParticipantProgress(),
            loadParticipantSessions(),
            loadParticipantActions()
        ]);
    } catch (error) {
        console.error("Error loading participant:", error);
        showProfileError(
            error.message || "Unable to load participant information."
        );
    }
}

function displayParticipantHeader(participant) {
    const container = document.getElementById("participant-header");
    if (!container) return;

    const initials = `${participant.FirstName?.charAt(0) || ""}${
        participant.LastName?.charAt(0) || ""
    }`.toUpperCase();

    container.innerHTML = `
        <div class="profile-avatar" aria-hidden="true">
            ${escapeHTML(initials || "P")}
        </div>

        <div class="profile-information">
            <p class="eyebrow">PARTICIPANT</p>
            <h2>
                ${escapeHTML(participant.FirstName)}
                ${escapeHTML(participant.LastName)}
            </h2>
            <p>${escapeHTML(participant.Email)}</p>
        </div>
    `;
}

function showProfileError(message) {
    const container = document.getElementById("participant-header");
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <h3>Unable to load profile</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

// ========================================
// PROGRAMMES
// ========================================

async function loadParticipantProgrammes() {
    const containerID = "profile-programmes";
    const container = document.getElementById(containerID);
    if (!container) return;

    showSectionLoading(containerID, "Loading programmes...");

    try {
        const programmes = await requestJSON(
            `${API_URL}/api/users/${participantID}/programmes`
        );

        if (!Array.isArray(programmes)) {
            throw new Error("The server returned invalid programme data.");
        }

        container.innerHTML = "";

        if (programmes.length === 0) {
            showSectionEmpty(
                containerID,
                "No programmes",
                "This participant is not enrolled in a programme."
            );
            return;
        }

        programmes.forEach(programme => {
            const element = document.createElement("div");
            const status =
                programme.EnrollmentStatus ||
                programme.ProgrammeStatus ||
                "Unknown";

            element.className = "profile-list-item";
            element.innerHTML = `
                <strong>${escapeHTML(programme.ProgrammeName)}</strong>
                <span>${escapeHTML(status)}</span>
            `;
            container.appendChild(element);
        });
    } catch (error) {
        console.error("Error loading participant programmes:", error);
        showSectionError(containerID, error, loadParticipantProgrammes);
    }
}

// ========================================
// PROGRESS
// ========================================

async function loadParticipantProgress() {
    const containerID = "profile-progress";
    const container = document.getElementById(containerID);
    if (!container) return;

    showSectionLoading(containerID, "Loading progress...");

    try {
        const progress = await requestJSON(`${API_URL}/api/progress`);

        if (!Array.isArray(progress)) {
            throw new Error("The server returned invalid progress data.");
        }

        const participantProgress = progress.filter(
            item => Number(item.UserID) === participantID
        );

        container.innerHTML = "";

        if (participantProgress.length === 0) {
            showSectionEmpty(
                containerID,
                "No progress available",
                "No progress record exists for this participant."
            );
            return;
        }

        participantProgress.forEach(item => {
            const percentage = clampPercentage(item.ProgressPercentage);
            const element = document.createElement("div");
            const editControls = canManageParticipant()
                ? `
                    <div class="progress-edit">
                        <div class="form-group">
                            <label for="progress-${Number(item.ProgressID)}">
                                Progress percentage
                            </label>
                            <input
                                id="progress-${Number(item.ProgressID)}"
                                class="progress-input"
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value="${percentage}"
                            >
                        </div>
                        <button
                            class="primary-button save-progress-button"
                            type="button"
                            data-progress-id="${Number(item.ProgressID)}"
                        >
                            Save
                        </button>
                    </div>
                    <div class="form-message progress-message"></div>
                `
                : "";

            element.className = "profile-progress-item";
            element.innerHTML = `
                <div class="profile-progress-header">
                    <div>
                        <strong>${escapeHTML(item.ProgrammeName)}</strong>
                        <span class="progress-status">
                            ${escapeHTML(item.Status)}
                        </span>
                    </div>
                    <strong class="progress-percentage">
                        ${percentage}%
                    </strong>
                </div>

                <div
                    class="progress-bar"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${percentage}"
                >
                    <div
                        class="progress-fill"
                        style="width: ${percentage}%"
                    ></div>
                </div>
                ${editControls}
            `;

            element
                .querySelector(".save-progress-button")
                ?.addEventListener("click", () => saveProgress(element));

            container.appendChild(element);
        });
    } catch (error) {
        console.error("Error loading participant progress:", error);
        showSectionError(containerID, error, loadParticipantProgress);
    }
}

async function saveProgress(element) {
    const button = element.querySelector(".save-progress-button");
    const input = element.querySelector(".progress-input");
    const message = element.querySelector(".progress-message");
    const progressID = Number(button?.dataset.progressId);
    const percentage = Number(input?.value);

    if (
        !Number.isInteger(progressID) ||
        progressID < 1 ||
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100
    ) {
        setProgressMessage(
            message,
            "Progress must be between 0 and 100.",
            "error"
        );
        return;
    }

    button.disabled = true;
    button.textContent = "Saving...";
    setProgressMessage(message, "");

    try {
        const result = await requestJSON(
            `${API_URL}/api/progress/${progressID}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ProgressPercentage: percentage
                })
            }
        );

        const updatedPercentage = clampPercentage(
            result.ProgressPercentage
        );

        element.querySelector(".progress-percentage").textContent =
            `${updatedPercentage}%`;
        element.querySelector(".progress-status").textContent =
            result.Status;
        element.querySelector(".progress-fill").style.width =
            `${updatedPercentage}%`;
        element.querySelector(".progress-bar").setAttribute(
            "aria-valuenow",
            updatedPercentage
        );

        input.value = updatedPercentage;
        setProgressMessage(
            message,
            "Progress updated successfully.",
            "success"
        );
    } catch (error) {
        console.error("Error updating progress:", error);
        setProgressMessage(message, error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = "Save";
    }
}

function setProgressMessage(element, message, type = "") {
    if (!element) return;
    element.textContent = message;
    element.className = type
        ? `form-message progress-message ${type}`
        : "form-message progress-message";
}

// ========================================
// SESSIONS AND ACTIONS
// ========================================

async function loadParticipantSessions() {
    const containerID = "profile-sessions";
    const container = document.getElementById(containerID);
    if (!container) return;

    showSectionLoading(containerID, "Loading sessions...");

    try {
        const sessions = await requestJSON(`${API_URL}/api/sessions`);
        if (!Array.isArray(sessions)) {
            throw new Error("The server returned invalid session data.");
        }

        const participantSessions = sessions
            .filter(session => Number(session.ParticipantID) === participantID)
            .sort((first, second) =>
                String(second.SessionDate || "").localeCompare(
                    String(first.SessionDate || "")
                )
            );

        container.innerHTML = "";

        if (participantSessions.length === 0) {
            showSectionEmpty(
                containerID,
                "No sessions",
                "No coaching sessions are available for this participant."
            );
            return;
        }

        participantSessions.forEach(session => {
            const element = document.createElement("div");
            element.className = "profile-list-item";
            element.innerHTML = `
                <strong>${escapeHTML(session.SessionType || "Coaching Session")}</strong>
                <span>Programme: ${escapeHTML(session.ProgrammeName || "Not assigned")}</span>
                <span>Date: ${escapeHTML(formatDate(session.SessionDate))}</span>
                <span>Time: ${escapeHTML(session.StartTime || "No time")}</span>
                <span class="session-status">${escapeHTML(session.Status)}</span>
            `;
            container.appendChild(element);
        });
    } catch (error) {
        console.error("Error loading participant sessions:", error);
        showSectionError(containerID, error, loadParticipantSessions);
    }
}

async function loadParticipantActions() {
    const containerID = "profile-actions";
    const container = document.getElementById(containerID);
    if (!container) return;

    showSectionLoading(containerID, "Loading actions...");

    try {
        const actions = await requestJSON(`${API_URL}/api/actions`);
        if (!Array.isArray(actions)) {
            throw new Error("The server returned invalid action data.");
        }

        const participantActions = actions
            .filter(action => Number(action.AssignedTo) === participantID)
            .sort((first, second) =>
                String(first.DueDate || "9999").localeCompare(
                    String(second.DueDate || "9999")
                )
            );

        container.innerHTML = "";

        if (participantActions.length === 0) {
            showSectionEmpty(
                containerID,
                "No actions",
                "No actions are assigned to this participant."
            );
            return;
        }

        participantActions.forEach(action => {
            const element = document.createElement("div");
            element.className = "profile-list-item";
            element.innerHTML = `
                <strong>${escapeHTML(action.Title)}</strong>
                <span>Due: ${escapeHTML(formatDate(action.DueDate))}</span>
                <span class="session-status">${escapeHTML(action.Status)}</span>
            `;
            container.appendChild(element);
        });
    } catch (error) {
        console.error("Error loading participant actions:", error);
        showSectionError(containerID, error, loadParticipantActions);
    }
}

// ========================================
// PROGRAMME ASSIGNMENT
// ========================================

function showProgrammeAssignmentMessage(message = "", type = "") {
    const element = document.getElementById(
        "programme-assignment-message"
    );
    if (!element) return;

    element.textContent = message;
    element.className = type
        ? `form-message ${type}`
        : "form-message";
}

async function loadProgrammeAssignmentOptions() {
    const select = document.getElementById(
        "programme-assignment-select"
    );
    if (!select || !canManageParticipant()) return;

    select.innerHTML = '<option value="">Select a programme</option>';

    try {
        const [programmes, assignedProgrammes] = await Promise.all([
            requestJSON(`${API_URL}/api/programmes`),
            requestJSON(`${API_URL}/api/users/${participantID}/programmes`)
        ]);

        if (!Array.isArray(programmes) || !Array.isArray(assignedProgrammes)) {
            throw new Error("The server returned invalid programme data.");
        }

        const assignedIDs = new Set(
            assignedProgrammes.map(programme => Number(programme.ProgrammeID))
        );
        const availableProgrammes = programmes.filter(
            programme => !assignedIDs.has(Number(programme.ProgrammeID))
        );

        availableProgrammes.forEach(programme => {
            const option = document.createElement("option");
            option.value = programme.ProgrammeID;
            option.textContent = programme.ProgrammeName;
            select.appendChild(option);
        });

        if (availableProgrammes.length === 0) {
            const option = document.createElement("option");
            option.disabled = true;
            option.textContent = "No available programmes";
            select.appendChild(option);
        }
    } catch (error) {
        console.error("Error loading programme options:", error);
        showProgrammeAssignmentMessage(error.message, "error");
    }
}

async function assignParticipantToProgramme(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const programmeID = Number(
        new FormData(form).get("ProgrammeID")
    );
    const submitButton = form.querySelector('button[type="submit"]');

    showProgrammeAssignmentMessage();

    if (!Number.isInteger(programmeID) || programmeID < 1) {
        showProgrammeAssignmentMessage(
            "Please select a programme.",
            "error"
        );
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Assigning...";
    }

    try {
        await requestJSON(
            `${API_URL}/api/programmes/${programmeID}/participants`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ UserID: participantID })
            }
        );

        showProgrammeAssignmentMessage(
            "Participant assigned successfully.",
            "success"
        );
        form.reset();

        await Promise.all([
            loadParticipantProgrammes(),
            loadParticipantProgress(),
            loadProgrammeAssignmentOptions()
        ]);
    } catch (error) {
        console.error("Error assigning programme:", error);
        showProgrammeAssignmentMessage(error.message, "error");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Assign";
        }
    }
}

// ========================================
// START
// ========================================

async function initialiseParticipantProfile() {
    if (participantProfileInitialised) return;
    participantProfileInitialised = true;

    const assignmentForm = document.getElementById(
        "programme-assignment-form"
    );
    const assignmentPanel =
        assignmentForm?.closest(".panel") || assignmentForm;

    if (assignmentPanel) {
        assignmentPanel.hidden = !canManageParticipant();
    }

    if (canManageParticipant()) {
        assignmentForm?.addEventListener(
            "submit",
            assignParticipantToProgramme
        );
    }

    await loadParticipantProfile();

    if (canManageParticipant()) {
        await loadProgrammeAssignmentOptions();
    }
}

if (window.kbdCurrentUser) {
    initialiseParticipantProfile();
} else {
    window.addEventListener(
        "kbd-auth-ready",
        initialiseParticipantProfile,
        { once: true }
    );
}
