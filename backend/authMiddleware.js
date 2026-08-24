// authMiddleware.js
// Vérifie qu'une requête porte un token JWT valide.
//
// Source du token, par ordre de priorité :
//   1) le cookie httpOnly "stb_token" (utilisé par le frontend web —
//      inaccessible en JavaScript côté navigateur, donc protégé contre le
//      vol par XSS)
//   2) le header "Authorization: Bearer <token>" (utile pour des clients
//      qui ne gèrent pas les cookies : app mobile, script, Postman...)

const jwt = require("jsonwebtoken");

function extraireToken(req) {
  if (req.cookies && req.cookies.stb_token) {
    return req.cookies.stb_token;
  }
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme === "Bearer" && token) {
    return token;
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = extraireToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentification requise. Veuillez vous connecter.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { sub, username, fullName, role }
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Session invalide ou expirée. Veuillez vous reconnecter.",
    });
  }
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: "Accès réservé aux comptes superviseurs.",
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
