// auditLog.js
// Journalisation minimale des évènements de sécurité (connexions
// réussies/échouées, verrouillages de compte). Fichier append-only,
// une ligne JSON par évènement (format facile à parser/agréger plus tard
// avec un vrai outil de log - ELK, Datadog, etc.).
//
// Ne journalise jamais le mot de passe, seulement le résultat.

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const LOG_PATH = path.join(LOG_DIR, "audit.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function auditLog(event, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  fs.appendFile(LOG_PATH, JSON.stringify(entry) + "\n", (err) => {
    if (err) console.error("Erreur d'écriture du journal d'audit :", err.message);
  });
}

module.exports = { auditLog };
