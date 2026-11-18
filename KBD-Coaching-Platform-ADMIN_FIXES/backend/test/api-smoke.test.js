const test = require("node:test");
const assert = require("node:assert/strict");

const baseURL = String(
    process.env.KBD_TEST_BASE_URL ||
    "http://localhost:5000"
).replace(/\/+$/, "");

const testEmail = String(
    process.env.KBD_TEST_LOGIN_EMAIL || ""
)
    .trim()
    .toLowerCase();

const testPassword = String(
    process.env.KBD_TEST_LOGIN_PASSWORD || ""
);

const termsVersion = String(
    process.env.KBD_TERMS_VERSION ||
    "2026-11-03"
);

async function readJSON(response) {
    return response
        .json()
        .catch(() => ({}));
}

function sessionCookie(response) {
    const header = response.headers.get(
        "set-cookie"
    );

    if (!header) return null;

    return header.split(";")[0];
}

test(
    "health endpoint responds successfully",
    async () => {
        const response = await fetch(
            `${baseURL}/api/health`
        );

        assert.equal(response.status, 200);

        const result =
            await readJSON(response);

        assert.equal(
            typeof result,
            "object"
        );
    }
);

test(
    "protected API rejects unauthenticated access",
    async () => {
        const response = await fetch(
            `${baseURL}/api/programmes`,
            {
                headers: {
                    Accept:
                        "application/json"
                }
            }
        );

        assert.equal(response.status, 401);

        const result =
            await readJSON(response);

        assert.match(
            String(result.error || ""),
            /authentication|sign in|session/i
        );
    }
);

test(
    "invalid login is rejected",
    async () => {
        const response = await fetch(
            `${baseURL}/api/auth/login`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",
                    Accept:
                        "application/json"
                },
                body: JSON.stringify({
                    Email:
                        `invalid-${Date.now()}@kbd.test`,
                    Password:
                        "InvalidPassword123!"
                })
            }
        );

        assert.ok(
            [400, 401, 403].includes(
                response.status
            )
        );
    }
);

test(
    "configured test account can sign in",
    {
        skip:
            !testEmail ||
            !testPassword
    },
    async () => {
        const loginResponse = await fetch(
            `${baseURL}/api/auth/login`,
            {
                method: "POST",
                redirect: "manual",
                headers: {
                    "Content-Type":
                        "application/json",
                    Accept:
                        "application/json"
                },
                body: JSON.stringify({
                    Email: testEmail,
                    Password: testPassword
                })
            }
        );

        assert.equal(
            loginResponse.status,
            200
        );

        const loginResult =
            await readJSON(loginResponse);

        assert.ok(loginResult.user?.UserID);

        const cookie =
            sessionCookie(loginResponse);

        assert.ok(
            cookie,
            "Login did not return a session cookie."
        );

        const termsResponse = await fetch(
            `${baseURL}/api/terms/acceptance`,
            {
                method: "POST",
                headers: {
                    Cookie: cookie,
                    "Content-Type":
                        "application/json",
                    Accept:
                        "application/json"
                },
                body: JSON.stringify({
                    TermsVersion:
                        termsVersion
                })
            }
        );

        assert.ok(
            [200, 201].includes(
                termsResponse.status
            )
        );

        const meResponse = await fetch(
            `${baseURL}/api/auth/me`,
            {
                headers: {
                    Cookie: cookie,
                    Accept:
                        "application/json"
                }
            }
        );

        assert.equal(meResponse.status, 200);

        const meResult =
            await readJSON(meResponse);

        assert.equal(
            meResult.user.Email
                .toLowerCase(),
            testEmail
        );

        if (["Admin", "Coach", "Participant"].includes(meResult.user.Role)) {
            const assessmentsResponse = await fetch(`${baseURL}/api/assessments`, {
                headers: { Cookie: cookie, Accept: "application/json" }
            });
            assert.equal(assessmentsResponse.status, 200);
            assert.ok(Array.isArray(await readJSON(assessmentsResponse)));
        }

        const logoutResponse = await fetch(
            `${baseURL}/api/auth/logout`,
            {
                method: "POST",
                headers: {
                    Cookie: cookie,
                    Accept:
                        "application/json"
                }
            }
        );

        assert.equal(
            logoutResponse.status,
            200
        );
    }
);
