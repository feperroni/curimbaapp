import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SENHA = process.env.SENHA_EDICAO || 'casua';

if (!process.env.SENHA_EDICAO) {
  console.warn('[seguranca] SENHA_EDICAO nao definida. Usando a senha padrao, que e publica no repositorio. Defina a variavel antes de expor a URL.');
}

/* Atras do proxy do Railway, sem isto req.ip seria sempre o do proxy e um
   unico atacante bloquearia todo mundo no limitador. */
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* Cabecalhos de seguranca, a mao para nao adicionar dependencia.
   O app nao tem script nem style inline, entao 'self' basta. */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'screen-wake-lock=(self), camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; '));
  if (req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '256kb' }));
/* Sem cache longo de proposito. Com maxAge alto, depois de um deploy o navegador
   pode servir um app.js velho junto de um index.html novo (ou o contrario), e a
   tela abre em branco. Os arquivos sao pequenos; revalidar sempre sai barato. */
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  maxAge: 0,
  setHeaders(res, caminho) {
    if (caminho.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    else res.setHeader('Cache-Control', 'no-cache');
  }
}));

/* Comparacao de tempo constante. Compara o SHA-256 dos dois para que o
   tamanho da senha enviada tambem nao vaze pelo timing. */
const DIGEST_SENHA = crypto.createHash('sha256').update(SENHA).digest();

function senhaConfere(enviada) {
  const d = crypto.createHash('sha256').update(String(enviada)).digest();
  return crypto.timingSafeEqual(d, DIGEST_SENHA);
}

/* Limitador de forca bruta.
 * Conta so as tentativas que falham, entao editar 50 pontos numa sessao nunca
 * esbarra nele. Passadas MAX_FALHAS, o IP fica bloqueado por um tempo que
 * dobra a cada nova rodada de erros, ate o teto.
 * E em memoria: reiniciar o servico zera. Suficiente para um terreiro, e sem
 * dependencia nova. Se um dia rodar em varias instancias, isto precisa sair
 * para Redis ou para o banco. */
const JANELA_MS = 15 * 60 * 1000;
const MAX_FALHAS = 10;
const BLOQUEIOS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const ATRASO_FALHA_MS = 400;
const TETO_IPS = 5000;

const tentativas = new Map(); // ip -> { falhas, rodada, expira, bloqueadoAte }

function limparVelhos(agora) {
  for (const [ip, t] of tentativas) {
    if (t.expira < agora && (t.bloqueadoAte || 0) < agora) tentativas.delete(ip);
  }
  // se ainda estiver grande demais, descarta os mais antigos: um atacante que
  // rotaciona IPs nao pode fazer a memoria crescer sem limite
  if (tentativas.size > TETO_IPS) {
    const ordenados = [...tentativas.entries()].sort((a, b) => a[1].expira - b[1].expira);
    for (const [ip] of ordenados.slice(0, tentativas.size - TETO_IPS)) tentativas.delete(ip);
  }
}

const espera = ms => new Promise(r => setTimeout(r, ms));

async function exigeSenha(req, res, next) {
  const agora = Date.now();
  const ip = req.ip || 'desconhecido';
  if (Math.random() < 0.02) limparVelhos(agora);

  const t = tentativas.get(ip);
  if (t?.bloqueadoAte > agora) {
    const segundos = Math.ceil((t.bloqueadoAte - agora) / 1000);
    res.setHeader('Retry-After', String(segundos));
    return res.status(429).json({
      erro: `Muitas tentativas. Tente de novo em ${Math.ceil(segundos / 60)} min.`
    });
  }

  if (senhaConfere(req.get('x-senha') || '')) {
    tentativas.delete(ip);
    return next();
  }

  const reg = (t && t.expira > agora) ? t : { falhas: 0, rodada: 0, expira: agora + JANELA_MS };
  reg.falhas += 1;
  if (reg.falhas >= MAX_FALHAS) {
    reg.bloqueadoAte = agora + BLOQUEIOS_MS[Math.min(reg.rodada, BLOQUEIOS_MS.length - 1)];
    reg.rodada += 1;
    reg.falhas = 0;
    reg.expira = reg.bloqueadoAte + JANELA_MS;
    console.warn(`[seguranca] ${ip} bloqueado ate ${new Date(reg.bloqueadoAte).toISOString()}`);
  }
  tentativas.set(ip, reg);

  // atraso fixo em toda falha: encarece forca bruta ate distribuida, de graca
  await espera(ATRASO_FALHA_MS);
  return res.status(401).json({ erro: 'Senha incorreta' });
}

function validar(body) {
  const erros = [];
  const p = {
    linha: String(body.linha || '').trim(),
    entidade: String(body.entidade || '').trim(),
    entidade_especifica: body.entidade_especifica ? String(body.entidade_especifica).trim() : null,
    momento: String(body.momento || 'firmeza').trim(),
    ritmos: Array.isArray(body.ritmos) ? body.ritmos.filter(r => db.RITMOS.includes(r)) : [],
    ritmo_original: body.ritmo_original ? String(body.ritmo_original) : null,
    coringa: Boolean(body.coringa),
    da_casa: Boolean(body.da_casa),
    titulo: String(body.titulo || '').trim(),
    letra: String(body.letra || '').trim()
  };
  if (!db.LINHAS.includes(p.linha)) erros.push('linha invalida');
  if (!p.entidade) erros.push('entidade obrigatoria');
  if (!db.MOMENTOS.includes(p.momento)) erros.push('momento invalido');
  if (!p.letra) erros.push('letra obrigatoria');
  if (!p.ritmos.length) erros.push('escolha ao menos um ritmo');
  if (!p.titulo) {
    p.titulo = p.letra.split('\n')[0].replace(/\((bis|2x|3x|4x)\)/gi, '').trim().slice(0, 46);
  }
  return { p, erros };
}

app.get('/api/meta', (req, res) => {
  res.json({ linhas: db.LINHAS, momentos: db.MOMENTOS, ritmos: db.RITMOS });
});

app.get('/api/pontos', async (req, res, next) => {
  try {
    res.json(await db.listar());
  } catch (e) { next(e); }
});

/* /api/login foi removido: o frontend nunca usou, e ele era um oraculo
   de senha, um endpoint que responde "acertou ou nao" de graca. */

app.post('/api/pontos', exigeSenha, async (req, res, next) => {
  try {
    const { p, erros } = validar(req.body);
    if (erros.length) return res.status(400).json({ erro: erros.join('; ') });
    res.status(201).json(await db.criar(p));
  } catch (e) { next(e); }
});

app.put('/api/pontos/:id', exigeSenha, async (req, res, next) => {
  try {
    const { p, erros } = validar(req.body);
    if (erros.length) return res.status(400).json({ erro: erros.join('; ') });
    const atualizado = await db.atualizar(Number(req.params.id), p);
    if (!atualizado) return res.status(404).json({ erro: 'Ponto nao encontrado' });
    res.json(atualizado);
  } catch (e) { next(e); }
});

app.delete('/api/pontos/:id', exigeSenha, async (req, res, next) => {
  try {
    const ok = await db.excluir(Number(req.params.id));
    res.status(ok ? 204 : 404).end();
  } catch (e) { next(e); }
});

/* O favorito nao pede senha, entao precisa de um teto de volume proprio:
   sem ele, qualquer um com a URL poderia martelar a rota. 120 por minuto e
   muito acima de qualquer uso humano num tablet. */
const CHAMADAS_MAX = 120;
const CHAMADAS_JANELA_MS = 60_000;
const chamadas = new Map(); // ip -> { n, expira }

function limitaVolume(req, res, next) {
  const agora = Date.now();
  const ip = req.ip || 'desconhecido';
  if (chamadas.size > TETO_IPS) chamadas.clear();
  const c = chamadas.get(ip);
  const reg = (c && c.expira > agora) ? c : { n: 0, expira: agora + CHAMADAS_JANELA_MS };
  reg.n += 1;
  chamadas.set(ip, reg);
  if (reg.n > CHAMADAS_MAX) {
    res.setHeader('Retry-After', String(Math.ceil((reg.expira - agora) / 1000)));
    return res.status(429).json({ erro: 'Muitas chamadas seguidas. Espere um minuto.' });
  }
  next();
}

/* Favorito nao pede senha de proposito: e um toque so, durante a gira,
   e totalmente reversivel. Exigir senha aqui atrapalharia o uso ao vivo. */
app.patch('/api/pontos/:id/favorito', limitaVolume, async (req, res, next) => {
  try {
    const p = await db.marcarFavorito(Number(req.params.id), Boolean(req.body?.favorito));
    if (!p) return res.status(404).json({ erro: 'Ponto nao encontrado' });
    res.json(p);
  } catch (e) { next(e); }
});

/* ---------- giras (roteiros ordenados) ---------- */

function validarGira(body) {
  const nome = String(body?.nome || '').trim();
  const observacao = body?.observacao ? String(body.observacao).trim() : null;
  const pontos = Array.isArray(body?.pontos)
    ? [...new Set(body.pontos.map(Number).filter(Number.isInteger))]
    : [];
  const erros = [];
  if (!nome) erros.push('a gira precisa de um nome');
  if (nome.length > 80) erros.push('nome muito longo');
  return { gira: { nome, observacao, pontos }, erros };
}

app.get('/api/giras', async (req, res, next) => {
  try {
    res.json(await db.listarGiras());
  } catch (e) { next(e); }
});

app.post('/api/giras', exigeSenha, async (req, res, next) => {
  try {
    const { gira, erros } = validarGira(req.body);
    if (erros.length) return res.status(400).json({ erro: erros.join('; ') });
    res.status(201).json(await db.criarGira(gira));
  } catch (e) { next(e); }
});

app.put('/api/giras/:id', exigeSenha, async (req, res, next) => {
  try {
    const { gira, erros } = validarGira(req.body);
    if (erros.length) return res.status(400).json({ erro: erros.join('; ') });
    const atualizada = await db.atualizarGira(Number(req.params.id), gira);
    if (!atualizada) return res.status(404).json({ erro: 'Gira nao encontrada' });
    res.json(atualizada);
  } catch (e) { next(e); }
});

app.delete('/api/giras/:id', exigeSenha, async (req, res, next) => {
  try {
    const ok = await db.excluirGira(Number(req.params.id));
    res.status(ok ? 204 : 404).end();
  } catch (e) { next(e); }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno' });
});

db.init()
  .then(() => app.listen(PORT, () => console.log(`Curimba no ar em http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Falha ao iniciar o banco:', err);
    process.exit(1);
  });
