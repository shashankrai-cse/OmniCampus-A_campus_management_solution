// ─────────────────────────────────────────────────────────
// Express App – middleware, routes, error handling
// ─────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import env from './config/env.js';
import healthRoutes from './modules/health/health.routes.js';
import campusRoutes from './modules/campus/campus.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import locationRoutes from './modules/location/location.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import noticeRoutes from './modules/notice/notice.routes.js';
import complaintRoutes from './modules/complaint/complaint.routes.js';
import utilitiesRoutes from './modules/utilities/utilities.routes.js';
import subjectRoutes from './modules/subject/subject.routes.js';
import assignmentRoutes from './modules/assignment/assignment.routes.js';
import practicalRoutes from './modules/practical/practical.routes.js';
import notificationRoutes from './modules/notification/notification.routes.js';
import onlineClassRoutes from './modules/onlineClass/onlineClass.routes.js';
import userRoutes from './modules/users/user.routes.js';
import copilotRoutes from './modules/copilot/copilot.routes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ── Security & Body Parsing ──────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true   // required so browsers send session cookies cross-origin
  })
);
app.use(express.json({ limit: '10mb' }));

// ── Serve uploaded files statically (local fallback when Cloudinary is not configured)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/', (req, res) => {
  res.json({ success: true, message: 'Smart Campus OS API is running' });
});

// ── API Routes ──────────────────────────────────────────
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/campus', campusRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/notices', noticeRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/utilities', utilitiesRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/assignments', assignmentRoutes);
app.use('/api/v1/practicals', practicalRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/classes', onlineClassRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/copilot', copilotRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
