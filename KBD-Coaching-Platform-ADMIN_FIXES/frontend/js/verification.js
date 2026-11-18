// ========================================
// KBD ACCOUNT-TYPE SELECTION
// ========================================

let verificationInitialised =
    false;


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
            "Unable to check existing session:",
            error
        );

    }

}


// ========================================
// ROLE SELECTION
// ========================================

function selectRole(role) {

    if (
        ![
            "Coach",
            "Participant"
        ].includes(role)
    ) {

        return;

    }


    sessionStorage.setItem(
        "kbdSelectedRole",
        role
    );


    if (role === "Coach") {

        window.location.href =
            "login.html?role=Coach";

        return;

    }


    showParticipantOptions();

}


function showParticipantOptions() {

    const roleGrid =
        document.querySelector(
            ".role-selection-grid"
        );


    const participantOptions =
        document.getElementById(
            "participant-options"
        );


    roleGrid?.classList.add(
        "hidden"
    );


    participantOptions?.classList.remove(
        "hidden"
    );


    participantOptions
        ?.querySelector("a")
        ?.focus();

}


function showRoleSelection() {

    const roleGrid =
        document.querySelector(
            ".role-selection-grid"
        );


    const participantOptions =
        document.getElementById(
            "participant-options"
        );


    sessionStorage.removeItem(
        "kbdSelectedRole"
    );


    participantOptions?.classList.add(
        "hidden"
    );


    roleGrid?.classList.remove(
        "hidden"
    );


    roleGrid
        ?.querySelector("button")
        ?.focus();

}


// ========================================
// INITIALISE
// ========================================

function initialiseVerificationPage() {

    if (verificationInitialised) {

        return;

    }


    verificationInitialised =
        true;


    const roleButtons =
        document.querySelectorAll(
            "[data-role]"
        );


    roleButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                selectRole(
                    button.dataset.role
                );

            }
        );

    });


    document
        .getElementById(
            "change-role-button"
        )
        ?.addEventListener(
            "click",
            showRoleSelection
        );


    const savedRole =
        sessionStorage.getItem(
            "kbdSelectedRole"
        );


    if (
        savedRole ===
        "Participant"
    ) {

        showParticipantOptions();

    }

checkExistingSession();

}


if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initialiseVerificationPage,
        {
            once: true
        }
    );

} else {

    initialiseVerificationPage();

}
