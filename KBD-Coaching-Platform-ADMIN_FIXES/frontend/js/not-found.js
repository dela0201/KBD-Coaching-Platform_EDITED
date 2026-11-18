const goBackButton =
    document.getElementById(
        "go-back-button"
    );


goBackButton?.addEventListener(
    "click",
    () => {

        if (
            window.history.length > 1
        ) {

            window.history.back();

        } else {

            window.location.href =
                "dashboard.html";

        }

    }
);
