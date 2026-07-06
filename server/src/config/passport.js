// ─────────────────────────────────────────────────────────
// Passport Configuration – Local Strategy
// Registers the local strategy and serialize/deserialize hooks.
// Import this file once (in app.js) to activate it globally.
// ─────────────────────────────────────────────────────────

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { User } from '../modules/auth/auth.model.js';

// ── Local Strategy ──────────────────────────────────────
// Authenticates a user by email + password using the
// existing bcrypt comparePassword instance method.
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',   // field names sent in POST body
      passwordField: 'password',
      session: true
    },
    async (email, password, done) => {
      try {
        // Include password field (hidden by default via select: false)
        const user = await User.findOne({ email: email.toLowerCase() }).select(
          '+password +refreshToken'
        );

        if (!user) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// ── Serialize: store only the user _id in the session ──
passport.serializeUser((user, done) => {
  done(null, user._id.toString());
});

// ── Deserialize: load the full user document per request ─
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

export default passport;
