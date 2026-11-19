// ========================================

// KBD FRONTEND AUTHENTICATION

// ========================================

const KBD_CURRENT_TERMS_VERSION =
    "2026-11-03";

function hasAcceptedKBDTerms() {
    try {
        const storedValue =
            localStorage.getItem(
                "kbdTermsAcceptance"
            );

        if (!storedValue) {
            return false;
        }

        const acceptance =
            JSON.parse(storedValue);

        return (
            acceptance.Accepted === true &&
            acceptance.Version ===
                KBD_CURRENT_TERMS_VERSION
        );
    } catch (error) {
        console.error(
            "Unable to verify Terms acceptance:",
            error
        );

        return false;
    }
}

function enforceTermsAcceptance() {
    if (hasAcceptedKBDTerms()) {
        return true;
    }

    window.location.replace(
        "/pages/terms.html?continue=1"
    );

    return false;
}

const PAGE_ACCESS_RULES = {
    "goals.html": ["Participant"],



    "dashboard.html": [

        "Admin",

        "Coach",

        "Participant",

        "Corporate"

    ],



    "programmes.html": [

        "Admin",

        "Coach",

        "Participant",

        "Corporate"

    ],



    "sessions.html": [

        "Admin",

        "Coach",

        "Participant",

        "Corporate"

    ],



    "participants.html": [

        "Admin",

        "Coach",

        "Corporate"

    ],



    "actions.html": [

        "Admin",

        "Coach",

        "Participant",

        "Corporate"

    ],



    "assessments.html": [

        "Admin",

        "Coach",

        "Participant"

    ],



    "materials.html": [

        "Admin",

        "Coach",

        "Participant"

    ],



    "reports.html": [

        "Admin",

        "Coach",

        "Corporate"

    ],

"coach-invitations.html": [
    "Admin"
],

    "password-requests.html": [

    "Admin",

    "Coach"

],



"temporary-password-change.html": [

    "Participant"

],



    "settings.html": [

        "Admin",

        "Coach",

        "Participant",

        "Corporate"

    ]



};



const VALID_USER_ROLES = [

    "Admin",

    "Coach",

    "Participant",

    "Corporate"

];



let authenticationStarted = false;

let logoutHandlerConfigured = false;



function getLoginURL() {

    return new URL("/pages/login.html", window.location.origin).href;

}



function redirectToLogin() {

    if (!window.location.pathname.endsWith("/login.html")) {

        window.location.replace(getLoginURL());

    }

}



async function readAuthenticationResponse(response) {

    const result = await response.json().catch(() => ({}));



    if (!response.ok) {

        const error = new Error(

            result.error || "Unable to verify authentication."

        );



        error.status = response.status;

        throw error;

    }



    return result;

}



async function checkAuthentication() {

    try {

        const response = await fetch("/api/auth/me", {

            method: "GET",

            credentials: "same-origin",

            headers: {

                Accept: "application/json"

            }

        });



        const result = await readAuthenticationResponse(response);

        const user = result.user;

window.kbdCurrentUser = user;

        if (

            !user ||

            !Number.isInteger(Number(user.UserID)) ||

            Number(user.UserID) <= 0 ||

            !user.FirstName ||

            !VALID_USER_ROLES.includes(user.Role)

        ) {

            throw new Error("The server returned invalid user information.");

        }



        

        if (

    !enforceTemporaryPasswordChange(

        user

    )

) {



    return null;



}

        if (user.Role === "Coach" && !window.location.pathname.startsWith("/coach/")) {
            const page = window.location.pathname.split("/").pop();
            const routes = {"dashboard.html":"/coach/index.html", "participants.html":"/coach/pages/participants.html",
                "participant-profile.html":"/coach/pages/participant-profile.html", "sessions.html":"/coach/pages/appointments.html",
                "programmes.html":"/coach/pages/programmes.html", "actions.html":"/coach/pages/actions.html", "reports.html":"/coach/pages/reports.html"};
            if (routes[page] && new URLSearchParams(window.location.search).get("view") !== "classic") {
                window.location.replace(routes[page] + window.location.search);
                return null;
            }
        }
        document.body.dataset.userRole = user.Role;



        applyRoleVisibility(user.Role);

        if (user.Role === "Admin") {
            renderAdminNavigation();
        }
        if (user.Role === "Coach") renderCoachNavigation();
        if (user.Role === "Participant") renderParticipantNavigation();
        applyNavigationVisibility(user.Role);

        if (

    !enforcePageAccess(

        user.Role

    )

) {



    return null;



}

        updateCurrentUser(user);

        setupLogout();



        window.dispatchEvent(

            new CustomEvent("kbd-auth-ready", {

                detail: user

            })

        );



        return user;

    } catch (error) {

        console.error("Authentication check failed:", error);



        window.kbdCurrentUser = null;



        if (error.status === 401 || error.status === 403) {

            redirectToLogin();

            return null;

        }



        showAuthenticationError(error.message);

        return null;

    }

}



// ========================================

// ROLE VISIBILITY

// ========================================



function applyRoleVisibility(role) {

    const protectedElements =

        document.querySelectorAll("[data-roles]");



    protectedElements.forEach(element => {

        const allowedRoles = String(element.dataset.roles || "")

            .split(",")

            .map(item => item.trim())

            .filter(Boolean);



        element.hidden = !allowedRoles.includes(role);

    });

}



function renderParticipantNavigation() {
    const nav=document.querySelector('.navigation');
    if (!nav) return;
    const links=[['dashboard.html','My Coaching'],['programmes.html','My Programmes'],['sessions.html','My Sessions'],
        ['actions.html','My Actions'],['goals.html','My Goals'],['assessments.html','My Assessments'],['materials.html','Learning Materials'],['messages.html','Messages']];
    nav.id='participant-navigation';
    nav.replaceChildren(...links.map(([page,label])=>{
        const link=document.createElement('a');link.href='/pages/'+page;link.className='nav-item';link.textContent=label;
        if(location.pathname.endsWith('/'+page)){link.classList.add('active');link.setAttribute('aria-current','page');}
        return link;
    }));
    const toggle=document.createElement('button');toggle.type='button';toggle.id='participant-menu-toggle';toggle.textContent='Menu';
    toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','participant-navigation participant-footer');
    const footer=document.querySelector('.sidebar-bottom');if(footer)footer.id='participant-footer';
    toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.closest('.sidebar').classList.toggle('participant-menu-open',!open);});
    if(!document.getElementById('participant-menu-toggle'))nav.before(toggle);
}

function renderCoachNavigation() {
    const nav = document.querySelector(".navigation");
    if (!nav) return;
    const links = [["/coach/index.html","Dashboard"],["/coach/pages/participants.html","Participants"],
        ["/coach/pages/appointments.html","Appointments"],["/coach/pages/programmes.html","Programmes"],
        ["/coach/pages/actions.html","Actions"],["/coach/pages/metrics.html","Metrics"],
        ["/coach/pages/reports.html","Reports"],["/coach/pages/messages.html","Messages"],
        ["/pages/assessments.html","Assessments"],["/pages/materials.html","Learning Materials"],
        ["/pages/password-requests.html","Password Requests"]];
    nav.replaceChildren(...links.map(([href,label]) => {
        const link = document.createElement("a"); link.href = href; link.textContent = label; link.className = "nav-item";
        if (href === window.location.pathname || href.replace("/coach", "") === window.location.pathname || (href.endsWith("appointments.html") && window.location.pathname.endsWith("sessions.html"))) {link.classList.add("active");link.setAttribute("aria-current","page");}
        return link;
    }));
    const settings = document.querySelector('.sidebar-bottom a[href="settings.html"]');
    if (settings) settings.href = "/coach/pages/settings.html";
    if (!document.getElementById("coach-shared-menu")) {
        const toggle = document.createElement("button"); toggle.id="coach-shared-menu"; toggle.type="button";
        toggle.textContent="Menu"; toggle.setAttribute("aria-expanded","false");
        toggle.addEventListener("click",()=>{const open=toggle.getAttribute("aria-expanded")==="true";toggle.setAttribute("aria-expanded",String(!open));nav.closest(".sidebar").classList.toggle("coach-menu-open",!open);});
        nav.before(toggle);
    }
}

function renderAdminNavigation() {
    const navigation = document.querySelector(".sidebar .navigation");
    const footer = document.querySelector(".sidebar .sidebar-bottom");
    if (!navigation || !footer) return;

    const links = [
        ["dashboard.html", "Dashboard"],
        ["programmes.html", "Programmes"],
        ["sessions.html", "Sessions"],
        ["participants.html", "Participants"],
        ["actions.html", "Actions"],
        ["assessments.html", "Assessments"],
        ["materials.html", "Learning Materials"],
        ["reports.html", "Reports"],
        ["coach-invitations.html", "Coach Invitations"],
        ["password-requests.html", "Password Requests"],
        ["settings.html", "Settings"]
    ];
    const currentPage = window.location.pathname.split("/").pop();
    const activePage = currentPage === "participant-profile.html" ? "participants.html" : currentPage;

    const items = links.map(([page, label]) => {
        const link = document.createElement("a");
        link.href = page;
        link.className = "nav-item";
        link.textContent = label;
        if (page === activePage) {
            link.classList.add("active");
            link.setAttribute("aria-current", page === currentPage ? "page" : "location");
        }
        return link;
    });

    navigation.replaceChildren(...items.slice(0, -1));
    footer.querySelector('a[href="settings.html"]')?.remove();
    footer.prepend(items.at(-1));

    if (!navigation.id) {
        navigation.id = "admin-navigation";
        footer.id = "admin-sidebar-footer";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "admin-menu-toggle";
        toggle.textContent = "Menu";
        toggle.setAttribute("aria-controls", "admin-navigation admin-sidebar-footer");
        toggle.setAttribute("aria-expanded", "false");
        toggle.addEventListener("click", () => {
            const expanded = toggle.getAttribute("aria-expanded") === "true";
            toggle.setAttribute("aria-expanded", String(!expanded));
        });
        navigation.before(toggle);
    }
}


function applyNavigationVisibility(role) {



    Object.entries(

        PAGE_ACCESS_RULES

    ).forEach(

        ([page, allowedRoles]) => {



            const links =

                document.querySelectorAll(

                    `.navigation a[href$="${page}"]`

                );





            links.forEach(link => {



                link.hidden =

                    !allowedRoles.includes(

                        role

                    );



            });



        }

    );



}



function enforceTemporaryPasswordChange(

    user

) {



    const currentPage =

        window.location.pathname

            .split("/")

            .pop()

            .toLowerCase();





    const passwordChangePage =

        "temporary-password-change.html";



    if (

        user.UsingTemporaryPassword &&

        user.Role !== "Participant"

    ) {

        throw new Error(

            "Temporary-password recovery is only available to Participant accounts."

        );

    }





    if (

        user.UsingTemporaryPassword &&

        currentPage !==

            passwordChangePage

    ) {



        window.location.replace(

            passwordChangePage

        );



        return false;



    }





    if (

        !user.UsingTemporaryPassword &&

        currentPage ===

            passwordChangePage

    ) {



        window.location.replace(

            "dashboard.html"

        );



        return false;



    }





    return true;



}



// ========================================

// PAGE ACCESS

// ========================================



function enforcePageAccess(role) {



    const currentPage =

        window.location.pathname

            .split("/")

            .pop()

            .toLowerCase();





    const allowedRoles =

        PAGE_ACCESS_RULES[

            currentPage

        ];





    // Pages not included in the rules,

    // such as access-denied.html,

    // are not redirected.

    if (!allowedRoles) {



        return true;



    }





    if (

        allowedRoles.includes(role)

    ) {



        return true;



    }





    window.location.replace(

        "/pages/access-denied.html"

    );





    return false;



}



// ========================================

// DISPLAY CURRENT USER

// ========================================



function updateCurrentUser(user) {

    const userArea = document.querySelector(".user-area");



    if (!userArea || !user) return;



    const avatar = userArea.querySelector(".user-avatar");

    const name = userArea.querySelector("strong");

    const role = userArea.querySelector("span");



    if (avatar) {

        const firstInitial = user.FirstName?.charAt(0) || "";

        const lastInitial = user.LastName?.charAt(0) || "";



        avatar.textContent =

            `${firstInitial}${lastInitial}`.toUpperCase() || "K";

    }



    if (name) {

        name.textContent = user.FirstName;

    }



    if (role) {

        role.textContent = user.Role;

    }
    const participantProfile=document.querySelector('.pp-profile');
    if (participantProfile) {
        participantProfile.querySelector('.pp-profile-text strong').textContent=`${user.FirstName} ${user.LastName}`;
        participantProfile.querySelector('.pp-profile-text span').textContent=user.Email;
        participantProfile.querySelector('.pp-profile-avatar').textContent=(user.FirstName[0]+user.LastName[0]).toUpperCase();
    }


}



// ========================================

// LOGOUT

// ========================================



function setupLogout() {

    if (logoutHandlerConfigured) return;



    const logoutLink =

        document.querySelector('[data-action="logout"]') ||

        Array.from(

            document.querySelectorAll(".sidebar-bottom a")

        ).find(link =>

            link.textContent.trim().toLowerCase() === "logout"

        );



    if (!logoutLink) return;



    logoutHandlerConfigured = true;



    logoutLink.addEventListener("click", async event => {

        event.preventDefault();



        if (logoutLink.dataset.busy === "true") return;



        const originalText = logoutLink.textContent;

        logoutLink.dataset.busy = "true";

        logoutLink.textContent = "Signing out...";



        try {

            const response = await fetch("/api/auth/logout", {

                method: "POST",

                credentials: "same-origin",

                headers: {

                    Accept: "application/json"

                }

            });



            if (!response.ok) {

                const result = await response.json().catch(() => ({}));



                throw new Error(

                    result.error || "Unable to sign out."

                );

            }



            window.kbdCurrentUser = null;

            sessionStorage.removeItem("kbdSelectedRole");

            redirectToLogin();

        } catch (error) {

            console.error("Logout error:", error);



            logoutLink.dataset.busy = "false";

            logoutLink.textContent = originalText;



            window.alert(

                error.message ||

                "Unable to sign out. Please try again."

            );

        }

    });

}



// ========================================

// AUTHENTICATION ERROR

// ========================================



function showAuthenticationError(message) {

    const mainContent = document.querySelector(".main-content");



    if (!mainContent) {

        window.alert(

            message ||

            "Unable to connect to the KBD platform."

        );

        return;

    }



    const existingMessage =

        document.getElementById("authentication-error");



    if (existingMessage) return;



    const errorPanel = document.createElement("div");

    errorPanel.id = "authentication-error";

    errorPanel.className = "auth-error";



    const heading = document.createElement("strong");

    heading.textContent = "Unable to verify your session";



    const description = document.createElement("p");

    description.textContent =

        message ||

        "Please check that the KBD backend is running and try again.";



    const retryButton = document.createElement("button");

    retryButton.type = "button";

    retryButton.textContent = "Try Again";

    retryButton.addEventListener("click", () => {

        errorPanel.remove();

        checkAuthentication();

    });



    errorPanel.append(heading, description, retryButton);

    mainContent.prepend(errorPanel);

}



// ========================================

// DYNAMIC ROLE-PROTECTED ELEMENTS

// ========================================



function startRoleVisibilityObserver() {

    if (!document.body) return;



    const observer = new MutationObserver(mutations => {

        if (!window.kbdCurrentUser) return;



        const containsRoleProtectedElements = mutations.some(

            mutation =>

                Array.from(mutation.addedNodes).some(node =>

                    node.nodeType === Node.ELEMENT_NODE &&

                    (

                        node.matches?.("[data-roles]") ||

                        node.querySelector?.("[data-roles]")

                    )

                )

        );



        if (containsRoleProtectedElements) {

            applyRoleVisibility(window.kbdCurrentUser.Role);

        }

    });



    observer.observe(document.body, {

        childList: true,

        subtree: true

    });

}



// ========================================

// START

// ========================================



function initialiseAuthentication() {

    if (authenticationStarted) return;



    authenticationStarted = true;

    startRoleVisibilityObserver();



    if (enforceTermsAcceptance()) {
    checkAuthentication();
}

}



if (document.readyState === "loading") {

    document.addEventListener(

        "DOMContentLoaded",

        initialiseAuthentication,

        { once: true }

    );

} else {

    initialiseAuthentication();

}
