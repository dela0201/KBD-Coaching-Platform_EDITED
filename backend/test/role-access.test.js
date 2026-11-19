const test = require("node:test");
const assert = require("node:assert/strict");

const baseURL = String(
    process.env.KBD_TEST_BASE_URL ||
    "http://localhost:5000"
).replace(/\/+$/, "");

const termsVersion = String(
    process.env.KBD_TERMS_VERSION ||
    "2026-11-03"
);

function credentials(prefix) {
    return {
        Email: String(
            process.env[
                `KBD_TEST_${prefix}_EMAIL`
            ] || ""
        )
            .trim()
            .toLowerCase(),

        Password: String(
            process.env[
                `KBD_TEST_${prefix}_PASSWORD`
            ] || ""
        )
    };
}

const admin = credentials("ADMIN");
const coach = credentials("COACH");
const participant =
    credentials("PARTICIPANT");

const credentialsConfigured = [
    admin,
    coach,
    participant
].every(
    account =>
        account.Email &&
        account.Password
);

async function readJSON(response) {
    return response
        .json()
        .catch(() => ({}));
}

function sessionCookie(response) {
    const header =
        response.headers.get("set-cookie");

    return header
        ? header.split(";")[0]
        : null;
}

async function login(account) {
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
            body: JSON.stringify(account)
        }
    );

    const result =
        await readJSON(response);

    assert.equal(
        response.status,
        200,
        result.error ||
        `Login failed for ${account.Email}`
    );

    const cookie =
        sessionCookie(response);

    assert.ok(cookie);

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

    return {
        cookie,
        user: result.user
    };
}

async function requestClosureList(cookie) {
    return fetch(
        `${baseURL}/api/admin/account-closure-requests`,
        {
            headers: {
                Cookie: cookie,
                Accept:
                    "application/json"
            }
        }
    );
}

test(
    "administrator endpoint enforces user roles",
    {
        skip:
            !credentialsConfigured
    },
    async () => {
        const adminSession =
            await login(admin);

        assert.equal(
            adminSession.user.Role,
            "Admin"
        );

        const adminResponse =
            await requestClosureList(
                adminSession.cookie
            );

        assert.equal(
            adminResponse.status,
            200
        );

        const coachSession =
            await login(coach);

        assert.equal(
            coachSession.user.Role,
            "Coach"
        );

        const coachResponse =
            await requestClosureList(
                coachSession.cookie
            );

        assert.equal(
            coachResponse.status,
            403
        );

        const participantSession =
            await login(participant);

        assert.equal(
            participantSession.user.Role,
            "Participant"
        );

        const participantResponse =
            await requestClosureList(
                participantSession.cookie
            );

        assert.equal(
            participantResponse.status,
            403
        );
    }
);
