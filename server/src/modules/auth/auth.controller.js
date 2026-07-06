// ─────────────────────────────────────────────────────────
// Auth Controller – register, login, me, refresh, logout
// Login now establishes a Passport session (connect-mongo)
// and still returns JWT tokens for API/mobile clients.
// ─────────────────────────────────────────────────────────

import passport from 'passport';
import { User } from './auth.model.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../../utils/authToken.js';

// ─────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// Creates a new user and returns access + refresh tokens
// ─────────────────────────────────────────────────────────
export async function register(req, res, next) {
  try {
    const { fullName, email, password, role, department, campus, enrollmentYear, section, avatarSeed } = req.body;

    // Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user (password is hashed via pre-save hook)
    const user = await User.create({
      fullName,
      email,
      password,
      role: role || 'student',
      department,
      campus,
      enrollmentYear,
      section,
      avatarSeed
    });

    // Generate tokens (for API / mobile clients)
    const userData = user.toSafeObject();
    const accessToken = signAccessToken(userData);
    const refreshToken = signRefreshToken(userData);

    // Persist refresh token on user document
    user.refreshToken = refreshToken;
    await user.save();

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: userData,
        token: accessToken,
        refreshToken
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// passport.authenticate('local') runs first (via route middleware).
// If credentials are valid, req.user is set by Passport.
// We then call req.logIn() to create a session and also return
// JWT tokens so API / mobile clients can authenticate stateless.
// ─────────────────────────────────────────────────────────
export function login(req, res, next) {
  passport.authenticate('local', async (err, user, info) => {
    // Internal error during strategy execution
    if (err) return next(err);

    // Authentication failed – wrong credentials
    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || 'Invalid email or password'
      });
    }

    // Establish a Passport session (browser clients)
    req.logIn(user, async (loginErr) => {
      if (loginErr) return next(loginErr);

      try {
        // Update last login timestamp
        user.lastLoginAt = new Date();

        // Generate fresh JWT tokens (API / mobile clients)
        const userData = user.toSafeObject();
        const accessToken = signAccessToken(userData);
        const refreshToken = signRefreshToken(userData);

        // Persist refresh token (rotation)
        user.refreshToken = refreshToken;
        await user.save();

        return res.status(200).json({
          success: true,
          message: 'Login successful',
          data: {
            user: userData,
            token: accessToken,         // JWT bearer token for API clients
            refreshToken               // JWT refresh token for API clients
            // Browser clients rely on the session cookie automatically
          }
        });
      } catch (saveErr) {
        return next(saveErr);
      }
    });
  })(req, res, next);
}

// ─────────────────────────────────────────────────────────
// GET /api/v1/auth/me
// Returns the currently authenticated user's profile.
// Works for both session and JWT-based auth (req.user is
// populated by the protect middleware in both cases).
// ─────────────────────────────────────────────────────────
export async function me(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user.toSafeObject()
    }
  });
}

// ─────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh
// Accepts a JWT refresh token and returns a new access token
// (+ a rotated refresh token). Stateless – for API clients.
// ─────────────────────────────────────────────────────────
export async function refreshAccessToken(req, res, next) {
  try {
    const { refreshToken } = req.body;

    // Verify the refresh token cryptographically
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Find user and compare with stored refresh token
    const user = await User.findById(decoded.sub).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      // Possible token reuse attack – invalidate all sessions
      if (user) {
        user.refreshToken = null;
        await user.save();
      }

      return res.status(401).json({
        success: false,
        message: 'Refresh token is invalid or has been revoked'
      });
    }

    // Issue new token pair (rotation)
    const userData = user.toSafeObject();
    const newAccessToken = signAccessToken(userData);
    const newRefreshToken = signRefreshToken(userData);

    user.refreshToken = newRefreshToken;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        token: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// Destroys the Passport session (browser clients) and
// invalidates the stored refresh token (API clients).
// ─────────────────────────────────────────────────────────
export async function logout(req, res, next) {
  try {
    // Clear the stored refresh token from DB (API clients)
    if (req.user) {
      const user = await User.findById(req.user._id).select('+refreshToken');

      if (user) {
        user.refreshToken = null;
        await user.save();
      }
    }

    // Destroy the Passport session (browser clients)
    req.logout((logoutErr) => {
      if (logoutErr) return next(logoutErr);

      // Destroy the underlying session and clear cookie
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          // Non-fatal – respond OK anyway
          console.error('Session destroy error:', destroyErr);
        }

        res.clearCookie('connect.sid');
        return res.status(200).json({
          success: true,
          message: 'Logged out successfully'
        });
      });
    });
  } catch (error) {
    return next(error);
  }
}
