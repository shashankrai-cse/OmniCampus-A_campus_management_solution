// ─────────────────────────────────────────────────────────
// Auth Controller – register, login, me, refresh, logout
// Login now establishes a Passport session (connect-mongo)
// and still returns JWT tokens for API/mobile clients.
// ─────────────────────────────────────────────────────────

import { User } from './auth.model.js';
import { Session } from './session.model.js';
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
    
    // Create a new session in MongoDB
    const session = await Session.create({ userId: user._id, user: userData });
    
    const accessToken = signAccessToken(session._id, userData);
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
        refreshToken,
        sessionId: session._id
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
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    
    // 1. Find user by email and include hidden password field
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +refreshToken');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // 2. Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // 3. Update last login timestamp
    user.lastLoginAt = new Date();

    // 4. Create Session Document
    const userData = user.toSafeObject();
    const session = await Session.create({ userId: user._id, user: userData });

    // 5. Generate fresh JWT tokens
    const accessToken = signAccessToken(session._id, userData);
    const refreshToken = signRefreshToken(userData);

    // 6. Persist refresh token
    user.refreshToken = refreshToken;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token: accessToken,
        refreshToken,
        sessionId: session._id
      }
    });
  } catch (error) {
    return next(error);
  }
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
    
    // Create new session for the new access token
    const session = await Session.create({ userId: user._id, user: userData });
    
    const newAccessToken = signAccessToken(session._id, userData);
    const newRefreshToken = signRefreshToken(userData);

    user.refreshToken = newRefreshToken;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        token: newAccessToken,
        refreshToken: newRefreshToken,
        sessionId: session._id
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
    // If user is authenticated, clear their refresh token from DB
    if (req.user) {
      const user = await User.findById(req.user._id).select('+refreshToken');
      if (user) {
        user.refreshToken = null;
        await user.save();
      }
    }
    
    // Destroy the custom JWT session if sessionId is attached to the request
    if (req.sessionId) {
      await Session.findByIdAndDelete(req.sessionId);
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    return next(error);
  }
}
