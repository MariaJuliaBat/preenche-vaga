// Agente Assistente de Candidatura: laço de Tool Calling com Streaming e, no modo "analise", Structured Output ancorado.
// Eventos emitidos (A8): ferramenta (inicio/fim), texto, analise, erro e fim. O Agente nunca lança para quem o chamou.
const { SYSTEM_PROMPT, blocoDeDados } = require("./prompt");
const { pedirAnalise, ancorarAnalise } = require("./analise");

const MAX_PASSOS_PADRAO = 5;

const PEDIDO_DE_ANALISE = "Agora devolva a Análise de Aderência no formato pedido, usando só o que as ferramentas trouxeram. "
  + "Se a Candidata trouxe uma pergunta aberta de formulário, escreva o rascunhoResposta; senão use null. "
  + "Em cada evidência, copie um trecho literal da Base ou do Perfil.";

/**
 * @param {{
 *   cliente: { transmitir: (p: any) => AsyncIterable<any>, gerar: (p: any) => Promise<string> },
 *   ferramentas: ReturnType<typeof import("./ferramentas").criarFerramentas>,
 *   maxPassos?: number
 * }} deps
 */
function criarAgente({ cliente, ferramentas, maxPassos = MAX_PASSOS_PADRAO }) {
  if (!cliente) throw new Error("Agente sem cliente do modelo.");

  return {
    /**
     * @param {{ pergunta: string, modo?: "conversa" | "analise", perguntaDoFormulario?: string, onEvento?: (e: any) => void }} args
     */
    async executar({ pergunta, modo = "conversa", perguntaDoFormulario, onEvento = () => {} }) {
      const emitir = (/** @type {any} */ e) => { try { onEvento(e); } catch { /* quem escuta não derruba o Agente */ } };
      /** @type {string[]} */
      const fontes = [];
      /** @type {string[]} */
      const usadas = [];
      let passos = 0;
      let ok = true;

      const pedido = [pergunta, perguntaDoFormulario ? `Pergunta aberta do formulário:\n${blocoDeDados("pergunta de formulário", perguntaDoFormulario)}` : ""].filter(Boolean).join("\n\n");
      /** @type {any[]} */
      const contents = [{ role: "user", parts: [{ text: pedido }] }];

      try {
        let terminou = false;
        while (!terminou && passos < maxPassos) {
          passos++;
          /** @type {any[]} */
          const partes = [];
          /** @type {any[]} */
          const chamadas = [];
          for await (const chunk of cliente.transmitir({ systemInstruction: SYSTEM_PROMPT, contents, tools: ferramentas.declaracoes })) {
            for (const parte of chunk?.candidates?.[0]?.content?.parts || []) {
              partes.push(parte);
              if (parte.functionCall) chamadas.push(parte.functionCall);
              else if (parte.text && !parte.thought) emitir({ tipo: "texto", texto: parte.text });
            }
          }
          contents.push({ role: "model", parts: partes.length ? partes : [{ text: "" }] });
          if (chamadas.length === 0) { terminou = true; break; }

          /** @type {any[]} */
          const respostas = [];
          for (const { name, args } of chamadas) {
            emitir({ tipo: "ferramenta", estado: "inicio", nome: name, args });
            const r = await ferramentas.executar(name, args); // A4: nunca lança
            usadas.push(name);
            fontes.push(...r.fontes);
            emitir({ tipo: "ferramenta", estado: "fim", nome: name, ok: r.ok });
            respostas.push({ functionResponse: { name, response: { result: r.resultado } } });
          }
          contents.push({ role: "user", parts: respostas });
        }
        if (!terminou) { ok = false; emitir({ tipo: "erro", mensagem: `Limite de ${maxPassos} passos de ferramenta atingido (A5).` }); } // A5

        if (ok && modo === "analise") {
          contents.push({ role: "user", parts: [{ text: PEDIDO_DE_ANALISE }] });
          const bruta = await pedirAnalise(cliente, { systemInstruction: SYSTEM_PROMPT, contents });
          const { analise, avisos } = ancorarAnalise(bruta, fontes); // A9
          emitir({ tipo: "analise", dados: analise, avisos });
        }
      } catch (erro) {
        ok = false;
        emitir({ tipo: "erro", mensagem: erro instanceof Error ? erro.message : "Falha no Agente." });
      }
      emitir({ tipo: "fim", ok, passos, ferramentas: [...new Set(usadas)] });
      return { ok, passos, ferramentas: usadas };
    }
  };
}

/**
 * Monta o Agente com os recursos reais do projeto (RAG, Lote Final e Perfil em output/) e o cliente Gemini.
 * @param {{ raiz: string, pastaSaida: string, env: Record<string, string | undefined>, cliente?: any, rag?: any }} args
 */
function criarAgenteDoProjeto({ raiz, pastaSaida, env, cliente, rag }) {
  const { criarClienteGemini } = require("./gemini");
  const { criarRag } = require("../rag");
  const { criarFerramentas } = require("./ferramentas");
  const { lerVagasLocais, lerPerfilLocal } = require("./fontes");
  const c = cliente || criarClienteGemini({ apiKey: env.GEMINI_API_KEY || "", modelo: env.GEMINI_MODEL || undefined });
  const r = rag || criarRag({ raiz, pastaSaida, env });
  return criarAgente({ cliente: c, ferramentas: criarFerramentas({ rag: r, lerVagas: () => lerVagasLocais(pastaSaida), lerPerfil: () => lerPerfilLocal(pastaSaida) }) });
}

module.exports = { criarAgente, criarAgenteDoProjeto, MAX_PASSOS_PADRAO };
