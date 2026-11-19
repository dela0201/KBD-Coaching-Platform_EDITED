// ========================================

// KBD LEARNING MATERIALS PAGE

// ========================================



const API_URL = "";

let materialsPageInitialised = false;
let selectedMaterialID = null;
let selectedMaterialTitle = "";
let materialUploadInProgress = false;
let pendingMaterialFiles = [];


function getCurrentUser() {

    return window.kbdCurrentUser || null;

}

function canManageMaterials() {
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

    if (window.KBDUI?.readResponse) {

        return window.KBDUI.readResponse(response);

    }



    const result = await response.json().catch(() => ({}));



    if (!response.ok) {

        throw new Error(

            result.error ||

            "The request could not be completed."

        );

    }



    return result;

}



function showMaterialsMessage(title, message) {

    const container = document.getElementById("materials-container");



    if (!container) return;



    container.innerHTML = `

        <div class="empty-state">

            <h3>${escapeHTML(title)}</h3>

            <p>${escapeHTML(message)}</p>

        </div>

    `;

}



function showMaterialFormMessage(message = "", type = "") {

    const element = document.getElementById("material-form-message");



    if (!element) return;



    element.textContent = message;

    element.className = type

        ? `form-message ${type}`

        : "form-message";



    if (message) {

        element.setAttribute(

            "role",

            type === "error" ? "alert" : "status"

        );

        element.setAttribute("aria-live", "polite");

    } else {

        element.removeAttribute("role");

        element.removeAttribute("aria-live");

    }

}



function getSafeMaterialURL(value) {

    const rawURL = String(value || "").trim();



    if (!rawURL) return null;



    try {

        const parsedURL = new URL(rawURL, window.location.origin);



        if (!["http:", "https:"].includes(parsedURL.protocol)) {

            return null;

        }



        if (parsedURL.username || parsedURL.password) {

            return null;

        }



        return parsedURL.href;

    } catch {

        return null;

    }

}



// ========================================

// LOAD MATERIALS

// ========================================



async function loadMaterials() {

    const container = document.getElementById("materials-container");



    if (!container) return;



    if (window.KBDUI?.showLoading) {

        window.KBDUI.showLoading(

            "materials-container",

            "Loading learning materials..."

        );

    } else {

        container.textContent = "Loading learning materials...";

    }



    try {

        const response = await fetch(`${API_URL}/api/materials`, {

            credentials: "same-origin",

            headers: { Accept: "application/json" }

        });

        const materials = await readResponse(response);



        if (!Array.isArray(materials)) {

            throw new Error(

                "The server returned invalid material data."

            );

        }



        displayMaterials(materials);

    } catch (error) {

        console.error("Error loading materials:", error);



        if (window.KBDUI?.showError) {

            window.KBDUI.showError(

                "materials-container",

                error.message,

                loadMaterials

            );

        } else {

            showMaterialsMessage(

                "Unable to load learning materials",

                error.message

            );

        }

    }

}



// ========================================

// DISPLAY MATERIALS

// ========================================



function displayMaterials(materials) {

    const container = document.getElementById("materials-container");



    if (!container) return;



    container.innerHTML = "";



    if (materials.length === 0) {

        if (window.KBDUI?.showEmpty) {

            window.KBDUI.showEmpty(

                "materials-container",

                "No learning materials found",

                "There are currently no learning materials available for your programmes."

            );

        } else {

            showMaterialsMessage(

                "No learning materials found",

                "There are currently no learning materials available for your programmes."

            );

        }



        return;

    }



    materials.forEach(material => {

        const card = document.createElement("article");

        const safeURL = getSafeMaterialURL(material.FileURL);



        card.className = "material-card";

        card.innerHTML = `

            <div class="material-icon" aria-hidden="true">

                ${escapeHTML(getMaterialIcon(material.MaterialType))}

            </div>



            <div class="material-content">

                <div class="material-heading">

                    <div>

                        <span class="material-type">

                            ${escapeHTML(material.MaterialType || "Material")}

                        </span>

                        <h3>${escapeHTML(material.Title)}</h3>

                    </div>

                </div>



                <p class="material-description">

                    ${escapeHTML(

                        material.Description ||

                        "No description provided."

                    )}

                </p>

${
    canManageMaterials()
        ? `
            <div class="material-card-actions">
                <button
                    type="button"
                    class="danger-button delete-material-button"
                    data-material-id="${material.MaterialID}"
                    data-material-title="${KBDUI.escapeHTML(
                        material.Title ||
                        "this Learning Material"
                    )}"
                >
                    Delete Material
                </button>
            </div>
        `
        : ""
}

                <div class="material-details">

                    <span>

                        <strong>Programme:</strong>

                        ${escapeHTML(

                            material.ProgrammeName ||

                            "Not assigned"

                        )}

                    </span>



                    <span>

                        <strong>Added:</strong>

                        ${escapeHTML(

                            formatMaterialDate(material.CreatedAt)

                        )}

                    </span>

                </div>

            </div>

        `;



        const content = card.querySelector(".material-content");


const actions = document.createElement("div");
actions.className = "material-actions";

if (safeURL) {
    const link = document.createElement("a");

    link.href = safeURL;
    link.className = "material-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open External Link";

    actions.appendChild(link);
} else if (material.FileURL) {
    const unavailable = document.createElement("span");

    unavailable.className = "material-unavailable";
    unavailable.textContent = "Invalid external link";

    actions.appendChild(unavailable);
}

const filesButton = document.createElement("button");

filesButton.className = "secondary-button material-files-button";
filesButton.type = "button";
filesButton.textContent = "Documents";

filesButton.addEventListener("click", () => {
    openMaterialFiles(
        material.MaterialID,
        material.Title
    );
});

actions.appendChild(filesButton);
content.appendChild(actions);



        container.appendChild(card);

    });

}

async function deleteMaterial(
    materialID,
    materialTitle,
    button
) {
    const confirmed = window.confirm(
        `Delete "${materialTitle}"?\n\n` +
        "Its uploaded documents will also be deleted. " +
        "This cannot be undone."
    );

    if (!confirmed) return;

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const response = await fetch(
            `/api/materials/${materialID}`,
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
                "The Learning Material could not be deleted."
            );
        }

        await loadMaterials();
    } catch (error) {
        console.error(
            "Unable to delete Learning Material:",
            error
        );

        alert(error.message);

        button.disabled = false;
        button.textContent = originalText;
    }
}

// ========================================

// MATERIAL HELPERS

// ========================================



function getMaterialIcon(type) {

    const icons = {

        pdf: "PDF",

        video: "▶",

        article: "A",

        worksheet: "W",

        link: "↗"

    };



    const normalizedType = String(type || "")

        .trim()

        .toLowerCase();



    return icons[normalizedType] || "KBD";

}



function formatMaterialDate(dateString) {

    if (!dateString) return "Unknown";



    const normalizedDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(
        String(dateString)
    )
        ? `${String(dateString).replace(" ", "T")}Z`
        : dateString;



    const date = new Date(normalizedDate);



    if (Number.isNaN(date.getTime())) return "Unknown";



    return date.toLocaleDateString("en-ZA", {

        day: "2-digit",

        month: "short",

        year: "numeric"

    });

}



// ========================================

// LOAD PROGRAMME OPTIONS

// ========================================



async function loadMaterialProgrammes() {

    const select = document.getElementById("material-programme");



    if (!select) return;



    try {

        const response = await fetch(`${API_URL}/api/programmes`, {

            credentials: "same-origin",

            headers: { Accept: "application/json" }

        });

        const programmes = await readResponse(response);



        if (!Array.isArray(programmes)) {

            throw new Error(

                "The server returned invalid programme data."

            );

        }



        select.innerHTML =

            '<option value="">Select a programme</option>';



        programmes.forEach(programme => {

            const option = document.createElement("option");

            option.value = programme.ProgrammeID;

            option.textContent = programme.ProgrammeName;

            select.appendChild(option);

        });

    } catch (error) {

        console.error("Error loading programmes:", error);

        showMaterialFormMessage(error.message, "error");

    }

}



// ========================================

// CREATE MATERIAL

// ========================================



function renderPendingMaterialFiles() {
    const container = document.getElementById(
        "material-create-selected-files"
    );

    if (!container) return;

    container.innerHTML = "";

    if (!pendingMaterialFiles.length) {
        container.textContent = "No documents selected.";
        return;
    }

    pendingMaterialFiles.forEach((file, index) => {
        const row = document.createElement("div");
        row.className = "selected-file";

        const name = document.createElement("span");
        name.textContent =
            `${file.name} (${formatMaterialFileSize(file.size)})`;

        const removeButton = document.createElement("button");
        removeButton.className = "remove-selected-file";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove ${file.name}`);
        removeButton.addEventListener("click", () => {
            pendingMaterialFiles.splice(index, 1);
            renderPendingMaterialFiles();
        });

        row.append(name, removeButton);
        container.appendChild(row);
    });
}

function addPendingMaterialFiles(fileList) {
    const files = Array.from(fileList || []);

    try {
        files.forEach(validateMaterialFile);
    } catch (error) {
        showMaterialFormMessage(error.message, "error");
        return;
    }

    files.forEach(file => {
        const duplicate = pendingMaterialFiles.some(existing =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (!duplicate) pendingMaterialFiles.push(file);
    });

    renderPendingMaterialFiles();
}

async function uploadNewMaterialDocuments(materialID, files) {
    const progress = document.getElementById(
        "material-create-upload-progress"
    );
    const progressBar = document.getElementById(
        "material-create-upload-progress-bar"
    );
    const progressText = document.getElementById(
        "material-create-upload-progress-text"
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

        const response = await fetch(
            `/api/materials/${materialID}/files`,
            {
                method: "POST",
                credentials: "same-origin",
                headers: { Accept: "application/json" },
                body: formData
            }
        );

        await readResponse(response);

        if (progressBar) {
            progressBar.style.width =
                `${Math.round(((index + 1) / files.length) * 100)}%`;
        }
    }

    if (progressText) progressText.textContent = "Upload complete";
}

function initialiseMaterialCreationFiles() {
    const dropZone = document.getElementById(
        "material-create-drop-zone"
    );
    const fileInput = document.getElementById(
        "material-create-file-input"
    );
    const chooseButton = document.getElementById(
        "choose-material-create-files"
    );

    if (!dropZone || !fileInput) return;

    renderPendingMaterialFiles();

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
        addPendingMaterialFiles(event.dataTransfer?.files);
    });

    fileInput.addEventListener("change", () => {
        addPendingMaterialFiles(fileInput.files);
        fileInput.value = "";
    });
}

async function submitMaterial(event) {

    event.preventDefault();



    const form = event.currentTarget;

    const formData = new FormData(form);

    const materialData = {

        ProgrammeID: Number(formData.get("ProgrammeID")),

        Title: String(formData.get("Title") || "").trim(),

        Description: String(

            formData.get("Description") || ""

        ).trim(),

        MaterialType: String(

            formData.get("MaterialType") || ""

        ).trim(),

        FileURL: String(formData.get("FileURL") || "").trim()

    };



    showMaterialFormMessage();



    if (

        !Number.isInteger(materialData.ProgrammeID) ||

        materialData.ProgrammeID < 1 ||

        !materialData.Title ||

        !materialData.MaterialType

    ) {

        showMaterialFormMessage(

            "Programme, title and material type are required.",

            "error"

        );

        return;

    }



    if (

        materialData.FileURL &&

        !getSafeMaterialURL(materialData.FileURL)

    ) {

        showMaterialFormMessage(

            "Please enter a valid HTTP or HTTPS material link.",

            "error"

        );

        return;

    }



    const submitButton = form.querySelector(

        'button[type="submit"], input[type="submit"]'

    );



    const originalButtonText = submitButton?.textContent;



    if (submitButton) {

        submitButton.disabled = true;

        submitButton.textContent = "Saving...";

    }

    const filesToUpload = [...pendingMaterialFiles];



    try {

        const response = await fetch(`${API_URL}/api/materials`, {

            method: "POST",

            credentials: "same-origin",

            headers: {

                "Content-Type": "application/json",

                Accept: "application/json"

            },

            body: JSON.stringify(materialData)

        });



        const result = await readResponse(response);
        const materialID = Number(result.MaterialID);
        let uploadError = null;

        if (filesToUpload.length) {
            if (!Number.isInteger(materialID) || materialID < 1) {
                uploadError = new Error(
                    "The material was created, but the server did not return its ID."
                );
            } else {
                try {
                    if (submitButton) {
                        submitButton.textContent = "Uploading documents...";
                    }

                    await uploadNewMaterialDocuments(
                        materialID,
                        filesToUpload
                    );
                } catch (error) {
                    uploadError = error;
                }
            }
        }



        showMaterialFormMessage(

            uploadError
                ? `Learning material created, but a document could not be uploaded: ${uploadError.message}`
                : "Learning material and documents saved successfully.",

            uploadError ? "error" : "success"

        );



        form.reset();

        pendingMaterialFiles = [];
        renderPendingMaterialFiles();

        const progress = document.getElementById(
            "material-create-upload-progress"
        );
        if (progress) progress.hidden = true;

        await loadMaterials();

    } catch (error) {

        console.error("Error saving material:", error);

        showMaterialFormMessage(error.message, "error");

    } finally {

        if (submitButton) {

            submitButton.disabled = false;

            submitButton.textContent =
                originalButtonText || "Save Material";

        }

    }

}



// ========================================

// START

// ========================================

function showMaterialUploadMessage(message = "", type = "") {
    const element =
        document.getElementById("material-upload-message");

    if (!element) return;

    element.textContent = message;
    element.className = type
        ? `form-message ${type}`
        : "form-message";
}

async function openMaterialFiles(materialID, title) {
    const numericID = Number(materialID);
    const panel = document.getElementById("material-files-panel");
    const heading = document.getElementById("material-files-title");

    if (!Number.isInteger(numericID) || numericID < 1 || !panel || !heading) {
        return;
    }

    selectedMaterialID = numericID;
    selectedMaterialTitle = title || "Learning Material";
    heading.textContent = `${selectedMaterialTitle} Documents`;

    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    showMaterialUploadMessage();
    renderSelectedMaterialFiles();
    await loadMaterialFiles();
}

async function loadMaterialFiles() {
    const container =
        document.getElementById("material-files-container");

    if (!container || !selectedMaterialID) return;

    container.textContent = "Loading material documents...";

    try {
        const response = await fetch(
            `/api/materials/${encodeURIComponent(selectedMaterialID)}/files`,
            {
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            }
        );

        const files = await readResponse(response);

        if (!Array.isArray(files)) {
            throw new Error("The server returned invalid file information.");
        }

        displayMaterialFiles(files);
    } catch (error) {
        console.error("Unable to load material documents:", error);

        container.innerHTML = `
            <div class="empty-state error-state">
                <h3>Unable to load documents</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function displayMaterialFiles(files) {
    const container =
        document.getElementById("material-files-container");

    const canDelete =
        ["Admin", "Coach"].includes(getCurrentUser()?.Role);

    if (!container) return;

    container.innerHTML = "";

    if (files.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No documents uploaded</h3>
                <p>
                    There are currently no documents attached
                    to this learning material.
                </p>
            </div>
        `;

        return;
    }

    files.forEach(file => {
        const fileID = Number(file.UploadedFileID);

        if (!Number.isInteger(fileID) || fileID < 1) return;

        const uploader =
            `${file.UploaderFirstName || ""} ${file.UploaderLastName || ""}`.trim();

        const item = document.createElement("article");
        item.className = "uploaded-file-item";

        item.innerHTML = `
            <div class="uploaded-file-information">
                <strong>
                    ${escapeHTML(file.OriginalFileName)}
                </strong>

                <span>
                    ${escapeHTML(formatMaterialFileSize(file.FileSize))}
                    · Uploaded by ${escapeHTML(uploader || "KBD user")}
                    · ${escapeHTML(formatMaterialDate(file.CreatedAt))}
                </span>
            </div>

            <div class="uploaded-file-actions">
                <a
                    class="secondary-button"
                    href="/api/material-files/${fileID}/download"
                >
                    Download
                </a>

                ${canDelete ? `
                    <button
                        class="delete-material-file secondary-button"
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
        .querySelectorAll(".delete-material-file")
        .forEach(button => {
            button.addEventListener("click", () => {
                deleteMaterialFile(button);
            });
        });
}

function formatMaterialFileSize(value) {
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

function validateMaterialFile(file) {
    const permittedExtensions = [
        ".pdf", ".doc", ".docx", ".xls", ".xlsx"
    ];

    const permitted = permittedExtensions.some(extension =>
        file.name.toLowerCase().endsWith(extension)
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

function uploadMaterialFile(file) {
    if (!selectedMaterialID || materialUploadInProgress) return;

    try {
        validateMaterialFile(file);
    } catch (error) {
        showMaterialUploadMessage(error.message, "error");
        return;
    }

    const progress =
        document.getElementById("material-upload-progress");

    const progressBar =
        document.getElementById("material-upload-progress-bar");

    const progressText =
        document.getElementById("material-upload-progress-text");

    const dropZone =
        document.getElementById("material-drop-zone");

    const formData = new FormData();
    formData.append("File", file);

    const request = new XMLHttpRequest();

    materialUploadInProgress = true;
    showMaterialUploadMessage();

    if (progress) progress.hidden = false;
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Uploading...";

    dropZone?.classList.add("uploading");

    request.open(
        "POST",
        `/api/materials/${selectedMaterialID}/files`
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
        } catch {
            result = {};
        }

        materialUploadInProgress = false;
        dropZone?.classList.remove("uploading");

        if (request.status < 200 || request.status >= 300) {
            if (progress) progress.hidden = true;

            showMaterialUploadMessage(
                result.error || "The file could not be uploaded.",
                "error"
            );

            return;
        }

        if (progressBar) progressBar.style.width = "100%";
        if (progressText) progressText.textContent = "Upload complete";

        showMaterialUploadMessage(
            result.message || "File uploaded successfully.",
            "success"
        );

        document.getElementById("material-file-input").value = "";
        await loadMaterialFiles();

        setTimeout(() => {
            if (progress) progress.hidden = true;
        }, 1200);
    });

    request.addEventListener("error", () => {
        materialUploadInProgress = false;
        dropZone?.classList.remove("uploading");

        if (progress) progress.hidden = true;

        showMaterialUploadMessage(
            "The file upload could not connect to the server.",
            "error"
        );
    });

    request.send(formData);
}

function renderSelectedMaterialFiles(files = []) {
    const container = document.getElementById("material-selected-files");
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
        name.textContent =
            `${file.name} (${formatMaterialFileSize(file.size)})`;

        row.appendChild(name);
        container.appendChild(row);
    });
}

function uploadMaterialDocument(file, index, total) {
    return new Promise((resolve, reject) => {
        const progressBar = document.getElementById(
            "material-upload-progress-bar"
        );
        const progressText = document.getElementById(
            "material-upload-progress-text"
        );
        const formData = new FormData();
        const request = new XMLHttpRequest();

        formData.append("File", file, file.name);

        request.open(
            "POST",
            `/api/materials/${selectedMaterialID}/files`
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
            } catch {
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

async function uploadMaterialFiles(fileList) {
    if (!selectedMaterialID || materialUploadInProgress) return;

    const files = Array.from(fileList || []);
    if (!files.length) return;

    try {
        files.forEach(validateMaterialFile);
    } catch (error) {
        showMaterialUploadMessage(error.message, "error");
        return;
    }

    const progress = document.getElementById("material-upload-progress");
    const progressBar = document.getElementById(
        "material-upload-progress-bar"
    );
    const progressText = document.getElementById(
        "material-upload-progress-text"
    );
    const dropZone = document.getElementById("material-drop-zone");
    const fileInput = document.getElementById("material-file-input");

    materialUploadInProgress = true;
    renderSelectedMaterialFiles(files);
    showMaterialUploadMessage();

    if (progress) progress.hidden = false;
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Preparing documents...";
    dropZone?.classList.add("uploading");

    try {
        for (let index = 0; index < files.length; index += 1) {
            await uploadMaterialDocument(files[index], index, files.length);
        }

        if (progressBar) progressBar.style.width = "100%";
        if (progressText) progressText.textContent = "Upload complete";

        showMaterialUploadMessage(
            `${files.length} document${files.length === 1 ? "" : "s"} uploaded successfully.`,
            "success"
        );

        await loadMaterialFiles();
    } catch (error) {
        console.error("Unable to upload material documents:", error);
        showMaterialUploadMessage(error.message, "error");
    } finally {
        materialUploadInProgress = false;
        dropZone?.classList.remove("uploading");
        if (fileInput) fileInput.value = "";
        renderSelectedMaterialFiles();

        window.setTimeout(() => {
            if (progress) progress.hidden = true;
        }, 1200);
    }
}

const materialsContainer =
    document.getElementById(
        "materials-container"
    );

materialsContainer?.addEventListener(
    "click",
    event => {
        const button =
            event.target.closest(
                ".delete-material-button"
            );

        if (!button) return;

        const materialID =
            Number(
                button.dataset.materialId
            );

        if (!Number.isInteger(materialID)) {
            alert("Invalid Learning Material ID.");
            return;
        }

        deleteMaterial(
            materialID,
            button.dataset.materialTitle ||
                "this Learning Material",
            button
        );
    }
);

async function deleteMaterialFile(button) {
    const fileID = Number(button.dataset.fileId);

    if (!Number.isInteger(fileID) || fileID < 1) return;

    if (!window.confirm("Delete this learning material document?")) {
        return;
    }

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const response = await fetch(
            `/api/material-files/${fileID}`,
            {
                method: "DELETE",
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            }
        );

        const result = await readResponse(response);

        showMaterialUploadMessage(result.message, "success");
        await loadMaterialFiles();
    } catch (error) {
        console.error("Unable to delete material file:", error);

        showMaterialUploadMessage(error.message, "error");

        button.disabled = false;
        button.textContent = "Delete";
    }
}

function initialiseMaterialFileControls() {
    const canUpload =
        ["Admin", "Coach"].includes(getCurrentUser()?.Role);

    const controls =
        document.getElementById("material-upload-controls");

    const dropZone =
        document.getElementById("material-drop-zone");

    const fileInput =
        document.getElementById("material-file-input");

    const chooseButton =
        document.getElementById("choose-material-files");

    if (controls) controls.hidden = !canUpload;

    if (!canUpload || !dropZone || !fileInput) return;

    renderSelectedMaterialFiles();

    chooseButton?.addEventListener("click", event => {
        event.stopPropagation();

        if (!materialUploadInProgress) {
            fileInput.click();
        }
    });

    dropZone.addEventListener("click", event => {
        if (
            event.target !== chooseButton &&
            !materialUploadInProgress
        ) {
            fileInput.click();
        }
    });

    dropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();

            if (!materialUploadInProgress) {
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

        if (files?.length) uploadMaterialFiles(files);
    });

    fileInput.addEventListener("change", () => {
        const files = fileInput.files;

        if (files?.length) uploadMaterialFiles(files);
    });
}

async function initialiseMaterialsPage() {
    if (window.kbdCurrentUser?.Role === "Participant") return;


    if (materialsPageInitialised) return;



    materialsPageInitialised = true;



    const user = getCurrentUser();

    const canCreateMaterials = ["Admin", "Coach"].includes(

        user?.Role

    );

    const showFormButton = document.getElementById(

        "show-material-form"

    );

    const closeFormButton = document.getElementById(

        "close-material-form"

    );

    const formPanel = document.getElementById(

        "material-form-panel"

    );

    const materialForm = document.getElementById("material-form");

    const materialFilesPanel =
    document.getElementById("material-files-panel");
    document.getElementById("close-material-files")
    ?.addEventListener("click", () => {
        if (materialUploadInProgress) {
            showMaterialUploadMessage(
                "Please wait for the document upload to finish.",
                "error"
            );

            return;
        }

        materialFilesPanel?.classList.add("hidden");

        selectedMaterialID = null;
        selectedMaterialTitle = "";

        const fileInput = document.getElementById(
            "material-file-input"
        );

        if (fileInput) fileInput.value = "";
        renderSelectedMaterialFiles();

        showMaterialUploadMessage();
    });

    if (showFormButton) {

        showFormButton.hidden = !canCreateMaterials;



        showFormButton.addEventListener("click", () => {

            formPanel?.classList.remove("hidden");

            formPanel?.scrollIntoView({

                behavior: "smooth",

                block: "start"

            });

        });

    }



    if (!canCreateMaterials) {

        formPanel?.classList.add("hidden");

    }



    closeFormButton?.addEventListener("click", () => {

        formPanel?.classList.add("hidden");

        materialForm?.reset();

        pendingMaterialFiles = [];
        renderPendingMaterialFiles();

        showMaterialFormMessage();

    });



    materialForm?.addEventListener("submit", submitMaterial);

    initialiseMaterialFileControls();

    if (canCreateMaterials) {
        initialiseMaterialCreationFiles();
    }

    await loadMaterials();



    if (canCreateMaterials) {

        await loadMaterialProgrammes();

    }

}



if (window.kbdCurrentUser) {

    initialiseMaterialsPage();

} else {

    window.addEventListener(

        "kbd-auth-ready",

        initialiseMaterialsPage,

        { once: true }

    );

}


// ========================================
// PARTICIPANT VIEW: LEARNING MATERIALS
// ----------------------------------------
// Runs only for Participants on materials.html. It shows a
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
    // LEARNING MATERIALS
    // ========================================

    async function renderMaterialsPage() {
        const ui = buildShell({
            pageTitle: "Learning Materials",
            eyebrow: "RESOURCES",
            heading: "Your learning library",
            description: "Everything your coach has shared with you, in one place."
        });
        if (!ui) return;

        const { data, failed } = await loadAll({
            materials: "/api/materials",
            programmes: "/api/programmes"
        });

        if (failed.length) showMessage("Some information could not be loaded. Please refresh to try again.");

        const types = [...new Set(data.materials.map(m => m.MaterialType).filter(Boolean))].sort();
        const state = { type: "all", programme: queryParameter("programme") || "", search: "" };

        setSummary(ui.summary, [
            { value: data.materials.length, label: "Resources" },
            { value: types.length, label: types.length === 1 ? "Type" : "Types" },
            { value: data.materials.filter(m => (daysFromToday(m.CreatedAt) ?? -99) >= -14).length, label: "Added in 2 weeks" }
        ]);

        ui.toolbar.append(
            segmented(
                [{ value: "all", label: "All" }, ...types.map(type => ({ value: type, label: type }))],
                state.type,
                value => { state.type = value; draw(); },
                "Filter by type"
            ),
            programmeSelect(data.programmes, state.programme, value => { state.programme = value; draw(); }),
            searchBox("Search materials", value => { state.search = value; draw(); })
        );

        function safeURL(value) {
            try {
                const url = new URL(String(value || ""), window.location.origin);
                return ["http:", "https:"].includes(url.protocol) ? url.href : null;
            } catch {
                return null;
            }
        }

        function draw() {
            ui.content.innerHTML = "";

            const materials = data.materials
                .filter(m => state.type === "all" || m.MaterialType === state.type)
                .filter(m => !state.programme || String(m.ProgrammeID) === state.programme)
                .filter(m => !state.search || `${m.Title || ""} ${m.Description || ""} ${m.ProgrammeName || ""}`.toLowerCase().includes(state.search))
                .sort((a, b) => String(b.CreatedAt || "").localeCompare(String(a.CreatedAt || "")));

            if (!materials.length) {
                ui.content.appendChild(data.materials.length
                    ? emptyState("No materials match", "Try another filter or search.")
                    : emptyState("No materials shared yet", "Your coach's resources will appear here."));
                return;
            }

            const grid = el("div", "pp-card-grid pp-card-grid-3");

            materials.forEach(material => {
                const card = el("article", "panel pp-card pp-material-card");
                const top = el("div", "pp-card-top");
                top.appendChild(el("span", "pd-material-type", material.MaterialType || "Resource"));
                if ((daysFromToday(material.CreatedAt) ?? -99) >= -14) top.appendChild(statusTag("New", "green"));
                card.appendChild(top);

                card.appendChild(el("h3", "", material.Title || "Untitled material"));
                if (material.Description) card.appendChild(el("p", "pp-card-text", material.Description));
                card.appendChild(el("p", "pp-card-meta", [material.ProgrammeName, formatDate(material.CreatedAt)].filter(Boolean).join(" · ")));

                const link = safeURL(material.FileURL);
                if (link) {
                    const open = el("a", "primary-button pp-open-link", "Open resource");
                    open.href = link;
                    open.target = "_blank";
                    open.rel = "noopener noreferrer";
                    card.appendChild(open);
                }

                card.appendChild(filesToggle(
                    "Files",
                    `/api/materials/${encodeURIComponent(material.MaterialID)}/files`,
                    fileID => `/api/material-files/${encodeURIComponent(fileID)}/download`
                ));

                grid.appendChild(card);
            });

            ui.content.appendChild(grid);
        }

        draw();
    }


    // ========================================
    // START (Participants on materials.html only)
    // ========================================

    function start(user) {
        if (ppStarted || !user || user.Role !== "Participant") return;
        if (PP_PAGE !== "materials") return;
        ppStarted = true;

        renderMaterialsPage().catch(error => {
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
