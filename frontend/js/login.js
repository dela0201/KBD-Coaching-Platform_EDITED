// ========================================

// KBD LOGIN PAGE

// ========================================



let loginPageInitialised = false;

let loginRequestInProgress = false;

let selectedLoginRole = null;





// ========================================

// ELEMENTS

// ========================================



function getLoginElements() {



    return {



        loginForm:

            document.getElementById(

                "login-form"

            ),



        loginButton:

            document.getElementById(

                "login-button"

            ),



        loginMessage:

            document.getElementById(

                "login-message"

            )



    };



}





// ========================================

// DISPLAY MESSAGE

// ========================================



function showLoginMessage(

    message = "",

    type = ""

) {



    const { loginMessage } =

        getLoginElements();





    if (!loginMessage) {



        return;



    }





    loginMessage.textContent =

        message;





    loginMessage.className =

        type

            ? `form-message ${type}`

            : "form-message";





    if (message) {



        loginMessage.setAttribute(

            "role",

            type === "error"

                ? "alert"

                : "status"

        );





        loginMessage.setAttribute(

            "aria-live",

            "polite"

        );



    } else {



        loginMessage.removeAttribute(

            "role"

        );





        loginMessage.removeAttribute(

            "aria-live"

        );



    }



}





// ========================================

// BUTTON LOADING STATE

// ========================================



function setLoginButtonLoading(

    isLoading

) {



    const { loginButton } =

        getLoginElements();





    if (!loginButton) {



        return;



    }





    loginButton.disabled =

        isLoading;





    loginButton.textContent =

        isLoading

            ? "Signing in..."

            : "Sign In";





    loginButton.setAttribute(

        "aria-busy",

        String(isLoading)

    );



}





// ========================================

// READ API RESPONSE

// ========================================



async function readJSONResponse(

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

                "The request could not be completed. Please try again."

            );





        error.status =

            response.status;





        throw error;



    }





    return result;



}





// ========================================

// CONFIGURE SELECTED ROLE

// ========================================



function configureSelectedRole() {



    const queryParameters =

        new URLSearchParams(

            window.location.search

        );





    const queryRole =

        queryParameters.get(

            "role"

        );





    const storedRole =

        sessionStorage.getItem(

            "kbdSelectedRole"

        );





    const roleValue =

        queryRole ||

        storedRole;





    const requestedRole =

        roleValue

            ? roleValue

                .trim()

                .toLowerCase()

            : "";





    if (

        ![

            "coach",

            "participant"

        ].includes(requestedRole)

    ) {



        window.location.replace(

            "verification.html"

        );





        return null;



    }





    selectedLoginRole =

        requestedRole ===

            "participant"

            ? "Participant"

            : "Coach";





    sessionStorage.setItem(

        "kbdSelectedRole",

        selectedLoginRole

    );





    const roleLabel =

        document.getElementById(

            "login-role-label"

        );





    const title =

        document.getElementById(

            "login-title"

        );





    const introduction =

        document.getElementById(

            "login-introduction"

        );





    const participantOptions =

        document.getElementById(

            "participant-login-options"

        );

        const coachOptions =
    document.getElementById(
        "coach-login-options"
    );




    if (roleLabel) {



        roleLabel.textContent =

            selectedLoginRole ===

                "Participant"

                ? "Participant access"

                : "Coach and staff access";



    }





    if (title) {



        title.textContent =

            selectedLoginRole ===

                "Participant"

                ? "Participant sign in"

                : "Coach sign in";



    }





    if (introduction) {



        introduction.textContent =

            selectedLoginRole ===

                "Participant"

                ? "Sign in to continue your coaching journey."

                : "Sign in to manage your coaching workspace.";



    }





    if (participantOptions) {



        participantOptions.hidden =

            selectedLoginRole !==

            "Participant";



    }


if (coachOptions) {

    coachOptions.hidden =
        selectedLoginRole !==
        "Coach";

}


    return selectedLoginRole;



}



function loginRoleMatchesSelection(authenticatedRole) {

    if (selectedLoginRole === "Participant") {

        return authenticatedRole === "Participant";

    }



    return [

        "Admin",

        "Coach",

        "Corporate"

    ].includes(authenticatedRole);

}





// ========================================

// CHECK EXISTING LOGIN

// ========================================



async function checkExistingLogin() {



    try {



        const response =

            await fetch(

                "/api/auth/me",

                {

                    method: "GET",



                    credentials:

                        "same-origin",



                    headers: {

                        Accept:

                            "application/json"

                    }

                }

            );





        if (

            response.status === 401 ||

            response.status === 403

        ) {



            return;



        }





        if (!response.ok) {



            throw new Error(

                "Unable to check the current login session."

            );



        }





        const result =

            await response

                .json()

                .catch(() => ({}));





        if (!result.user?.UserID) {



            return;



        }



        if (!loginRoleMatchesSelection(result.user.Role)) {

            await clearIncorrectLogin();

            return;

        }





        if (

            result.user

                .UsingTemporaryPassword

        ) {



            window.location.replace(

                "temporary-password-change.html"

            );





            return;



        }





        window.location.replace(

            "dashboard.html"

        );



    }



    catch (error) {



        console.error(

            "Unable to check existing login:",

            error

        );





        showLoginMessage(

            "Unable to check your existing session. You may still try to sign in.",

            "error"

        );



    }



}





// ========================================

// LOG OUT AFTER ROLE MISMATCH

// ========================================



async function clearIncorrectLogin() {



    try {



        await fetch(

            "/api/auth/logout",

            {

                method: "POST",



                credentials:

                    "same-origin"

            }

        );



    }



    catch (error) {



        console.error(

            "Unable to clear incorrect login:",

            error

        );



    }



}





// ========================================

// LOGIN

// ========================================



async function handleLogin(event) {



    event.preventDefault();





    if (loginRequestInProgress) {



        return;



    }





    const { loginForm } =

        getLoginElements();





    if (!loginForm) {



        return;



    }





    showLoginMessage();





    const formData =

        new FormData(

            loginForm

        );





    const email =

        String(

            formData.get("Email") ||

            ""

        )

            .trim()

            .toLowerCase();





    const password =

        String(

            formData.get("Password") ||

            ""

        );





    if (!email || !password) {



        showLoginMessage(

            "Please enter your email address and password.",

            "error"

        );





        return;



    }





    loginRequestInProgress =

        true;





    setLoginButtonLoading(

        true

    );





    try {



        const response =

            await fetch(

                "/api/auth/login",

                {

                    method: "POST",



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

                            Email:

                                email,



                            Password:

                                password

                        })

                }

            );





        const result =

            await readJSONResponse(

                response

            );





        if (!result.user?.UserID) {



            throw new Error(

                "The server returned invalid login information."

            );



        }





        const authenticatedRole =

            result.user.Role;





        const roleMatchesSelection =

            loginRoleMatchesSelection(

                authenticatedRole

            );





        if (!roleMatchesSelection) {



            await clearIncorrectLogin();





            throw new Error(

                selectedLoginRole ===

                    "Participant"

                    ? "This account is not registered as a Participant. Please choose Coach access."

                    : "This is a Participant account. Please choose Participant access."

            );



        }





        showLoginMessage(

            "Login successful. Redirecting...",

            "success"

        );

if (
    !window.KBDTerms ||
    typeof window.KBDTerms
        .saveAcceptanceForCurrentUser !== "function"
) {
    throw new Error(
        "The Terms and Conditions service is unavailable."
    );
}

try {
    await window.KBDTerms
        .saveAcceptanceForCurrentUser();
} catch (termsError) {
    await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
    }).catch(() => {});

    throw termsError;
}
        sessionStorage.removeItem(

            "kbdSelectedRole"

        );

        if (

            result.requiresPasswordChange ||

            result.user

                .UsingTemporaryPassword

        ) {



            window.location.replace(

                "temporary-password-change.html"

            );



        } else {



            window.location.replace(

                "dashboard.html"

            );



        }



    }



    catch (error) {



        console.error(

            "Login error:",

            error

        );





        const message =

            error.status === 401

                ? "The email address or password is incorrect."

                : error.message;





        showLoginMessage(

            message,

            "error"

        );



    }



    finally {



        loginRequestInProgress =

            false;





        setLoginButtonLoading(

            false

        );



    }



}





// ========================================

// INITIALISE LOGIN PAGE

// ========================================



function initialiseLoginPage() {



    if (loginPageInitialised) {



        return;



    }





    const role =

        configureSelectedRole();





    if (!role) {



        return;



    }





    const {

        loginForm,

        loginButton

    } = getLoginElements();





    if (!loginForm) {



        console.error(

            'Login form not found. Expected id="login-form".'

        );





        return;



    }





    if (!loginButton) {



        console.error(

            'Login button not found. Expected id="login-button".'

        );





        return;



    }





    loginPageInitialised =

        true;





    loginForm.addEventListener(

        "submit",

        handleLogin

    );





    checkExistingLogin();



}





// ========================================

// START

// ========================================



if (

    document.readyState ===

    "loading"

) {



    document.addEventListener(

        "DOMContentLoaded",

        initialiseLoginPage,

        {

            once: true

        }

    );



} else {



    initialiseLoginPage();



}
