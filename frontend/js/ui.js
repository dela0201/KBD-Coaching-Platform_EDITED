// ========================================
// KBD SHARED USER-INTERFACE HELPERS
// ========================================

const KBDUI = {
    escapeHTML(value) {
        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    },

    getContainer(containerID) {
        if (!containerID) return null;
        return document.getElementById(containerID);
    },

    clear(containerID) {
        const container = this.getContainer(containerID);
        if (container) container.replaceChildren();
    },

    showLoading(containerID, message = "Loading...") {
        const container = this.getContainer(containerID);
        if (!container) return;

        const state = document.createElement("div");
        const spinner = document.createElement("div");
        const description = document.createElement("p");

        state.className = "loading-state";
        state.setAttribute("role", "status");
        state.setAttribute("aria-live", "polite");
        state.setAttribute("aria-busy", "true");

        spinner.className = "loading-spinner";
        spinner.setAttribute("aria-hidden", "true");
        description.textContent = message;

        state.append(spinner, description);
        container.replaceChildren(state);
    },

    showEmpty(containerID, title, message) {
        const container = this.getContainer(containerID);
        if (!container) return;

        const state = document.createElement("div");
        const heading = document.createElement("h3");
        const description = document.createElement("p");

        state.className = "empty-state";
        state.setAttribute("role", "status");
        heading.textContent = title || "No information available";
        description.textContent = message || "There is nothing to display.";

        state.append(heading, description);
        container.replaceChildren(state);
    },

    showError(containerID, message, retryFunction) {
        const container = this.getContainer(containerID);
        if (!container) return;

        const state = document.createElement("div");
        const heading = document.createElement("h3");
        const description = document.createElement("p");
        const retryButton = document.createElement("button");

        state.className = "empty-state error-state";
        state.setAttribute("role", "alert");

        heading.textContent = "Unable to load information";
        description.textContent = message || "Something went wrong.";

        retryButton.type = "button";
        retryButton.className = "retry-button";
        retryButton.textContent = "Try Again";

        if (typeof retryFunction === "function") {
            retryButton.addEventListener("click", async () => {
                if (retryButton.disabled) return;

                retryButton.disabled = true;
                retryButton.textContent = "Trying again...";

                try {
                    await retryFunction();
                } catch (error) {
                    console.error("Retry failed:", error);
                    retryButton.disabled = false;
                    retryButton.textContent = "Try Again";
                }
            });
        } else {
            retryButton.hidden = true;
        }

        state.append(heading, description, retryButton);
        container.replaceChildren(state);
    },

    getLoginURL() {
        return new URL("/pages/login.html", window.location.origin).href;
    },

    async readResponse(response) {
        if (!(response instanceof Response)) {
            throw new TypeError("A valid server response is required.");
        }

        if (response.status === 401) {
            window.kbdCurrentUser = null;
            window.location.replace(this.getLoginURL());

            const error = new Error("Your session has expired.");
            error.status = 401;
            throw error;
        }

        if (response.status === 403) {
    const result = await response
        .clone()
        .json()
        .catch(() => ({}));

    if (
        result.code ===
        "TERMS_ACCEPTANCE_REQUIRED"
    ) {
        window.location.replace(
            "terms.html"
        );

        throw new Error(
            "Please accept the current Terms and Conditions."
        );
    }
}

if (response.status === 403) {
    const result = await response
        .clone()
        .json()
        .catch(() => ({}));

    if (result.code === "ACCOUNT_INACTIVE") {
        window.location.replace(
            "login.html?account=inactive"
        );

        throw new Error(
            "This account is not currently active."
        );
    }

    if (
        result.code ===
        "TERMS_ACCEPTANCE_REQUIRED"
    ) {
        window.location.replace(
            "terms.html"
        );

        throw new Error(
            "Please accept the current Terms and Conditions."
        );
    }
}

        if (response.status === 204) {
            if (!response.ok) {
                const error = new Error("The request could not be completed.");
                error.status = response.status;
                throw error;
            }

            return null;
        }

        const responseText = await response.text();
        let result = {};

        if (responseText) {
            try {
                result = JSON.parse(responseText);
            } catch {
                const error = new Error(
                    "The server returned an invalid response."
                );
                error.status = response.status;
                throw error;
            }
        }

        if (!response.ok) {
            const error = new Error(
                result.error || "The request could not be completed."
            );
            error.status = response.status;
            error.details = result;
            throw error;
        }

        return result;
    }
};

window.KBDUI = KBDUI;
