const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules/", "dist/", "paginas-teste/"] },
  js.configs.recommended,
  {
    // Scripts da extensão: rodam no navegador, são scripts clássicos (não módulos).
    files: ["content/**/*.js", "popup/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions, MAPEAMENTO_CAMPOS: "readonly", ImportarDocx: "readonly" }
    }
  },
  {
    // Scripts de build e testes: rodam no Node.
    files: ["scripts/**/*.js", "pipeline/**/*.js", "dashboard/*.js", "tests/**/*.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node
    }
  },
  {
    // Front-end do Dashboard: script clássico no navegador.
    files: ["dashboard/public/**/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser }
  }
];
