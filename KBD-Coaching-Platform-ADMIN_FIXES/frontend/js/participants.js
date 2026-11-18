// ========================================
// KBD PARTICIPANTS PAGE
// ========================================

const API_URL = "";
let participantsPageInitialised = false;

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

function canCreateParticipants() {
    return ["Admin", "Coach"].includes(window.kbdCurrentUser?.Role);
}

function showParticipantFormMessage(message = "", type = "") {
    const element = document.getElementById("participant-form-message");

    if (!element) return;

    element.textContent = message;
    element.className = type
        ? `form-message ${type}`
        : "form-message";

    if (message) {
        element.setAttribute("role", type === "error" ? "alert" : "status");
        element.setAttribute("aria-live", "polite");
    } else {
        element.removeAttribute("role");
        element.removeAttribute("aria-live");
    }
}

function showParticipantsMessage(title, message) {
    const container = document.getElementById("participants-container");

    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

// ========================================
// LOAD PARTICIPANTS
// ========================================

async function loadParticipants() {
    const container = document.getElementById("participants-container");

    if (!container) return;

    if (window.KBDUI?.showLoading) {
        KBDUI.showLoading("participants-container", "Loading participants...");
    } else {
        container.textContent = "Loading participants...";
    }

    try {
        const response = await fetch(`${API_URL}/api/users`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });
        const users = await readResponse(response);

        if (!Array.isArray(users)) {
            throw new Error("The server returned invalid participant data.");
        }

        const participants = users.filter(
            user => user.Role === "Participant"
        );

        displayParticipants(participants);
    } catch (error) {
        console.error("Error loading participants:", error);

        if (window.KBDUI?.showError) {
            KBDUI.showError(
                "participants-container",
                error.message,
                loadParticipants
            );
        } else {
            showParticipantsMessage(
                "Unable to load participants",
                error.message
            );
        }
    }
}

// ========================================
// DISPLAY PARTICIPANTS
// ========================================

function displayParticipants(participants) {
    const container = document.getElementById("participants-container");

    if (!container) return;

    container.innerHTML = "";

    if (participants.length === 0) {
        if (window.KBDUI?.showEmpty) {
            KBDUI.showEmpty(
                "participants-container",
                "No participants found",
                "There are currently no participants assigned to your programmes."
            );
        } else {
            showParticipantsMessage(
                "No participants found",
                "There are currently no participants assigned to your programmes."
            );
        }

        return;
    }

    participants.forEach(participant => {
        const userID = Number(participant.UserID);

        if (!Number.isInteger(userID) || userID < 1) return;

        const card = document.createElement("article");
        const initials = `${participant.FirstName?.charAt(0) || ""}${
            participant.LastName?.charAt(0) || ""
        }`.toUpperCase();

        card.className = "participant-card";
        card.innerHTML = `
            <div class="participant-avatar" aria-hidden="true">
                ${escapeHTML(initials || "P")}
            </div>

            <div class="participant-info">
                <h3>
                    ${escapeHTML(participant.FirstName)}
                    ${escapeHTML(participant.LastName)}
                </h3>
                <p>${escapeHTML(participant.Email)}</p>
            </div>

            <div class="participant-role">
                <span>Participant</span>
            </div>

            <div class="participant-action">
                <button
                    class="view-participant"
                    type="button"
                    data-user-id="${userID}"
                    aria-label="View ${escapeHTML(
                        participant.FirstName
                    )} ${escapeHTML(participant.LastName)} profile"
                >
                    View Profile
                </button>
            </div>
        `;

        card
            .querySelector(".view-participant")
            .addEventListener("click", event => {
                const selectedUserID = Number(
                    event.currentTarget.dataset.userId
                );

                if (!Number.isInteger(selectedUserID) || selectedUserID < 1) {
                    return;
                }

                window.location.href =
                    `participant-profile.html?id=${encodeURIComponent(
                        selectedUserID
                    )}`;
            });

        container.appendChild(card);
    });
}

// ========================================
// CREATE PARTICIPANT
// ========================================

async function submitParticipant(event) {
    event.preventDefault();

    if (!canCreateParticipants()) {
        showParticipantFormMessage(
            "You do not have permission to create participants.",
            "error"
        );
        return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const participantData = {
        FirstName: String(formData.get("FirstName") || "").trim(),
        LastName: String(formData.get("LastName") || "").trim(),
        Email: String(formData.get("Email") || "").trim().toLowerCase(),
        Password: String(formData.get("Password") || ""),
        Role: "Participant"
    };
    const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"]'
    );

    showParticipantFormMessage();

    if (
        !participantData.FirstName ||
        !participantData.LastName ||
        !participantData.Email ||
        !participantData.Password
    ) {
        showParticipantFormMessage(
            "First name, last name, email and password are required.",
            "error"
        );
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participantData.Email)) {
        showParticipantFormMessage(
            "Please enter a valid email address.",
            "error"
        );
        return;
    }

    if (participantData.Password.length < 8) {
        showParticipantFormMessage(
            "Password must contain at least 8 characters.",
            "error"
        );
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating...";
    }

    try {
        const response = await fetch(`${API_URL}/api/users`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(participantData)
        });

        await readResponse(response);

        showParticipantFormMessage(
            "Participant created successfully.",
            "success"
        );
        form.reset();
        await loadParticipants();
    } catch (error) {
        console.error("Error creating participant:", error);
        showParticipantFormMessage(error.message, "error");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Create Participant";
        }
    }
}

// ========================================
// START
// ========================================

async function initialiseParticipantsPage() {
    if (participantsPageInitialised) return;

    participantsPageInitialised = true;

    const showFormButton = document.getElementById("show-participant-form");
    const closeFormButton = document.getElementById("close-participant-form");
    const formPanel = document.getElementById("participant-form-panel");
    const participantForm = document.getElementById("participant-form");
    const canCreate = canCreateParticipants();

    if (showFormButton) {
        showFormButton.hidden = !canCreate;
        showFormButton.addEventListener("click", () => {
            formPanel?.classList.remove("hidden");
            formPanel?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }

    if (!canCreate) {
        formPanel?.classList.add("hidden");
    }

    closeFormButton?.addEventListener("click", () => {
        formPanel?.classList.add("hidden");
        participantForm?.reset();
        showParticipantFormMessage();
    });

    participantForm?.addEventListener("submit", submitParticipant);

    await loadParticipants();
}

if (window.kbdCurrentUser) {
    initialiseParticipantsPage();
} else {
    window.addEventListener(
        "kbd-auth-ready",
        initialiseParticipantsPage,
        { once: true }
    );
}
