// Datas de formação escritas à mão no Doc ("Dez/2026", "12/2029", "2029"): só serve para saber se já passou.
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * A data (fim do mês ou do ano) já ficou para trás? Texto que não dá para ler conta como futuro (nunca esconde um "previsão" por engano).
 * @param {string | null | undefined} texto @param {Date} [hoje]
 */
function dataJaPassou(texto, hoje = new Date()) {
  const t = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const ano = /\b(20\d{2}|19\d{2})\b/.exec(t);
  if (!ano) return false;
  const y = Number(ano[1]);
  const mesNome = MESES.findIndex((m) => new RegExp(`\b${m}[a-z]*\b`).test(t));
  const mesNumero = /\b(0?[1-9]|1[0-2])\s*[/.-]\s*(?:19|20)\d{2}\b/.exec(t);
  const mes = mesNome >= 0 ? mesNome : mesNumero ? Number(mesNumero[1]) - 1 : 11; // só o ano: vale até dezembro
  const fim = new Date(y, mes + 1, 1); // 1º dia do mês seguinte
  return fim.getTime() <= hoje.getTime();
}

module.exports = { dataJaPassou };
