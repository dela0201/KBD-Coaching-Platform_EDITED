const coachRequestForm = document.getElementById("coach-request-form");
const coachRequestButton = document.getElementById("coach-request-button");
const coachRequestMessage = document.getElementById("coach-request-message");

function showCoachRequestMessage(message = "", type = "") {
    coachRequestMessage.textContent = message;
    coachRequestMessage.className = type
        ? `form-message ${type}`
        : "form-message";
}

coachRequestForm?.addEventListener("submit", async event => {
    event.preventDefault();

    if (!coachRequestForm.reportValidity()) return;

    showCoachRequestMessage();
    coachRequestButton.disabled = true;
    coachRequestButton.textContent = "Submitting...";

    const formData = new FormData(coachRequestForm);

    const requestData = {
        FirstName: String(formData.get("FirstName") || "").trim(),
        LastName: String(formData.get("LastName") || "").trim(),
        Email: String(formData.get("Email") || "").trim().toLowerCase(),
        Reason: String(formData.get("Reason") || "").trim()
    };

    try {
        const response = await fetch("/api/coach-access-requests", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error ||
                "The Coach access request could not be submitted."
            );
        }

        coachRequestForm.reset();

        showCoachRequestMessage(
            result.message ||
            "Your request has been sent to the administrator.",
            "success"
        );
    } catch (error) {
        console.error("Coach access request error:", error);

        showCoachRequestMessage(
            error.message ||
            "The Coach access request could not be submitted.",
            "error"
        );
    } finally {
        coachRequestButton.disabled = false;
        coachRequestButton.textContent = "Submit Request";
    }
});
