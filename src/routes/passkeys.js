const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Lazy-load ESM-only @simplewebauthn/server
const webauthn = import('@simplewebauthn/server');

const RP_NAME = 'Estatecraft';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'ops.estate';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || `https://${RP_ID}`;

// In-memory challenge store (single server, fine for this use case)
const challenges = new Map();

function storeChallenge(key, challenge) {
  challenges.set(key, { challenge, expires: Date.now() + 5 * 60 * 1000 });
}

function getChallenge(key) {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.challenge;
}

function getUserPasskeys(userId) {
  return db.prepare('SELECT * FROM user_passkeys WHERE user_id = ?').all(userId);
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// --- Registration (requires auth — user adding a passkey to their account) ---

// POST /register-options
router.post('/register-options', authenticate, async (req, res) => {
  try {
    const { generateRegistrationOptions } = await webauthn;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existingPasskeys = getUserPasskeys(user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map(pk => ({
        id: pk.credential_id,
        transports: pk.transports ? JSON.parse(pk.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    storeChallenge(`reg:${user.id}`, options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate options', details: err.message });
  }
});

// POST /register-verify
router.post('/register-verify', authenticate, async (req, res) => {
  try {
    const { verifyRegistrationResponse } = await webauthn;

    const expectedChallenge = getChallenge(`reg:${req.user.id}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expired or missing. Please try again.' });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body.credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey verification failed' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    db.prepare(`
      INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, transports, name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      credential.id,
      Buffer.from(credential.publicKey),
      credential.counter,
      credentialDeviceType || null,
      credentialBackedUp ? 1 : 0,
      credential.transports ? JSON.stringify(credential.transports) : null,
      req.body.name || 'Passkey'
    );

    logActivity('user', req.user.id, 'passkey_registered', 'Passkey registered', req.user.id);

    res.json({ verified: true });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed', details: err.message });
  }
});

// --- Authentication (no auth required — this IS the login flow) ---

// POST /login-options
router.post('/login-options', async (req, res) => {
  try {
    const { generateAuthenticationOptions } = await webauthn;

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      // No allowCredentials — let the browser/OS show all available passkeys for this RP
    });

    storeChallenge(`auth:${options.challenge}`, options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate options', details: err.message });
  }
});

// POST /login-verify
router.post('/login-verify', async (req, res) => {
  try {
    const { verifyAuthenticationResponse } = await webauthn;

    const { credential, challenge } = req.body;
    if (!credential || !credential.id) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    // Look up the passkey by credential ID
    const passkey = db.prepare('SELECT * FROM user_passkeys WHERE credential_id = ?').get(credential.id);
    if (!passkey) {
      return res.status(401).json({ error: 'Passkey not recognized' });
    }

    // Retrieve challenge — keyed by the challenge value itself
    const foundChallenge = challenge ? getChallenge(`auth:${challenge}`) : null;
    if (!foundChallenge) {
      return res.status(400).json({ error: 'Challenge expired. Please try again.' });
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: foundChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(passkey.public_key),
        counter: passkey.counter,
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ error: 'Passkey authentication failed' });
    }

    // Update counter and last used
    db.prepare('UPDATE user_passkeys SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(verification.authenticationInfo.newCounter, passkey.id);

    // Get the user and issue a JWT
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(passkey.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User account is inactive' });
    }

    const token = generateToken(user);
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed', details: err.message });
  }
});

// --- Management (requires auth) ---

// GET /  — list user's passkeys
router.get('/', authenticate, (req, res) => {
  try {
    const passkeys = db.prepare(
      'SELECT id, name, device_type, backed_up, created_at, last_used_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id);
    res.json(passkeys);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch passkeys', details: err.message });
  }
});

// DELETE /:id — remove a passkey
router.delete('/:id', authenticate, (req, res) => {
  try {
    const passkey = db.prepare('SELECT * FROM user_passkeys WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!passkey) return res.status(404).json({ error: 'Passkey not found' });

    db.prepare('DELETE FROM user_passkeys WHERE id = ?').run(req.params.id);
    logActivity('user', req.user.id, 'passkey_removed', 'Passkey removed', req.user.id);
    res.json({ message: 'Passkey removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove passkey', details: err.message });
  }
});

// PUT /:id — rename a passkey
router.put('/:id', authenticate, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const passkey = db.prepare('SELECT * FROM user_passkeys WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!passkey) return res.status(404).json({ error: 'Passkey not found' });

    db.prepare('UPDATE user_passkeys SET name = ? WHERE id = ?').run(name, req.params.id);
    res.json({ message: 'Passkey renamed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename passkey', details: err.message });
  }
});

module.exports = router;
