// ─────────────────────────────────────────────────────────
// Auth Middleware – Passport session check + JWT fallback
// ─────────────────────────────────────────────────────────
// protect() works in two modes:
//   1. Passport session  – browser clients (cookies)
//   2. JWT Bearer token  – mobile / API clients (Authorization header)
// authorize() and authorizeDashboardRoleParam() are unchanged;
// they both rely on req.user which either mode populates.
// ─────────────────────────────────────────────────────────

import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { USER_ROLES } from '../modules/auth/auth.constants.js';
import { Session } from '../modules/auth/session.model.js';

// ── Helper: extract Bearer token from Authorization header ─
function extractToken(authorizationHeader = '') {
  const [type, token] = authorizationHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

export async function protect(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);

    // 401 – no token provided
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing – please log in'
      });
    }

    // Verify token signature + expiry
    const decoded = jwt.verify(token, env.jwtSecret);

    if (!decoded.sessionId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format – missing session ID'
      });
    }

    // Fetch the corresponding session from DB (Bypassing User query)
    const session = await Session.findById(decoded.sessionId);

    // 401 – session no longer exists
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session has expired or was logged out. Please log in again.'
      });
    }

    // Attach cached user to request for downstream handlers
    req.user = session.user;
    req.sessionId = session._id;
    return next();
  } catch (error) {
    // Handle specific JWT errors with meaningful messages
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired – please refresh or log in again'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token – authentication failed'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
}

// ─────────────────────────────────────────────────────────
// authorize (roleMiddleware)
// Restricts access to routes based on user role.
// Must be called after protect middleware.
// Usage: authorize('admin') or authorize('admin', 'teacher')
// ─────────────────────────────────────────────────────────
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    // Must be called after protect middleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated – login required'
      });
    }

    // 403 – user role not in allowed list
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied – requires ${allowedRoles.join(' or ')} role`
      });
    }

    return next();
  };
}

// ─────────────────────────────────────────────────────────
// authorizeDashboardRoleParam
// Ensures the :role param matches the authenticated user's role
// ─────────────────────────────────────────────────────────
export function authorizeDashboardRoleParam(req, res, next) {
  const requestedRole = req.params.role;

  // Validate the role param itself
  if (!USER_ROLES.includes(requestedRole)) {
    return res.status(400).json({
      success: false,
      message: `Unsupported dashboard role: ${requestedRole}`
    });
  }

  // Only allow users to view their own role's dashboard
  if (req.user.role !== requestedRole) {
    return res.status(403).json({
      success: false,
      message: `Access denied for ${requestedRole} dashboard`
    });
  }

  return next();
}
