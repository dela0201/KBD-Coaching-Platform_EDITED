// ========================================
// KBD PASSWORD RECOVERY REQUEST
// ========================================

let passwordRequestInProgress =
    false;


// ========================================
// ELEMENT HELPERS
// ========================================

function getPasswordRequestElements() {

    return {

        form:
            document.getElementById(
                "password-request-form"
            ),

        email:
            document.getElementById(
                "recovery-email"
            ),

        button:
            document.getElementById(
                "password-request-button"
            ),

        message:
            document.getElementById(
                "password-request-message"
            )

    };

}


function showPasswordRequestMessage(
    message = "",
    type = ""
) {

    const { message: element } =
        getPasswordRequestElements();


    if (!element) {

        return;

    }


    element.textContent =
        message;


    element.className =
        type
            ? `form-message ${type}`
            : "form-message";

}


function setPasswordRequestLoading(
    isLoading
) {

    const { button } =
        getPasswordRequestElements();


    if (!button) {

        return;

    }


    button.disabled =
        isLoading;


    button.textContent =
        isLoading
            ? "Sending Request..."
            : "Send Request to Coach";


    button.setAttribute(
        "aria-busy",
        String(isLoading)
    );

}


// ========================================
// CHECK EXISTING SESSION
// ========================================

async function checkExistingSession() {

    try {

        const response =
            await fetch(
                "/api/auth/me",
                {
                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );


        if (!response.ok) {

            return;

        }


        const result =
            await response
                .json()
                .catch(() => ({}));


        if (result.user?.UserID) {

            window.location.replace(
                "dashboard.html"
            );

        }

    }

    catch (error) {

        console.error(
            "Unable to check the current session:",
            error
        );

    }

}


// ========================================
// SUBMIT REQUEST
// ========================================

async function submitPasswordRequest(
    event
) {

    event.preventDefault();


    if (passwordRequestInProgress) {

        return;

    }


    const {
        form,
        email
    } = getPasswordRequestElements();


    if (!form || !email) {

        return;

    }


    showPasswordRequestMessage();


    const emailAddress =
        String(
            email.value || ""
        )
            .trim()
            .toLowerCase();


    if (!emailAddress) {

        showPasswordRequestMessage(
            "Please enter your Participant email address.",
            "error"
        );

        return;

    }


    passwordRequestInProgress =
        true;


    setPasswordRequestLoading(
        true
    );


    try {

        const response =
            await fetch(
                "/api/auth/password-request",
                {
                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json"

                    },

                    body:
                        JSON.stringify({
                            Email:
                                emailAddress
                        })
                }
            );


        const result =
            await response
                .json()
                .catch(() => ({}));


        if (!response.ok) {

            throw new Error(
                result.error ||
                "The request could not be submitted."
            );

        }


        form.reset();


        showPasswordRequestMessage(
            result.message ||
                "Your request has been submitted.",
            "success"
        );

    }

    catch (error) {

        console.error(
            "Password request error:",
            error
        );


        showPasswordRequestMessage(
            error.message,
            "error"
        );

    }

    finally {

        passwordRequestInProgress =
            false;


        setPasswordRequestLoading(
            false
        );

    }

}


// ========================================
// START
// ========================================

function initialisePasswordRequestPage() {

    sessionStorage.setItem(
        "kbdSelectedRole",
        "Participant"
    );


    const { form } =
        getPasswordRequestElements();


    form?.addEventListener(
        "submit",
        submitPasswordRequest
    );


    checkExistingSession();

}


if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initialisePasswordRequestPage,
        {
            once: true
        }
    );

} else {

    initialisePasswordRequestPage();

}
