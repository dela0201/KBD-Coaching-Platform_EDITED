// ========================================
// KBD SETTINGS PAGE
// ========================================

let settingsPageInitialised = false;


// ========================================
// RESPONSE HANDLING
// ========================================

async function readSettingsResponse(response) {

    if (window.KBDUI?.readResponse) {

        return KBDUI.readResponse(
            response
        );

    }


    const result =
        await response
            .json()
            .catch(() => ({}));


    if (!response.ok) {

        throw new Error(
            result.error ||
            "The request could not be completed."
        );

    }


    return result;

}


// ========================================
// FORM MESSAGES
// ========================================

function showSettingsMessage(
    elementID,
    message = "",
    type = ""
) {

    const element =
        document.getElementById(
            elementID
        );


    if (!element) {

        return;

    }


    element.textContent =
        message;


    element.className =
        type
            ? `form-message ${type}`
            : "form-message";


    if (message) {

        element.setAttribute(
            "role",
            type === "error"
                ? "alert"
                : "status"
        );

        element.setAttribute(
            "aria-live",
            "polite"
        );

    }

}


// ========================================
// BUTTON LOADING STATE
// ========================================

function setButtonLoading(
    button,
    isLoading,
    loadingText,
    normalText
) {

    if (!button) {

        return;

    }


    button.disabled =
        isLoading;


    button.textContent =
        isLoading
            ? loadingText
            : normalText;


    button.setAttribute(
        "aria-busy",
        String(isLoading)
    );

}


// ========================================
// LOAD CURRENT USER
// ========================================

function loadCurrentUserSettings(user) {

    if (!user) {

        return;

    }


    const firstNameInput =
        document.getElementById(
            "settings-first-name"
        );

    const lastNameInput =
        document.getElementById(
            "settings-last-name"
        );

    const emailInput =
        document.getElementById(
            "settings-email"
        );

    const roleInput =
        document.getElementById(
            "settings-role"
        );


    if (firstNameInput) {

        firstNameInput.value =
            user.FirstName || "";

    }


    if (lastNameInput) {

        lastNameInput.value =
            user.LastName || "";

    }


    if (emailInput) {

        emailInput.value =
            user.Email || "";

    }


    if (roleInput) {

        roleInput.value =
            user.Role || "";

    }

}


// ========================================
// UPDATE PROFILE
// ========================================

async function updateProfile(event) {

    event.preventDefault();


    const form =
        event.currentTarget;

    const submitButton =
        document.getElementById(
            "save-profile-button"
        );


    showSettingsMessage(
        "profile-settings-message"
    );


    const formData =
        new FormData(form);


    const profileData = {

        FirstName:
            String(
                formData.get(
                    "FirstName"
                ) || ""
            ).trim(),

        LastName:
            String(
                formData.get(
                    "LastName"
                ) || ""
            ).trim(),

        Email:
            String(
                formData.get(
                    "Email"
                ) || ""
            )
                .trim()
                .toLowerCase()

    };


    if (
        !profileData.FirstName ||
        !profileData.LastName ||
        !profileData.Email
    ) {

        showSettingsMessage(
            "profile-settings-message",
            "Please complete all profile fields.",
            "error"
        );

        return;

    }


    setButtonLoading(
        submitButton,
        true,
        "Saving...",
        "Save Profile"
    );


    try {

        const response =
            await fetch(
                "/api/settings/profile",
                {
                    method: "PUT",

                    credentials:
                        "same-origin",

                    headers: {

                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json"

                    },

                    body:
                        JSON.stringify(
                            profileData
                        )
                }
            );


        const result =
            await readSettingsResponse(
                response
            );


        if (!result.user) {

            throw new Error(
                "The server returned invalid profile information."
            );

        }


        window.kbdCurrentUser =
            result.user;


        loadCurrentUserSettings(
            result.user
        );


        if (
            typeof updateCurrentUser ===
            "function"
        ) {

            updateCurrentUser(
                result.user
            );

        }


        showSettingsMessage(
            "profile-settings-message",
            result.message ||
                "Profile updated successfully.",
            "success"
        );

    }

    catch (error) {

        console.error(
            "Profile update error:",
            error
        );


        showSettingsMessage(
            "profile-settings-message",
            error.message,
            "error"
        );

    }

    finally {

        setButtonLoading(
            submitButton,
            false,
            "Saving...",
            "Save Profile"
        );

    }

}


// ========================================
// CHANGE PASSWORD
// ========================================

async function changePassword(event) {

    event.preventDefault();


    const form =
        event.currentTarget;

    const submitButton =
        document.getElementById(
            "change-password-button"
        );


    showSettingsMessage(
        "password-settings-message"
    );


    const formData =
        new FormData(form);


    const currentPassword =
        String(
            formData.get(
                "CurrentPassword"
            ) || ""
        );


    const newPassword =
        String(
            formData.get(
                "NewPassword"
            ) || ""
        );


    const confirmPassword =
        String(
            formData.get(
                "ConfirmPassword"
            ) || ""
        );


    if (
        !currentPassword ||
        !newPassword ||
        !confirmPassword
    ) {

        showSettingsMessage(
            "password-settings-message",
            "Please complete all password fields.",
            "error"
        );

        return;

    }


    if (newPassword.length < 8) {

        showSettingsMessage(
            "password-settings-message",
            "The new password must contain at least 8 characters.",
            "error"
        );

        return;

    }


    if (
        newPassword !==
        confirmPassword
    ) {

        showSettingsMessage(
            "password-settings-message",
            "The new passwords do not match.",
            "error"
        );

        return;

    }


    if (
        currentPassword ===
        newPassword
    ) {

        showSettingsMessage(
            "password-settings-message",
            "The new password must be different from the current password.",
            "error"
        );

        return;

    }


    setButtonLoading(
        submitButton,
        true,
        "Changing...",
        "Change Password"
    );


    try {

        const response =
            await fetch(
                "/api/settings/password",
                {
                    method: "PUT",

                    credentials:
                        "same-origin",

                    headers: {

                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            CurrentPassword:
                                currentPassword,

                            NewPassword:
                                newPassword

                        })
                }
            );


        const result =
            await readSettingsResponse(
                response
            );


        form.reset();


        showSettingsMessage(
            "password-settings-message",
            result.message ||
                "Password changed successfully.",
            "success"
        );

    }

    catch (error) {

        console.error(
            "Password change error:",
            error
        );


        showSettingsMessage(
            "password-settings-message",
            error.message,
            "error"
        );

    }

    finally {

        setButtonLoading(
            submitButton,
            false,
            "Changing...",
            "Change Password"
        );

    }

}


// ========================================
// INITIALISE SETTINGS PAGE
// ========================================

function initialiseSettingsPage(event) {

    if (settingsPageInitialised) {

        return;

    }


    settingsPageInitialised = true;


    const user =
        event?.detail ||
        window.kbdCurrentUser;


    loadCurrentUserSettings(
        user
    );


    const profileForm =
        document.getElementById(
            "profile-settings-form"
        );


    const passwordForm =
        document.getElementById(
            "password-settings-form"
        );


    profileForm?.addEventListener(
        "submit",
        updateProfile
    );


    passwordForm?.addEventListener(
        "submit",
        changePassword
    );

}


// ========================================
// START
// ========================================

if (window.kbdCurrentUser) {

    initialiseSettingsPage();

} else {

    window.addEventListener(
        "kbd-auth-ready",
        initialiseSettingsPage,
        {
            once: true
        }
    );

}

function setupAccountClosure() {
    const button = document.getElementById(
        "request-account-closure"
    );

    const message = document.getElementById(
        "account-closure-message"
    );

    if (!button) return;

    button.addEventListener(
        "click",
        async () => {
            const confirmed = window.confirm(
                "Are you sure you want to request account closure? You will be signed out immediately."
            );

            if (!confirmed) return;

            button.disabled = true;
            button.textContent =
                "Submitting request...";

            if (message) {
                message.textContent = "";
                message.className =
                    "form-message";
            }

            try {
                const response = await fetch(
                    "/api/account/deactivation-request",
                    {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            Accept:
                                "application/json"
                        }
                    }
                );

                const result = await response
                    .json()
                    .catch(() => ({}));

                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "The request could not be completed."
                    );
                }

                window.location.replace(
                    "login.html?account=closure-requested"
                );
            } catch (error) {
                if (message) {
                    message.textContent =
                        error.message;

                    message.className =
                        "form-message error";
                }

                button.disabled = false;
                button.textContent =
                    "Request Account Closure";
            }
        }
    );
}

async function loadAccountClosureRequests() {
    const container = document.getElementById(
        "account-closure-requests"
    );

    if (!container) return;

    container.innerHTML =
        "<p>Loading requests...</p>";

    try {
        const response = await fetch(
            "/api/admin/account-closure-requests",
            {
                credentials: "same-origin",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const requests = window.KBDUI
            ? await KBDUI.readResponse(response)
            : await response.json();

        if (!response.ok) {
            throw new Error(
                requests.error ||
                "Unable to load requests."
            );
        }

        displayAccountClosureRequests(
            Array.isArray(requests)
                ? requests
                : []
        );
    } catch (error) {
        console.error(
            "Unable to load account closure requests:",
            error
        );

        container.innerHTML = "";

        const message =
            document.createElement("p");

        message.className =
            "form-message error";

        message.textContent =
            error.message;

        container.appendChild(message);
    }
}

function displayAccountClosureRequests(
    requests
) {
    const container = document.getElementById(
        "account-closure-requests"
    );

    if (!container) return;

    container.innerHTML = "";

    if (!requests.length) {
        const empty =
            document.createElement("div");

        empty.className = "empty-state";

        const heading =
            document.createElement("h3");

        heading.textContent =
            "No pending requests";

        const description =
            document.createElement("p");

        description.textContent =
            "There are currently no account closure requests.";

        empty.append(
            heading,
            description
        );

        container.appendChild(empty);
        return;
    }

    requests.forEach(request => {
        const row =
            document.createElement("div");

        row.className =
            "account-closure-row";

        const details =
            document.createElement("div");

        const name =
            document.createElement("strong");

        name.textContent =
            `${request.FirstName || ""} ${request.LastName || ""}`.trim();

        const email =
            document.createElement("span");

        email.textContent =
            request.Email;

        const role =
            document.createElement("span");

        role.textContent =
            `Role: ${request.Role}`;

        const date =
            document.createElement("span");

        date.textContent =
            `Requested: ${formatClosureDate(
                request.DeletionRequestedAt
            )}`;

        details.append(
            name,
            email,
            role,
            date
        );

        const controls =
            document.createElement("div");

        controls.className =
            "account-closure-controls";

        const restoreButton =
            document.createElement("button");

        restoreButton.type = "button";
        restoreButton.className =
            "secondary-button";
        restoreButton.textContent =
            "Restore Account";
        restoreButton.dataset.userId =
            request.UserID;
        restoreButton.dataset.action =
            "restore";

        const deactivateButton =
            document.createElement("button");

        deactivateButton.type = "button";
        deactivateButton.className =
            "danger-button";
        deactivateButton.textContent =
            "Confirm Deactivation";
        deactivateButton.dataset.userId =
            request.UserID;
        deactivateButton.dataset.action =
            "deactivate";

        controls.append(
            restoreButton,
            deactivateButton
        );

        row.append(
            details,
            controls
        );

        container.appendChild(row);
    });
}

function formatClosureDate(value) {
    if (!value) return "Unknown";

    const date = new Date(
        String(value).includes("T")
            ? value
            : `${value.replace(" ", "T")}Z`
    );

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("en-ZA");
}

async function handleAccountClosureAction(
    event
) {
    const button = event.target.closest(
        "button[data-user-id][data-action]"
    );

    if (!button) return;

    const userID = button.dataset.userId;
    const action = button.dataset.action;

    const prompt =
        action === "restore"
            ? "Restore this account?"
            : "Confirm deactivation of this account?";

    if (!window.confirm(prompt)) return;

    const container = document.getElementById(
        "account-closure-requests"
    );

    const buttons = container.querySelectorAll(
        "button"
    );

    buttons.forEach(item => {
        item.disabled = true;
    });

    try {
        const response = await fetch(
            `/api/admin/account-closure-requests/${userID}/${action}`,
            {
                method: "PUT",
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
                "The request could not be completed."
            );
        }

        await loadAccountClosureRequests();
    } catch (error) {
        alert(error.message);

        buttons.forEach(item => {
            item.disabled = false;
        });
    }
}

function setupAdminAccountClosures() {
    const container = document.getElementById(
        "account-closure-requests"
    );

    if (!container) return;

    container.addEventListener(
        "click",
        handleAccountClosureAction
    );

    loadAccountClosureRequests();
}

function initialiseAccountSettings(user) {
    setupAccountClosure();

    if (user?.Role === "Admin") {
        setupAdminAccountClosures();
    }
}

if (window.kbdCurrentUser) {
    initialiseAccountSettings(
        window.kbdCurrentUser
    );
} else {
    window.addEventListener(
        "kbd-auth-ready",
        event => {
            initialiseAccountSettings(
                event.detail
            );
        },
        {
            once: true
        }
    );
}


// ========================================
// PARTICIPANT VIEW: SETTINGS
// ----------------------------------------
// Runs only for Participants on settings.html. It shows a
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
    // SETTINGS (keeps the existing forms; adds a profile header)
    // ========================================

    function enhanceSettingsPage(user) {
        document.body.classList.add("participant-settings");

        const welcome = document.querySelector(".main-content > .dashboard > .welcome");
        if (!welcome || welcome.querySelector(".pp-profile")) return;

        const initials = `${(user.FirstName || "").charAt(0)}${(user.LastName || "").charAt(0)}`.toUpperCase() || "?";
        const profile = el("div", "pp-profile");
        profile.appendChild(el("div", "pp-profile-avatar", initials));
        const text = el("div", "pp-profile-text");
        text.appendChild(el("strong", "", personName(user.FirstName, user.LastName) || "Your account"));
        if (user.Email) text.appendChild(el("span", "", user.Email));
        text.appendChild(el("span", "pd-tag pp-tag-green", "Participant"));
        profile.appendChild(text);

        // Keep the existing banner text together on the left.
        const textBlock = el("div", "pp-settings-text");
        while (welcome.firstChild) textBlock.appendChild(welcome.firstChild);

        welcome.classList.add("pp-settings-welcome");
        welcome.append(textBlock, profile);
    }


    // ========================================
    // START (Participants on settings.html only)
    // ========================================

    function start(user) {
        if (ppStarted || !user || user.Role !== "Participant") return;
        if (PP_PAGE !== "settings") return;
        ppStarted = true;
        enhanceSettingsPage(user);
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
