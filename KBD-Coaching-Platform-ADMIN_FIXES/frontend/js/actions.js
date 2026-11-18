//========================================
//KBD ACTIONS PAGE
// ========================================

const ACTION_STATUSES = [
    "Pending",
    "In Progress",
    "Completed",
    "Cancelled"
];

const ACTION_FILE_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg"
]);
const ACTION_FILE_EXTENSIONS = new Set([
    "pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg"
]);
const ACTION_MAX_FILE_SIZE = 10 * 1024 * 1024;

let allActions = [];
let actionPageInitialised = false;
let selectedActionFiles = [];

const showActionFormButton =
    document.getElementById("show-action-form");

const closeActionFormButton =
    document.getElementById("close-action-form");

const actionFormPanel =
    document.getElementById("action-form-panel");

const actionForm =
    document.getElementById("action-form");

const actionSearch =
    document.getElementById("action-search");

const actionStatusFilter =
    document.getElementById("action-status-filter");

const actionFileInput =
    document.getElementById("action-file-input");

const actionFileDropZone =
    document.getElementById("action-file-drop-zone");

const chooseActionFilesButton =
    document.getElementById("choose-action-files");

const actionSelectedFiles =
    document.getElementById("action-selected-files");


// ========================================
// SHARED HELPERS
// ========================================

function canManageActions() {
    return [
        "Admin",
        "Coach"
    ].includes(
        window.kbdCurrentUser?.Role
    );
}

function escapeHTML(value) {

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


async function readResponse(response) {

    if (
        window.KBDUI &&
        typeof window.KBDUI.readResponse === "function"
    ) {
        return window.KBDUI.readResponse(response);
    }

    const result =
        await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            result.error ||
            "The request could not be completed."
        );
    }

    return result;

}


function showLoading() {

    if (window.KBDUI) {
        window.KBDUI.showLoading(
            "actions-container",
            "Loading actions..."
        );
        return;
    }

    const container =
        document.getElementById("actions-container");

    if (container) {
        container.textContent = "Loading actions...";
    }

}


function showLoadError(error) {

    if (window.KBDUI) {
        window.KBDUI.showError(
            "actions-container",
            error.message,
            loadActions
        );
        return;
    }

    const container =
        document.getElementById("actions-container");

    if (container) {
        container.textContent = error.message;
    }

}


// ========================================
// LOAD AND FILTER ACTIONS
// ========================================

async function loadActions() {

    const container =
        document.getElementById("actions-container");

    if (!container) {
        return;
    }

    showLoading();

    try {

        const response = await fetch(
            "/api/actions",
            {
                credentials: "same-origin",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const actions =
            await readResponse(response);

        if (!Array.isArray(actions)) {
            throw new Error(
                "The server returned invalid action data."
            );
        }

        allActions = actions;
        displayFilteredActions();

    } catch (error) {

        console.error(
            "Error loading actions:",
            error
        );

        showLoadError(error);

    }

}


function displayFilteredActions() {

    const selectedStatus =
        actionStatusFilter?.value || "All";

    const searchTerm =
        actionSearch?.value
            .trim()
            .toLowerCase() || "";

    const filteredActions =
        allActions.filter(action => {

            const participant =
                `${action.ParticipantFirstName || ""} ` +
                `${action.ParticipantLastName || ""}`;

            const coach =
                `${action.CoachFirstName || ""} ` +
                `${action.CoachLastName || ""}`;

            const searchableText = [
                action.Title,
                action.Description,
                participant,
                coach,
                action.ProgrammeName
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesStatus =
                selectedStatus === "All" ||
                action.Status === selectedStatus;

            return (
                matchesStatus &&
                searchableText.includes(searchTerm)
            );

        });

    displayActions(filteredActions);

}


// ========================================
// DISPLAY ACTIONS
// ========================================

function statusesForRole(role) {

    if (role === "Participant") {
        return ACTION_STATUSES.filter(
            status => status !== "Cancelled"
        );
    }

    return ACTION_STATUSES;

}


function actionStatusControl(action, role) {

    if (role === "Corporate") {
        return `
            <span class="action-status">
                ${escapeHTML(action.Status)}
            </span>
        `;
    }

    const options =
        statusesForRole(role)
            .map(status => {

                const selected =
                    status === action.Status
                        ? "selected"
                        : "";

                return `
                    <option
                        value="${escapeHTML(status)}"
                        ${selected}
                    >
                        ${escapeHTML(status)}
                    </option>
                `;

            })
            .join("");

    return `
        <select
            class="action-status-select"
            data-action-id="${Number(action.ActionID)}"
            data-current-status="${escapeHTML(action.Status)}"
            aria-label="Status for ${escapeHTML(action.Title)}"
        >
            ${options}
        </select>
    `;

}


function displayActions(actions) {

    const container =
        document.getElementById("actions-container");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (actions.length === 0) {

        if (window.KBDUI) {
            window.KBDUI.showEmpty(
                "actions-container",
                "No actions found",
                "There are no coaching actions matching the current filters."
            );
        } else {
            container.textContent = "No actions found.";
        }

        return;

    }

    const role =
        window.kbdCurrentUser?.Role || "Participant";

    actions.forEach(action => {

        const actionID = Number(action.ActionID);

        if (!Number.isInteger(actionID) || actionID <= 0) {
            return;
        }

        const participant =
            (`${action.ParticipantFirstName || ""} ` +
             `${action.ParticipantLastName || ""}`)
                .trim() || "Not assigned";

        const coach =
            (`${action.CoachFirstName || ""} ` +
             `${action.CoachLastName || ""}`)
                .trim() || "Not assigned";

        const canDelete =
            role === "Admin" || role === "Coach";

        const card =
            document.createElement("article");

        card.className = "action-card";

        card.innerHTML = `
        ${
    canManageActions()
        ? `
            <div class="action-card-actions">
                <button
                    type="button"
                    class="danger-button delete-action-button"
                    data-action-id="${action.ActionID}"
                    data-action-title="${KBDUI.escapeHTML(
                        action.Title ||
                        "this Action"
                    )}"
                >
                    Delete Action
                </button>
            </div>
        `
        : ""
}
            <div class="action-main">
                <div class="action-title-row">
                    <h3>${escapeHTML(action.Title)}</h3>
                    ${actionStatusControl(action, role)}
                </div>

                <p class="action-description">
                    ${escapeHTML(
                        action.Description ||
                        "No description provided."
                    )}
                </p>

                <div class="action-details">
                    <span>
                        <strong>Participant:</strong>
                        ${escapeHTML(participant)}
                    </span>

                    <span>
                        <strong>Coach:</strong>
                        ${escapeHTML(coach)}
                    </span>

                    <span>
                        <strong>Programme:</strong>
                        ${escapeHTML(
                            action.ProgrammeName ||
                            "Not specified"
                        )}
                    </span>

                    <span>
                        <strong>Due:</strong>
                        ${escapeHTML(
                            formatActionDate(action.DueDate)
                        )}
                    </span>
                </div>

                ${canDelete ? `
                    <button
                        type="button"
                        class="delete-action-button"
                        data-action-id="${actionID}"
                    >
                        Delete Action
                    </button>
                ` : ""}
            </div>
        `;

        container.appendChild(card);

    });

    addActionStatusListeners();
    addDeleteActionListeners();

}

async function deleteAction(
    actionID,
    actionTitle,
    button
) {
    const confirmed = window.confirm(
        `Delete "${actionTitle}"?\n\n` +
        "Its uploaded documents will also be deleted. " +
        "This cannot be undone."
    );

    if (!confirmed) return;

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const response = await fetch(
            `/api/actions/${actionID}`,
            {
                method: "DELETE",
                credentials: "same-origin",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const result = await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error ||
                "The Action could not be deleted."
            );
        }

        await loadActions();
    } catch (error) {
        console.error(
            "Unable to delete Action:",
            error
        );

        alert(error.message);

        button.disabled = false;
        button.textContent = originalText;
    }
}

// ========================================
// UPDATE AND DELETE ACTIONS
// ========================================

function addActionStatusListeners() {

    document
        .querySelectorAll(".action-status-select")
        .forEach(selector => {

            selector.addEventListener(
                "change",
                async () => {

                    const actionID =
                        Number(selector.dataset.actionId);

                    const previousStatus =
                        selector.dataset.currentStatus;

                    const newStatus =
                        selector.value;

                    if (
                        !Number.isInteger(actionID) ||
                        actionID <= 0
                    ) {
                        return;
                    }

                    selector.disabled = true;

                    try {

                        const response = await fetch(
                            `/api/actions/${actionID}`,
                            {
                                method: "PUT",
                                credentials: "same-origin",
                                headers: {
                                    "Content-Type": "application/json",
                                    Accept: "application/json"
                                },
                                body: JSON.stringify({
                                    Status: newStatus
                                })
                            }
                        );

                        const result =
                            await readResponse(response);

                        const storedAction =
                            allActions.find(
                                item =>
                                    Number(item.ActionID) ===
                                    actionID
                            );

                        if (storedAction) {
                            storedAction.Status = newStatus;
                            storedAction.CompletedAt =
                                newStatus === "Completed"
                                    ? new Date().toISOString()
                                    : null;
                        }

                        showActionMessage(
                            result.message ||
                            "Action updated successfully.",
                            "success"
                        );

                        displayFilteredActions();

                    } catch (error) {

                        console.error(
                            "Error updating action status:",
                            error
                        );

                        selector.value = previousStatus;

                        showActionMessage(
                            error.message,
                            "error"
                        );

                        selector.disabled = false;

                    }

                }
            );

        });

}


function addDeleteActionListeners() {

    document
        .querySelectorAll(".delete-action-button")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const actionID =
                        Number(button.dataset.actionId);

                    if (
                        !Number.isInteger(actionID) ||
                        actionID <= 0
                    ) {
                        return;
                    }

                    const confirmed = window.confirm(
                        "Delete this action? This cannot be undone."
                    );

                    if (!confirmed) {
                        return;
                    }

                    button.disabled = true;

                    try {

                        const response = await fetch(
                            `/api/actions/${actionID}`,
                            {
                                method: "DELETE",
                                credentials: "same-origin",
                                headers: {
                                    Accept: "application/json"
                                }
                            }
                        );

                        const result =
                            await readResponse(response);

                        allActions = allActions.filter(
                            action =>
                                Number(action.ActionID) !==
                                actionID
                        );

                        showActionMessage(
                            result.message ||
                            "Action deleted successfully.",
                            "success"
                        );

                        displayFilteredActions();

                    } catch (error) {

                        console.error(
                            "Error deleting action:",
                            error
                        );

                        showActionMessage(
                            error.message,
                            "error"
                        );

                        button.disabled = false;

                    }

                }
            );

        });

}


function formatActionDate(dateString) {

    if (!dateString) {
        return "No date";
    }

    const date =
        new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return "Invalid date";
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


// ========================================
// ACTION FORM OPTIONS
// ========================================

function configureActionFormForRole() {

    const role =
        window.kbdCurrentUser?.Role;

    const canCreate =
        role === "Admin" || role === "Coach";

    if (showActionFormButton) {
        showActionFormButton.hidden = !canCreate;
    }

    if (!canCreate) {
        actionFormPanel?.classList.add("hidden");
        return;
    }

    const coachSelect =
        document.getElementById("action-coach");

    const coachGroup =
        coachSelect?.closest(".form-group");

    if (role === "Coach") {

        if (coachSelect) {
            coachSelect.required = false;
            coachSelect.disabled = true;
        }

        if (coachGroup) {
            coachGroup.hidden = true;
        }

    } else {

        if (coachSelect) {
            coachSelect.required = true;
            coachSelect.disabled = false;
        }

        if (coachGroup) {
            coachGroup.hidden = false;
        }

    }

}


async function loadActionFormOptions() {

    const role =
        window.kbdCurrentUser?.Role;

    if (
        !actionForm ||
        !["Admin", "Coach"].includes(role)
    ) {
        return;
    }

    try {

        const [usersResponse, programmesResponse] =
            await Promise.all([
                fetch("/api/users", {
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                }),
                fetch("/api/programmes", {
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                })
            ]);

        const users =
            await readResponse(usersResponse);

        const programmes =
            await readResponse(programmesResponse);

        if (
            !Array.isArray(users) ||
            !Array.isArray(programmes)
        ) {
            throw new Error(
                "The server returned invalid form data."
            );
        }

        populateUserOptions(
            "action-participant",
            users.filter(
                user => user.Role === "Participant"
            ),
            "Select a participant"
        );

        if (role === "Admin") {
            populateUserOptions(
                "action-coach",
                users.filter(
                    user => user.Role === "Coach"
                ),
                "Select a coach"
            );
        }

        populateProgrammeOptions(programmes);

    } catch (error) {

        console.error(
            "Error loading action form options:",
            error
        );

        showActionFormMessage(
            error.message,
            "error"
        );

    }

}


function resetSelect(select, placeholder) {

    if (!select) {
        return;
    }

    select.innerHTML = "";

    const option =
        document.createElement("option");

    option.value = "";
    option.textContent = placeholder;
    option.disabled = true;
    option.selected = true;

    select.appendChild(option);

}


function populateUserOptions(
    selectID,
    users,
    placeholder
) {

    const select =
        document.getElementById(selectID);

    if (!select) {
        return;
    }

    resetSelect(select, placeholder);

    users.forEach(user => {

        const option =
            document.createElement("option");

        option.value = user.UserID;
        option.textContent =
            `${user.FirstName} ${user.LastName}`;

        select.appendChild(option);

    });

}


function populateProgrammeOptions(programmes) {

    const select =
        document.getElementById("action-programme");

    if (!select) {
        return;
    }

    resetSelect(select, "Select a programme");

    programmes.forEach(programme => {

        const option =
            document.createElement("option");

        option.value = programme.ProgrammeID;
        option.textContent = programme.ProgrammeName;

        select.appendChild(option);

    });

}


// ========================================
// ACTION ATTACHMENTS
// ========================================

function actionFileExtension(fileName) {
    return String(fileName || "")
        .split(".")
        .pop()
        .toLowerCase();
}


function validateActionFile(file) {
    const validType =
        ACTION_FILE_TYPES.has(file.type) ||
        ACTION_FILE_EXTENSIONS.has(actionFileExtension(file.name));

    if (!validType) {
        return `${file.name} is not an accepted PDF, Word, Excel or image file.`;
    }

    if (file.size > ACTION_MAX_FILE_SIZE) {
        return `${file.name} exceeds the 10 MB file-size limit.`;
    }

    return null;
}


function addActionFiles(fileList) {
    const incomingFiles = Array.from(fileList || []);
    const errors = [];

    incomingFiles.forEach(file => {
        const error = validateActionFile(file);

        if (error) {
            errors.push(error);
            return;
        }

        const duplicate = selectedActionFiles.some(existing =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (!duplicate) selectedActionFiles.push(file);
    });

    renderSelectedActionFiles();

    if (errors.length) {
        showActionFormMessage(errors.join(" "), "error");
    } else if (incomingFiles.length) {
        clearActionFormMessage();
    }
}


function renderSelectedActionFiles() {
    if (!actionSelectedFiles) return;

    actionSelectedFiles.innerHTML = "";

    if (!selectedActionFiles.length) {
        actionSelectedFiles.textContent = "No files selected.";
        return;
    }

    selectedActionFiles.forEach((file, index) => {
        const row = document.createElement("div");
        row.className = "selected-file";

        const details = document.createElement("span");
        details.textContent = `${file.name} (${formatFileSize(file.size)})`;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-selected-file";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove ${file.name}`);
        removeButton.addEventListener("click", () => {
            selectedActionFiles.splice(index, 1);
            renderSelectedActionFiles();
        });

        row.append(details, removeButton);
        actionSelectedFiles.appendChild(row);
    });
}


function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function resetActionFiles() {
    selectedActionFiles = [];
    if (actionFileInput) actionFileInput.value = "";
    actionFileDropZone?.classList.remove("drag-active");
    renderSelectedActionFiles();
}


function setupActionFileControls() {
    if (!actionFileInput || !actionFileDropZone) return;

    chooseActionFilesButton?.addEventListener("click", event => {
        event.stopPropagation();
        actionFileInput.click();
    });

    actionFileDropZone.addEventListener("click", event => {
        if (event.target !== chooseActionFilesButton) actionFileInput.click();
    });

    actionFileDropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            actionFileInput.click();
        }
    });

    ["dragenter", "dragover"].forEach(eventName => {
        actionFileDropZone.addEventListener(eventName, event => {
            event.preventDefault();
            actionFileDropZone.classList.add("drag-active");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        actionFileDropZone.addEventListener(eventName, event => {
            event.preventDefault();
            actionFileDropZone.classList.remove("drag-active");
        });
    });

    actionFileDropZone.addEventListener("drop", event => {
        addActionFiles(event.dataTransfer?.files);
    });

    actionFileInput.addEventListener("change", () => {
        addActionFiles(actionFileInput.files);
        actionFileInput.value = "";
    });

    renderSelectedActionFiles();
}


function getCreatedActionID(result) {
    const value =
        result?.ActionID ??
        result?.actionID ??
        result?.action?.ActionID ??
        result?.id;

    const actionID = Number(value);
    return Number.isInteger(actionID) && actionID > 0 ? actionID : null;
}


async function uploadActionFiles(actionID) {
    for (let index = 0; index < selectedActionFiles.length; index += 1) {
        const file = selectedActionFiles[index];
        const data = new FormData();
        data.append("File", file, file.name);

        showActionFormMessage(
            `Uploading file ${index + 1} of ${selectedActionFiles.length}: ${file.name}`,
            "success"
        );

        const response = await fetch(`/api/actions/${actionID}/files`, {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            body: data
        });

        await readResponse(response);
    }
}


// ========================================
// CREATE ACTION
// ========================================

async function createAction(event) {

    event.preventDefault();

    if (!actionForm) {
        return;
    }

    clearActionFormMessage();

    const formData =
        new FormData(actionForm);

    const role =
        window.kbdCurrentUser?.Role;

    const sessionValue =
        formData.get("SessionID");

    const actionData = {
        ProgrammeID:
            Number(formData.get("ProgrammeID")),
        SessionID:
            sessionValue
                ? Number(sessionValue)
                : null,
        AssignedTo:
            Number(formData.get("AssignedTo")),
        Title:
            String(formData.get("Title") || "").trim(),
        Description:
            String(formData.get("Description") || "").trim(),
        DueDate:
            formData.get("DueDate") || null
    };

    if (role === "Admin") {
        actionData.AssignedBy =
            Number(formData.get("AssignedBy"));
    }

    if (
        !Number.isInteger(actionData.ProgrammeID) ||
        actionData.ProgrammeID <= 0 ||
        !Number.isInteger(actionData.AssignedTo) ||
        actionData.AssignedTo <= 0 ||
        !actionData.Title
    ) {
        showActionFormMessage(
            "Programme, participant and title are required.",
            "error"
        );
        return;
    }

    if (
        role === "Admin" &&
        (
            !Number.isInteger(actionData.AssignedBy) ||
            actionData.AssignedBy <= 0
        )
    ) {
        showActionFormMessage(
            "Please select the Coach assigning this action.",
            "error"
        );
        return;
    }

    const submitButton =
        actionForm.querySelector('[type="submit"]');

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating...";
    }

    let createdActionID = null;

    try {

        const response = await fetch(
            "/api/actions",
            {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify(actionData)
            }
        );

        const result =
            await readResponse(response);

        createdActionID = getCreatedActionID(result);

        if (selectedActionFiles.length) {
            if (!createdActionID) {
                throw new Error(
                    "The Action was created, but the server did not return its ID. Attachments were not uploaded."
                );
            }

            if (submitButton) submitButton.textContent = "Uploading...";
            await uploadActionFiles(createdActionID);
        }

        showActionFormMessage(
            selectedActionFiles.length
                ? "Action and supporting files created successfully."
                : result.message || "Action created successfully.",
            "success"
        );

        actionForm.reset();
        resetActionFiles();
        await loadActions();

        window.setTimeout(
            () => {
                actionFormPanel?.classList.add("hidden");
                clearActionFormMessage();
            },
            1200
        );

    } catch (error) {

        console.error(
            "Error creating action:",
            error
        );

        if (createdActionID) {
            const message =
                `Action ${createdActionID} was created, but one or more files were not uploaded: ${error.message}`;

            actionForm.reset();
            resetActionFiles();
            await loadActions();
            actionFormPanel?.classList.add("hidden");
            clearActionFormMessage();
            showActionMessage(message, "error");
            return;
        }

        showActionFormMessage(
            error.message,
            "error"
        );

    } finally {

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Create Action";
        }

    }

}

const actionsContainer =
    document.getElementById(
        "actions-container"
    );

actionsContainer?.addEventListener(
    "click",
    event => {
        const button =
            event.target.closest(
                ".delete-action-button"
            );

        if (!button) return;

        const actionID =
            Number(
                button.dataset.actionId
            );

        if (!Number.isInteger(actionID)) {
            alert("Invalid Action ID.");
            return;
        }

        deleteAction(
            actionID,
            button.dataset.actionTitle ||
                "this Action",
            button
        );
    }
);

// ========================================
// MESSAGES
// ========================================

function showActionMessage(message, type) {

    let element =
        document.getElementById("action-message");

    const container =
        document.getElementById("actions-container");

    if (!container?.parentElement) {
        return;
    }

    if (!element) {
        element = document.createElement("div");
        element.id = "action-message";
        container.parentElement.insertBefore(
            element,
            container
        );
    }

    element.className = `form-message ${type}`;
    element.textContent = message;
    element.hidden = false;

    window.clearTimeout(element.messageTimer);

    element.messageTimer = window.setTimeout(
        () => {
            element.hidden = true;
        },
        3000
    );

}


function showActionFormMessage(message, type) {

    const element =
        document.getElementById("action-form-message");

    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = `form-message ${type}`;

}


function clearActionFormMessage() {

    const element =
        document.getElementById("action-form-message");

    if (!element) {
        return;
    }

    element.textContent = "";
    element.className = "form-message";

}


// ========================================
// START
// ========================================

function initialiseActionPage() {

    if (actionPageInitialised) {
        return;
    }

    actionPageInitialised = true;

    configureActionFormForRole();

    actionStatusFilter?.addEventListener(
        "change",
        displayFilteredActions
    );

    actionSearch?.addEventListener(
        "input",
        displayFilteredActions
    );

    showActionFormButton?.addEventListener(
        "click",
        () => {
            actionFormPanel?.classList.remove("hidden");
            actionFormPanel?.scrollIntoView({
                behavior: "smooth"
            });
        }
    );

    closeActionFormButton?.addEventListener(
        "click",
        () => {
            actionFormPanel?.classList.add("hidden");
            actionForm?.reset();
            resetActionFiles();
            clearActionFormMessage();
        }
    );

    actionForm?.addEventListener(
        "submit",
        createAction
    );

    setupActionFileControls();

    loadActions();
    loadActionFormOptions();

}


if (window.kbdCurrentUser) {
    initialiseActionPage();
} else {
    window.addEventListener(
        "kbd-auth-ready",
        initialiseActionPage,
        {
            once: true
        }
    );
}
