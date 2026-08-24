// uploadMiddleware.js
// Configuration Multer pour l'upload de justificatifs (photo de reçu,
// capture d'écran d'une transaction) joints à une réclamation.

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { randomUUID } = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const TYPES_AUTORISES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    // Un sous-dossier par utilisateur : isole les fichiers et simplifie le
    // controle d'acces (on ne sert que le dossier du user_id du token).
    const dir = path.join(UPLOAD_DIR, String(req.user.sub));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Nom aleatoire : n'expose jamais le nom de fichier original (qui
    // pourrait contenir des informations sensibles) et evite tout risque
    // d'ecrasement/de path traversal.
    const ext = EXTENSIONS[file.mimetype] || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const uploadJustificatif = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo
  fileFilter(req, file, cb) {
    // Premier filtre, rapide : le mimetype declare par le navigateur.
    // Insuffisant a lui seul (facilement falsifie), voir verifierSignatureFichier
    // ci-dessous pour la verification qui compte vraiment.
    if (!TYPES_AUTORISES.has(file.mimetype)) {
      return cb(new Error("Type de fichier non autorisé (image ou PDF uniquement)."));
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------
// Verification du contenu reel du fichier ("magic bytes"), a appliquer
// APRES l'upload (le fileFilter de Multer ne voit que l'en-tete HTTP
// Content-Type, que n'importe quel client peut mentir sur -- par exemple
// renommer un .exe en .jpg et forcer le Content-Type "image/jpeg").
// On lit les premiers octets du fichier ecrit sur disque et on les
// compare a la signature binaire connue du type annonce. En cas de
// non-correspondance, le fichier est supprime immediatement.
// ---------------------------------------------------------------------

const SIGNATURES = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // "RIFF", verif "WEBP" a l'offset 8 ci-dessous
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // "%PDF"
};

function correspondSignature(buffer, mimetype) {
  const signatures = SIGNATURES[mimetype];
  if (!signatures) return false;

  const ok = signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
  if (!ok) return false;

  if (mimetype === "image/webp") {
    const webpTag = buffer.slice(8, 12).toString("ascii");
    if (webpTag !== "WEBP") return false;
  }
  return true;
}

function verifierSignatureFichier(req, res, next) {
  if (!req.file) return next();

  const cheminAbsolu = path.join(req.file.destination, req.file.filename);
  const handle = fs.openSync(cheminAbsolu, "r");
  const buffer = Buffer.alloc(12);
  fs.readSync(handle, buffer, 0, 12, 0);
  fs.closeSync(handle);

  if (!correspondSignature(buffer, req.file.mimetype)) {
    fs.unlinkSync(cheminAbsolu);
    return res.status(400).json({
      success: false,
      message: "Le contenu du fichier ne correspond pas au type déclaré. Fichier rejeté.",
    });
  }

  next();
}

module.exports = { uploadJustificatif, UPLOAD_DIR, verifierSignatureFichier };
