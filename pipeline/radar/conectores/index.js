// Monta os Conectores do Radar pela lista RADAR_FONTES (padrão: gupy, solides, infojobs, linkedin, indeed, github).
// As fontes abertas e com busca focada em Brasília vêm antes: são as que atingem a Cota DF (50%) com facilidade.
// LinkedIn e Indeed costumam bloquear acesso automatizado; quando bloqueiam, só relatam (ver cada Conector).
const { criarConectoresGithub } = require("./github");
const { criarConectorGupy } = require("./gupy");
const { criarConectorSolides } = require("./solides");
const { criarConectorInfojobs } = require("./infojobs");
const { criarConectorLinkedin } = require("./linkedin");
const { criarConectorIndeed } = require("./indeed");

/**
 * @param {{ radar: { fontes: string[], reposGithub: string[], githubToken: string } }} config
 * @returns {import("../tipos").Conector[]}
 */
function criarConectores(config) {
  const fabricas = /** @type {Record<string, () => import("../tipos").Conector[]>} */ ({
    gupy: () => [criarConectorGupy()],
    solides: () => [criarConectorSolides()],
    infojobs: () => [criarConectorInfojobs()],
    linkedin: () => [criarConectorLinkedin()],
    indeed: () => [criarConectorIndeed()],
    github: () => criarConectoresGithub({ repos: config.radar.reposGithub, token: config.radar.githubToken })
  });
  return config.radar.fontes.flatMap((fonte) => fabricas[fonte]());
}

module.exports = { criarConectores };
