// ─────────────────────────────────────────────────────────
// Attendance Controller
// ─────────────────────────────────────────────────────────

import { AttendanceSession, AttendanceRecord } from './attendance.model.js';
import { CampusLocation } from '../location/location.model.js';
import { Subject } from '../subject/subject.model.js';
import { isWithinCampus } from '../../utils/geo.js';

// ── In-Memory Cache for Campus Locations ──────────────────
let cachedCampusLocations = null;
let campusLocationsLastFetched = 0;
const CAMPUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getActiveCampusLocations() {
  const now = Date.now();
  if (!cachedCampusLocations || now - campusLocationsLastFetched > CAMPUS_CACHE_TTL) {
    cachedCampusLocations = await CampusLocation.find({ isActive: true });
    campusLocationsLastFetched = now;
  }
  return cachedCampusLocations;
}

// ── POST /sessions – Teacher creates a new attendance session
export async function createSession(req, res, next) {
  try {
    const { subject, date, scheduledDate, department, expiresInMinutes } = req.body;

    const expiresAt = expiresInMinutes
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000)
      : undefined;

    const sessionStatus = scheduledDate ? 'scheduled' : 'active';

    let resolvedCampus = req.user.campus;
    if (!resolvedCampus) {
      const subjectDoc = await Subject.findById(subject);
      resolvedCampus = subjectDoc?.campus;
    }

    const session = await AttendanceSession.create({
      subject,
      campus: resolvedCampus,
      date: date || new Date(),
      scheduledDate,
      status: sessionStatus,
      department: department || req.user.department,
      createdBy: req.user._id,
      ...(expiresAt && { expiresAt })
    });

    return res.status(201).json({
      success: true,
      message: 'Attendance session created',
      data: { session }
    });
  } catch (error) {
    return next(error);
  }
}

// ── POST /mark – Student marks attendance via QR code + geolocation
export async function markAttendance(req, res, next) {
  try {
    const { qrCode, latitude, longitude } = req.body;

    // 1. Find the session by QR code
    const session = await AttendanceSession.findOne({ qrCode: qrCode.toUpperCase() });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Invalid attendance code – session not found'
      });
    }

    // 2. Check if session has expired
    if (new Date() > session.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'This attendance session has expired'
      });
    }

    // 3. Check if already marked
    const existing = await AttendanceRecord.findOne({
      session: session._id,
      student: req.user._id
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Attendance already marked for this session'
      });
    }

    // 4. Geolocation check – student must be within radius of ANY active campus
    const campusLocations = await getActiveCampusLocations();

    if (campusLocations.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No campus locations configured – contact admin'
      });
    }

    let nearestDistance = Infinity;
    let withinAnyCampus = false;

    for (const campus of campusLocations) {
      const result = isWithinCampus(
        latitude,
        longitude,
        campus.latitude,
        campus.longitude,
        campus.radiusMetres
      );

      if (result.distance < nearestDistance) {
        nearestDistance = result.distance;
      }

      if (result.within) {
        withinAnyCampus = true;
        break;
      }
    }

    if (!withinAnyCampus) {
      return res.status(403).json({
        success: false,
        message: `You are ${nearestDistance}m away from campus. Must be within 100m to mark attendance.`,
        data: { distance: nearestDistance }
      });
    }

    // 5. Determine if late (more than 10 minutes after session creation)
    const minutesSinceCreation = (Date.now() - session.createdAt.getTime()) / 60000;
    const status = minutesSinceCreation > 10 ? 'late' : 'present';

    // 6. Create attendance record
    const record = await AttendanceRecord.create({
      session: session._id,
      student: req.user._id,
      status,
      method: 'geolocation',
      coordinates: { latitude, longitude },
      distanceFromCampus: nearestDistance
    });

    return res.status(201).json({
      success: true,
      message: status === 'late'
        ? 'Attendance marked as LATE (arrived after 10 min window)'
        : 'Attendance marked successfully!',
      data: { record, distance: nearestDistance, status }
    });
  } catch (error) {
    return next(error);
  }
}

// ── PUT /manual – Teacher manually marks / edits a student's attendance
export async function manualMark(req, res, next) {
  try {
    const { sessionId, studentId, status } = req.body;

    const session = await AttendanceSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const record = await AttendanceRecord.findOneAndUpdate(
      { session: sessionId, student: studentId },
      { status, method: 'manual', markedAt: new Date() },
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: `Attendance manually set to ${status}`,
      data: { record }
    });
  } catch (error) {
    return next(error);
  }
}

// ── GET /sessions/:id/records – Teacher views all records for a session
export async function getSessionRecords(req, res, next) {
  try {
    const session = await AttendanceSession.findById(req.params.id)
      .populate('createdBy', 'fullName email');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const records = await AttendanceRecord.find({ session: session._id })
      .populate('student', 'fullName email department')
      .sort({ markedAt: 1 });

    return res.status(200).json({
      success: true,
      data: { session, records, totalPresent: records.filter(r => r.status !== 'absent').length }
    });
  } catch (error) {
    return next(error);
  }
}

// ── GET /sessions – List all sessions (teacher sees own, admin sees all)
export async function getSessions(req, res, next) {
  try {
    const filter = req.user.role === 'admin' ? {} : { createdBy: req.user._id };
    const sessions = await AttendanceSession.find(filter)
      .populate('createdBy', 'fullName')
      .sort({ date: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      data: { sessions }
    });
  } catch (error) {
    return next(error);
  }
}

// ── GET /my – Student views own attendance with auto-calculated percentage
export async function getMyAttendance(req, res, next) {
  try {
    const records = await AttendanceRecord.find({ student: req.user._id })
      .populate({
        path: 'session',
        select: 'subject date department createdBy',
        populate: { path: 'createdBy', select: 'fullName' }
      })
      .sort({ markedAt: -1 });

    // Calculate attendance percentage
    const total = records.length;
    const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';

    return res.status(200).json({
      success: true,
      data: {
        records,
        stats: {
          total,
          present,
          absent: total - present,
          percentage: parseFloat(percentage)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}
import PDFDocument from 'pdfkit';

// ── GET /report/pdf – Generate a PDF report for attendance
export async function generateAttendancePdf(req, res, next) {
  try {
    const { subjectId, campusId } = req.query;
    const filter = {};
    if (subjectId) filter.subject = subjectId;
    if (campusId) filter.campus = campusId;

    if (req.user.role === 'teacher') filter.createdBy = req.user._id;

    const sessions = await AttendanceSession.find(filter)
      .populate('subject', 'name code')
      .populate('campus', 'name')
      .sort({ date: -1 });

    const sessionIds = sessions.map(s => s._id);
    const records = await AttendanceRecord.find({ session: { $in: sessionIds } })
      .populate('student', 'fullName email enrollmentYear section');

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance-report.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Attendance Report', { align: 'center' });
    doc.moveDown();

    sessions.forEach(session => {
      doc.fontSize(14).text(`Session: ${session.subject?.name || 'Unknown'} - ${new Date(session.date).toLocaleDateString()}`);
      doc.fontSize(10).text(`Campus: ${session.campus?.name || 'Unknown'}  |  Status: ${session.status}`);
      doc.moveDown(0.5);

      const sessionRecords = records.filter(r => r.session.toString() === session._id.toString());
      if (sessionRecords.length === 0) {
        doc.text('No records found for this session.', { style: 'italic' });
      } else {
        sessionRecords.forEach((record, index) => {
          doc.text(`${index + 1}. ${record.student?.fullName || 'Unknown Student'} (${record.student?.section || 'N/A'}) - ${record.status.toUpperCase()}`);
        });
      }
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    return next(error);
  }
}
