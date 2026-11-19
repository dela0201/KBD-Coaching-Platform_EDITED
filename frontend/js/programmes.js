// ========================================
// KBD PROGRAMMES PAGE
// ========================================

const API_URL = "";
const PROGRAMME_STATUSES = [
    "Draft",
    "Active",
    "Completed",
    "Archived"
];
const PROGRAMME_FILE_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
const PROGRAMME_FILE_EXTENSIONS = new Set([
    "pdf", "doc", "docx", "xls", "xlsx"
]);
const PROGRAMME_MAX_FILE_SIZE = 10 * 1024 * 1024;
let programmesPageInitialised = false;
let selectedProgrammeFiles = [];

const programmeFileInput = document.getElementById("programme-file-input");
const programmeFileDropZone = document.getElementById("programme-file-drop-zone");
const chooseProgrammeFilesButton = document.getElementById("choose-programme-files");
const programmeSelectedFiles = document.getElementById("programme-selected-files");

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function canDeleteProgrammes() {
    return (
        window.kbdCurrentUser?.Role ===
        "Admin"
    );
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

function canManageProgrammes() {
    return ["Admin", "Coach"].includes(window.kbdCurrentUser?.Role);
}

function showProgrammeFormMessage(message = "", type = "") {
    const element = document.getElementById("programme-form-message");
    if (!element) return;

    element.textContent = message;
    element.className = type
        ? `form-message ${type}`
        : "form-message";

    if (message) {
        element.setAttribute("role", type === "error" ? "alert" : "status");
        element.setAttribute("aria-live", "polite");
    } else {
        element.removeAttribute("role");
        element.removeAttribute("aria-live");
    }
}

function showProgrammePageMessage(message, type = "success") {
    const container = document.getElementById("programmes-container");
    if (!container?.parentElement) return;

    let element = document.getElementById("programme-page-message");
    if (!element) {
        element = document.createElement("div");
        element.id = "programme-page-message";
        container.parentElement.insertBefore(element, container);
    }

    element.textContent = message;
    element.className = `form-message ${type}`;
    element.hidden = false;

    window.clearTimeout(element.messageTimer);
    element.messageTimer = window.setTimeout(() => {
        element.hidden = true;
    }, 5000);
}

function showProgrammesMessage(title, message) {
    const container = document.getElementById("programmes-container");
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function formatProgrammeDate(dateString) {
    if (!dateString) return "Not set";

    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "Not set";

    return date.toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// ========================================
// LOAD AND DISPLAY PROGRAMMES
// ========================================

async function loadProgrammes() {
    const container = document.getElementById("programmes-container");
    if (!container) return;

    if (window.KBDUI?.showLoading) {
        KBDUI.showLoading("programmes-container", "Loading programmes...");
    } else {
        container.textContent = "Loading programmes...";
    }

    try {
        const response = await fetch(`${API_URL}/api/programmes`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });
        const programmes = await readResponse(response);

        if (!Array.isArray(programmes)) {
            throw new Error("The server returned invalid programme data.");
        }

        displayProgrammes(programmes);
    } catch (error) {
        console.error("Error loading programmes:", error);

        if (window.KBDUI?.showError) {
            KBDUI.showError(
                "programmes-container",
                error.message,
                loadProgrammes
            );
        } else {
            showProgrammesMessage("Unable to load programmes", error.message);
        }
    }
}

function displayProgrammes(programmes) {
    const container = document.getElementById("programmes-container");
    if (!container) return;

    container.innerHTML = "";

    if (programmes.length === 0) {
        if (window.KBDUI?.showEmpty) {
            KBDUI.showEmpty(
                "programmes-container",
                "No programmes found",
                "There are currently no coaching programmes available."
            );
        } else {
            showProgrammesMessage(
                "No programmes found",
                "There are currently no coaching programmes available."
            );
        }
        return;
    }

    programmes.forEach(programme => {
        const programmeID = Number(programme.ProgrammeID);
        const currentStatus = PROGRAMME_STATUSES.includes(programme.Status)
            ? programme.Status
            : "Draft";
        const card = document.createElement("article");

        if (!Number.isInteger(programmeID) || programmeID < 1) return;

        card.className = "programme-card";
        card.innerHTML = `

        
            <h3>${escapeHTML(programme.ProgrammeName)}</h3>

            <p>${escapeHTML(programme.Description || "No description provided.")}</p>


            
            <div class="programme-details">
                
                <span>
                    <strong>Dates:</strong>
                    ${escapeHTML(formatProgrammeDate(programme.StartDate))}
                    –
                    ${escapeHTML(formatProgrammeDate(programme.EndDate))}
                </span>
            </div>

            ${
    canDeleteProgrammes()
        ? `
            <div class="programme-card-actions">
                <button
                    type="button"
                    class="danger-button delete-programme-button"
                    data-programme-id="${programme.ProgrammeID}"
                    data-programme-name="${KBDUI.escapeHTML(
                        programme.ProgrammeName ||
                        "this Programme"
                    )}"
                >
                    Delete Programme
                </button>
            </div>
        `
        : ""
}
        `;

        if (canManageProgrammes()) {
            const statusLabel = document.createElement("label");
            const statusSelect = document.createElement("select");
            const selectID = `programme-status-${programmeID}`;

            statusLabel.className = "programme-status-label";
            statusLabel.htmlFor = selectID;
            statusLabel.textContent = "Status";

            statusSelect.id = selectID;
            statusSelect.className = "programme-status-select";
            statusSelect.dataset.programmeId = programmeID;
            statusSelect.dataset.previousStatus = currentStatus;

            PROGRAMME_STATUSES.forEach(status => {
                const option = document.createElement("option");
                option.value = status;
                option.textContent = status;
                option.selected = status === currentStatus;
                statusSelect.appendChild(option);
            });

            statusSelect.addEventListener("change", handleStatusChange);
            card.append(statusLabel, statusSelect);
        } else {
            const status = document.createElement("span");
            status.className = "programme-status";
            status.textContent = currentStatus;
            card.appendChild(status);
        }

        card.appendChild(createProgrammeAttachments(programmeID));

        container.appendChild(card);
        loadProgrammeFiles(programmeID);
    });
}

// ========================================
// PROGRAMME DOCUMENTS
// ========================================

function programmeFileExtension(fileName) {
    return String(fileName || "").split(".").pop().toLowerCase();
}

function validateProgrammeFile(file) {
    const validType =
        PROGRAMME_FILE_TYPES.has(file.type) ||
        PROGRAMME_FILE_EXTENSIONS.has(programmeFileExtension(file.name));

    if (!validType) {
        return `${file.name} is not an accepted PDF, Word or Excel document.`;
    }

    if (file.size > PROGRAMME_MAX_FILE_SIZE) {
        return `${file.name} exceeds the 10 MB file-size limit.`;
    }

    return null;
}

function formatProgrammeFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function addProgrammeFiles(fileList) {
    const incomingFiles = Array.from(fileList || []);
    const errors = [];

    incomingFiles.forEach(file => {
        const error = validateProgrammeFile(file);
        if (error) {
            errors.push(error);
            return;
        }

        const duplicate = selectedProgrammeFiles.some(existing =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (!duplicate) selectedProgrammeFiles.push(file);
    });

    renderSelectedProgrammeFiles();

    if (errors.length) {
        showProgrammeFormMessage(errors.join(" "), "error");
    } else if (incomingFiles.length) {
        showProgrammeFormMessage();
    }
}

function renderSelectedProgrammeFiles() {
    if (!programmeSelectedFiles) return;
    programmeSelectedFiles.innerHTML = "";

    if (!selectedProgrammeFiles.length) {
        programmeSelectedFiles.textContent = "No documents selected.";
        return;
    }

    selectedProgrammeFiles.forEach((file, index) => {
        const row = document.createElement("div");
        row.className = "selected-file";

        const details = document.createElement("span");
        details.textContent = `${file.name} (${formatProgrammeFileSize(file.size)})`;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-selected-file";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove ${file.name}`);
        removeButton.addEventListener("click", () => {
            selectedProgrammeFiles.splice(index, 1);
            renderSelectedProgrammeFiles();
        });

        row.append(details, removeButton);
        programmeSelectedFiles.appendChild(row);
    });
}

function resetProgrammeFiles() {
    selectedProgrammeFiles = [];
    if (programmeFileInput) programmeFileInput.value = "";
    programmeFileDropZone?.classList.remove("drag-active");
    renderSelectedProgrammeFiles();
}

function setupProgrammeFileControls() {
    if (!programmeFileInput || !programmeFileDropZone) return;

    chooseProgrammeFilesButton?.addEventListener("click", event => {
        event.stopPropagation();
        programmeFileInput.click();
    });

    programmeFileDropZone.addEventListener("click", event => {
        if (event.target !== chooseProgrammeFilesButton) programmeFileInput.click();
    });

    programmeFileDropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            programmeFileInput.click();
        }
    });

    ["dragenter", "dragover"].forEach(eventName => {
        programmeFileDropZone.addEventListener(eventName, event => {
            event.preventDefault();
            programmeFileDropZone.classList.add("drag-active");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        programmeFileDropZone.addEventListener(eventName, event => {
            event.preventDefault();
            programmeFileDropZone.classList.remove("drag-active");
        });
    });

    programmeFileDropZone.addEventListener("drop", event => {
        addProgrammeFiles(event.dataTransfer?.files);
    });

    programmeFileInput.addEventListener("change", () => {
        addProgrammeFiles(programmeFileInput.files);
        programmeFileInput.value = "";
    });

    renderSelectedProgrammeFiles();
}

function getCreatedProgrammeID(result) {
    const value =
        result?.ProgrammeID ??
        result?.programmeID ??
        result?.programme?.ProgrammeID ??
        result?.id;
    const programmeID = Number(value);
    return Number.isInteger(programmeID) && programmeID > 0
        ? programmeID
        : null;
}

async function uploadProgrammeFiles(programmeID, files, showFormProgress = false) {
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const data = new FormData();
        data.append("File", file, file.name);

        if (showFormProgress) {
            showProgrammeFormMessage(
                `Uploading document ${index + 1} of ${files.length}: ${file.name}`,
                "success"
            );
        }

        try {
            const response = await fetch(
                `${API_URL}/api/programmes/${programmeID}/files`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { Accept: "application/json" },
                    body: data
                }
            );

            await readResponse(response);
        } catch (error) {
            const remaining = files.slice(index + 1).map(item => item.name);
            const skipped = remaining.length ? ` Still to upload: ${remaining.join(", ")}.` : "";
            throw new Error(`Could not upload "${file.name}": ${error.message}${skipped}`);
        }
    }
}

function createProgrammeAttachments(programmeID) {
    const section = document.createElement("section");
    section.className = "programme-attachments";

    const heading = document.createElement("div");
    heading.className = "programme-attachments-heading";

    const title = document.createElement("strong");
    title.textContent = "Programme Documents";
    heading.appendChild(title);

    if (canManageProgrammes()) {
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "add-programme-files secondary-button";
        addButton.textContent = "Add Documents";

        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf,.doc,.docx,.xls,.xlsx";
        input.multiple = true;
        input.hidden = true;

        addButton.addEventListener("click", () => input.click());
        input.addEventListener("change", async () => {
            const files = Array.from(input.files || []);
            input.value = "";
            if (!files.length) return;

            const errors = files.map(validateProgrammeFile).filter(Boolean);
            if (errors.length) {
                showProgrammePageMessage(errors.join(" "), "error");
                return;
            }

            addButton.disabled = true;
            addButton.textContent = "Uploading...";

            try {
                await uploadProgrammeFiles(programmeID, files);
                showProgrammePageMessage(
                    "Programme documents uploaded successfully.",
                    "success"
                );
                await loadProgrammeFiles(programmeID);
            } catch (error) {
                console.error("Error uploading Programme documents:", error);
                showProgrammePageMessage(
                    `${error.message} Check the document list, then use Add Documents to retry any missing files.`,
                    "error"
                );
                await loadProgrammeFiles(programmeID);
            } finally {
                addButton.disabled = false;
                addButton.textContent = "Add Documents";
            }
        });

        heading.append(addButton, input);
    }

    const list = document.createElement("div");
    list.id = `programme-files-${programmeID}`;
    list.className = "programme-files-list";
    list.setAttribute("aria-live", "polite");
    list.textContent = "Loading documents...";

    section.append(heading, list);
    return section;
}

async function loadProgrammeFiles(programmeID) {
    const container = document.getElementById(`programme-files-${programmeID}`);
    if (!container) return;

    container.textContent = "Loading documents...";
    container.classList.remove("error-state");

    try {
        const response = await fetch(`${API_URL}/api/programmes/${programmeID}/files`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });
        const files = await readResponse(response);

        if (!Array.isArray(files)) {
            throw new Error("The server returned invalid Programme document data.");
        }

        renderProgrammeFiles(programmeID, files);
    } catch (error) {
        console.error(`Error loading Programme ${programmeID} documents:`, error);
        container.textContent = error.message;
        container.classList.add("error-state");
    }
}

function renderProgrammeFiles(programmeID, files) {
    const container = document.getElementById(`programme-files-${programmeID}`);
    if (!container) return;

    container.innerHTML = "";
    container.classList.remove("error-state");

    if (!files.length) {
        container.textContent = "No Programme documents.";
        return;
    }

    files.forEach(file => {
        const fileID = Number(file.UploadedFileID);
        if (!Number.isInteger(fileID) || fileID < 1) return;

        const row = document.createElement("div");
        row.className = "programme-file-row";

        const details = document.createElement("div");
        details.className = "programme-file-details";

        const link = document.createElement("a");
        link.href = `${API_URL}/api/programme-files/${fileID}/download`;
        link.textContent = file.OriginalFileName || "Download document";

        const size = document.createElement("span");
        size.textContent = formatProgrammeFileSize(Number(file.FileSize) || 0);

        details.append(link, size);
        row.appendChild(details);

        if (canManageProgrammes()) {
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-programme-file";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", async () => {
                await deleteProgrammeFile(programmeID, fileID, deleteButton);
            });
            row.appendChild(deleteButton);
        }

        container.appendChild(row);
    });
}

async function deleteProgramme(
    programmeID,
    programmeName,
    button
) {
    const confirmation = window.prompt(
        `Permanently delete "${programmeName}"?\n\n` +
        "This will also delete related Sessions, Actions, " +
        "Assessments, Learning Materials, progress and documents.\n\n" +
        `Type "${programmeName}" to confirm.`
    );

    if (confirmation === null) return;

    if (confirmation.trim() !== programmeName.trim()) {
        alert(
            "The Programme name did not match. " +
            "The Programme was not deleted."
        );
        return;
    }

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const response = await fetch(
            `/api/programmes/${programmeID}`,
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
                "The Programme could not be deleted."
            );
        }

        await loadProgrammes();
    } catch (error) {
        console.error(
            "Unable to delete Programme:",
            error
        );

        alert(error.message);

        button.disabled = false;
        button.textContent = originalText;
    }
}

async function deleteProgrammeFile(programmeID, fileID, button) {
    if (!window.confirm("Delete this Programme document? This cannot be undone.")) {
        return;
    }

    button.disabled = true;

    try {
        const response = await fetch(`${API_URL}/api/programme-files/${fileID}`, {
            method: "DELETE",
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });
        const result = await readResponse(response);
        showProgrammePageMessage(
            result.message || "Programme document deleted successfully.",
            "success"
        );
        await loadProgrammeFiles(programmeID);
    } catch (error) {
        console.error("Error deleting Programme document:", error);
        showProgrammePageMessage(error.message, "error");
        button.disabled = false;
    }
}

// ========================================
// CREATE PROGRAMME
// ========================================

async function submitProgramme(event) {
    event.preventDefault();

    if (!canManageProgrammes()) {
        showProgrammeFormMessage(
            "You do not have permission to create programmes.",
            "error"
        );
        return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const programmeData = {
        ProgrammeName: String(formData.get("ProgrammeName") || "").trim(),
        Description: String(formData.get("Description") || "").trim(),
        StartDate: String(formData.get("StartDate") || "") || null,
        EndDate: String(formData.get("EndDate") || "") || null,
        Status: String(formData.get("Status") || "Active")
    };
    const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"]'
    );

    showProgrammeFormMessage();

    if (!programmeData.ProgrammeName) {
        showProgrammeFormMessage(
            "Programme name is required.",
            "error"
        );
        return;
    }

    if (!PROGRAMME_STATUSES.includes(programmeData.Status)) {
        showProgrammeFormMessage("Please select a valid status.", "error");
        return;
    }

    if (
        programmeData.StartDate &&
        programmeData.EndDate &&
        programmeData.EndDate < programmeData.StartDate
    ) {
        showProgrammeFormMessage(
            "End date cannot be earlier than start date.",
            "error"
        );
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating...";
    }

    let createdProgrammeID = null;

    try {
        const response = await fetch(`${API_URL}/api/programmes`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(programmeData)
        });

        const result = await readResponse(response);
        createdProgrammeID = getCreatedProgrammeID(result);

        if (selectedProgrammeFiles.length) {
            if (!createdProgrammeID) {
                throw new Error(
                    "The Programme was created, but the server did not return its ID. Documents were not uploaded."
                );
            }

            if (submitButton) submitButton.textContent = "Uploading...";
            await uploadProgrammeFiles(
                createdProgrammeID,
                selectedProgrammeFiles,
                true
            );
        }

        showProgrammeFormMessage(
            selectedProgrammeFiles.length
                ? "Programme and documents created successfully."
                : result.message || "Programme created successfully.",
            "success"
        );
        form.reset();
        resetProgrammeFiles();
        await loadProgrammes();
    } catch (error) {
        console.error("Error creating programme:", error);

        if (createdProgrammeID) {
            const message =
                `"${programmeData.ProgrammeName}" was created. ${error.message} ` +
                "Check the programme’s document list, then use Add Documents to retry any missing files.";

            form.reset();
            resetProgrammeFiles();
            await loadProgrammes();
            document.getElementById("programme-form-panel")?.classList.add("hidden");
            showProgrammeFormMessage();
            showProgrammePageMessage(message, "error");
            return;
        }

        showProgrammeFormMessage(error.message, "error");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Create Programme";
        }
    }
}

// ========================================
// UPDATE PROGRAMME STATUS
// ========================================

async function handleStatusChange(event) {
    const statusSelect = event.currentTarget;
    const programmeID = Number(statusSelect.dataset.programmeId);
    const previousStatus = statusSelect.dataset.previousStatus;
    const newStatus = statusSelect.value;

    statusSelect.disabled = true;

    try {
        await updateProgrammeStatus(programmeID, newStatus);
        statusSelect.dataset.previousStatus = newStatus;
    } catch (error) {
        console.error("Error updating programme status:", error);
        statusSelect.value = previousStatus;
        window.alert(error.message);
    } finally {
        statusSelect.disabled = false;
    }
}

async function updateProgrammeStatus(programmeID, status) {
    if (!Number.isInteger(programmeID) || programmeID < 1) {
        throw new Error("Invalid programme ID.");
    }

    if (!PROGRAMME_STATUSES.includes(status)) {
        throw new Error("Invalid programme status.");
    }

    const response = await fetch(
        `${API_URL}/api/programmes/${programmeID}/status`,
        {
            method: "PUT",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ Status: status })
        }
    );

    return readResponse(response);
}

// ========================================
// START
// ========================================

const programmesContainer =
    document.getElementById(
        "programmes-container"
    );

programmesContainer?.addEventListener(
    "click",
    event => {
        const button =
            event.target.closest(
                ".delete-programme-button"
            );

        if (!button) return;

        const programmeID =
            Number(
                button.dataset.programmeId
            );

        if (!Number.isInteger(programmeID)) {
            alert("Invalid Programme ID.");
            return;
        }

        deleteProgramme(
            programmeID,
            button.dataset.programmeName ||
                "this Programme",
            button
        );
    }
);

async function initialiseProgrammesPage() {
    if (window.kbdCurrentUser?.Role === "Participant") return;

    if (programmesPageInitialised) return;
    programmesPageInitialised = true;

    const showFormButton = document.getElementById("show-programme-form");
    const closeFormButton = document.getElementById("close-programme-form");
    const formPanel = document.getElementById("programme-form-panel");
    const programmeForm = document.getElementById("programme-form");
    const canManage = canManageProgrammes();

    if (showFormButton) {
        showFormButton.hidden = !canManage;
        showFormButton.addEventListener("click", () => {
            formPanel?.classList.remove("hidden");
            formPanel?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }

    if (!canManage) formPanel?.classList.add("hidden");

    closeFormButton?.addEventListener("click", () => {
        formPanel?.classList.add("hidden");
        programmeForm?.reset();
        resetProgrammeFiles();
        showProgrammeFormMessage();
    });

    programmeForm?.addEventListener("submit", submitProgramme);

    setupProgrammeFileControls();

    await loadProgrammes();

}

if (window.kbdCurrentUser) {
    initialiseProgrammesPage();
} else {
    window.addEventListener(
        "kbd-auth-ready",
        initialiseProgrammesPage,
        { once: true }
    );
}


// ========================================
// PARTICIPANT VIEW: PROGRAMMES
// ----------------------------------------
// Runs only for Participants on programmes.html. It shows a
// client-portal style page and hides the standard one.
// Coach, Admin and Corporate users see the page unchanged.
// Uses existing API routes only (no backend change).
// Styles: the participant sections at the end of CSS/style.css.
// To switch it off, delete this section.
// ========================================
(() => {
    let ppStarted = false;

    const PP_PAGE = (window.location.pathname.split("/").pop() || "")
        .replace(/\.html$/, "")
        .toLowerCase();


    // ========================================
    // HELPERS
    // ========================================

    function el(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = String(text);
        return element;
    }

    function today() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function parseDate(value) {
        if (!value) return null;
        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    function daysFromToday(value) {
        const date = parseDate(value);
        return date ? Math.round((date - today()) / 86400000) : null;
    }

    function formatDate(value, options) {
        const date = parseDate(value);
        if (!date) return "";
        return date.toLocaleDateString(
            "en-ZA",
            options || { day: "numeric", month: "short", year: "numeric" }
        );
    }

    function formatTime(value) {
        const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
        return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
    }

    function personName(first, last) {
        return `${first || ""} ${last || ""}`.trim();
    }

    function formatSize(bytes) {
        const size = Number(bytes || 0);
        if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`;
        if (size >= 1024) return `${Math.round(size / 1024)} KB`;
        return size ? `${size} B` : "";
    }

    async function readResponse(response) {
        if (window.KBDUI && typeof KBDUI.readResponse === "function") {
            return KBDUI.readResponse(response);
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(result.error || "The request could not be completed.");
            error.status = response.status;
            throw error;
        }

        return result;
    }

    async function getJSON(url) {
        const response = await fetch(url, {
            method: "GET",
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });

        if (response.status === 404) {
            const error = new Error("Not available.");
            error.status = 404;
            throw error;
        }

        return readResponse(response);
    }

    async function sendJSON(method, url, body) {
        const response = await fetch(url, {
            method,
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(body)
        });

        return readResponse(response);
    }

    async function loadAll(map) {
        const keys = Object.keys(map);
        const results = await Promise.allSettled(keys.map(key => getJSON(map[key])));
        const data = {};
        const failed = [];

        results.forEach((result, index) => {
            const key = keys[index];

            if (result.status === "fulfilled" && Array.isArray(result.value)) {
                data[key] = result.value;
            } else {
                data[key] = [];
                failed.push({ key, status: result.reason?.status });
                if (result.status === "rejected") {
                    console.error(`Unable to load ${key}:`, result.reason);
                }
            }
        });

        return { data, failed };
    }

    function queryParameter(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    // ========================================
    // SHARED COMPONENTS
    // ========================================

    function buildShell(options) {
        const standard = document.querySelector(".main-content > .dashboard");
        if (!standard) return null;

        document.body.classList.add("participant-portal");

        const heading = document.querySelector(".topbar h1");
        if (heading) heading.textContent = options.pageTitle;

        const shell = el("section", "pd pp");
        shell.id = "participant-page";

        const intro = el("div", "pp-intro");
        const introText = el("div", "pp-intro-text");
        introText.appendChild(el("p", "eyebrow", options.eyebrow));
        introText.appendChild(el("h2", "", options.heading));
        introText.appendChild(el("p", "", options.description));
        const summary = el("div", "pp-intro-stats");
        summary.id = "pp-summary";
        intro.append(introText, summary);

        const message = el("div", "pd-message");
        message.id = "pp-message";
        message.hidden = true;

        const toolbar = el("div", "pp-toolbar");
        toolbar.id = "pp-toolbar";

        const content = el("div", "pp-content");
        content.id = "pp-content";
        content.setAttribute("aria-live", "polite");
        content.appendChild(el("p", "pp-loading", "Loading..."));

        shell.append(intro, message, toolbar, content);
        standard.insertAdjacentElement("afterend", shell);

        return { shell, summary, toolbar, content };
    }

    function setSummary(container, items) {
        container.innerHTML = "";
        items.forEach(item => {
            const chip = el("div", "pp-summary-item");
            chip.appendChild(el("strong", "", item.value));
            chip.appendChild(el("span", "", item.label));
            container.appendChild(chip);
        });
    }

    function showMessage(text, type) {
        const box = document.getElementById("pp-message");
        if (!box) return;
        box.textContent = text || "";
        box.hidden = !text;
        box.classList.toggle("pp-message-info", type === "info");
    }

    function emptyState(title, text) {
        const box = el("div", "pd-empty");
        box.appendChild(el("strong", "", title));
        if (text) box.appendChild(el("span", "", text));
        return box;
    }

    function segmented(options, current, onChange, label) {
        const group = el("div", "pp-segmented");
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", label);

        options.forEach(option => {
            const button = el("button", "pp-segment", option.label);
            button.type = "button";
            button.setAttribute("aria-pressed", String(option.value === current));
            if (option.value === current) button.classList.add("is-active");
            button.addEventListener("click", () => {
                group.querySelectorAll(".pp-segment").forEach(other => {
                    other.classList.remove("is-active");
                    other.setAttribute("aria-pressed", "false");
                });
                button.classList.add("is-active");
                button.setAttribute("aria-pressed", "true");
                onChange(option.value);
            });
            group.appendChild(button);
        });

        return group;
    }

    function programmeSelect(programmes, current, onChange) {
        const wrapper = el("label", "pp-select");
        wrapper.appendChild(el("span", "pp-visually-hidden", "Filter by programme"));
        const select = el("select");
        select.appendChild(new Option("All programmes", ""));
        programmes.forEach(programme => {
            select.appendChild(new Option(programme.ProgrammeName, String(programme.ProgrammeID)));
        });
        select.value = current || "";
        select.addEventListener("change", () => onChange(select.value));
        wrapper.appendChild(select);
        return wrapper;
    }

    function searchBox(placeholder, onInput) {
        const wrapper = el("label", "pp-search");
        wrapper.appendChild(el("span", "pp-visually-hidden", placeholder));
        const input = el("input");
        input.type = "search";
        input.placeholder = placeholder;
        input.addEventListener("input", () => onInput(input.value.trim().toLowerCase()));
        wrapper.appendChild(input);
        return wrapper;
    }

    // A "Documents" toggle that lazy-loads a file list.
    function filesToggle(label, listURL, downloadURL) {
        const wrapper = el("div", "pp-files");
        const button = el("button", "pd-link-button", label);
        button.type = "button";
        button.setAttribute("aria-expanded", "false");
        const list = el("ul", "pp-file-list");
        list.hidden = true;
        let loaded = false;

        button.addEventListener("click", async () => {
            const open = list.hidden;
            list.hidden = !open;
            button.setAttribute("aria-expanded", String(open));
            if (!open || loaded) return;

            list.innerHTML = "";
            list.appendChild(el("li", "pp-file-note", "Loading documents..."));

            try {
                const files = await getJSON(listURL);
                loaded = true;
                list.innerHTML = "";

                if (!Array.isArray(files) || !files.length) {
                    list.appendChild(el("li", "pp-file-note", "No documents attached."));
                    return;
                }

                files.forEach(file => {
                    const item = el("li", "pp-file");
                    const link = el("a", "", file.OriginalFileName || "Document");
                    link.href = downloadURL(file.UploadedFileID);
                    link.setAttribute("download", "");
                    const meta = el("span", "pp-file-meta", [formatSize(file.FileSize), formatDate(file.CreatedAt)].filter(Boolean).join(" · "));
                    item.append(link, meta);
                    list.appendChild(item);
                });
            } catch (error) {
                list.innerHTML = "";
                list.appendChild(el("li", "pp-file-note", error.message || "Documents could not be loaded."));
            }
        });

        wrapper.append(button, list);
        return wrapper;
    }

    function progressBar(percent, label) {
        const bar = el("div", "pd-bar");
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(percent));
        bar.setAttribute("aria-label", label);
        const fill = el("span", "pd-bar-fill");
        fill.style.width = `${percent}%`;
        bar.appendChild(fill);
        return bar;
    }

    function dateBadge(value) {
        const date = parseDate(value);
        const badge = el("div", "pd-date-badge");
        badge.appendChild(el("span", "pd-date-month", date ? date.toLocaleDateString("en-ZA", { month: "short" }) : ""));
        badge.appendChild(el("strong", "pd-date-day", date ? date.getDate() : "?"));
        return badge;
    }

    function statusTag(text, tone) {
        return el("span", `pd-tag ${tone ? `pp-tag-${tone}` : ""}`.trim(), text);
    }

    // ========================================
    // PROGRAMMES
    // ========================================

    async function renderProgrammesPage() {
        const ui = buildShell({
            pageTitle: "My Programmes",
            eyebrow: "YOUR PROGRAMMES",
            heading: "Programmes you are part of",
            description: "Track your progress, see what's next and open the documents your coach has shared."
        });
        if (!ui) return;

        const { data, failed } = await loadAll({
            programmes: "/api/programmes",
            progress: "/api/progress",
            sessions: "/api/sessions",
            actions: "/api/actions"
        });

        if (failed.length) showMessage("Some information could not be loaded. Please refresh to try again.");

        const progressBy = new Map(data.progress.map(row => [Number(row.ProgrammeID), row]));
        const programmes = data.programmes
            .filter(p => p.Status !== "Archived")
            .sort((a, b) => (a.Status === "Active" ? 0 : 1) - (b.Status === "Active" ? 0 : 1));

        const active = programmes.filter(p => p.Status === "Active").length;
        const average = data.progress.length
            ? Math.round(data.progress.reduce((sum, row) => sum + Number(row.ProgressPercentage || 0), 0) / data.progress.length)
            : null;

        setSummary(ui.summary, [
            { value: active, label: "Active" },
            { value: programmes.length - active, label: "Completed" },
            { value: average === null ? "–" : `${average}%`, label: "Average progress" }
        ]);

        ui.content.innerHTML = "";

        if (!programmes.length) {
            ui.content.appendChild(emptyState("No programmes yet", "Programmes you join will show here."));
            return;
        }

        const grid = el("div", "pp-card-grid");

        programmes.forEach(programme => {
            const id = Number(programme.ProgrammeID);
            const progress = progressBy.get(id);
            const percent = Math.max(0, Math.min(100, Math.round(Number(progress?.ProgressPercentage || 0))));
            const openActions = data.actions.filter(a => Number(a.ProgrammeID) === id && ["Pending", "In Progress"].includes(a.Status)).length;
            const nextSession = data.sessions
                .filter(s => Number(s.ProgrammeID) === id && ["Scheduled", "Rescheduled"].includes(s.Status) && (daysFromToday(s.SessionDate) ?? -1) >= 0)
                .sort((a, b) => `${a.SessionDate} ${a.StartTime || ""}`.localeCompare(`${b.SessionDate} ${b.StartTime || ""}`))[0];

            const card = el("article", "panel pp-card");

            const top = el("div", "pp-card-top");
            top.appendChild(el("h3", "", programme.ProgrammeName));
            top.appendChild(statusTag(programme.Status, programme.Status === "Active" ? "green" : "blue"));
            card.appendChild(top);

            const dates = [formatDate(programme.StartDate), formatDate(programme.EndDate)].filter(Boolean);
            if (dates.length) card.appendChild(el("p", "pp-card-meta", dates.join(" – ")));
            if (programme.OrganisationName) card.appendChild(el("p", "pp-card-meta", programme.OrganisationName));
            if (programme.Description) card.appendChild(el("p", "pp-card-text", programme.Description));

            const progressRow = el("div", "pp-progress-row");
            progressRow.appendChild(el("span", "", progress?.Status || "Not Started"));
            progressRow.appendChild(el("strong", "pd-percent", `${percent}%`));
            card.append(progressRow, progressBar(percent, `${programme.ProgrammeName} progress`));

            const facts = el("ul", "pp-facts");
            const actionsFact = el("li");
            actionsFact.appendChild(el("strong", "", openActions));
            actionsFact.appendChild(el("span", "", openActions === 1 ? "open action" : "open actions"));
            const sessionFact = el("li");
            sessionFact.appendChild(el("strong", "", nextSession ? formatDate(nextSession.SessionDate, { day: "numeric", month: "short" }) : "–"));
            sessionFact.appendChild(el("span", "", "next session"));
            facts.append(actionsFact, sessionFact);
            card.appendChild(facts);

            card.appendChild(filesToggle(
                "Programme documents",
                `/api/programmes/${encodeURIComponent(id)}/files`,
                fileID => `/api/programme-files/${encodeURIComponent(fileID)}/download`
            ));

            const links = el("div", "pp-card-links");
            const actionsLink = el("a", "", "Actions");
            actionsLink.href = `actions.html?programme=${encodeURIComponent(id)}`;
            const materialsLink = el("a", "", "Materials");
            materialsLink.href = `materials.html?programme=${encodeURIComponent(id)}`;
            const sessionsLink = el("a", "", "Sessions");
            sessionsLink.href = `sessions.html?programme=${encodeURIComponent(id)}`;
            links.append(actionsLink, sessionsLink, materialsLink);
            card.appendChild(links);

            grid.appendChild(card);
        });

        ui.content.appendChild(grid);
    }


    // ========================================
    // START (Participants on programmes.html only)
    // ========================================

    function start(user) {
        if (ppStarted || !user || user.Role !== "Participant") return;
        if (PP_PAGE !== "programmes") return;
        ppStarted = true;

        renderProgrammesPage().catch(error => {
            console.error("Participant page error:", error);
            showMessage(error.message || "This page could not be loaded.");
        });
    }

    if (window.kbdCurrentUser) {
        start(window.kbdCurrentUser);
    } else {
        window.addEventListener(
            "kbd-auth-ready",
            event => start(event.detail || window.kbdCurrentUser),
            { once: true }
        );
    }
})();
