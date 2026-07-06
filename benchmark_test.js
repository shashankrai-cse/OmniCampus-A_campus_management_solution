import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, fail } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate, Counter } from 'k6/metrics';

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const BASE_URL = 'https://coderush-1-y64q.onrender.com/api/v1';
const WS_URL = 'wss://coderush-1-y64q.onrender.com';
const TEACHER_EMAIL = 'teacher@bbdniit.ac.in'; // Replace with the teacher email
const TEACHER_PASS = 'teacher123';            // Replace with teacher password

// 1. List every CSV file + give it a short "batch" label.
//    Each user loaded from a given file gets tagged with that batch label,
//    so every metric below can be sliced/compared per file (e.g. first 1,000
//    users vs the next 3,000). Add or remove rows here as needed — everything
//    else in the script (metrics, thresholds, logging) will follow automatically.
const CSV_FILES = [
    { path: '/home/shashank/Downloads/users.csv',  batch: 'batch1_users' },
    { path: '/home/shashank/Downloads/users2.csv', batch: 'batch2_users2' },
    // { path: '/home/shashank/Downloads/users3.csv', batch: 'batch3_users3' },
];

// 2. Load and tag every user with which file (batch) they came from.
const usersData = new SharedArray('users', function () {
    const users = [];

    for (const cf of CSV_FILES) {
        try {
            const f = open(cf.path);
            const rows = f.split('\n').map(row => row.trim()).filter(row => row);
            if (rows.length === 0) continue;

            const headers = rows[0].split(',').map(h => h.trim());

            for (let i = 1; i < rows.length; i++) {
                const values = rows[i].split(',').map(v => v.trim());
                const userObj = {};
                headers.forEach((h, idx) => { userObj[h] = values[idx]; });
                if (userObj.email && userObj.password) {
                    userObj.batch = cf.batch; // tag: which CSV this user came from
                    users.push(userObj);
                }
            }
        } catch (e) {
            console.error(`Could not read file: ${cf.path}`);
        }
    }

    return users;
});

// Fail fast and loudly if no users were loaded at all — much easier to
// diagnose than watching every single iteration fail with "undefined".
if (usersData.length === 0) {
    fail('No users were loaded from any CSV file. Check the paths in CSV_FILES.');
}

const BATCH_TAGS = CSV_FILES.map(cf => cf.batch);

// ==========================================
// 📊 METRICS RECORDERS
// ==========================================
// Overall (combined, all batches together) — same as before, kept so old
// dashboards/thresholds referencing these names still work.
const loginTime = new Trend('metric_login_time');
const attendanceOTPTime = new Trend('metric_attendance_otp_time');
const geminiCacheTime = new Trend('metric_gemini_response_time');
const apiDataRetrievalTime = new Trend('metric_api_retrieval_time');
const socketConnectionTime = new Trend('metric_socket_connect_time');

const successRate = new Rate('successful_requests');
const loginErrorRate = new Rate('auth_login_error_rate');

// Counts every failed request, split by which endpoint and which HTTP status
// came back — lets you see e.g. "480 failures were 504 Gateway Timeout on
// /auth/login from batch2_users2" instead of just one blended error rate.
const failuresByEndpoint = new Counter('failures_by_endpoint');

// Per-batch metrics: one full set of Trends/Rates per CSV file, built
// automatically from BATCH_TAGS. This is what lets you directly compare
// "batch1_users" (first 1,000) against "batch2_users2" (the rest) in the
// k6 end-of-test summary — each batch's numbers print under their own name.
const metricsByBatch = {};
BATCH_TAGS.forEach((tag) => {
    metricsByBatch[tag] = {
        loginTime: new Trend(`login_time__${tag}`),
        otpTime: new Trend(`otp_time__${tag}`),
        geminiTime: new Trend(`gemini_time__${tag}`),
        apiTime: new Trend(`api_time__${tag}`),
        socketTime: new Trend(`socket_time__${tag}`),
        successRate: new Rate(`success_rate__${tag}`),
        errorRate: new Rate(`error_rate__${tag}`),
    };
});

// ==========================================
// 🚀 TEST STAGES
// ==========================================
export const options = {
    // 🚀 4,000 user ramp — graduated load test
    stages: [
        { duration: '30s', target: 100 },   // Warm up
        { duration: '1m',  target: 500 },   // Ramp to 500
        { duration: '1m',  target: 1000 },  // Ramp to 1,000
        { duration: '1m',  target: 2000 },  // Ramp to 2,000
        { duration: '1m',  target: 4000 },  // Spike to 4,000
        { duration: '30s', target: 0 },     // Wind down
    ],
    thresholds: {
        // Combined (all batches blended together) — same as before.
        'metric_login_time':           ['p(95)<1000'],
        'metric_attendance_otp_time':  ['p(95)<2000'],
        'metric_gemini_response_time': ['p(95)<750'],
        'metric_socket_connect_time':  ['p(95)<500'],
        'successful_requests':         ['rate>0.90'],
        'auth_login_error_rate':       ['rate<0.10'],
        'http_req_failed':             ['rate<0.25'],

        // Per-batch thresholds — these are what let you spot "batch2 is failing
        // way more than batch1" directly in the pass/fail table, instead of
        // having to eyeball raw numbers. Auto-generated for every CSV file
        // listed in CSV_FILES above.
        ...Object.fromEntries(
            BATCH_TAGS.flatMap((tag) => [
                [`login_time__${tag}`, ['p(95)<1000']],
                [`success_rate__${tag}`, ['rate>0.90']],
                [`error_rate__${tag}`, ['rate<0.10']],
            ])
        ),
    },
};

// Small helper so failure logging is consistent everywhere and doesn't
// flood the console — logs full detail, but only for a sample of failures.
function logFailure(endpoint, res, batch) {
    failuresByEndpoint.add(1, { endpoint, status: String(res.status), batch });

    // Log ~1 in 20 failures in full detail (status, batch, VU, body snippet).
    // Change SAMPLE_RATE to 1 if you want every single failure logged.
    const SAMPLE_RATE = 0.05;
    if (Math.random() < SAMPLE_RATE) {
        const bodySnippet = (res.body || '').toString().slice(0, 200);
        console.error(
            `[FAIL] endpoint=${endpoint} batch=${batch} vu=${__VU} iter=${__ITER} ` +
            `status=${res.status} duration=${res.timings.duration.toFixed(0)}ms body="${bodySnippet}"`
        );
    }
}

export default function () {
    // Get unique user from CSV based on Virtual User ID (__VU) and current iteration (__ITER)
    // This ensures if a login fails, the next iteration will try a different user
    const userIndex = (__VU - 1 + __ITER) % usersData.length;
    const user = usersData[userIndex];
    const batch = user.batch;
    const batchMetrics = metricsByBatch[batch];
    const requestTags = { batch }; // attach to every http call so k6 can tag/filter by batch too

    const jsonHeaders = { 'Content-Type': 'application/json' };

    // ========================================================
    // 1. PLATFORM SCALE & BACKEND APIs: Login & Data Retrieval
    // ========================================================
    let loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
        email: user.email,
        password: user.password
    }), { headers: jsonHeaders, tags: requestTags });

    // If wrong credentials, invalid, or user not found, just ignore and move on immediately
    if (loginRes.status === 401 || loginRes.status === 404 || loginRes.status === 400) {
        logFailure('auth/login', loginRes, batch);
        return;
    }

    loginTime.add(loginRes.timings.duration);
    batchMetrics.loginTime.add(loginRes.timings.duration);

    successRate.add(loginRes.status === 200);
    batchMetrics.successRate.add(loginRes.status === 200);

    loginErrorRate.add(loginRes.status !== 200);
    batchMetrics.errorRate.add(loginRes.status !== 200);

    if (loginRes.status !== 200) {
        // If login fails due to server overload (5xx), back off briefly
        logFailure('auth/login', loginRes, batch);
        sleep(1);
        return;
    }

    const token = loginRes.json('data.token');
    const authHeaders = { ...jsonHeaders, 'Authorization': `Bearer ${token}` };

    // Test Dashboard/Profile Retrieval Speed (Modular Architecture check)
    let profileRes = http.get(`${BASE_URL}/auth/me`, { headers: authHeaders, tags: requestTags });
    apiDataRetrievalTime.add(profileRes.timings.duration);
    batchMetrics.apiTime.add(profileRes.timings.duration);
    const dashboardOk = check(profileRes, { 'Dashboard loaded': (r) => r.status === 200 });
    if (!dashboardOk) logFailure('auth/me', profileRes, batch);

    // ========================================================
    // 2. SMART ATTENDANCE: OTP & Verification
    // ========================================================
    // Simulating submitting an OTP for attendance
    const attendancePayload = JSON.stringify({
        qrCode: "123456", // Assuming a dummy active session
        latitude: 26.8467,     // Dummy geo-location
        longitude: 80.9462
    });

    let attendanceRes = http.post(`${BASE_URL}/attendance/mark`, attendancePayload, {
        headers: authHeaders,
        tags: requestTags,
    });
    attendanceOTPTime.add(attendanceRes.timings.duration);
    batchMetrics.otpTime.add(attendanceRes.timings.duration);
    if (attendanceRes.status >= 400) logFailure('attendance/mark', attendanceRes, batch);

    // ========================================================
    // 3. GEMINI API ASSISTANT: Caching Speed Test
    // ========================================================
    // Simulating identical questions to hit the Copilot Cache
    const geminiPayload = JSON.stringify({ message: "What is the attendance policy?" });
    let geminiRes = http.post(`${BASE_URL}/copilot/chat`, geminiPayload, {
        headers: authHeaders,
        tags: requestTags,
    });

    geminiCacheTime.add(geminiRes.timings.duration);
    batchMetrics.geminiTime.add(geminiRes.timings.duration);
    if (geminiRes.status >= 400) logFailure('copilot/chat', geminiRes, batch);

    // ========================================================
    // 4. REAL-TIME FEATURES: Socket.io Latency Test
    // ========================================================
    // Note: WebSockets require Engine.IO payload formats (e.g., 40 to connect)
    // We test connection initiation latency
    const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

    const wsConnectStart = Date.now();
    const wsRes = ws.connect(url, { tags: requestTags }, function (socket) {

        socket.on('open', () => {
            // Record connection time now that it's open
            const connectMs = Date.now() - wsConnectStart;
            socketConnectionTime.add(connectMs);
            batchMetrics.socketTime.add(connectMs);

            // Emulate joining a class room
            socket.send('42["join-class", "demo-room", "student", "dummy-id"]');

            // Emulate sending a chat message
            socket.send('42["chat-message", {"classId": "demo-room", "text": "Hello world"}]');

            // Close after brief interaction
            socket.setTimeout(function () {
                socket.close();
            }, 1000);
        });

        socket.on('error', (e) => {
            const errMsg = e.error();
            // Suppress normal Socket.io close codes (1005 = no status, 1000 = normal)
            if (errMsg !== 'websocket: close sent' && !errMsg.includes('1005') && !errMsg.includes('1000')) {
                console.log(`[WS FAIL] batch=${batch} vu=${__VU} error=${errMsg}`);
            }
        });
    });

    // Emulate user reading the screen before next loop
    sleep(Math.random() * 3 + 1);
}

// ==========================================
// 📋 END-OF-TEST BREAKDOWN
// ==========================================
// Prints a quick batch-vs-batch comparison right after the normal k6 summary,
// so you don't have to hunt through the CUSTOM metrics list by hand.
export function handleSummary(data) {
    const lines = ['\n===== BATCH COMPARISON (per CSV file) ====='];

    BATCH_TAGS.forEach((tag) => {
        const m = data.metrics || {};
        const get = (name, stat) => {
            const metric = m[name];
            if (!metric || !metric.values) return 'n/a';
            const v = metric.values[stat];
            return v === undefined ? 'n/a' : (typeof v === 'number' ? v.toFixed(1) : v);
        };

        lines.push(`\n--- ${tag} ---`);
        lines.push(`  login p95 (ms):     ${get(`login_time__${tag}`, 'p(95)')}`);
        lines.push(`  otp p95 (ms):       ${get(`otp_time__${tag}`, 'p(95)')}`);
        lines.push(`  gemini p95 (ms):    ${get(`gemini_time__${tag}`, 'p(95)')}`);
        lines.push(`  api p95 (ms):       ${get(`api_time__${tag}`, 'p(95)')}`);
        lines.push(`  success rate:       ${get(`success_rate__${tag}`, 'rate')}`);
        lines.push(`  error rate:         ${get(`error_rate__${tag}`, 'rate')}`);
    });

    lines.push('\n=============================================\n');
    const summaryText = lines.join('\n');

    return {
        'stdout': summaryText, // print the batch breakdown to the terminal
        'summary.json': JSON.stringify(data, null, 2), // also save full raw data to a file
    };
}
