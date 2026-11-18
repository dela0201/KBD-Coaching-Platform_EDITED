// ========================================
// KBD PARTICIPANT REGISTRATION
// ========================================

let registrationInProgress =
    false;


// ========================================
// ELEMENT HELPERS
// ========================================

function getRegistrationElements() {

    return {

        form:
            document.getElementById(
                "registration-form"
            ),

        button:
            document.getElementById(
                "registration-button"
            ),

        message:
            document.getElementById(
                "registration-message"
            )

    };

}


function showRegistrationMessage(
    message = "",
    type = ""
) {

    const { message: element } =
        getRegistrationElements();


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


function setRegistrationLoading(
    isLoading
) {

    const { button } =
        getRegistrationElements();


    if (!button) {

        return;

    }


    button.disabled =
        isLoading;


    button.textContent =
        isLoading
            ? "Creating Account..."
            : "Create Account";


    button.setAttribute(
        "aria-busy",
        String(isLoading)
    );

}


// ========================================
// CHECK EXISTING SESSION
// ========================================


// ========================================
// REGISTER PARTICIPANT
// ========================================

async function registerParticipant(event) {

    event.preventDefault();


    if (registrationInProgress) {

        return;

    }


    const { form } =
        getRegistrationElements();


    if (!form) {

        return;

    }


    showRegistrationMessage();


    const formData =
        new FormData(form);


    const firstName =
        String(
            formData.get(
                "FirstName"
            ) || ""
        ).trim();


    const lastName =
        String(
            formData.get(
                "LastName"
            ) || ""
        ).trim();


    const email =
        String(
            formData.get(
                "Email"
            ) || ""
        )
            .trim()
            .toLowerCase();


    const password =
        String(
            formData.get(
                "Password"
            ) || ""
        );


    const confirmPassword =
        String(
            formData.get(
                "ConfirmPassword"
            ) || ""
        );


    if (
        !firstName ||
        !lastName ||
        !email ||
        !password ||
        !confirmPassword
    ) {

        showRegistrationMessage(
            "Please complete all registration fields.",
            "error"
        );

        return;

    }


    if (password.length < 8) {

        showRegistrationMessage(
            "Password must contain at least 8 characters.",
            "error"
        );

        return;

    }


    if (
        password !==
        confirmPassword
    ) {

        showRegistrationMessage(
            "The passwords do not match.",
            "error"
        );

        return;

    }


    registrationInProgress =
        true;


    setRegistrationLoading(
        true
    );


    try {

        const response =
            await fetch(
                "/api/auth/register",
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

                            FirstName:
                                firstName,

                            LastName:
                                lastName,

                            Email:
                                email,

                            Password:
                                password

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
                "Registration could not be completed."
            );

        }


        if (!result.user?.UserID) {

            throw new Error(
                "The server returned invalid registration information."
            );

        }

if (
    !window.KBDTerms ||
    typeof window.KBDTerms
        .saveAcceptanceForCurrentUser !==
        "function"
) {
    throw new Error(
        "The Terms and Conditions service is unavailable."
    );
}

try {
    await window.KBDTerms
        .saveAcceptanceForCurrentUser();
} catch (termsError) {
    await fetch(
        "/api/auth/logout",
        {
            method: "POST",
            credentials: "same-origin"
        }
    ).catch(() => {});

    throw new Error(
        "Your account was created, but Terms acceptance could not be recorded. Please sign in again."
    );
}

        sessionStorage.removeItem(
            "kbdSelectedRole"
        );


        showRegistrationMessage(
            "Account created successfully. Redirecting...",
            "success"
        );


        window.setTimeout(
    () => {

        window.location.replace(
            "dashboard.html"
        );

    },
    700
);

    }

    catch (error) {

        console.error(
            "Registration error:",
            error
        );


        showRegistrationMessage(
            error.message,
            "error"
        );

    }

    finally {

        registrationInProgress =
            false;


        setRegistrationLoading(
            false
        );

    }

}


// ========================================
// START
// ========================================

function initialiseRegistrationPage() {

    const selectedRole =
        sessionStorage.getItem(
            "kbdSelectedRole"
        );


    if (
        selectedRole ===
        "Coach"
    ) {

        window.location.replace(
            "login.html?role=Coach"
        );

        return;

    }


    const { form } =
        getRegistrationElements();


    form?.addEventListener(
        "submit",
        registerParticipant
    );


}


if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initialiseRegistrationPage,
        {
            once: true
        }
    );

} else {

    initialiseRegistrationPage();

}

