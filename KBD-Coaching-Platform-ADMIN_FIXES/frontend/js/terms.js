// ========================================
// KBD TERMS ACCEPTANCE
// ========================================

const KBD_TERMS_VERSION =
    "2026-11-03";

const KBD_TERMS_STORAGE_KEY =
    "kbdTermsAcceptance";


const termsForm =
    document.getElementById(
        "terms-acceptance-form"
    );


const termsCheckbox =
    document.getElementById(
        "accept-terms-checkbox"
    );


const termsButton =
    document.getElementById(
        "accept-terms-button"
    );


const termsMessage =
    document.getElementById(
        "terms-message"
    );


// ========================================
// EXISTING ACCEPTANCE
// ========================================

function hasAcceptedCurrentTerms() {

    try {

        const storedValue =
            localStorage.getItem(
                KBD_TERMS_STORAGE_KEY
            );


        if (!storedValue) {

            return false;

        }


        const acceptance =
            JSON.parse(
                storedValue
            );


        return (
            acceptance.Accepted === true &&
            acceptance.Version ===
                KBD_TERMS_VERSION
        );

    }

    catch (error) {

        console.error(
            "Unable to read Terms acceptance:",
            error
        );


        return false;

    }

}


function arrivedFromApplicationStart() {

    const parameters =
        new URLSearchParams(
            window.location.search
        );


    return (
        parameters.get("continue") ===
        "1"
    );

}


if (
    arrivedFromApplicationStart() &&
    hasAcceptedCurrentTerms()
) {

    window.location.replace(
        "welcome.html"
    );

}


// ========================================
// CHECKBOX
// ========================================

termsCheckbox?.addEventListener(
    "change",
    () => {

        termsButton.disabled =
            !termsCheckbox.checked;


        if (termsMessage) {

            termsMessage.textContent = "";

            termsMessage.className =
                "form-message";

        }

    }
);


// ========================================
// ACCEPT TERMS
// ========================================

termsForm?.addEventListener(
    "submit",
    event => {

        event.preventDefault();


        if (!termsCheckbox?.checked) {

            if (termsMessage) {

                termsMessage.textContent =
                    "Please accept the Terms and Conditions before continuing.";


                termsMessage.className =
                    "form-message error";

            }


            return;

        }


        const acceptance = {

            Accepted:
                true,

            Version:
                KBD_TERMS_VERSION,

            AcceptedAt:
                new Date().toISOString()

        };


        try {

            localStorage.setItem(
                KBD_TERMS_STORAGE_KEY,
                JSON.stringify(
                    acceptance
                )
            );


            window.location.href =
                "welcome.html";

        }

        catch (error) {

            console.error(
                "Unable to save Terms acceptance:",
                error
            );


            if (termsMessage) {

                termsMessage.textContent =
                    "Your acceptance could not be saved. Please enable browser storage and try again.";


                termsMessage.className =
                    "form-message error";

            }

        }

    }
);
