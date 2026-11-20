// Monta os Conectores do Radar pela lista RADAR_FONTES (padrão: gupy, linkedin, indeed, github).
// A ordem importa pouco para o resultado, mas as fontes com busca focada em Brasília vêm antes do GitHub:
// elas são as que atingem a Cota DF (50%) com facilidade.
const { criarConectoresGithub } = require("./github");
const { criarConectorGupy } = require("./gupy");
const { criarConectorLinkedin } = require("./linkedin");
const { criarConectorIndeed } = require("./indeed");

/**
 * @param {{ radar: { fontes: string[], reposGithub: string[], githubToken: string } }} config
 * @returns {import("../tipos").Conector[]}
 */
function criarConectores(config) {
  const fabricas = /** @type {Record<string, () => import("../tipos").Conector[]>} */ ({
    gupy: () => [criarConectorGupy()],
    linkedin: () => [criarConectorLinkedin()],
    indeed: () => [criarConectorIndeed()],
    github: () => criarConectoresGithub({ repos: config.radar.reposGithub, token: config.radar.githubToken })
  });
  return config.radar.fontes.flatMap((fonte) => fabricas[fonte]());
}

module.exports = { criarConectores };
