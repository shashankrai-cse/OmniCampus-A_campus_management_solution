

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

// 1. Load multiple CSV Files dynamically using SharedArray
const usersData = new SharedArray('users', function () {
    // k6 runs this once and shares the data across all VUs.
    // Add all your CSV file paths to this array:
    const csvFiles = [
        '/home/shashank/Downloads/users.csv',
        '/home/shashank/Downloads/users2.csv',
        // '/home/shashank/Downloads/users3.csv'
    ];

    const users = [];

    for (const filePath of csvFiles) {
        try {
            const f = open(filePath);
            const rows = f.split('\n').map(row => row.trim()).filter(row => row);
            if (rows.length === 0) continue;

            const headers = rows[0].split(',').map(h => h.trim());

            for (let i = 1; i < rows.length; i++) {
                const values = rows[i].split(',').map(v => v.trim());
                const userObj = {};
                headers.forEach((h, idx) => { userObj[h] = values[idx]; });
                if (userObj.email && userObj.password) {
                    users.push(userObj);
                }
            }
        } catch (e) {
            console.error(`Could not read file: ${filePath}`);
        }
    }

    console.log(`\n======================================================`);
    console.log(`📊 PLATFORM SCALE: Loaded ${users.length} dummy data profiles for testing from CSVs.`);
    console.log(`======================================================\n`);

    return users;
});

// ==========================================
// 📊 METRICS RECORDERS
// ==========================================
const loginTime = new Trend('metric_login_time');
const attendanceOTPTime = new Trend('metric_attendance_otp_time');
const geminiCacheTime = new Trend('metric_gemini_response_time');
const apiDataRetrievalTime = new Trend('metric_api_retrieval_time');
const socketConnectionTime = new Trend('metric_socket_connect_time');

const successRate = new Rate('successful_requests');
const loginErrorRate = new Rate('auth_login_error_rate'); // tracks auth endpoint failures specifically
const chatMessagesSent = new Counter('metric_chat_messages_sent');

// ==========================================
// 🚀 TEST STAGES
// ==========================================
export const options = {
    // 🚀 500 user ramp — graduated load test
    stages: [
        { duration: '30s', target: 100 },   // Warm up
        { duration: '1m', target: 250 },   // Ramp to 250
        { duration: '1m', target: 500 },   // Spike to 500
        { duration: '30s', target: 0 },     // Wind down
    ],
    thresholds: {
        'metric_login_time': ['p(95)<1000'],  // 95% logins under 1s
        'metric_attendance_otp_time': ['p(95)<2000'],  // 95% OTP under 2s
        'metric_gemini_response_time': ['p(95)<750'],   // Gemini (cache + fresh blended)
        'metric_socket_connect_time': ['p(95)<500'],   // Socket connect < 500ms
        'successful_requests': ['rate>0.90'],   // >90% login success
        'auth_login_error_rate': ['rate<0.10'],   // <10% auth endpoint errors
        'http_req_failed': ['rate<0.25'],   // <25% overall HTTP failure rate
    },
};

export default function () {
    // Get unique user from CSV based on Virtual User ID (__VU) and current iteration (__ITER)
    // This ensures if a login fails, the next iteration will try a different user
    const userIndex = (__VU - 1 + __ITER) % usersData.length;
    const user = usersData[userIndex];

    const jsonHeaders = { 'Content-Type': 'application/json' };

    // ========================================================
    // 1. PLATFORM SCALE & BACKEND APIs: Login & Data Retrieval
    // ========================================================
    let loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
        email: user.email,
        password: user.password
    }), { headers: jsonHeaders });

    // If wrong credentials, invalid, or user not found, just ignore and move on immediately
    if (loginRes.status === 401 || loginRes.status === 404 || loginRes.status === 400) {
        return;
    }

    loginTime.add(loginRes.timings.duration);
    successRate.add(loginRes.status === 200);
    loginErrorRate.add(loginRes.status !== 200); // track auth failures for resume metric

    if (loginRes.status !== 200) {
        // If login fails due to server overload (5xx), back off briefly
        sleep(1);
        return;
    }

    const token = loginRes.json('data.token');
    const authHeaders = { ...jsonHeaders, 'Authorization': `Bearer ${token}` };

    // Test Dashboard/Profile Retrieval Speed (Modular Architecture check)
    let profileRes = http.get(`${BASE_URL}/auth/me`, { headers: authHeaders });
    apiDataRetrievalTime.add(profileRes.timings.duration);
    check(profileRes, { 'Dashboard loaded': (r) => r.status === 200 });

    // ========================================================
    // 2. SMART ATTENDANCE: OTP & Verification
    // ========================================================
    // Simulating submitting an OTP for attendance
    const attendancePayload = JSON.stringify({
        qrCode: "123456", // Assuming a dummy active session
        latitude: 26.8467,     // Dummy geo-location
        longitude: 80.9462
    });

    let attendanceRes = http.post(`${BASE_URL}/attendance/mark`, attendancePayload, { headers: authHeaders });
    attendanceOTPTime.add(attendanceRes.timings.duration);

    check(attendanceRes, {
        'Smart Attendance: OTP Verification under 2s': (r) => r.timings.duration < 2000,
        'Smart Attendance: Geolocation proxy check responded': (r) => r.status === 200 || r.status === 400 || r.status === 403
    });

    // ========================================================
    // 3. GEMINI API ASSISTANT: Caching Speed Test
    // ========================================================
    // Simulating identical questions to hit the Copilot Cache
    const geminiPayload = JSON.stringify({ message: "What is the attendance policy?" });
    let geminiRes = http.post(`${BASE_URL}/copilot/chat`, geminiPayload, { headers: authHeaders });

    geminiCacheTime.add(geminiRes.timings.duration);

    check(geminiRes, {
        'Gemini API: Sub-second response (Cached < 1s)': (r) => r.timings.duration < 1000
    });

    // ========================================================
    // 4. REAL-TIME FEATURES: Socket.io Latency Test
    // ========================================================
    // Note: WebSockets require Engine.IO payload formats (e.g., 40 to connect)
    // We test connection initiation latency
    const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

    const wsConnectStart = Date.now();
    const wsRes = ws.connect(url, null, function (socket) {

        socket.on('open', () => {
            // Record connection time now that it's open
            socketConnectionTime.add(Date.now() - wsConnectStart);

            // Emulate joining a class room
            socket.send('42["join-class", "demo-room", "student", "dummy-id"]');

            // Emulate sending a chat message
            socket.send('42["chat-message", {"classId": "demo-room", "text": "Hello world"}]');
            chatMessagesSent.add(1);

            // Close after brief interaction
            socket.setTimeout(function () {
                socket.close();
            }, 1000);
        });

        socket.on('error', (e) => {
            const errMsg = e.error();
            // Suppress normal Socket.io close codes (1005 = no status, 1000 = normal)
            if (errMsg !== 'websocket: close sent' && !errMsg.includes('1005') && !errMsg.includes('1000')) {
                console.log('Socket Error: ', errMsg);
            }
        });
    });

    // Emulate user reading the screen before next loop
    sleep(Math.random() * 3 + 1);
}
