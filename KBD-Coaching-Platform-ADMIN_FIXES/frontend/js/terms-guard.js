(() => {
    const TERMS_VERSION = "2026-11-03";
    const STORAGE_KEY = "kbdTermsAcceptance";

    function getAcceptance() {
        try {
            return JSON.parse(
                localStorage.getItem(STORAGE_KEY)
            );
        } catch {
            return null;
        }
    }

    function hasAcceptedCurrentTerms() {
    const acceptance = getAcceptance();

    if (!acceptance) return false;

    const accepted =
        acceptance.Accepted ??
        acceptance.accepted;

    const version =
        acceptance.Version ??
        acceptance.version;

    return (
        accepted === true &&
        version === TERMS_VERSION
    );
}

    async function saveAcceptanceForCurrentUser() {
        if (!hasAcceptedCurrentTerms()) {
            throw new Error(
                "Please accept the current Terms and Conditions."
            );
        }

        const response = await fetch(
            "/api/terms/acceptance",
            {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    TermsVersion: TERMS_VERSION
                })
            }
        );

        const result = await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Terms acceptance could not be recorded."
            );
        }

        return result;
    }

    window.KBDTerms = {
        version: TERMS_VERSION,
        getAcceptance,
        hasAcceptedCurrentTerms,
        saveAcceptanceForCurrentUser
    };

    if (
        !hasAcceptedCurrentTerms() &&
        !window.location.pathname.endsWith(
            "/terms.html"
        )
    ) {
        window.location.replace(
            "terms.html"
        );
    }
})();
