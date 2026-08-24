// db.js
// Connexion SQLite partagée et schéma de toute l'application (utilisateurs,
// réclamations, messages, retours, notifications). Un seul fichier
// stb.db, une seule connexion réutilisée par tous les modules.
//
// Utilise le module SQLite integre a Node.js (node:sqlite, disponible sans
// aucune compilation native) plutot qu'un paquet npm comme better-sqlite3 :
// ce dernier doit etre recompile depuis les sources sur chaque machine
// (Windows, Mac, Linux) et echoue souvent faute d'outils de compilation
// installes (Visual Studio Build Tools sur Windows, notamment). node:sqlite
// evite entierement ce probleme - c'est pourquoi Node.js >= 22.5 est requis
// (voir engines dans package.json).

const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "stb.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    fullName TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent',
    email TEXT,
    telephone TEXT,
    failedAttempts INTEGER NOT NULL DEFAULT 0,
    lockedUntil INTEGER
  );

  -- Une reclamation = un "ticket" ouvert des qu'une conversation identifie
  -- un vrai probleme (sous_categorie != hors_sujet / salutation).
  CREATE TABLE IF NOT EXISTS reclamations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    sous_categorie TEXT NOT NULL,
    resume TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'recu', -- recu | en_cours | resolu
    escalade_humaine INTEGER NOT NULL DEFAULT 0,
    escalade_traitee INTEGER NOT NULL DEFAULT 0,
    justificatif_path TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reclamation_id INTEGER REFERENCES reclamations(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL, -- user | bot
    texte TEXT NOT NULL,
    sous_categorie TEXT,
    degrade INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL, -- 1 = pouce leve, -1 = pouce baisse
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS notifications_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reclamation_id INTEGER NOT NULL REFERENCES reclamations(id),
    canal TEXT NOT NULL, -- email | sms
    destinataire TEXT NOT NULL,
    contenu TEXT NOT NULL,
    statut TEXT NOT NULL, -- simule | envoye | echec
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reclamations_user ON reclamations(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_reclamation ON messages(reclamation_id);
  CREATE INDEX IF NOT EXISTS idx_reclamations_escalade ON reclamations(escalade_humaine, escalade_traitee);
`);

module.exports = db;
