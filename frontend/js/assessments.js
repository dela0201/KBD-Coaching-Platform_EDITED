const API_URL = "";



let assessmentsInitialised = false;
let selectedAssessmentID = null;
let selectedAssessmentName = "";
let assessmentUploadInProgress = false;
let pendingAssessmentFiles = [];


function getCurrentUser() {

    return window.kbdCurrentUser || null;

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

function canManageAssessments() {
    return [
        "Admin",
        "Coach"
    ].includes(
        window.kbdCurrentUser?.Role
    );
}

async function readResponse(response) {

    if (window.KBDUI?.readResponse) {

        return window.KBDUI.readResponse(response);

    }



    const data = await response.json().catch(() => ({}));



    if (!response.ok) {

        throw new Error(data.error || "The request could not be completed.");

    }



    return data;

}


function assessmentFetch(url, options = {}) {

    return fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.headers || {})
        }
    });

}



function showContainerMessage(containerID, title, message) {

    const container = document.getElementById(containerID);



    if (!container) return;



    container.innerHTML = `

        <div class="empty-state">

            <h3>${escapeHTML(title)}</h3>

            <p>${escapeHTML(message)}</p>

        </div>

    `;

}



function showFormMessage(elementID, message, type = "") {

    const element = document.getElementById(elementID);



    if (!element) return;



    element.textContent = message;

    element.className = type ? `form-message ${type}` : "form-message";

}



function formatAssessmentDate(dateString) {

    if (!dateString) return "Unknown";



    const date = new Date(dateString);



    if (Number.isNaN(date.getTime())) return "Unknown";



    return date.toLocaleDateString("en-ZA", {

        day: "2-digit",

        month: "short",

        year: "numeric"

    });

}



async function loadAssessments() {

    const container = document.getElementById("assessments-container");



    if (!container) return;



    if (window.KBDUI?.showLoading) {

        window.KBDUI.showLoading("assessments-container", "Loading assessments...");

    } else {

        container.textContent = "Loading assessments...";

    }



    try {

        const response = await assessmentFetch(`${API_URL}/api/assessments`);

        const assessments = await readResponse(response);



        if (!Array.isArray(assessments)) {

            throw new Error("The server returned invalid assessment data.");

        }



        displayAssessments(assessments);

    } catch (error) {

        console.error("Error loading assessments:", error);



        if (window.KBDUI?.showError) {

            window.KBDUI.showError("assessments-container", error.message, loadAssessments);

        } else {

            showContainerMessage(

                "assessments-container",

                "Unable to load assessments",

                error.message

            );

        }

    }

}



function displayAssessments(assessments) {

    const container = document.getElementById("assessments-container");

    const user = getCurrentUser();



    if (!container) return;



    container.innerHTML = "";



    if (assessments.length === 0) {

        if (window.KBDUI?.showEmpty) {

            window.KBDUI.showEmpty(

                "assessments-container",

                "No assessments found",

                "There are currently no assessments available for your programmes."

            );

        } else {

            showContainerMessage(

                "assessments-container",

                "No assessments found",

                "There are currently no assessments available for your programmes."

            );

        }



        return;

    }



    assessments.forEach(assessment => {

        const card = document.createElement("article");

        const canAddResponse = ["Admin", "Coach", "Participant"].includes(user?.Role);



        card.className = "assessment-card";

        card.innerHTML = `

            <div class="assessment-card-top">

                <span class="assessment-type">

                    ${escapeHTML(assessment.Type || "General")}

                </span>

            </div>



            <h3>${escapeHTML(assessment.AssessmentName)}</h3>



            <p class="assessment-description">

                ${escapeHTML(assessment.Description || "No description provided.")}

            </p>

${
    canManageAssessments()
        ? `
            <div class="assessment-card-actions">
                <button
                    type="button"
                    class="danger-button delete-assessment-button"
                    data-assessment-id="${assessment.AssessmentID}"
                    data-assessment-title="${KBDUI.escapeHTML(
                        assessment.Title || "this Assessment"
                    )}"
                >
                    Delete Assessment
                </button>
            </div>
        `
        : ""
}

            <div class="assessment-details">

                <span>

                    <strong>Programme:</strong>

                    ${escapeHTML(assessment.ProgrammeName || "Not assigned")}

                </span>



                <span>

                    <strong>Created:</strong>

                    ${escapeHTML(formatAssessmentDate(assessment.CreatedAt))}

                </span>

            </div>



            <div class="assessment-actions">

                ${canAddResponse ? `

                    <button class="add-response-button" type="button">

                        Add Response

                    </button>

                ` : ""}



                <button class="view-responses-button" type="button">

                    View Responses

                </button>

                <button
                    class="view-assessment-files-button"
                    type="button"
                >
                    Documents
                </button>

            </div>

        `;



        card.querySelector(".add-response-button")?.addEventListener("click", () => {

            openResponseForm(assessment.AssessmentID, assessment.AssessmentName);

        });



        card.querySelector(".view-responses-button")?.addEventListener("click", () => {

            loadAssessmentResponses(assessment.AssessmentID, assessment.AssessmentName);

        });

        card.querySelector(".view-assessment-files-button")
            ?.addEventListener("click", () => {
                openAssessmentFiles(
                    assessment.AssessmentID,
                    assessment.AssessmentName
                );
            });



        container.appendChild(card);

    });

}

async function deleteAssessment(
    assessmentID,
    assessmentTitle,
    button
) {
    const confirmed = window.confirm(
        `Delete "${assessmentTitle}"?\n\n` +
        "Its responses and uploaded documents will also be deleted. " +
        "This cannot be undone."
    );

    if (!confirmed) return;

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const response = await fetch(
            `/api/assessments/${assessmentID}`,
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
                "The Assessment could not be deleted."
            );
        }

        await loadAssessments();
    } catch (error) {
        console.error(
            "Unable to delete Assessment:",
            error
        );

        alert(error.message);

        button.disabled = false;
        button.textContent = originalText;
    }
}

async function loadAssessmentResponses(assessmentID, assessmentName) {

    const numericAssessmentID = Number(assessmentID);

    if (!Number.isInteger(numericAssessmentID) || numericAssessmentID < 1) {
        return;
    }

    const panel = document.getElementById("assessment-responses-panel");

    const container = document.getElementById("assessment-responses-container");

    const title = document.getElementById("assessment-responses-title");



    if (!panel || !container || !title) return;



    panel.classList.remove("hidden");

    title.textContent = `${assessmentName} Responses`;

    container.textContent = "Loading responses...";

    panel.scrollIntoView({ behavior: "smooth", block: "start" });



    try {

        const response = await assessmentFetch(

            `${API_URL}/api/assessments/${encodeURIComponent(numericAssessmentID)}/responses`

        );

        const responses = await readResponse(response);



        if (!Array.isArray(responses)) {

            throw new Error("The server returned invalid response data.");

        }



        displayAssessmentResponses(responses);

    } catch (error) {

        console.error("Error loading assessment responses:", error);

        showContainerMessage(

            "assessment-responses-container",

            "Unable to load responses",

            error.message

        );

    }

}



function displayAssessmentResponses(responses) {

    const container = document.getElementById("assessment-responses-container");



    if (!container) return;



    container.innerHTML = "";



    if (responses.length === 0) {

        showContainerMessage(

            "assessment-responses-container",

            "No responses yet",

            "No responses are available for this assessment."

        );

        return;

    }



    responses.forEach(item => {

        const responseCard = document.createElement("article");

        const participantName = `${item.FirstName || ""} ${item.LastName || ""}`.trim();

        const score = item.Score === null || item.Score === undefined

            ? "Not scored"

            : `${item.Score}/10`;



        responseCard.className = "assessment-response-card";

        responseCard.innerHTML = `

            <div class="response-heading">

                <div>

                    <strong>${escapeHTML(participantName || "Participant")}</strong>

                    <span>${escapeHTML(formatAssessmentDate(item.CompletedAt))}</span>

                </div>

                <span class="response-score">${escapeHTML(score)}</span>

            </div>



            <div class="response-question">

                <strong>Question</strong>

                <p>${escapeHTML(item.Question)}</p>

            </div>



            <div class="response-answer">

                <strong>Answer</strong>

                <p>${escapeHTML(item.Answer || "No answer provided.")}</p>

            </div>

        `;



        container.appendChild(responseCard);

    });

}



async function loadAssessmentProgrammes() {

    const select = document.getElementById("assessment-programme");



    if (!select) return;



    try {

        const response = await assessmentFetch(`${API_URL}/api/programmes`);

        const programmes = await readResponse(response);



        if (!Array.isArray(programmes)) {

            throw new Error("The server returned invalid programme data.");

        }



        select.innerHTML = '<option value="">Select a programme</option>';



        programmes.forEach(programme => {

            const option = document.createElement("option");

            option.value = programme.ProgrammeID;

            option.textContent = programme.ProgrammeName;

            select.appendChild(option);

        });

    } catch (error) {

        console.error("Error loading programmes:", error);

        showFormMessage("assessment-form-message", error.message, "error");

    }

}



async function loadResponseParticipants() {

    const select = document.getElementById("response-participant");



    if (!select || getCurrentUser()?.Role === "Participant") return;



    try {

        const response = await assessmentFetch(`${API_URL}/api/users`);

        const users = await readResponse(response);



        if (!Array.isArray(users)) {

            throw new Error("The server returned invalid participant data.");

        }



        select.innerHTML = '<option value="">Select a participant</option>';



        users

            .filter(user => user.Role === "Participant")

            .forEach(participant => {

                const option = document.createElement("option");

                option.value = participant.UserID;

                option.textContent = `${participant.FirstName} ${participant.LastName}`;

                select.appendChild(option);

            });

    } catch (error) {

        console.error("Error loading participants:", error);

        showFormMessage("response-form-message", error.message, "error");

    }

}



function renderPendingAssessmentFiles() {
    const container = document.getElementById(
        "assessment-create-selected-files"
    );

    if (!container) return;

    container.innerHTML = "";

    if (!pendingAssessmentFiles.length) {
        container.textContent = "No documents selected.";
        return;
    }

    pendingAssessmentFiles.forEach((file, index) => {
        const row = document.createElement("div");
        row.className = "selected-file";

        const name = document.createElement("span");
        name.textContent = `${file.name} (${formatFileSize(file.size)})`;

        const removeButton = document.createElement("button");
        removeButton.className = "remove-selected-file";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove ${file.name}`);
        removeButton.addEventListener("click", () => {
            pendingAssessmentFiles.splice(index, 1);
            renderPendingAssessmentFiles();
        });

        row.append(name, removeButton);
        container.appendChild(row);
    });
}

function addPendingAssessmentFiles(fileList) {
    const files = Array.from(fileList || []);

    try {
        files.forEach(validateAssessmentFile);
    } catch (error) {
        showFormMessage("assessment-form-message", error.message, "error");
        return;
    }

    files.forEach(file => {
        const duplicate = pendingAssessmentFiles.some(existing =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (!duplicate) pendingAssessmentFiles.push(file);
    });

    renderPendingAssessmentFiles();
}

async function uploadNewAssessmentDocuments(assessmentID, files) {
    const progress = document.getElementById(
        "assessment-create-upload-progress"
    );
    const progressBar = document.getElementById(
        "assessment-create-upload-progress-bar"
    );
    const progressText = document.getElementById(
        "assessment-create-upload-progress-text"
    );

    if (!files.length) return;

    if (progress) progress.hidden = false;
    if (progressBar) progressBar.style.width = "0%";

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const formData = new FormData();
        formData.append("File", file, file.name);

        if (progressText) {
            progressText.textContent =
                `Uploading document ${index + 1} of ${files.length}...`;
        }

        const response = await assessmentFetch(
            `/api/assessments/${assessmentID}/files`,
            { method: "POST", body: formData }
        );

        await readResponse(response);

        if (progressBar) {
            progressBar.style.width =
                `${Math.round(((index + 1) / files.length) * 100)}%`;
        }
    }

    if (progressText) progressText.textContent = "Upload complete";
}

function initialiseAssessmentCreationFiles() {
    const dropZone = document.getElementById(
        "assessment-create-drop-zone"
    );
    const fileInput = document.getElementById(
        "assessment-create-file-input"
    );
    const chooseButton = document.getElementById(
        "choose-assessment-create-files"
    );

    if (!dropZone || !fileInput) return;

    renderPendingAssessmentFiles();

    chooseButton?.addEventListener("click", event => {
        event.stopPropagation();
        fileInput.click();
    });

    dropZone.addEventListener("click", event => {
        if (event.target !== chooseButton) fileInput.click();
    });

    dropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });

    ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.add("drag-active");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.remove("drag-active");
        });
    });

    dropZone.addEventListener("drop", event => {
        addPendingAssessmentFiles(event.dataTransfer?.files);
    });

    fileInput.addEventListener("change", () => {
        addPendingAssessmentFiles(fileInput.files);
        fileInput.value = "";
    });
}

function openResponseForm(assessmentID, assessmentName) {

    const panel = document.getElementById("response-form-panel");

    const form = document.getElementById("response-form");

    const assessmentInput = document.getElementById("response-assessment-id");

    const title = document.getElementById("response-form-title");

    const participantSelect = document.getElementById("response-participant");



    if (!panel || !form || !assessmentInput || !title) return;



    form.reset();

    assessmentInput.value = assessmentID;

    title.textContent = `Add Response: ${assessmentName}`;

    showFormMessage("response-form-message", "");



    if (participantSelect && getCurrentUser()?.Role === "Participant") {

        participantSelect.required = false;

        participantSelect.closest(".form-group")?.classList.add("hidden");

    }



    panel.classList.remove("hidden");

    panel.scrollIntoView({ behavior: "smooth", block: "start" });

}



async function submitAssessment(event) {

    event.preventDefault();



    const form = event.currentTarget;

    const formData = new FormData(form);

    const programmeID = Number(formData.get("ProgrammeID"));

    const assessmentName = String(formData.get("AssessmentName") || "").trim();



    showFormMessage("assessment-form-message", "");



    if (!Number.isInteger(programmeID) || programmeID < 1 || !assessmentName) {

        showFormMessage(

            "assessment-form-message",

            "Programme and assessment name are required.",

            "error"

        );

        return;

    }

    const submitButton = form.querySelector('[type="submit"]');

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating...";
    }

    const filesToUpload = [...pendingAssessmentFiles];



    try {

        const response = await assessmentFetch(`${API_URL}/api/assessments`, {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({

                ProgrammeID: programmeID,

                AssessmentName: assessmentName,

                Description: String(formData.get("Description") || "").trim(),

                Type: String(formData.get("Type") || "General").trim()

            })

        });



        const result = await readResponse(response);
        const assessmentID = Number(result.AssessmentID);

        let uploadError = null;

        if (filesToUpload.length) {
            if (!Number.isInteger(assessmentID) || assessmentID < 1) {
                uploadError = new Error(
                    "The assessment was created, but the server did not return its ID."
                );
            } else {
                try {
                    if (submitButton) {
                        submitButton.textContent = "Uploading documents...";
                    }

                    await uploadNewAssessmentDocuments(
                        assessmentID,
                        filesToUpload
                    );
                } catch (error) {
                    uploadError = error;
                }
            }
        }

        showFormMessage(

            "assessment-form-message",

            uploadError
                ? `Assessment created, but a document could not be uploaded: ${uploadError.message}`
                : "Assessment and documents created successfully.",

            uploadError ? "error" : "success"

        );

        form.reset();

        pendingAssessmentFiles = [];
        renderPendingAssessmentFiles();

        const progress = document.getElementById(
            "assessment-create-upload-progress"
        );
        if (progress) progress.hidden = true;

        await loadAssessments();

    } catch (error) {

        console.error("Error creating assessment:", error);

        showFormMessage("assessment-form-message", error.message, "error");

    } finally {

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Create Assessment";
        }

    }

}



async function submitAssessmentResponse(event) {

    event.preventDefault();



    const form = event.currentTarget;

    const formData = new FormData(form);

    const assessmentID = Number(formData.get("AssessmentID"));

    const question = String(formData.get("Question") || "").trim();

    const rawScore = String(formData.get("Score") || "").trim();

    const user = getCurrentUser();

    const payload = {

        AssessmentID: assessmentID,

        Question: question,

        Answer: String(formData.get("Answer") || "").trim(),

        Score: rawScore === "" ? null : Number(rawScore)

    };



    if (user?.Role !== "Participant") {

        payload.UserID = Number(formData.get("UserID"));

    }



    showFormMessage("response-form-message", "");



    if (!Number.isInteger(assessmentID) || assessmentID < 1 || !question) {

        showFormMessage(

            "response-form-message",

            "Assessment and question are required.",

            "error"

        );

        return;

    }



    if (user?.Role !== "Participant" && (!Number.isInteger(payload.UserID) || payload.UserID < 1)) {

        showFormMessage("response-form-message", "Please select a participant.", "error");

        return;

    }



    if (payload.Score !== null && (!Number.isFinite(payload.Score) || payload.Score < 0 || payload.Score > 10)) {

        showFormMessage("response-form-message", "Score must be between 0 and 10.", "error");

        return;

    }

    const submitButton = form.querySelector('[type="submit"]');

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Saving...";
    }



    try {

        const response = await assessmentFetch(`${API_URL}/api/assessment-responses`, {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify(payload)

        });



        await readResponse(response);

        showFormMessage("response-form-message", "Response saved successfully.", "success");



        const savedAssessmentID = assessmentID;

        form.reset();

        document.getElementById("response-assessment-id").value = savedAssessmentID;

    } catch (error) {

        console.error("Error saving response:", error);

        showFormMessage("response-form-message", error.message, "error");

    } finally {

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Save Response";
        }

    }

}

async function openAssessmentFiles(assessmentID, assessmentName) {
    const numericID = Number(assessmentID);
    const panel = document.getElementById("assessment-files-panel");
    const title = document.getElementById("assessment-files-title");

    if (!Number.isInteger(numericID) || numericID < 1 || !panel || !title) {
        return;
    }

    selectedAssessmentID = numericID;
    selectedAssessmentName = assessmentName || "Assessment";
    title.textContent = `${selectedAssessmentName} Documents`;

    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    showFormMessage("assessment-upload-message", "");
    renderSelectedAssessmentFiles();
    await loadAssessmentFiles();
}

async function loadAssessmentFiles() {
    const container =
        document.getElementById("assessment-files-container");

    if (!container || !selectedAssessmentID) return;

    container.textContent = "Loading assessment documents...";

    try {
        const response = await assessmentFetch(
            `${API_URL}/api/assessments/${encodeURIComponent(selectedAssessmentID)}/files`
        );

        const files = await readResponse(response);

        if (!Array.isArray(files)) {
            throw new Error("The server returned invalid file information.");
        }

        displayAssessmentFiles(files);
    } catch (error) {
        console.error("Unable to load assessment documents:", error);

        showContainerMessage(
            "assessment-files-container",
            "Unable to load documents",
            error.message
        );
    }
}

function displayAssessmentFiles(files) {
    const container =
        document.getElementById("assessment-files-container");

    const canDelete =
        ["Admin", "Coach"].includes(getCurrentUser()?.Role);

    if (!container) return;

    container.innerHTML = "";

    if (files.length === 0) {
        showContainerMessage(
            "assessment-files-container",
            "No documents uploaded",
            "There are currently no documents attached to this assessment."
        );

        return;
    }

    files.forEach(file => {
        const fileID = Number(file.UploadedFileID);

        if (!Number.isInteger(fileID) || fileID < 1) return;

        const uploaderName =
            `${file.UploaderFirstName || ""} ${file.UploaderLastName || ""}`.trim();

        const item = document.createElement("article");
        item.className = "uploaded-file-item";

        item.innerHTML = `
            <div class="uploaded-file-information">
                <strong>
                    ${escapeHTML(file.OriginalFileName)}
                </strong>

                <span>
                    ${escapeHTML(formatFileSize(file.FileSize))}
                    · Uploaded by
                    ${escapeHTML(uploaderName || "KBD user")}
                    · ${escapeHTML(formatAssessmentDate(file.CreatedAt))}
                </span>
            </div>

            <div class="uploaded-file-actions">
                <a
                    class="secondary-button"
                    href="/api/assessment-files/${fileID}/download"
                >
                    Download
                </a>

                ${canDelete ? `
                    <button
                        class="delete-assessment-file secondary-button"
                        type="button"
                        data-file-id="${fileID}"
                    >
                        Delete
                    </button>
                ` : ""}
            </div>
        `;

        container.appendChild(item);
    });

    container
        .querySelectorAll(".delete-assessment-file")
        .forEach(button => {
            button.addEventListener("click", () => {
                deleteAssessmentFile(button);
            });
        });
}

function formatFileSize(value) {
    const bytes = Number(value);

    if (!Number.isFinite(bytes) || bytes < 0) {
        return "Unknown size";
    }

    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateAssessmentFile(file) {
    const permittedExtensions = [
        ".pdf", ".doc", ".docx", ".xls", ".xlsx"
    ];

    const fileName = file.name.toLowerCase();

    const permitted = permittedExtensions.some(extension =>
        fileName.endsWith(extension)
    );

    if (!permitted) {
        throw new Error(
            "Select a PDF, Word or Excel document."
        );
    }

    if (file.size > 10 * 1024 * 1024) {
        throw new Error("The selected file must not exceed 10 MB.");
    }

    if (file.size < 1) {
        throw new Error("The selected file is empty.");
    }
}

function uploadAssessmentFile(file) {
    if (!selectedAssessmentID || assessmentUploadInProgress) return;

    try {
        validateAssessmentFile(file);
    } catch (error) {
        showFormMessage(
            "assessment-upload-message",
            error.message,
            "error"
        );

        return;
    }

    const progress = document.getElementById(
        "assessment-upload-progress"
    );

    const progressBar = document.getElementById(
        "assessment-upload-progress-bar"
    );

    const progressText = document.getElementById(
        "assessment-upload-progress-text"
    );

    const dropZone = document.getElementById(
        "assessment-drop-zone"
    );

    const formData = new FormData();
    formData.append("File", file);

    const request = new XMLHttpRequest();

    assessmentUploadInProgress = true;
    showFormMessage("assessment-upload-message", "");

    if (progress) progress.hidden = false;
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Uploading...";
    dropZone?.classList.add("uploading");

    request.open(
        "POST",
        `/api/assessments/${selectedAssessmentID}/files`
    );

    request.withCredentials = true;
    request.setRequestHeader("Accept", "application/json");

    request.upload.addEventListener("progress", event => {
        if (!event.lengthComputable) return;

        const percentage = Math.round(
            (event.loaded / event.total) * 100
        );

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent =
                `Uploading... ${percentage}%`;
        }
    });

    request.addEventListener("load", async () => {
        let result = {};

        try {
            result = JSON.parse(request.responseText || "{}");
        } catch (error) {
            result = {};
        }

        assessmentUploadInProgress = false;
        dropZone?.classList.remove("uploading");

        if (request.status < 200 || request.status >= 300) {
            if (progress) progress.hidden = true;

            showFormMessage(
                "assessment-upload-message",
                result.error || "The file could not be uploaded.",
                "error"
            );

            return;
        }

        if (progressBar) progressBar.style.width = "100%";
        if (progressText) progressText.textContent = "Upload complete";

        showFormMessage(
            "assessment-upload-message",
            result.message || "File uploaded successfully.",
            "success"
        );

        document.getElementById("assessment-file-input").value = "";
        await loadAssessmentFiles();

        setTimeout(() => {
            if (progress) progress.hidden = true;
        }, 1200);
    });

    request.addEventListener("error", () => {
        assessmentUploadInProgress = false;
        dropZone?.classList.remove("uploading");

        if (progress) progress.hidden = true;

        showFormMessage(
            "assessment-upload-message",
            "The file upload could not connect to the server.",
            "error"
        );
    });

    request.send(formData);
}

function renderSelectedAssessmentFiles(files = []) {
    const container = document.getElementById("assessment-selected-files");
    if (!container) return;

    container.innerHTML = "";

    if (!files.length) {
        container.textContent = "No documents selected.";
        return;
    }

    files.forEach(file => {
        const row = document.createElement("div");
        row.className = "selected-file";

        const name = document.createElement("span");
        name.textContent = `${file.name} (${formatFileSize(file.size)})`;

        row.appendChild(name);
        container.appendChild(row);
    });
}

function uploadAssessmentDocument(file, index, total) {
    return new Promise((resolve, reject) => {
        const progressBar = document.getElementById(
            "assessment-upload-progress-bar"
        );
        const progressText = document.getElementById(
            "assessment-upload-progress-text"
        );
        const formData = new FormData();
        const request = new XMLHttpRequest();

        formData.append("File", file, file.name);

        request.open(
            "POST",
            `/api/assessments/${selectedAssessmentID}/files`
        );
        request.withCredentials = true;
        request.setRequestHeader("Accept", "application/json");

        request.upload.addEventListener("progress", event => {
            if (!event.lengthComputable) return;

            const percentage = Math.round(
                (event.loaded / event.total) * 100
            );

            if (progressBar) progressBar.style.width = `${percentage}%`;
            if (progressText) {
                progressText.textContent =
                    `Uploading document ${index + 1} of ${total}: ${percentage}%`;
            }
        });

        request.addEventListener("load", () => {
            let result = {};

            try {
                result = JSON.parse(request.responseText || "{}");
            } catch (error) {
                result = {};
            }

            if (request.status < 200 || request.status >= 300) {
                reject(new Error(
                    result.error || `${file.name} could not be uploaded.`
                ));
                return;
            }

            resolve(result);
        });

        request.addEventListener("error", () => {
            reject(new Error(
                `${file.name} could not connect to the upload server.`
            ));
        });

        request.send(formData);
    });
}

async function uploadAssessmentFiles(fileList) {
    if (!selectedAssessmentID || assessmentUploadInProgress) return;

    const files = Array.from(fileList || []);
    if (!files.length) return;

    try {
        files.forEach(validateAssessmentFile);
    } catch (error) {
        showFormMessage("assessment-upload-message", error.message, "error");
        return;
    }

    const progress = document.getElementById("assessment-upload-progress");
    const progressBar = document.getElementById(
        "assessment-upload-progress-bar"
    );
    const progressText = document.getElementById(
        "assessment-upload-progress-text"
    );
    const dropZone = document.getElementById("assessment-drop-zone");
    const fileInput = document.getElementById("assessment-file-input");

    assessmentUploadInProgress = true;
    renderSelectedAssessmentFiles(files);
    showFormMessage("assessment-upload-message", "");

    if (progress) progress.hidden = false;
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Preparing documents...";
    dropZone?.classList.add("uploading");

    try {
        for (let index = 0; index < files.length; index += 1) {
            await uploadAssessmentDocument(files[index], index, files.length);
        }

        if (progressBar) progressBar.style.width = "100%";
        if (progressText) progressText.textContent = "Upload complete";

        showFormMessage(
            "assessment-upload-message",
            `${files.length} document${files.length === 1 ? "" : "s"} uploaded successfully.`,
            "success"
        );

        await loadAssessmentFiles();
    } catch (error) {
        console.error("Unable to upload Assessment documents:", error);
        showFormMessage("assessment-upload-message", error.message, "error");
    } finally {
        assessmentUploadInProgress = false;
        dropZone?.classList.remove("uploading");
        if (fileInput) fileInput.value = "";
        renderSelectedAssessmentFiles();

        window.setTimeout(() => {
            if (progress) progress.hidden = true;
        }, 1200);
    }
}

async function deleteAssessmentFile(button) {
    const fileID = Number(button.dataset.fileId);

    if (!Number.isInteger(fileID) || fileID < 1) return;

    if (!window.confirm("Delete this assessment document?")) {
        return;
    }

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const response = await assessmentFetch(
            `${API_URL}/api/assessment-files/${fileID}`,
            { method: "DELETE" }
        );

        const result = await readResponse(response);

        showFormMessage(
            "assessment-upload-message",
            result.message,
            "success"
        );

        await loadAssessmentFiles();
    } catch (error) {
        console.error("Unable to delete assessment file:", error);

        showFormMessage(
            "assessment-upload-message",
            error.message,
            "error"
        );

        button.disabled = false;
        button.textContent = "Delete";
    }
}

function initialiseAssessmentFileControls() {
    const user = getCurrentUser();
    const canUpload = ["Admin", "Coach"].includes(user?.Role);

    const controls =
        document.getElementById("assessment-upload-controls");

    const dropZone =
        document.getElementById("assessment-drop-zone");

    const fileInput =
        document.getElementById("assessment-file-input");

    const chooseButton =
        document.getElementById("choose-assessment-files");

    if (controls) controls.hidden = !canUpload;

    if (!canUpload || !dropZone || !fileInput) return;

    renderSelectedAssessmentFiles();

    chooseButton?.addEventListener("click", event => {
        event.stopPropagation();

        if (!assessmentUploadInProgress) fileInput.click();
    });

    dropZone.addEventListener("click", event => {
        if (
            event.target !== chooseButton &&
            !assessmentUploadInProgress
        ) {
            fileInput.click();
        }
    });

    dropZone.addEventListener("keydown", event => {
        if (
            event.key === "Enter" ||
            event.key === " "
        ) {
            event.preventDefault();

            if (!assessmentUploadInProgress) {
                fileInput.click();
            }
        }
    });

    ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.add("drag-active");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.remove("drag-active");
        });
    });

    dropZone.addEventListener("drop", event => {
        const files = event.dataTransfer?.files;

        if (files?.length) uploadAssessmentFiles(files);
    });

    fileInput.addEventListener("change", () => {
        const files = fileInput.files;

        if (files?.length) uploadAssessmentFiles(files);
    });
}

async function initialiseAssessmentsPage() {
    if (window.kbdCurrentUser?.Role === "Participant") return;


    if (assessmentsInitialised) return;

    assessmentsInitialised = true;

const assessmentsContainer =
    document.getElementById(
        "assessments-container"
    );

assessmentsContainer?.addEventListener(
    "click",
    event => {
        const button =
            event.target.closest(
                ".delete-assessment-button"
            );

        if (!button) return;

        const assessmentID =
            Number(
                button.dataset.assessmentId
            );

        if (!Number.isInteger(assessmentID)) {
            alert("Invalid Assessment ID.");
            return;
        }

        deleteAssessment(
            assessmentID,
            button.dataset.assessmentTitle ||
                "this Assessment",
            button
        );
    }
);

    const user = getCurrentUser();

    const canCreateAssessments = ["Admin", "Coach"].includes(user?.Role);

    const showAssessmentFormButton = document.getElementById("show-assessment-form");

    const assessmentFormPanel = document.getElementById("assessment-form-panel");

    const responseFormPanel = document.getElementById("response-form-panel");

    const assessmentFilesPanel =
    document.getElementById("assessment-files-panel");

    document.getElementById("close-assessment-files")
    ?.addEventListener("click", () => {
        if (assessmentUploadInProgress) {
            showFormMessage(
                "assessment-upload-message",
                "Please wait for the document upload to finish.",
                "error"
            );

            return;
        }

        assessmentFilesPanel?.classList.add("hidden");

        selectedAssessmentID = null;
        selectedAssessmentName = "";

        const fileInput = document.getElementById(
            "assessment-file-input"
        );

        if (fileInput) fileInput.value = "";
        renderSelectedAssessmentFiles();

        showFormMessage(
            "assessment-upload-message",
            ""
        );
    });

    if (showAssessmentFormButton) {

        showAssessmentFormButton.hidden = !canCreateAssessments;

        showAssessmentFormButton.addEventListener("click", () => {

            assessmentFormPanel?.classList.remove("hidden");

            assessmentFormPanel?.scrollIntoView({ behavior: "smooth", block: "start" });

        });

    }



    document.getElementById("close-assessment-form")?.addEventListener("click", () => {

        assessmentFormPanel?.classList.add("hidden");

        document.getElementById("assessment-form")?.reset();
        pendingAssessmentFiles = [];
        renderPendingAssessmentFiles();

        showFormMessage("assessment-form-message", "");

    });



    document.getElementById("close-response-form")?.addEventListener("click", () => {

        responseFormPanel?.classList.add("hidden");

        document.getElementById("response-form")?.reset();

        showFormMessage("response-form-message", "");

    });



    document.getElementById("close-responses")?.addEventListener("click", () => {

        document.getElementById("assessment-responses-panel")?.classList.add("hidden");

    });



    document.getElementById("assessment-form")?.addEventListener("submit", submitAssessment);

    document.getElementById("response-form")?.addEventListener("submit", submitAssessmentResponse);

    initialiseAssessmentFileControls();

    if (canCreateAssessments) {
        initialiseAssessmentCreationFiles();
    }

    await loadAssessments();



    if (canCreateAssessments) {

        await Promise.all([

            loadAssessmentProgrammes(),

            loadResponseParticipants()

        ]);

    }

}



if (window.kbdCurrentUser) {

    initialiseAssessmentsPage();

} else {

    window.addEventListener("kbd-auth-ready", initialiseAssessmentsPage, { once: true });

}


// ========================================
// PARTICIPANT VIEW: ASSESSMENTS
// ----------------------------------------
// Runs only for Participants on assessments.html. It shows a
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
    // ASSESSMENTS
    // ========================================

    async function renderAssessmentsPage() {
        const ui = buildShell({
            pageTitle: "My Assessments",
            eyebrow: "REFLECT AND MEASURE",
            heading: "Your assessments",
            description: "Answer the assessments for your programmes and look back at what you've submitted."
        });
        if (!ui) return;

        const { data, failed } = await loadAll({
            assessments: "/api/assessments",
            responses: "/api/assessment-responses",
            programmes: "/api/programmes"
        });

        const listUnavailable = failed.some(f => f.key === "assessments");
        if (listUnavailable) {
            showMessage("The list of assessments isn't available from the server right now. Your submitted answers are shown below.", "info");
        } else if (failed.length) {
            showMessage("Some information could not be loaded. Please refresh to try again.");
        }

        const myID = Number(window.kbdCurrentUser?.UserID);
        const responses = data.responses.filter(r => !myID || Number(r.UserID) === myID);
        const responsesBy = new Map();
        responses.forEach(r => {
            const key = Number(r.AssessmentID);
            if (!responsesBy.has(key)) responsesBy.set(key, []);
            responsesBy.get(key).push(r);
        });

        // Without the list route, fall back to assessments known from responses.
        let assessments = data.assessments;
        if (listUnavailable) {
            assessments = [...responsesBy.entries()].map(([id, rows]) => ({
                AssessmentID: id,
                AssessmentName: rows[0].AssessmentName,
                ProgrammeID: rows[0].ProgrammeID,
                ProgrammeName: rows[0].ProgrammeName
            }));
        }

        const programmeNames = new Map(data.programmes.map(p => [Number(p.ProgrammeID), p.ProgrammeName]));
        const state = { view: "todo", programme: queryParameter("programme") || "" };

        function updateSummary() {
            const answered = assessments.filter(a => responsesBy.has(Number(a.AssessmentID))).length;
            setSummary(ui.summary, [
                { value: assessments.length - answered, label: "To answer" },
                { value: answered, label: "Answered" },
                { value: responses.length, label: "Answers given" }
            ]);
        }

        ui.toolbar.append(
            segmented(
                [{ value: "todo", label: "To answer" }, { value: "answered", label: "Answered" }, { value: "all", label: "All" }],
                listUnavailable ? "all" : state.view,
                value => { state.view = value; draw(); },
                "Show assessments"
            ),
            programmeSelect(data.programmes, state.programme, value => { state.programme = value; draw(); })
        );
        if (listUnavailable) state.view = "all";

        function responseForm(assessment, onSaved) {
            const form = el("form", "pp-response-form");
            form.hidden = true;
            const uid = `pp-r-${assessment.AssessmentID}`;

            const qLabel = el("label", "", "Question or prompt");
            qLabel.setAttribute("for", `${uid}-q`);
            const question = el("input");
            question.id = `${uid}-q`;
            question.required = true;
            question.maxLength = 2000;
            question.placeholder = "e.g. What did you learn this week?";

            const aLabel = el("label", "", "Your answer");
            aLabel.setAttribute("for", `${uid}-a`);
            const answer = el("textarea");
            answer.id = `${uid}-a`;
            answer.rows = 4;
            answer.maxLength = 10000;

            const sLabel = el("label", "", "Self-rating out of 10 (optional)");
            sLabel.setAttribute("for", `${uid}-s`);
            const score = el("input");
            score.id = `${uid}-s`;
            score.type = "number";
            score.min = "0";
            score.max = "10";
            score.step = "1";

            const buttons = el("div", "pp-form-buttons");
            const submit = el("button", "primary-button", "Submit answer");
            submit.type = "submit";
            const cancel = el("button", "secondary-button", "Cancel");
            cancel.type = "button";
            cancel.addEventListener("click", () => { form.hidden = true; form.reset(); });
            buttons.append(submit, cancel);

            const note = el("p", "pp-form-note");

            form.append(qLabel, question, aLabel, answer, sLabel, score, buttons, note);

            form.addEventListener("submit", async event => {
                event.preventDefault();
                if (!form.reportValidity()) return;
                submit.disabled = true;
                submit.textContent = "Submitting...";
                note.textContent = "";

                const body = {
                    AssessmentID: Number(assessment.AssessmentID),
                    Question: question.value.trim(),
                    Answer: answer.value.trim()
                };
                if (score.value !== "") body.Score = Number(score.value);

                try {
                    const result = await sendJSON("POST", "/api/assessment-responses", body);
                    const saved = {
                        ResponseID: result.ResponseID,
                        AssessmentID: Number(assessment.AssessmentID),
                        UserID: myID,
                        Question: body.Question,
                        Answer: body.Answer,
                        Score: body.Score ?? null,
                        CompletedAt: new Date().toISOString(),
                        AssessmentName: assessment.AssessmentName
                    };
                    onSaved(saved);
                } catch (error) {
                    note.textContent = error.message || "Your answer could not be saved.";
                    submit.disabled = false;
                    submit.textContent = "Submit answer";
                }
            });

            return form;
        }

        function draw() {
            updateSummary();
            ui.content.innerHTML = "";

            const list = assessments
                .filter(a => !state.programme || String(a.ProgrammeID) === state.programme)
                .filter(a => {
                    const answered = responsesBy.has(Number(a.AssessmentID));
                    return state.view === "all" || (state.view === "answered" ? answered : !answered);
                });

            if (!list.length) {
                ui.content.appendChild(state.view === "todo"
                    ? emptyState("Nothing to answer", "New assessments from your coach will appear here.")
                    : emptyState("No assessments here yet", listUnavailable ? "Answers you submit will be listed here." : "Try another filter."));
                return;
            }

            const grid = el("div", "pp-card-grid");

            list.forEach(assessment => {
                const id = Number(assessment.AssessmentID);
                const mine = (responsesBy.get(id) || []).sort((a, b) => String(b.CompletedAt || "").localeCompare(String(a.CompletedAt || "")));

                const card = el("article", "panel pp-card");
                const top = el("div", "pp-card-top");
                top.appendChild(el("span", "pd-material-type", assessment.Type || "Assessment"));
                top.appendChild(mine.length ? statusTag(`Answered · ${mine.length}`, "green") : statusTag("To answer", "blue"));
                card.appendChild(top);

                card.appendChild(el("h3", "", assessment.AssessmentName || "Assessment"));
                if (assessment.Description) card.appendChild(el("p", "pp-card-text", assessment.Description));
                const programmeName = assessment.ProgrammeName || programmeNames.get(Number(assessment.ProgrammeID));
                if (programmeName) card.appendChild(el("p", "pp-card-meta", programmeName));

                card.appendChild(filesToggle(
                    "Assessment documents",
                    `/api/assessments/${encodeURIComponent(id)}/files`,
                    fileID => `/api/assessment-files/${encodeURIComponent(fileID)}/download`
                ));

                if (mine.length) {
                    const history = el("details", "pp-history");
                    history.appendChild(el("summary", "", `Your answers (${mine.length})`));
                    mine.forEach(r => {
                        const entry = el("div", "pp-history-item");
                        entry.appendChild(el("strong", "", r.Question));
                        if (r.Answer) entry.appendChild(el("p", "", r.Answer));
                        entry.appendChild(el("span", "pp-card-meta", [r.Score !== null && r.Score !== undefined ? `Score ${r.Score}/10` : "", formatDate(r.CompletedAt)].filter(Boolean).join(" · ")));
                        history.appendChild(entry);
                    });
                    card.appendChild(history);
                }

                const form = responseForm(assessment, saved => {
                    responses.push(saved);
                    if (!responsesBy.has(id)) responsesBy.set(id, []);
                    responsesBy.get(id).push(saved);
                    draw();
                    showMessage("Your answer was saved.", "info");
                });

                const answerButton = el("button", "primary-button pp-answer-button", mine.length ? "Add another answer" : "Answer");
                answerButton.type = "button";
                answerButton.addEventListener("click", () => {
                    form.hidden = !form.hidden;
                    if (!form.hidden) form.querySelector("input")?.focus();
                });

                card.append(answerButton, form);
                grid.appendChild(card);
            });

            ui.content.appendChild(grid);
        }

        draw();
    }


    // ========================================
    // START (Participants on assessments.html only)
    // ========================================

    function start(user) {
        if (ppStarted || !user || user.Role !== "Participant") return;
        if (PP_PAGE !== "assessments") return;
        ppStarted = true;

        renderAssessmentsPage().catch(error => {
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
