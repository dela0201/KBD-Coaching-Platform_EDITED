// ========================================
// KBD PERMANENT PASSWORD CREATION
// ========================================

let passwordChangeInitialised =
    false;

let passwordChangeInProgress =
    false;


// ========================================
// ELEMENT HELPERS
// ========================================

function getPasswordChangeElements() {

    return {

        form:
            document.getElementById(
                "temporary-password-change-form"
            ),

        button:
            document.getElementById(
                "save-permanent-password"
            ),

        message:
            document.getElementById(
                "temporary-password-change-message"
            )

    };

}


function showPasswordChangeMessage(
    message = "",
    type = ""
) {

    const { message: element } =
        getPasswordChangeElements();


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


function setPasswordChangeLoading(
    isLoading
) {

    const { button } =
        getPasswordChangeElements();


    if (!button) {

        return;

    }


    button.disabled =
        isLoading;


    button.textContent =
        isLoading
            ? "Saving Password..."
            : "Save Permanent Password";


    button.setAttribute(
        "aria-busy",
        String(isLoading)
    );

}


// ========================================
// SAVE PERMANENT PASSWORD
// ========================================

async function savePermanentPassword(
    event
) {

    event.preventDefault();


    if (passwordChangeInProgress) {

        return;

    }


    const { form } =
        getPasswordChangeElements();


    if (!form) {

        return;

    }


    showPasswordChangeMessage();


    const formData =
        new FormData(form);


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
        !newPassword ||
        !confirmPassword
    ) {

        showPasswordChangeMessage(
            "Please complete both password fields.",
            "error"
        );

        return;

    }


    if (newPassword.length < 8) {

        showPasswordChangeMessage(
            "The new password must contain at least 8 characters.",
            "error"
        );

        return;

    }


    if (
        newPassword !==
        confirmPassword
    ) {

        showPasswordChangeMessage(
            "The passwords do not match.",
            "error"
        );

        return;

    }


    passwordChangeInProgress =
        true;


    setPasswordChangeLoading(
        true
    );


    try {

        const response =
            await fetch(
                "/api/auth/temporary-password/change",
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
                        JSON.stringify({
                            NewPassword:
                                newPassword
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
                "The permanent password could not be saved."
            );

        }


        if (!result.user?.UserID) {

            throw new Error(
                "The server returned invalid account information."
            );

        }


        window.kbdCurrentUser =
            result.user;


        form.reset();


        showPasswordChangeMessage(
            result.message ||
                "Permanent password saved successfully.",
            "success"
        );


        window.setTimeout(
            () => {

                window.location.replace(
                    "dashboard.html"
                );

            },
            800
        );

    }

    catch (error) {

        console.error(
            "Permanent password update error:",
            error
        );


        showPasswordChangeMessage(
            error.message,
            "error"
        );

    }

    finally {

        passwordChangeInProgress =
            false;


        setPasswordChangeLoading(
            false
        );

    }

}


// ========================================
// CANCEL RECOVERY
// ========================================

async function cancelRecovery() {

    try {

        await fetch(
            "/api/auth/logout",
            {
                method:
                    "POST",

                credentials:
                    "same-origin"
            }
        );

    }

    catch (error) {

        console.error(
            "Recovery logout error:",
            error
        );

    }


    window.location.replace(
        "verification.html"
    );

}


// ========================================
// INITIALISE
// ========================================

function initialisePasswordChangePage() {

    if (passwordChangeInitialised) {

        return;

    }


    passwordChangeInitialised =
        true;


    const { form } =
        getPasswordChangeElements();


    form?.addEventListener(
        "submit",
        savePermanentPassword
    );


    document
        .getElementById(
            "cancel-recovery-button"
        )
        ?.addEventListener(
            "click",
            cancelRecovery
        );

}


if (window.kbdCurrentUser) {

    initialisePasswordChangePage();

} else {

    window.addEventListener(
        "kbd-auth-ready",
        initialisePasswordChangePage,
        {
            once: true
        }
    );

}
