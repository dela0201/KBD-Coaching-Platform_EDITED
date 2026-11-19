// ========================================
// KBD REPORTS PAGE
// ========================================

const API_URL = "";
let reportsPageInitialised = false;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function readResponse(response) {
    if (window.KBDUI?.readResponse) {
        return KBDUI.readResponse(response);
    }

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.error || "The request could not be completed.");
    }

    return result;
}

async function fetchReportResource(path) {
    const response = await fetch(`${API_URL}${path}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
    });

    return readResponse(response);
}

// ========================================
// LOAD REPORTS
// ========================================

async function loadReports() {
    const resources = [
        {
            path: "/api/reports/summary",
            label: "report summary",
            render: displayReportSummary,
            valid: result => result && typeof result === "object" && !Array.isArray(result)
        },
        {
            path: "/api/progress",
            label: "programme progress",
            render: displayReportProgress
        }
    ];

    if (["Admin", "Coach"].includes(window.kbdCurrentUser?.Role)) {
        resources.push(
            { path: "/api/assessments", label: "assessments", count: "report-assessments" },
            { path: "/api/assessment-responses", label: "assessment responses", count: "report-responses" },
            { path: "/api/materials", label: "learning materials", count: "report-materials" }
        );
    }

    const state = document.getElementById("reports-state");
    state.textContent = "Preparing reports…";
    state.setAttribute("aria-busy", "true");
    KBDUI.showLoading("report-progress-container", "Loading progress…");

    const failures = await Promise.all(resources.map(async resource => {
        try {
            const result = await fetchReportResource(resource.path);
            const valid = resource.valid || Array.isArray;
            if (!valid(result)) {
                throw new Error("The server returned invalid report data.");
            }

            resource.render?.(result);
            if (resource.count) {
                setText(resource.count, result.length);
            }
            return null;
        } catch (error) {
            console.error(`Unable to load ${resource.label}:`, error);
            if (resource.path === "/api/progress") {
                KBDUI.showError("report-progress-container", error.message);
            }
            return resource.label;
        }
    }));

    state.removeAttribute("aria-busy");
    state.replaceChildren();
    const unavailable = failures.filter(Boolean);
    if (unavailable.length) {
        KBDUI.showError("reports-state", `Could not load: ${unavailable.join(", ")}.`, loadReports);
    }
}

// ========================================
// DISPLAY SUMMARY
// ========================================

function displayReportSummary(summary) {
    const actionRate = limitPercentage(summary.ActionCompletionRate);
    const sessionRate = limitPercentage(summary.SessionCompletionRate);
    const averageProgress = limitPercentage(summary.AverageProgress);

    setText("report-programmes", summary.ActiveProgrammes);
    setText("report-participants", summary.TotalParticipants);
    setText("report-average-progress", `${averageProgress}%`);
    setText("report-completed-actions", summary.CompletedActions);

    setText("total-actions", summary.TotalActions);
    setText("completed-actions", summary.CompletedActions);
    setText("outstanding-actions", Math.max(
        0,
        toNonNegativeNumber(summary.TotalActions) - toNonNegativeNumber(summary.CompletedActions)
    ));
    setText("action-rate", `${actionRate}%`);
    updateRateBar("action-rate-bar", actionRate);

    setText("total-sessions", summary.TotalSessions);
    setText("completed-sessions", summary.CompletedSessions);
    setText("session-rate", `${sessionRate}%`);
    updateRateBar("session-rate-bar", sessionRate);

}

// ========================================
// DISPLAY PARTICIPANT PROGRESS
// ========================================

function displayReportProgress(progress) {
    const container = document.getElementById("report-progress-container");

    if (!container) return;

    container.innerHTML = "";

    if (progress.length === 0) {
        if (window.KBDUI?.showEmpty) {
            KBDUI.showEmpty(
                "report-progress-container",
                "No progress available",
                "Participant progress has not been recorded yet."
            );
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No progress available</h3>
                    <p>Participant progress has not been recorded yet.</p>
                </div>
            `;
        }
        return;
    }

    progress.forEach(item => {
        const percentage = limitPercentage(item.ProgressPercentage);
        const row = document.createElement("div");

        row.className = "report-progress-row";
        row.innerHTML = `
            <div class="report-participant">
                <strong>
                    ${escapeHTML(item.FirstName)}
                    ${escapeHTML(item.LastName)}
                </strong>
                <span>${escapeHTML(item.ProgrammeName)}</span>
            </div>

            <div class="report-progress-status">
                <span class="programme-status">
                    ${escapeHTML(item.Status)}
                </span>
            </div>

            <div class="report-progress-value">
                <div class="report-progress-heading">
                    <span>Progress</span>
                    <strong>${percentage}%</strong>
                </div>

                <div
                    class="report-progress-bar"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${percentage}"
                >
                    <div
                        class="report-progress-fill"
                        style="width: ${percentage}%"
                    ></div>
                </div>
            </div>
        `;

        container.appendChild(row);
    });
}

// ========================================
// HELPERS
// ========================================

function setText(elementID, value) {
    const element = document.getElementById(elementID);
    if (element) element.textContent = value ?? "—";
}

function toNonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function limitPercentage(value) {
    return Math.min(100, Math.max(0, toNonNegativeNumber(value)));
}

function updateRateBar(elementID, percentage) {
    const element = document.getElementById(elementID);
    if (!element) return;

    element.style.width = `${percentage}%`;
    element.setAttribute("role", "progressbar");
    element.setAttribute("aria-valuemin", "0");
    element.setAttribute("aria-valuemax", "100");
    element.setAttribute("aria-valuenow", percentage);
}

// ========================================
// START
// ========================================

function initialiseReportsPage() {
    if (reportsPageInitialised) return;
    reportsPageInitialised = true;
    loadReports();
}

if (window.kbdCurrentUser) {
    initialiseReportsPage();
} else {
    window.addEventListener(
        "kbd-auth-ready",
        initialiseReportsPage,
        { once: true }
    );
}
