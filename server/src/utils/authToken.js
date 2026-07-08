// ─────────────────────────────────────────────────────────
// JWT Utility – sign & verify access + refresh tokens
// ─────────────────────────────────────────────────────────

import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Sign a short-lived access token.
 * Payload includes: sessionId, sub (user id), role, name.
 */
export function signAccessToken(sessionId, user) {
  return jwt.sign(
    {
      sessionId: sessionId.toString(),
      sub: user.id,
      role: user.role,
      name: user.fullName
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/**
 * Verify an access token and return the decoded payload.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

/**
 * Sign a long-lived refresh token.
 * Payload only contains sub (user id) – minimal surface.
 */
export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpiresIn }
  );
}

/**
 * Verify a refresh token and return the decoded payload.
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
