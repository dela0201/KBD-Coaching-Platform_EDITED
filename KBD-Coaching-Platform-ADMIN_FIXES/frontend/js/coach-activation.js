// ========================================
// KBD COACH ACCOUNT ACTIVATION
// ========================================

let coachInvitationToken =
    null;

let activationRequestInProgress =
    false;


function getActivationElements() {

    return {

        loading:
            document.getElementById(
                "invitation-loading"
            ),

        errorPanel:
            document.getElementById(
                "invitation-error"
            ),

        errorMessage:
            document.getElementById(
                "invitation-error-message"
            ),

        form:
            document.getElementById(
                "coach-activation-form"
            ),

        email:
            document.getElementById(
                "coach-email"
            ),

        message:
            document.getElementById(
                "coach-activation-message"
            ),

        button:
            document.getElementById(
                "coach-activation-button"
            )

    };

}


async function readActivationResponse(
    response
) {

    const result =
        await response
            .json()
            .catch(() => ({}));


    if (!response.ok) {

        const error =
            new Error(
                result.error ||
                "The request could not be completed."
            );


        error.status =
            response.status;


        throw error;

    }


    return result;

}


function showInvitationError(message) {

    const {
        loading,
        errorPanel,
        errorMessage,
        form
    } = getActivationElements();


    if (loading) {

        loading.hidden =
            true;

    }


    if (form) {

        form.hidden =
            true;

    }


    if (errorPanel) {

        errorPanel.hidden =
            false;

    }


    if (errorMessage) {

        errorMessage.textContent =
            message;

    }

}


function showActivationMessage(
    message = "",
    type = ""
) {

    const {
        message: messageElement
    } = getActivationElements();


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


function setActivationLoading(
    isLoading
) {

    const {
        button
    } = getActivationElements();


    if (!button) {

        return;

    }


    button.disabled =
        isLoading;


    button.textContent =
        isLoading
            ? "Activating..."
            : "Activate Coach Account";


    button.setAttribute(
        "aria-busy",
        String(isLoading)
    );

}


// ========================================
// VALIDATE INVITATION
// ========================================

async function validateCoachInvitation() {

    const queryParameters =
        new URLSearchParams(
            window.location.search
        );


    coachInvitationToken =
        queryParameters
            .get("token")
            ?.trim() ||
        null;


    if (!coachInvitationToken) {

        showInvitationError(
            "The invitation link is incomplete. Ask your KBD administrator for a new invitation."
        );

        return;

    }


    try {

        const response =
            await fetch(
                `/api/coach-invitations/validate?token=${
                    encodeURIComponent(
                        coachInvitationToken
                    )
                }`,
                {
                    method:
                        "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


        const result =
            await readActivationResponse(
                response
            );


        if (
            !result.valid ||
            !result.invitation?.Email
        ) {

            throw new Error(
                "The server returned invalid invitation information."
            );

        }


        const {
            loading,
            errorPanel,
            form,
            email
        } = getActivationElements();


        if (loading) {

            loading.hidden =
                true;

        }


        if (errorPanel) {

            errorPanel.hidden =
                true;

        }


        if (email) {

            email.value =
                result.invitation.Email;

        }


        if (form) {

            form.hidden =
                false;

        }


        document
            .getElementById(
                "coach-first-name"
            )
            ?.focus();

    }

    catch (error) {

        console.error(
            "Coach invitation validation error:",
            error
        );


        showInvitationError(
            error.message
        );

    }

}


// ========================================
// ACTIVATE ACCOUNT
// ========================================

async function handleCoachActivation(
    event
) {

    event.preventDefault();


    if (activationRequestInProgress) {

        return;

    }


    const {
        form
    } = getActivationElements();


    if (
        !form ||
        !coachInvitationToken
    ) {

        return;

    }


    showActivationMessage();


    const formData =
        new FormData(form);


    const activationData = {

        Token:
            coachInvitationToken,

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

        Password:
            String(
                formData.get(
                    "Password"
                ) || ""
            ),

        ConfirmPassword:
            String(
                formData.get(
                    "ConfirmPassword"
                ) || ""
            )

    };


    if (
        activationData.Password !==
        activationData.ConfirmPassword
    ) {

        showActivationMessage(
            "The passwords do not match.",
            "error"
        );

        return;

    }


    activationRequestInProgress =
        true;


    setActivationLoading(
        true
    );


    try {

        const response =
            await fetch(
                "/api/auth/coach-activate",
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
                            activationData
                        )

                }
            );


        const result =
            await readActivationResponse(
                response
            );


        if (
            !result.user ||
            result.user.Role !==
                "Coach"
        ) {

            throw new Error(
                "The server returned invalid Coach account information."
            );

        }


        sessionStorage.removeItem(
            "kbdSelectedRole"
        );


        showActivationMessage(
            "Coach account activated successfully. Redirecting...",
            "success"
        );


        window.setTimeout(
            () => {

                window.location.replace(
                    "dashboard.html"
                );

            },
            500
        );

    }

    catch (error) {

        console.error(
            "Coach activation error:",
            error
        );


        showActivationMessage(
            error.message,
            "error"
        );

    }

    finally {

        activationRequestInProgress =
            false;


        setActivationLoading(
            false
        );

    }

}


// ========================================
// START
// ========================================

function initialiseCoachActivation() {

    const {
        form
    } = getActivationElements();


    if (!form) {

        console.error(
            'Coach activation form not found. Expected id="coach-activation-form".'
        );

        return;

    }


    form.addEventListener(
        "submit",
        handleCoachActivation
    );


    validateCoachInvitation();

}


if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initialiseCoachActivation,
        {
            once:
                true
        }
    );

} else {

    initialiseCoachActivation();

}
