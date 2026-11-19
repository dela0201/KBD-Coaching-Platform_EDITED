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
    if (window.kbdCurrentUser?.Role === "Participant") return;


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


// ========================================
// PARTICIPANT DASHBOARD (client-portal style)
// ----------------------------------------
// Loaded on dashboard.html for every role, but only runs for
// Participants. It hides the standard dashboard and shows a
// personal home page instead. It uses existing API routes only:
//   GET /api/sessions, /api/actions, /api/progress,
//       /api/programmes, /api/materials
//   PUT /api/actions/:id  { Status }  (allowed for Participants)
// To switch it off, remove this participant section from app.js and style.css.
// ========================================

(() => {
    let participantDashboardStarted = false;

    const pdState = {
        sessions: [],
        actions: [],
        progress: [],
        programmes: [],
        materials: [],
        showCompleted: false
    };

    // ---------- helpers ----------

    function pdEl(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }
        return element;
    }

    function pdToday() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function pdParseDate(value) {
        if (!value) return null;
        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;
        return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
        );
    }

    function pdDaysFromToday(value) {
        const date = pdParseDate(value);
        if (!date) return null;
        return Math.round((date - pdToday()) / 86400000);
    }

    function pdFormatDate(value, options) {
        const date = pdParseDate(value);
        if (!date) return "No date";
        return date.toLocaleDateString(
            "en-ZA",
            options || { weekday: "short", day: "numeric", month: "short" }
        );
    }

    function pdFormatTime(value) {
        if (!value) return "";
        const match = String(value).match(/^(\d{1,2}):(\d{2})/);
        return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
    }

    function pdPersonName(first, last) {
        return `${first || ""} ${last || ""}`.trim();
    }

    async function pdRead(response) {
        if (window.KBDUI && typeof KBDUI.readResponse === "function") {
            return KBDUI.readResponse(response);
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error || "The request could not be completed."
            );
        }

        return result;
    }

    function pdGet(url) {
        return fetch(url, {
            method: "GET",
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        }).then(pdRead);
    }

    // ---------- data shaping ----------

    function pdUpcomingSessions() {
        return pdState.sessions
            .filter(session => {
                const days = pdDaysFromToday(session.SessionDate);
                return (
                    days !== null &&
                    days >= 0 &&
                    ["Scheduled", "Rescheduled"].includes(session.Status)
                );
            })
            .sort((a, b) =>
                `${a.SessionDate} ${a.StartTime || ""}`.localeCompare(
                    `${b.SessionDate} ${b.StartTime || ""}`
                )
            );
    }

    function pdOpenActions() {
        return pdState.actions.filter(action =>
            ["Pending", "In Progress"].includes(action.Status)
        );
    }

    function pdCompletedActions() {
        return pdState.actions
            .filter(action => action.Status === "Completed")
            .sort((a, b) =>
                String(b.CompletedAt || "").localeCompare(
                    String(a.CompletedAt || "")
                )
            );
    }

    function pdActionGroup(action) {
        const days = pdDaysFromToday(action.DueDate);
        if (days === null) return "later";
        if (days < 0) return "overdue";
        if (days <= 7) return "soon";
        return "later";
    }

    function pdAverageProgress() {
        if (!pdState.progress.length) return null;
        const total = pdState.progress.reduce(
            (sum, row) => sum + Number(row.ProgressPercentage || 0),
            0
        );
        return Math.round(total / pdState.progress.length);
    }

    // ---------- page skeleton ----------

    function pdBuildShell() {
        const standard = document.querySelector(".main-content .dashboard");
        if (!standard) return null;

        document.body.classList.add("participant-portal");

        const heading = document.querySelector(".topbar h1");
        if (heading) heading.textContent = "My Coaching";

        const shell = pdEl("section", "pd");
        shell.id = "participant-dashboard";
        shell.setAttribute("aria-live", "polite");

        shell.innerHTML = `
            <div class="pd-hero">
                <div class="pd-hero-text">
                    <p class="eyebrow">YOUR COACHING SPACE</p>
                    <h2 id="pd-greeting">Welcome back</h2>
                    <p id="pd-hero-summary">Loading your coaching overview...</p>
                </div>
                <div class="pd-next" id="pd-next-session"></div>
            </div>

            <div class="pd-message" id="pd-message" hidden></div>

            <div class="pd-stats" id="pd-stats"></div>

            <div class="pd-grid">
                <div class="pd-column-main">
                    <div class="panel pd-panel">
                        <div class="panel-header">
                            <div>
                                <p class="eyebrow">TO DO</p>
                                <h3>My Actions</h3>
                            </div>
                            <a href="actions.html">View all</a>
                        </div>
                        <div id="pd-actions"></div>
                    </div>
                </div>

                <div class="pd-column-side">
                    <div class="panel pd-panel">
                        <div class="panel-header">
                            <div>
                                <p class="eyebrow">AGENDA</p>
                                <h3>Upcoming Sessions</h3>
                            </div>
                            <a href="sessions.html">View all</a>
                        </div>
                        <div id="pd-sessions"></div>
                    </div>

                    <div class="panel pd-panel">
                        <div class="panel-header">
                            <div>
                                <p class="eyebrow">PROGRESS</p>
                                <h3>My Programmes</h3>
                            </div>
                            <a href="programmes.html">View all</a>
                        </div>
                        <div id="pd-programmes"></div>
                    </div>
                </div>
            </div>

            <div class="panel pd-panel">
                <div class="panel-header">
                    <div>
                        <p class="eyebrow">RESOURCES</p>
                        <h3>Learning Materials</h3>
                    </div>
                    <a href="materials.html">View all</a>
                </div>
                <div class="pd-materials" id="pd-materials"></div>
            </div>
        `;

        standard.insertAdjacentElement("afterend", shell);

        return shell;
    }

    // ---------- renderers ----------

    function pdRenderGreeting() {
        const firstName = window.kbdCurrentUser?.FirstName || "";
        const hour = new Date().getHours();
        const part =
            hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

        const greeting = document.getElementById("pd-greeting");
        if (greeting) {
            greeting.textContent = firstName ? `${part}, ${firstName}` : part;
        }

        const open = pdOpenActions();
        const overdue = open.filter(a => pdActionGroup(a) === "overdue").length;
        const upcoming = pdUpcomingSessions().length;

        const parts = [];
        parts.push(
            open.length === 1 ? "1 open action" : `${open.length} open actions`
        );
        if (overdue) parts.push(`${overdue} overdue`);
        parts.push(
            upcoming === 1 ? "1 upcoming session" : `${upcoming} upcoming sessions`
        );

        const summary = document.getElementById("pd-hero-summary");
        if (summary) summary.textContent = `You have ${parts.join(", ")}.`;
    }

    function pdRenderNextSession() {
        const container = document.getElementById("pd-next-session");
        if (!container) return;
        container.innerHTML = "";

        const next = pdUpcomingSessions()[0];

        container.appendChild(pdEl("span", "pd-next-label", "Next session"));

        if (!next) {
            container.appendChild(pdEl("strong", "pd-next-date", "Nothing booked"));
            container.appendChild(
                pdEl("span", "pd-next-meta", "Your coach will schedule your next session.")
            );
            return;
        }

        const days = pdDaysFromToday(next.SessionDate);
        const when =
            days === 0 ? "Today" : days === 1 ? "Tomorrow" : pdFormatDate(next.SessionDate);
        const time = pdFormatTime(next.StartTime);

        container.appendChild(
            pdEl("strong", "pd-next-date", time ? `${when}, ${time}` : when)
        );

        const coach = pdPersonName(next.CoachFirstName, next.CoachLastName);
        container.appendChild(
            pdEl(
                "span",
                "pd-next-meta",
                [next.SessionType, coach ? `with ${coach}` : ""].filter(Boolean).join(" ")
            )
        );

        if (next.ProgrammeName) {
            container.appendChild(pdEl("span", "pd-next-meta", next.ProgrammeName));
        }
    }

    function pdRenderStats() {
        const container = document.getElementById("pd-stats");
        if (!container) return;
        container.innerHTML = "";

        const open = pdOpenActions();
        const dueThisWeek = open.filter(a => {
            const days = pdDaysFromToday(a.DueDate);
            return days !== null && days >= 0 && days <= 7;
        }).length;
        const average = pdAverageProgress();

        const stats = [
            { label: "Open actions", value: open.length, tone: "" },
            { label: "Due this week", value: dueThisWeek, tone: "" },
            { label: "Upcoming sessions", value: pdUpcomingSessions().length, tone: "" },
            {
                label: "Overall progress",
                value: average === null ? "–" : `${average}%`,
                tone: "pd-stat-green"
            }
        ];

        stats.forEach(stat => {
            const card = pdEl("div", `stat-card pd-stat ${stat.tone}`.trim());
            card.appendChild(pdEl("span", "stat-label", stat.label));
            card.appendChild(pdEl("strong", "stat-number", stat.value));
            container.appendChild(card);
        });
    }

    function pdActionItem(action) {
        const item = pdEl("li", "pd-action");
        const done = action.Status === "Completed";
        if (done) item.classList.add("is-done");

        const id = `pd-action-${action.ActionID}`;

        const checkbox = pdEl("input", "pd-check");
        checkbox.type = "checkbox";
        checkbox.id = id;
        checkbox.checked = done;
        checkbox.addEventListener("change", () =>
            pdToggleAction(action, checkbox)
        );

        const body = pdEl("div", "pd-action-body");
        const label = pdEl("label", "pd-action-title", action.Title || "Untitled action");
        label.setAttribute("for", id);
        body.appendChild(label);

        if (action.Description) {
            body.appendChild(pdEl("p", "pd-action-desc", action.Description));
        }

        const meta = pdEl("div", "pd-action-meta");
        if (action.ProgrammeName) {
            meta.appendChild(pdEl("span", "pd-tag", action.ProgrammeName));
        }
        if (action.Status === "In Progress") {
            meta.appendChild(pdEl("span", "pd-tag pd-tag-blue", "In progress"));
        }
        body.appendChild(meta);

        const due = pdEl("div", "pd-due");
        if (done) {
            due.textContent = "Done";
            due.classList.add("pd-due-done");
        } else {
            const days = pdDaysFromToday(action.DueDate);
            if (days === null) {
                due.textContent = "No due date";
            } else if (days < 0) {
                due.textContent = `Overdue · ${pdFormatDate(action.DueDate, { day: "numeric", month: "short" })}`;
                due.classList.add("pd-due-overdue");
            } else if (days === 0) {
                due.textContent = "Due today";
                due.classList.add("pd-due-soon");
            } else if (days === 1) {
                due.textContent = "Due tomorrow";
                due.classList.add("pd-due-soon");
            } else {
                due.textContent = `Due ${pdFormatDate(action.DueDate, { day: "numeric", month: "short" })}`;
                if (days <= 7) due.classList.add("pd-due-soon");
            }
        }

        item.append(checkbox, body, due);
        return item;
    }

    function pdRenderActions() {
        const container = document.getElementById("pd-actions");
        if (!container) return;
        container.innerHTML = "";

        const open = pdOpenActions().sort((a, b) =>
            String(a.DueDate || "9999").localeCompare(String(b.DueDate || "9999"))
        );

        const groups = [
            { key: "overdue", title: "Overdue" },
            { key: "soon", title: "Due in the next 7 days" },
            { key: "later", title: "Later" }
        ];

        if (!open.length) {
            const empty = pdEl("div", "pd-empty");
            empty.appendChild(pdEl("strong", "", "You're all caught up"));
            empty.appendChild(
                pdEl("span", "", "New actions from your coach will appear here.")
            );
            container.appendChild(empty);
        }

        groups.forEach(group => {
            const items = open.filter(a => pdActionGroup(a) === group.key);
            if (!items.length) return;

            container.appendChild(
                pdEl("h4", `pd-group-title pd-group-${group.key}`, `${group.title} (${items.length})`)
            );

            const list = pdEl("ul", "pd-action-list");
            items.forEach(action => list.appendChild(pdActionItem(action)));
            container.appendChild(list);
        });

        const completed = pdCompletedActions();
        if (completed.length) {
            const toggle = pdEl(
                "button",
                "pd-link-button",
                pdState.showCompleted
                    ? "Hide completed"
                    : `Show completed (${completed.length})`
            );
            toggle.type = "button";
            toggle.setAttribute("aria-expanded", String(pdState.showCompleted));
            toggle.addEventListener("click", () => {
                pdState.showCompleted = !pdState.showCompleted;
                pdRenderActions();
            });
            container.appendChild(toggle);

            if (pdState.showCompleted) {
                const list = pdEl("ul", "pd-action-list");
                completed.slice(0, 10).forEach(action =>
                    list.appendChild(pdActionItem(action))
                );
                container.appendChild(list);
            }
        }
    }

    async function pdToggleAction(action, checkbox) {
        const previous = action.Status;
        const next = checkbox.checked ? "Completed" : "Pending";

        checkbox.disabled = true;
        pdShowMessage("");

        try {
            const response = await fetch(
                `/api/actions/${encodeURIComponent(action.ActionID)}`,
                {
                    method: "PUT",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json"
                    },
                    body: JSON.stringify({ Status: next })
                }
            );

            await pdRead(response);

            action.Status = next;
            action.CompletedAt =
                next === "Completed" ? new Date().toISOString() : null;

            pdRenderAll();
        } catch (error) {
            console.error("Unable to update action:", error);
            action.Status = previous;
            checkbox.checked = previous === "Completed";
            checkbox.disabled = false;
            pdShowMessage(error.message || "The action could not be updated.");
        }
    }

    function pdRenderSessions() {
        const container = document.getElementById("pd-sessions");
        if (!container) return;
        container.innerHTML = "";

        const sessions = pdUpcomingSessions().slice(0, 4);

        if (!sessions.length) {
            const empty = pdEl("div", "pd-empty");
            empty.appendChild(pdEl("strong", "", "No sessions booked"));
            empty.appendChild(pdEl("span", "", "Upcoming sessions will show here."));
            container.appendChild(empty);
            return;
        }

        const list = pdEl("ul", "pd-session-list");

        sessions.forEach(session => {
            const date = pdParseDate(session.SessionDate);
            const item = pdEl("li", "pd-session");

            const badge = pdEl("div", "pd-date-badge");
            badge.appendChild(
                pdEl("span", "pd-date-month", date ? date.toLocaleDateString("en-ZA", { month: "short" }) : "")
            );
            badge.appendChild(pdEl("strong", "pd-date-day", date ? date.getDate() : "?"));

            const body = pdEl("div", "pd-session-body");
            const start = pdFormatTime(session.StartTime);
            const end = pdFormatTime(session.EndTime);
            body.appendChild(
                pdEl("strong", "", `${session.SessionType || "Session"}${start ? ` · ${start}${end ? `–${end}` : ""}` : ""}`)
            );

            const coach = pdPersonName(session.CoachFirstName, session.CoachLastName);
            body.appendChild(
                pdEl("span", "", [coach ? `with ${coach}` : "", session.ProgrammeName].filter(Boolean).join(" · "))
            );

            if (session.Status === "Rescheduled") {
                body.appendChild(pdEl("span", "pd-tag pd-tag-blue", "Rescheduled"));
            }

            item.append(badge, body);
            list.appendChild(item);
        });

        container.appendChild(list);
    }

    function pdRenderProgrammes() {
        const container = document.getElementById("pd-programmes");
        if (!container) return;
        container.innerHTML = "";

        const progressByProgramme = new Map(
            pdState.progress.map(row => [Number(row.ProgrammeID), row])
        );

        const programmes = pdState.programmes.filter(p =>
            ["Active", "Completed"].includes(p.Status)
        );

        if (!programmes.length) {
            const empty = pdEl("div", "pd-empty");
            empty.appendChild(pdEl("strong", "", "No programmes yet"));
            empty.appendChild(pdEl("span", "", "Programmes you join will show here."));
            container.appendChild(empty);
            return;
        }

        const list = pdEl("ul", "pd-programme-list");

        programmes.forEach(programme => {
            const row = progressByProgramme.get(Number(programme.ProgrammeID));
            const percent = Math.max(
                0,
                Math.min(100, Math.round(Number(row?.ProgressPercentage || 0)))
            );

            const item = pdEl("li", "pd-programme");
            const top = pdEl("div", "pd-programme-top");
            top.appendChild(pdEl("strong", "", programme.ProgrammeName));
            top.appendChild(pdEl("span", "pd-percent", `${percent}%`));

            const bar = pdEl("div", "pd-bar");
            bar.setAttribute("role", "progressbar");
            bar.setAttribute("aria-valuemin", "0");
            bar.setAttribute("aria-valuemax", "100");
            bar.setAttribute("aria-valuenow", String(percent));
            bar.setAttribute("aria-label", `${programme.ProgrammeName} progress`);
            const fill = pdEl("span", "pd-bar-fill");
            fill.style.width = `${percent}%`;
            bar.appendChild(fill);

            const meta = pdEl(
                "span",
                "pd-programme-meta",
                [
                    row?.Status || "Not Started",
                    programme.EndDate ? `ends ${pdFormatDate(programme.EndDate, { day: "numeric", month: "short", year: "numeric" })}` : ""
                ].filter(Boolean).join(" · ")
            );

            item.append(top, bar, meta);
            list.appendChild(item);
        });

        container.appendChild(list);
    }

    function pdRenderMaterials() {
        const container = document.getElementById("pd-materials");
        if (!container) return;
        container.innerHTML = "";

        const materials = [...pdState.materials]
            .sort((a, b) => String(b.CreatedAt || "").localeCompare(String(a.CreatedAt || "")))
            .slice(0, 4);

        if (!materials.length) {
            const empty = pdEl("div", "pd-empty");
            empty.appendChild(pdEl("strong", "", "No materials shared yet"));
            empty.appendChild(pdEl("span", "", "Your coach's resources will appear here."));
            container.appendChild(empty);
            return;
        }

        materials.forEach(material => {
            const card = pdEl("a", "pd-material");
            card.href = "materials.html";

            card.appendChild(pdEl("span", "pd-material-type", material.MaterialType || "Resource"));
            card.appendChild(pdEl("strong", "", material.Title || "Untitled material"));
            if (material.ProgrammeName) {
                card.appendChild(pdEl("span", "pd-material-meta", material.ProgrammeName));
            }

            container.appendChild(card);
        });
    }

    function pdShowMessage(message) {
        const box = document.getElementById("pd-message");
        if (!box) return;
        box.textContent = message || "";
        box.hidden = !message;
    }

    function pdRenderAll() {
        pdRenderGreeting();
        pdRenderNextSession();
        pdRenderStats();
        pdRenderActions();
        pdRenderSessions();
        pdRenderProgrammes();
        pdRenderMaterials();
    }

    // ---------- start ----------

    async function pdLoad() {
        try {
            const results = await Promise.allSettled([
                pdGet("/api/sessions"),
                pdGet("/api/actions"),
                pdGet("/api/progress"),
                pdGet("/api/programmes"),
                pdGet("/api/materials")
            ]);

            const keys = ["sessions", "actions", "progress", "programmes", "materials"];
            const failed = [];

            results.forEach((result, index) => {
                if (result.status === "fulfilled" && Array.isArray(result.value)) {
                    pdState[keys[index]] = result.value;
                } else {
                    failed.push(keys[index]);
                    if (result.status === "rejected") {
                        console.error(`Unable to load ${keys[index]}:`, result.reason);
                    }
                }
            });

            pdRenderAll();

            if (failed.length) {
                pdShowMessage(`Some information could not be loaded (${failed.join(", ")}). Please refresh to try again.`);
            }
        } catch (error) {
            console.error("Unable to load the participant dashboard:", error);
            pdShowMessage(error.message || "Your dashboard could not be loaded.");
        }
    }

    function pdStart(user) {
        if (participantDashboardStarted) return;
        if (!user || user.Role !== "Participant") return;

        participantDashboardStarted = true;

        if (!pdBuildShell()) return;

        pdLoad();
    }

    if (window.kbdCurrentUser) {
        pdStart(window.kbdCurrentUser);
    } else {
        window.addEventListener(
            "kbd-auth-ready",
            event => pdStart(event.detail || window.kbdCurrentUser),
            { once: true }
        );
    }
})();
