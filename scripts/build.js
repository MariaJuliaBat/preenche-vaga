// "Build" da extensão: não há compilação, então validamos o pacote e montamos dist/.
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const erros = [];

const manifest = JSON.parse(fs.readFileSync(path.join(raiz, "manifest.json"), "utf8"));

if (manifest.manifest_version !== 3) erros.push("manifest_version deve ser 3");
for (const chave of ["name", "version", "description"]) {
  if (!manifest[chave]) erros.push(`manifest.json sem "${chave}"`);
}

const arquivos = new Set();
for (const script of manifest.content_scripts || []) {
  for (const arquivo of [...(script.js || []), ...(script.css || [])]) arquivos.add(arquivo);
}
if (manifest.action?.default_popup) arquivos.add(manifest.action.default_popup);

for (const arquivo of arquivos) {
  if (!fs.existsSync(path.join(raiz, arquivo))) {
    erros.push(`arquivo referenciado no manifest não existe: ${arquivo}`);
  }
}

if (erros.length > 0) {
  console.error("Build falhou:\n- " + erros.join("\n- "));
  process.exit(1);
}

const destino = path.join(raiz, "dist");
fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
fs.copyFileSync(path.join(raiz, "manifest.json"), path.join(destino, "manifest.json"));
for (const pasta of ["content", "popup"]) {
  if (fs.existsSync(path.join(raiz, pasta))) {
    fs.cpSync(path.join(raiz, pasta), path.join(destino, pasta), { recursive: true });
  }
}

console.log(`Build ok: ${arquivos.size} arquivo(s) validados, pacote em dist/`);
