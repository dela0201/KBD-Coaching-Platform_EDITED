// ========================================
// KBD COACH PASSWORD REQUESTS
// ========================================

let passwordRequestsInitialised =
    false;

let visibleTemporaryPassword =
    "";


// ========================================
// RESPONSE HANDLING
// ========================================

async function readPasswordResponse(
    response
) {

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
// DATE FORMATTING
// ========================================

function formatPasswordRequestDate(
    dateString
) {

    if (!dateString) {

        return "Unknown date";

    }


    const date =
        new Date(dateString);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Unknown date";

    }


    return date.toLocaleString(
        "en-ZA",
        {
            day:
                "2-digit",

            month:
                "short",

            year:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit"
        }
    );

}


// ========================================
// LOAD REQUESTS
// ========================================

async function loadPasswordRequests() {

    const container =
        document.getElementById(
            "password-requests-container"
        );


    if (!container) {

        return;

    }


    if (window.KBDUI?.showLoading) {

        KBDUI.showLoading(
            "password-requests-container",
            "Loading password requests..."
        );

    } else {

        container.textContent =
            "Loading password requests...";

    }


    try {

        const response =
            await fetch(
                "/api/password-recovery/requests",
                {
                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


        const requests =
            await readPasswordResponse(
                response
            );


        if (!Array.isArray(requests)) {

            throw new Error(
                "The server returned invalid password-request information."
            );

        }


        displayPasswordRequests(
            requests
        );

    }

    catch (error) {

        console.error(
            "Unable to load password requests:",
            error
        );


        if (window.KBDUI?.showError) {

            KBDUI.showError(
                "password-requests-container",
                error.message,
                loadPasswordRequests
            );

        } else {

            container.textContent =
                error.message;

        }

    }

}


// ========================================
// DISPLAY REQUESTS
// ========================================

function displayPasswordRequests(
    requests
) {

    const container =
        document.getElementById(
            "password-requests-container"
        );


    if (!container) {

        return;

    }


    container.innerHTML =
        "";


    if (requests.length === 0) {

        if (window.KBDUI?.showEmpty) {

            KBDUI.showEmpty(
                "password-requests-container",
                "No pending requests",
                "There are currently no Participant password requests requiring attention."
            );

        } else {

            container.textContent =
                "No pending password requests.";

        }


        return;

    }


    requests.forEach(request => {

        const requestID =
            Number(
                request.RequestID
            );


        if (
            !Number.isInteger(requestID) ||
            requestID < 1
        ) {

            return;

        }


        const card =
            document.createElement(
                "article"
            );


        card.className =
            "password-request-card";


        const information =
            document.createElement(
                "div"
            );


        information.className =
            "password-request-information";


        const name =
            document.createElement(
                "h3"
            );


        name.textContent =
            `${request.FirstName || ""}
             ${request.LastName || ""}`
                .trim() ||
            "Participant";


        const email =
            document.createElement(
                "p"
            );


        email.textContent =
            request.Email ||
            "Email unavailable";


        const requestedAt =
            document.createElement(
                "span"
            );


        requestedAt.textContent =
            `Requested: ${
                formatPasswordRequestDate(
                    request.RequestedAt
                )
            }`;


        information.append(
            name,
            email,
            requestedAt
        );


        const action =
            document.createElement(
                "div"
            );


        action.className =
            "password-request-action";


        const status =
            document.createElement(
                "span"
            );


        status.className =
            "action-status";


        status.textContent =
            "Pending";


        const generateButton =
            document.createElement(
                "button"
            );


        generateButton.type =
            "button";


        generateButton.className =
            "primary-button generate-password-button";


        generateButton.textContent =
            "Generate Password";


        generateButton.addEventListener(
            "click",
            () => {

                generateTemporaryPassword(
                    requestID,
                    generateButton
                );

            }
        );


        action.append(
            status,
            generateButton
        );


        card.append(
            information,
            action
        );


        container.appendChild(
            card
        );

    });

}


// ========================================
// GENERATE PASSWORD
// ========================================

async function generateTemporaryPassword(
    requestID,
    button
) {

    const confirmed =
        window.confirm(
            "Generate a new temporary password for this Participant? Any previous temporary password will be revoked."
        );


    if (!confirmed) {

        return;

    }


    button.disabled =
        true;


    button.textContent =
        "Generating...";


    button.setAttribute(
        "aria-busy",
        "true"
    );


    try {

        const response =
            await fetch(
                `/api/password-recovery/requests/${requestID}/generate`,
                {
                    method:
                        "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


        const result =
            await readPasswordResponse(
                response
            );


        const generatedRequest =
            result.request;


        if (
            !generatedRequest ||
            !generatedRequest.TemporaryPassword
        ) {

            throw new Error(
                "The server did not return a temporary password."
            );

        }


        showGeneratedPassword(
            generatedRequest
        );


        await loadPasswordRequests();

    }

    catch (error) {

        console.error(
            "Unable to generate temporary password:",
            error
        );


        alert(
            error.message
        );


        button.disabled =
            false;


        button.textContent =
            "Generate Password";


        button.setAttribute(
            "aria-busy",
            "false"
        );

    }

}


// ========================================
// SHOW GENERATED PASSWORD
// ========================================

function showGeneratedPassword(
    request
) {

    const panel =
        document.getElementById(
            "generated-password-panel"
        );


    const name =
        document.getElementById(
            "generated-participant-name"
        );


    const email =
        document.getElementById(
            "generated-participant-email"
        );


    const expiry =
        document.getElementById(
            "generated-password-expiry"
        );


    const passwordInput =
        document.getElementById(
            "generated-password-value"
        );


    if (
        !panel ||
        !passwordInput
    ) {

        return;

    }


    visibleTemporaryPassword =
        String(
            request.TemporaryPassword
        );


    if (name) {

        name.textContent =
            request.ParticipantName ||
            "Participant";

    }


    if (email) {

        email.textContent =
            request.Email ||
            "Email unavailable";

    }


    if (expiry) {

        expiry.textContent =
            formatPasswordRequestDate(
                request.ExpiresAt
            );

    }


    passwordInput.value =
        visibleTemporaryPassword;


    panel.classList.remove(
        "hidden"
    );


    panel.scrollIntoView({
        behavior:
            "smooth",

        block:
            "start"
    });


    passwordInput.focus();

    passwordInput.select();

}


// ========================================
// COPY PASSWORD
// ========================================

async function copyGeneratedPassword() {

    const passwordInput =
        document.getElementById(
            "generated-password-value"
        );


    const message =
        document.getElementById(
            "copy-password-message"
        );


    if (
        !passwordInput ||
        !visibleTemporaryPassword
    ) {

        return;

    }


    try {

        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {

            await navigator.clipboard.writeText(
                visibleTemporaryPassword
            );

        } else {

            passwordInput.focus();

            passwordInput.select();


            const copied =
                document.execCommand(
                    "copy"
                );


            if (!copied) {

                throw new Error(
                    "Copy command failed."
                );

            }

        }


        if (message) {

            message.textContent =
                "Temporary password copied.";

            message.className =
                "form-message success";

        }

    }

    catch (error) {

        console.error(
            "Unable to copy password:",
            error
        );


        if (message) {

            message.textContent =
                "Unable to copy automatically. Select and copy the password manually.";

            message.className =
                "form-message error";

        }

    }

}


// ========================================
// CLEAR PASSWORD
// ========================================

function clearGeneratedPassword() {

    const panel =
        document.getElementById(
            "generated-password-panel"
        );


    const passwordInput =
        document.getElementById(
            "generated-password-value"
        );


    const message =
        document.getElementById(
            "copy-password-message"
        );


    visibleTemporaryPassword =
        "";


    if (passwordInput) {

        passwordInput.value =
            "";

    }


    if (message) {

        message.textContent =
            "";

        message.className =
            "form-message";

    }


    panel?.classList.add(
        "hidden"
    );

}


// ========================================
// INITIALISE
// ========================================

function initialisePasswordRequestsPage() {

    if (passwordRequestsInitialised) {

        return;

    }


    passwordRequestsInitialised =
        true;


    document
        .getElementById(
            "refresh-password-requests"
        )
        ?.addEventListener(
            "click",
            loadPasswordRequests
        );


    document
        .getElementById(
            "copy-generated-password"
        )
        ?.addEventListener(
            "click",
            copyGeneratedPassword
        );


    document
        .getElementById(
            "close-generated-password"
        )
        ?.addEventListener(
            "click",
            clearGeneratedPassword
        );


    window.addEventListener(
        "beforeunload",
        () => {

            visibleTemporaryPassword =
                "";

        }
    );


    loadPasswordRequests();

}


if (window.kbdCurrentUser) {

    initialisePasswordRequestsPage();

} else {

    window.addEventListener(
        "kbd-auth-ready",
        initialisePasswordRequestsPage,
        {
            once: true
        }
    );

}
