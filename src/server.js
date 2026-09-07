import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SENHA = process.env.SENHA_EDICAO || 'cazua';

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

function exigeSenha(req, res, next) {
  const enviada = req.get('x-senha') || '';
  if (enviada !== SENHA) {
    return res.status(401).json({ erro: 'Senha incorreta' });
  }
  next();
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

app.post('/api/login', (req, res) => {
  const ok = (req.body?.senha || '') === SENHA;
  res.status(ok ? 200 : 401).json({ ok });
});

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

/* Favorito nao pede senha de proposito: e um toque so, durante a gira,
   e totalmente reversivel. Exigir senha aqui atrapalharia o uso ao vivo. */
app.patch('/api/pontos/:id/favorito', async (req, res, next) => {
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
