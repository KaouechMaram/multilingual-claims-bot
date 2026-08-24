// users.js
// Requêtes liées aux utilisateurs, sur la base SQLite partagée (db.js).

const bcrypt = require("bcryptjs");
const db = require("./db");

// Comptes de démonstration, créés une seule fois si la base est vide.
const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get();
if (count === 0) {
  db.prepare(
    `INSERT INTO users (username, fullName, passwordHash, role, email)
     VALUES (?, ?, ?, ?, ?)`
  ).run("demo", "Utilisateur Démo", bcrypt.hashSync("Demo1234!", 10), "agent", "demo@stb-demo.local");
  db.prepare(
    `INSERT INTO users (username, fullName, passwordHash, role, email)
     VALUES (?, ?, ?, ?, ?)`
  ).run("admin", "Superviseur Démo", bcrypt.hashSync("Admin1234!", 10), "admin", "admin@stb-demo.local");
}

// ---------- Politique de mot de passe ----------
// Minimum 8 caractères, au moins une majuscule, une minuscule et un chiffre.
const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function validerPolitiqueMotDePasse(motDePasse) {
  if (typeof motDePasse !== "string" || !PASSWORD_POLICY_REGEX.test(motDePasse)) {
    return {
      valide: false,
      message:
        "Le mot de passe doit contenir au moins 8 caractères, une majuscule, " +
        "une minuscule et un chiffre.",
    };
  }
  return { valide: true };
}

function findByUsername(username) {
  return db
    .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)")
    .get(String(username));
}

function findById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function updateUser(id, patch) {
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!current) return null;

  const next = { ...current, ...patch };
  db.prepare(
    `UPDATE users SET failedAttempts = ?, lockedUntil = ? WHERE id = ?`
  ).run(next.failedAttempts, next.lockedUntil, id);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function createUser({ username, fullName, password, role = "agent" }) {
  const check = validerPolitiqueMotDePasse(password);
  if (!check.valide) {
    throw new Error(check.message);
  }
  if (findByUsername(username)) {
    throw new Error(`L'utilisateur '${username}' existe déjà.`);
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (username, fullName, passwordHash, role)
       VALUES (?, ?, ?, ?)`
    )
    .run(username, fullName, passwordHash, role);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
}

module.exports = {
  findByUsername,
  findById,
  updateUser,
  createUser,
  validerPolitiqueMotDePasse,
};
