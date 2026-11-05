// Copia .agents/ (fonte única) para .claude/, que é onde o Claude Code procura
// agentes e skills. No Windows, links simbólicos costumam não funcionar, então copiamos.
// Rode depois de editar qualquer arquivo em .agents/: npm run agents:sync
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const origem = path.join(raiz, ".agents");
const destino = path.join(raiz, ".claude");

let copiados = 0;
for (const pasta of ["agents", "skills"]) {
  const de = path.join(origem, pasta);
  if (!fs.existsSync(de)) continue;
  for (const item of fs.readdirSync(de)) {
    fs.cpSync(path.join(de, item), path.join(destino, pasta, item), { recursive: true });
    copiados += 1;
  }
}

console.log(`agents:sync ok: ${copiados} item(ns) copiados de .agents/ para .claude/`);
