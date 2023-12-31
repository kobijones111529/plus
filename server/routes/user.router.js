/**
 * @typedef {import("../server")}
 */

const express = require("express");
const {
  rejectUnauthenticated,
} = require("../modules/authentication-middleware");
const encryptLib = require("../modules/encryption");
const pool = require("../modules/pool");
const userStrategy = require("../strategies/user.strategy");

const router = express.Router();

// Handles Ajax request for user information if user is authenticated
router.get("/", rejectUnauthenticated, (req, res) => {
  if (!req.user) {
    res.sendStatus(500);
    return;
  }

  // Send back user object from the session (previously queried from the database)
  res.send(req.user);
});

router.get(
  "/can-upload",
  rejectUnauthenticated,
  /**
   * @param {import("express").Request<{}, { canUpload: boolean }>} req
   * @param {import("express").Response<{ canUpload: boolean }>} res
   * @returns
   */
  (req, res) => {
    if (!req.user) {
      res.sendStatus(500);
      return;
    }

    const lastUploadedAt = req.user.lastUploadedAt;
    if (!lastUploadedAt) {
      res.send({ canUpload: true });
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    res.send({ canUpload: lastUploadedAt < today });
  }
);

// Handles POST request with new user data
// The only thing different from this and every other post we've seen
// is that the password gets encrypted before being inserted
router.post("/register", async (req, res) => {
  /**
   * @typedef RequestBody
   * @property {string} username
   * @property {string} password
   */

  /**
   * @param {{[key: string]: any}} body
   * @returns {RequestBody | null}
   */
  const validate = (body) => {
    const username = body["username"];
    const password = body["password"];

    if (typeof username !== "string" || typeof password !== "string") {
      return null;
    }

    return { username, password };
  };

  const body = validate(req.body);
  // Malformed request
  if (!body) {
    res.sendStatus(400);
    return;
  }

  const passwordHash = encryptLib.encryptPassword(body.password);

  try {
    await pool.query(
      `
        INSERT INTO "users" ("email", "password")
        VALUES ($1, $2) RETURNING "id"
      `,
      [body.username, passwordHash]
    );
    res.sendStatus(201);
  } catch (err) {
    console.error("Registration failed:", err);
    res.sendStatus(500);
  }
});

// Handles login form authenticate/login POST
// userStrategy.authenticate('local') is middleware that we run on this route
// this middleware will run our POST if successful
// this middleware will send a 404 if not successful
router.post("/login", userStrategy.authenticate("local"), (_req, res) => {
  res.sendStatus(200);
});

// clear all server session information about this user
router.post("/logout", (req, res) => {
  // Use passport's built-in method to log out the user
  req.logout(() => {});
  res.sendStatus(200);
});

router.get("/tokens", rejectUnauthenticated, (req, res) => {
  if (!req.user) {
    res.sendStatus(500);
    return;
  }

  res.send({ tokens: req.user.tokens });
});

module.exports = router;
