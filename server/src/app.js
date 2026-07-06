// ─────────────────────────────────────────────────────────
// Express App – middleware, routes, error handling
// ─────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from './config/passport.js';

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

// ── MongoDB-backed Session Store ─────────────────────────
// Sessions are persisted in the 'sessions' collection so they
// survive server restarts. connect-mongo reuses the existing
// Mongoose connection automatically once Mongoose is connected.
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: env.mongoUri,
      collectionName: 'sessions',
      ttl: env.sessionMaxAgeDays * 24 * 60 * 60, // in seconds
      touchAfter: 24 * 3600 // time period in seconds
    }),
    cookie: {
      httpOnly: true,
      secure: env.nodeEnv === 'production',  // HTTPS-only in prod
      sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
      maxAge: env.sessionMaxAgeDays * 24 * 60 * 60 * 1000  // ms
    }
  })
);

// ── Passport (session-based auth) ────────────────────────
app.use(passport.initialize());
app.use(passport.session());

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
