// ========================================
// INVITATION HISTORY
// ========================================

function formatInvitationDate(value) {

    if (!value) {

        return "Not available";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return value;

    }


    return date.toLocaleString(
        "en-ZA",
        {
            dateStyle:
                "medium",

            timeStyle:
                "short"
        }
    );

}


function displayCoachInvitations(
    invitations
) {

    const {
        invitationsContainer
    } = getCoachInvitationElements();


    if (!invitationsContainer) {

        return;

    }


    invitationsContainer.innerHTML =
        "";


    if (invitations.length === 0) {

        if (
            window.KBDUI &&
            typeof KBDUI.showEmpty ===
                "function"
        ) {

            KBDUI.showEmpty(
                "coach-invitations-container",
                "No Coach invitations",
                "No Coach invitations have been created yet."
            );

        } else {

            invitationsContainer.textContent =
                "No Coach invitations have been created yet.";

        }


        return;

    }


    invitations.forEach(
        invitation => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "action-row";


            const information =
                document.createElement(
                    "div"
                );


            const email =
                document.createElement(
                    "strong"
                );


            email.textContent =
                invitation.Email;


            const details =
                document.createElement(
                    "span"
                );


            details.textContent =
                invitation.OrganisationName
                    ? invitation.OrganisationName
                    : "No organisation";


            information.append(
                email,
                details
            );


            const status =
                document.createElement(
                    "span"
                );


            status.className =
                "status";


            status.textContent =
                invitation.InvitationStatus;


            const expiry =
                document.createElement(
                    "span"
                );


            expiry.textContent =
                `Expires ${
                    formatInvitationDate(
                        invitation.ExpiresAt
                    )
                }`;


            row.append(
    information,
    status,
    expiry
);


if (
    invitation.InvitationStatus ===
        "Pending"
) {

    const revokeButton =
        document.createElement(
            "button"
        );


    revokeButton.type =
        "button";


    revokeButton.className =
        "secondary-button";


    revokeButton.textContent =
        "Revoke";


    revokeButton.addEventListener(
        "click",
        () => {

            revokeCoachInvitation(
                invitation.InvitationID,
                invitation.Email
            );

        }
    );


    row.appendChild(
        revokeButton
    );

}


            invitationsContainer.appendChild(
                row
            );

        }
    );

}


async function loadCoachInvitations() {

    const {
        invitationsContainer,
        refreshButton
    } = getCoachInvitationElements();


    if (!invitationsContainer) {

        return;

    }


    if (
        window.KBDUI &&
        typeof KBDUI.showLoading ===
            "function"
    ) {

        KBDUI.showLoading(
            "coach-invitations-container",
            "Loading Coach invitations..."
        );

    } else {

        invitationsContainer.textContent =
            "Loading Coach invitations...";

    }


    if (refreshButton) {

        refreshButton.disabled =
            true;

    }


    try {

        const response =
            await fetch(
                "/api/coach-invitations",
                {
                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


        const invitations =
            await readCoachInvitationResponse(
                response
            );


        if (!Array.isArray(invitations)) {

            throw new Error(
                "The server returned invalid invitation data."
            );

        }


        displayCoachInvitations(
            invitations
        );

    }

    catch (error) {

        console.error(
            "Unable to load Coach invitations:",
            error
        );


        if (
            window.KBDUI &&
            typeof KBDUI.showError ===
                "function"
        ) {

            KBDUI.showError(
                "coach-invitations-container",
                error.message,
                loadCoachInvitations
            );

        } else {

            invitationsContainer.textContent =
                error.message;

        }

    }

    finally {

        if (refreshButton) {

            refreshButton.disabled =
                false;

        }

    }

}

async function revokeCoachInvitation(
    invitationID,
    email
) {

    const confirmed =
        window.confirm(
            `Revoke the Coach invitation for ${email}?`
        );


    if (!confirmed) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/coach-invitations/${
                    encodeURIComponent(
                        invitationID
                    )
                }`,
                {
                    method:
                        "DELETE",

                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


        const result =
            await readCoachInvitationResponse(
                response
            );


        showCoachInvitationMessage(
            result.message ||
            "Coach invitation revoked successfully.",
            "success"
        );


        await loadCoachInvitations();

    }

    catch (error) {

        console.error(
            "Unable to revoke Coach invitation:",
            error
        );


        showCoachInvitationMessage(
            error.message,
            "error"
        );

    }

}

// ========================================
// KBD COACH INVITATION MANAGEMENT
// ========================================

let coachInvitationPageInitialised =
    false;

let coachInvitationRequestInProgress =
    false;


function getCoachInvitationElements() {

    return {

        form:
            document.getElementById(
                "coach-invitation-form"
            ),

        email:
            document.getElementById(
                "invitation-email"
            ),

        organisation:
            document.getElementById(
                "invitation-organisation"
            ),

        message:
            document.getElementById(
                "coach-invitation-message"
            ),

        submitButton:
            document.getElementById(
                "create-coach-invitation"
            ),

        result:
            document.getElementById(
                "coach-invitation-result"
            ),

        activationLink:
            document.getElementById(
                "coach-activation-link"
            ),

        copyButton:
            document.getElementById(
                "copy-coach-activation-link"
            ),

            invitationsContainer:
    document.getElementById(
        "coach-invitations-container"
    ),

refreshButton:
    document.getElementById(
        "refresh-coach-invitations"
    )

    };

}


async function readCoachInvitationResponse(
    response
) {

    if (
        window.KBDUI &&
        typeof KBDUI.readResponse ===
            "function"
    ) {

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


function showCoachInvitationMessage(
    message = "",
    type = ""
) {

    const {
        message: messageElement
    } = getCoachInvitationElements();


    if (!messageElement) {

        return;

    }


    messageElement.textContent =
        message;


    messageElement.className =
        type
            ? `form-message ${type}`
            : "form-message";

}


function setCoachInvitationLoading(
    isLoading
) {

    const {
        submitButton
    } = getCoachInvitationElements();


    if (!submitButton) {

        return;

    }


    submitButton.disabled =
        isLoading;


    submitButton.textContent =
        isLoading
            ? "Creating..."
            : "Create Invitation";


    submitButton.setAttribute(
        "aria-busy",
        String(isLoading)
    );

}


// ========================================
// LOAD ORGANISATIONS
// ========================================

async function loadCoachInvitationOrganisations() {
    const { organisation } = getCoachInvitationElements();
    if (!organisation) return;

    const state = document.getElementById("invitation-organisation-state");

    try {
        const response = await fetch("/api/organisations", {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });
        const organisations = await readCoachInvitationResponse(response);
        if (!Array.isArray(organisations)) {
            throw new Error("The server returned invalid organisation data.");
        }

        state.textContent = organisations.length
            ? ""
            : "No organisations are available. You can send an invitation without one.";

        organisations.forEach(item => {
            organisation.add(new Option(item.OrganisationName, item.OrganisationID));
        });
    } catch (error) {
        console.error("Unable to load organisations:", error);
        state.textContent = "Organisations could not be loaded. You can send an invitation without one.";
    }
}


// ========================================
// CREATE INVITATION
// ========================================

async function handleCoachInvitationSubmit(
    event
) {

    event.preventDefault();


    if (coachInvitationRequestInProgress) {

        return;

    }


    const {
        form,
        result,
        activationLink
    } = getCoachInvitationElements();


    if (!form) {

        return;

    }


    showCoachInvitationMessage();


    if (result) {

        result.hidden =
            true;

    }


    const formData =
        new FormData(form);


    const email =
        String(
            formData.get("Email") || ""
        )
            .trim()
            .toLowerCase();


    const organisationValue =
        String(
            formData.get(
                "OrganisationID"
            ) || ""
        ).trim();


    const invitationData = {

        Email:
            email,

        OrganisationID:
            organisationValue
                ? Number(
                    organisationValue
                )
                : null

    };


    coachInvitationRequestInProgress =
        true;


    setCoachInvitationLoading(
        true
    );


    try {

        const response =
            await fetch(
                "/api/coach-invitations",
                {
                    method:
                        "POST",

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
                            invitationData
                        )

                }
            );


        const responseData =
            await readCoachInvitationResponse(
                response
            );


        const generatedLink =
            responseData.invitation
                ?.ActivationURL;


        if (!generatedLink) {

            throw new Error(
                "The server did not return an activation link."
            );

        }


        if (activationLink) {

            activationLink.value =
                generatedLink;

        }


        if (result) {

            result.hidden =
                false;


            result.scrollIntoView({
                behavior:
                    "smooth",

                block:
                    "start"
            });

        }


        showCoachInvitationMessage(
            "Coach invitation created successfully.",
            "success"
        );


        form.reset();
        await loadCoachInvitations();

    }

    catch (error) {

        console.error(
            "Coach invitation creation error:",
            error
        );


        showCoachInvitationMessage(
            error.message,
            "error"
        );

    }

    finally {

        coachInvitationRequestInProgress =
            false;


        setCoachInvitationLoading(
            false
        );

    }

}


// ========================================
// COPY ACTIVATION LINK
// ========================================

async function copyCoachActivationLink() {

    const {
        activationLink,
        copyButton
    } = getCoachInvitationElements();


    if (!activationLink?.value) {

        return;

    }


    try {

        await navigator.clipboard.writeText(
            activationLink.value
        );


        if (copyButton) {

            copyButton.textContent =
                "Copied";


            window.setTimeout(
                () => {

                    copyButton.textContent =
                        "Copy Link";

                },
                1500
            );

        }

    }

    catch (error) {

        console.error(
            "Unable to copy activation link:",
            error
        );


        activationLink.focus();
        activationLink.select();


        showCoachInvitationMessage(
            "Copy the selected activation link manually.",
            "error"
        );

    }

}


// ========================================
// START
// ========================================

function initialiseCoachInvitationsPage(
    user
) {

    if (coachInvitationPageInitialised) {

        return;

    }


    if (!user) {

        return;

    }


    if (user.Role !== "Admin") {

        window.location.replace(
            "dashboard.html"
        );

        return;

    }


    const {
    form,
    copyButton,
    refreshButton
} = getCoachInvitationElements();


    if (!form) {

        console.error(
            'Coach invitation form not found. Expected id="coach-invitation-form".'
        );

        return;

    }


    coachInvitationPageInitialised =
        true;


    form.addEventListener(
        "submit",
        handleCoachInvitationSubmit
    );


    copyButton?.addEventListener(
        "click",
        copyCoachActivationLink
    );

refreshButton?.addEventListener(
    "click",
    loadCoachInvitations
);    

    loadCoachInvitationOrganisations();
    loadCoachInvitations();
}


if (window.kbdCurrentUser) {

    initialiseCoachInvitationsPage(
        window.kbdCurrentUser
    );

} else {

    window.addEventListener(
        "kbd-auth-ready",
        event => {

            initialiseCoachInvitationsPage(
                event.detail
            );

        },
        {
            once:
                true
        }
    );

}

const coachRequestsContainer =
    document.getElementById("coach-requests-container");

const coachRequestResult =
    document.getElementById("coach-request-result");

const refreshCoachRequestsButton =
    document.getElementById("refresh-coach-requests");

    const coachActivationResult =
    document.getElementById("coach-activation-result");

const coachActivationURL =
    document.getElementById("coach-activation-url");

const copyCoachActivationButton =
    document.getElementById("copy-coach-activation-url");

// ========================================
// COACH ACCESS REQUESTS (ADMIN REVIEW)
// ========================================

let coachRequestsInitialised = false;

function showCoachRequestResult(message = "", type = "") {
    if (!coachRequestResult) return;

    coachRequestResult.textContent = message;
    coachRequestResult.className = type
        ? `form-message ${type}`
        : "form-message";
}

function showCoachActivationLink(url) {
    if (!coachActivationResult || !coachActivationURL) return;

    coachActivationURL.value = url || "";
    coachActivationResult.hidden = !url;
}

function createCoachRequestCard(request) {
    const card = document.createElement("article");
    card.className = "coach-request-card";

    const details = document.createElement("div");
    details.className = "coach-request-details";

    const name = document.createElement("h4");
    name.textContent =
        `${request.FirstName || ""} ${request.LastName || ""}`.trim();

    const email = document.createElement("a");
    email.href = `mailto:${request.Email}`;
    email.textContent = request.Email;

    const reason = document.createElement("p");
    reason.textContent = request.Reason || "No reason provided.";

    const submitted = document.createElement("small");
    submitted.textContent =
        `Requested ${formatInvitationDate(request.CreatedAt)}` +
        (request.UserID ? " · Existing participant account" : "");

    details.append(name, email, reason, submitted);

    const actions = document.createElement("div");
    actions.className = "coach-request-actions";

    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.className = "primary-button";
    approveButton.textContent = "Approve";

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.className = "danger-button";
    rejectButton.textContent = "Reject";

    approveButton.addEventListener("click", () =>
        reviewCoachRequest(request, "approve", [approveButton, rejectButton])
    );

    rejectButton.addEventListener("click", () =>
        reviewCoachRequest(request, "reject", [approveButton, rejectButton])
    );

    actions.append(approveButton, rejectButton);
    card.append(details, actions);

    return card;
}

async function loadCoachRequests() {
    if (!coachRequestsContainer) return;

    coachRequestsContainer.innerHTML = "<p>Loading Coach requests...</p>";

    try {
        const response = await fetch(
            "/api/admin/coach-access-requests?status=Pending",
            {
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            }
        );

        const requests = await readCoachInvitationResponse(response);

        coachRequestsContainer.innerHTML = "";

        if (!Array.isArray(requests) || requests.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "There are no pending Coach requests.";
            coachRequestsContainer.appendChild(empty);
            return;
        }

        requests.forEach(request => {
            coachRequestsContainer.appendChild(
                createCoachRequestCard(request)
            );
        });
    } catch (error) {
        console.error("Unable to load Coach requests:", error);

        coachRequestsContainer.innerHTML = "";
        showCoachRequestResult(
            error.message || "Coach requests could not be loaded.",
            "error"
        );
    }
}

async function reviewCoachRequest(request, decision, buttons) {
    const fullName =
        `${request.FirstName || ""} ${request.LastName || ""}`.trim();

    const confirmed = window.confirm(
        decision === "approve"
            ? `Approve Coach access for ${fullName}? An activation link will be created.`
            : `Reject the Coach request from ${fullName}?`
    );

    if (!confirmed) return;

    buttons.forEach(button => { button.disabled = true; });
    showCoachRequestResult();
    showCoachActivationLink("");

    try {
        const response = await fetch(
            `/api/admin/coach-access-requests/${encodeURIComponent(
                request.CoachRequestID
            )}/${decision}`,
            {
                method: "PUT",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: "{}"
            }
        );

        const result = await readCoachInvitationResponse(response);

        showCoachRequestResult(
            result.message ||
            (decision === "approve"
                ? "Coach request approved."
                : "Coach request rejected."),
            "success"
        );

        if (decision === "approve") {
            showCoachActivationLink(result.invitation?.ActivationURL);
        }

        await loadCoachRequests();

        if (typeof loadCoachInvitations === "function") {
            loadCoachInvitations();
        }
    } catch (error) {
        console.error("Unable to review Coach request:", error);

        showCoachRequestResult(
            error.message || "The Coach request could not be updated.",
            "error"
        );

        buttons.forEach(button => { button.disabled = false; });
    }
}

async function copyCoachRequestActivationLink() {
    if (!coachActivationURL?.value) return;

    try {
        await navigator.clipboard.writeText(coachActivationURL.value);

        if (copyCoachActivationButton) {
            copyCoachActivationButton.textContent = "Copied";

            window.setTimeout(() => {
                copyCoachActivationButton.textContent = "Copy Link";
            }, 1500);
        }
    } catch (error) {
        coachActivationURL.focus();
        coachActivationURL.select();

        showCoachRequestResult(
            "Copy the selected activation link manually.",
            "error"
        );
    }
}

function initialiseCoachRequests(user) {
    if (coachRequestsInitialised || !user || user.Role !== "Admin") {
        return;
    }

    coachRequestsInitialised = true;

    refreshCoachRequestsButton?.addEventListener("click", () => {
        showCoachRequestResult();
        loadCoachRequests();
    });

    copyCoachActivationButton?.addEventListener(
        "click",
        copyCoachRequestActivationLink
    );

    loadCoachRequests();
}

if (window.kbdCurrentUser) {
    initialiseCoachRequests(window.kbdCurrentUser);
} else {
    window.addEventListener(
        "kbd-auth-ready",
        event => initialiseCoachRequests(event.detail),
        { once: true }
    );
}
