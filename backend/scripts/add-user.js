// scripts/add-user.js
// Ajoute un utilisateur à la base SQLite, avec vérification de la
// politique de mot de passe.
//
// Usage :
//   node scripts/add-user.js <identifiant> "<Nom complet>" <mot_de_passe> [role]

const { createUser } = require("../users");

const [, , username, fullName, password, role] = process.argv;

if (!username || !fullName || !password) {
  console.log("Usage : node scripts/add-user.js <identifiant> \"<Nom complet>\" <mot_de_passe> [role]");
  process.exit(1);
}

try {
  const user = createUser({ username, fullName, password, role: role || "agent" });
  console.log(`✅ Utilisateur créé : ${user.username} (id ${user.id}, rôle ${user.role})`);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
