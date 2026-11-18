// ========================================
// KBD DASHBOARD
// ========================================

let dashboardInitialised = false;


function dashboardEscapeHTML(value) {

    if (
        window.KBDUI &&
        typeof window.KBDUI.escapeHTML === "function"
    ) {
        return window.KBDUI.escapeHTML(value);
    }

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


async function readDashboardResponse(response) {

    if (
        window.KBDUI &&
        typeof window.KBDUI.readResponse === "function"
    ) {
        return window.KBDUI.readResponse(response);
    }

    if (response.status === 401) {
        window.location.replace("login.html");
        throw new Error("Your session has expired.");
    }

    const result =
        await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            result.error ||
            "Unable to load dashboard data."
        );
    }

    return result;

}


function dashboardFetch(url) {

    return fetch(
        url,
        {
            method: "GET",
            credentials: "same-origin",
            headers: {
                Accept: "application/json"
            }
        }
    );

}


async function loadDashboard() {
    const resources = [
        {
            path: "/api/users",
            label: "participants",
            count: "#dashboard-participants-count",
            total: users => users.filter(user => user.Role === "Participant").length
        },
        {
            path: "/api/programmes",
            label: "active programmes",
            count: "#dashboard-programmes-count",
            total: programmes => programmes.filter(programme => programme.Status === "Active").length
        },
        {
            path: "/api/sessions",
            label: "upcoming sessions",
            count: "#dashboard-sessions-count",
            total: sessions => getUpcomingSessions(sessions).length,
            panel: ".session-list",
            render: displaySessions
        },
        {
            path: "/api/actions",
            label: "outstanding actions",
            count: "#dashboard-actions-count",
            total: actions => actions.filter(isOutstandingAction).length,
            panel: "#dashboard-actions-panel",
            render: displayActions
        },
        {
            path: "/api/progress",
            label: "programme progress",
            panel: "#dashboard-progress-panel",
            render: displayProgress
        }
    ];

    updateDashboardGreeting();
    const state = document.getElementById("dashboard-state");
    state.replaceChildren();
    state.setAttribute("aria-busy", "true");

    const failures = await Promise.all(resources.map(async resource => {
        setDashboardCount(resource.count, "…");
        const panel = resource.panel && document.querySelector(resource.panel);
        panel?.querySelectorAll(".session, .progress-item, .action-row, .dashboard-empty-message")
            .forEach(item => item.remove());
        const loading = panel && appendDashboardEmptyMessage(panel, `Loading ${resource.label}…`);

        try {
            const response = await dashboardFetch(resource.path);
            const records = await readDashboardResponse(response);
            if (!Array.isArray(records)) {
                throw new Error("The server returned invalid dashboard data.");
            }

            resource.render?.(records);
            if (resource.total) {
                setDashboardCount(resource.count, resource.total(records));
            }
            return null;
        } catch (error) {
            console.error(`Unable to load ${resource.label}:`, error);
            setDashboardCount(resource.count, "Unavailable");
            if (panel) {
                appendDashboardEmptyMessage(panel, `Unable to load ${resource.label}.`);
            }
            return resource.label;
        } finally {
            loading?.remove();
        }
    }));

    state.removeAttribute("aria-busy");
    const unavailable = failures.filter(Boolean);
    if (unavailable.length) {
        window.KBDUI.showError(
            "dashboard-state",
            `Could not load: ${unavailable.join(", ")}.`,
            loadDashboard
        );
    }
}


function setDashboardCount(selector, value) {
    if (selector) {
        document.querySelector(selector).textContent = value;
    }
}


function isOutstandingAction(action) {
    return action.Status === "Pending" || action.Status === "In Progress";
}


function updateDashboardGreeting() {

    if (window.kbdCurrentUser?.Role === "Admin") {
        document.getElementById("dashboard-title").textContent = "Admin Dashboard";
        document.title = "KBD | Admin Dashboard";
    }

    const firstName =
        window.kbdCurrentUser?.FirstName;

    if (!firstName) {
        return;
    }

    const greeting =
        document.querySelector(".welcome h2");

    if (!greeting) {
        return;
    }

    const hour = new Date().getHours();

    const timeGreeting =
        hour < 12
            ? "Good morning"
            : hour < 18
                ? "Good afternoon"
                : "Good evening";

    greeting.textContent =
        `${timeGreeting}, ${firstName}.`;

}


function localDateValue(dateString) {

    if (!dateString) {
        return null;
    }

    const date =
        new Date(`${dateString}T00:00:00`);

    return Number.isNaN(date.getTime())
        ? null
        : date;

}


function getUpcomingSessions(sessions) {

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return sessions
        .filter(session => {

            const date =
                localDateValue(session.SessionDate);

            return (
                session.Status === "Scheduled" &&
                date &&
                date >= today
            );

        })
        .sort((first, second) => {

            const firstValue =
                `${first.SessionDate || ""} ` +
                `${first.StartTime || ""}`;

            const secondValue =
                `${second.SessionDate || ""} ` +
                `${second.StartTime || ""}`;

            return firstValue.localeCompare(secondValue);

        });

}


function displaySessions(sessions) {

    const sessionList =
        document.querySelector(".session-list");

    if (!sessionList) {
        return;
    }

    sessionList.innerHTML = "";

    const upcomingSessions =
        getUpcomingSessions(sessions).slice(0, 3);

    if (upcomingSessions.length === 0) {
        appendDashboardEmptyMessage(
            sessionList,
            "No upcoming sessions."
        );
        return;
    }

    upcomingSessions.forEach(session => {

        const date =
            localDateValue(session.SessionDate);

        if (!date) {
            return;
        }

        const participant =
            (`${session.ParticipantFirstName || ""} ` +
             `${session.ParticipantLastName || ""}`)
                .trim() || "Participant";

        const element =
            document.createElement("div");

        element.className = "session";

        element.innerHTML = `
            <div class="session-date">
                <strong>${date.getDate()}</strong>
                <span>
                    ${date
                        .toLocaleString(
                            "en-ZA",
                            { month: "short" }
                        )
                        .toUpperCase()}
                </span>
            </div>

            <div class="session-info">
                <strong>
                    ${dashboardEscapeHTML(participant)}
                </strong>
                <span>
                    ${dashboardEscapeHTML(
                        session.SessionType || "Coaching"
                    )}
                </span>
            </div>

            <div class="session-time">
                ${dashboardEscapeHTML(
                    session.StartTime || "Time not set"
                )}
            </div>
        `;

        sessionList.appendChild(element);

    });

}


function displayProgress(progress) {

    const progressPanel = document.getElementById("dashboard-progress-panel");

    progressPanel
        .querySelectorAll(
            ".progress-item, .dashboard-empty-message"
        )
        .forEach(item => item.remove());

    const records = progress.slice(0, 3);

    if (records.length === 0) {
        appendDashboardEmptyMessage(
            progressPanel,
            "No progress information available."
        );
        return;
    }

    records.forEach(person => {

        const rawPercentage =
            Number(person.ProgressPercentage);

        const percentage =
            Number.isFinite(rawPercentage)
                ? Math.min(
                    100,
                    Math.max(0, rawPercentage)
                )
                : 0;

        const participantName =
            (`${person.FirstName || ""} ` +
             `${person.LastName || ""}`)
                .trim() || "Participant";

        const item =
            document.createElement("div");

        item.className = "progress-item";

        item.innerHTML = `
            <div class="progress-heading">
                <span>
                    ${dashboardEscapeHTML(participantName)}
                </span>
                <strong>${percentage}%</strong>
            </div>

            <div
                class="progress-bar"
                role="progressbar"
                aria-label="Progress for ${dashboardEscapeHTML(participantName)}"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${percentage}"
            >
                <div
                    class="progress-fill"
                    style="width: ${percentage}%"
                ></div>
            </div>
        `;

        progressPanel.appendChild(item);

    });

}


function displayActions(actions) {

    const actionPanel =
        document.querySelector(
            ".dashboard > .panel:last-child"
        );

    if (!actionPanel) {
        return;
    }

    actionPanel
        .querySelectorAll(
            ".action-row, .dashboard-empty-message"
        )
        .forEach(item => item.remove());

    const outstandingActions = actions
        .filter(isOutstandingAction)
        .sort((first, second) =>
            String(first.DueDate || "9999-12-31")
                .localeCompare(
                    String(
                        second.DueDate || "9999-12-31"
                    )
                )
        );

    if (outstandingActions.length === 0) {
        appendDashboardEmptyMessage(
            actionPanel,
            "No outstanding actions."
        );
        return;
    }

    outstandingActions
        .slice(0, 3)
        .forEach(action => {

            const participant =
                (`${action.ParticipantFirstName || ""} ` +
                 `${action.ParticipantLastName || ""}`)
                    .trim() || "Participant";

            const row =
                document.createElement("div");

            row.className = "action-row";

            row.innerHTML = `
                <div>
                    <strong>
                        ${dashboardEscapeHTML(action.Title)}
                    </strong>
                    <span>
                        ${dashboardEscapeHTML(participant)}
                    </span>
                </div>

                <span class="status">
                    ${dashboardEscapeHTML(action.Status)}
                </span>

                <span>
                    Due ${dashboardEscapeHTML(
                        formatDashboardDate(action.DueDate)
                    )}
                </span>
            `;

            actionPanel.appendChild(row);

        });

}


function formatDashboardDate(dateString) {

    const date = localDateValue(dateString);

    if (!date) {
        return "No date";
    }

    return date.toLocaleDateString(
        "en-ZA",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


function appendDashboardEmptyMessage(
    container,
    message
) {

    const element =
        document.createElement("p");

    element.className =
        "muted dashboard-empty-message";

    element.textContent = message;
    container.appendChild(element);
    return element;

}


function initialiseDashboard() {

    if (dashboardInitialised) {
        return;
    }

    dashboardInitialised = true;
    loadDashboard();

}


if (window.kbdCurrentUser) {
    initialiseDashboard();
} else {
    window.addEventListener(
        "kbd-auth-ready",
        initialiseDashboard,
        {
            once: true
        }
    );
}
