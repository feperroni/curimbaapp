import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'seed', 'pontos.json');
const DEV_PONTOS = path.join(__dirname, '..', 'seed', '.dev-db.json');
const DEV_GIRAS = path.join(__dirname, '..', 'seed', '.dev-giras.json');

const LINHAS = ['ritual', 'orixas', 'esquerda', 'direita'];
const MOMENTOS = ['abertura', 'defumacao', 'chamada', 'saudacao', 'firmeza', 'paga', 'descarrego', 'subida'];
const RITMOS = ['Angola', 'Ijexá', 'Nagô', 'Congo', 'Samba', 'Samba de Caboclo', 'BV', 'Barravento', 'Cabula'];

/*
 * Camada de dados. Com DATABASE_URL definida usa Postgres.
 * Sem ela, cai para arquivos JSON locais, so para desenvolvimento.
 */
const useDb = Boolean(process.env.DATABASE_URL);
let pool = null;

if (useDb) {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pontos (
  id                  SERIAL PRIMARY KEY,
  linha               TEXT NOT NULL,
  entidade            TEXT NOT NULL,
  entidade_especifica TEXT,
  momento             TEXT NOT NULL DEFAULT 'firmeza',
  ritmos              TEXT[] NOT NULL DEFAULT '{}',
  ritmo_original      TEXT,
  coringa             BOOLEAN NOT NULL DEFAULT FALSE,
  titulo              TEXT NOT NULL,
  letra               TEXT NOT NULL,
  favorito            BOOLEAN NOT NULL DEFAULT FALSE,
  da_casa             BOOLEAN NOT NULL DEFAULT FALSE,
  seed_ref            INTEGER,
  editado_manual      BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- para bancos criados antes destas colunas existirem
ALTER TABLE pontos ADD COLUMN IF NOT EXISTS da_casa        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pontos ADD COLUMN IF NOT EXISTS seed_ref       INTEGER;
ALTER TABLE pontos ADD COLUMN IF NOT EXISTS editado_manual BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pontos_seed_ref ON pontos (seed_ref) WHERE seed_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pontos_linha    ON pontos (linha);
CREATE INDEX IF NOT EXISTS idx_pontos_entidade ON pontos (entidade);
CREATE INDEX IF NOT EXISTS idx_pontos_da_casa  ON pontos (da_casa) WHERE da_casa;

CREATE TABLE IF NOT EXISTS giras (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL,
  observacao TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gira_pontos (
  gira_id  INTEGER NOT NULL REFERENCES giras(id) ON DELETE CASCADE,
  ponto_id INTEGER NOT NULL REFERENCES pontos(id) ON DELETE CASCADE,
  ordem    INTEGER NOT NULL,
  PRIMARY KEY (gira_id, ponto_id)
);
CREATE INDEX IF NOT EXISTS idx_gira_pontos ON gira_pontos (gira_id, ordem);
`;

function lerSeed() {
  return JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
}

// ---------- modo arquivo (dev) ----------
function fileLoad() {
  if (!fs.existsSync(DEV_PONTOS)) {
    const seed = lerSeed().map((p, i) => ({ ...p, seed_ref: p.id, id: i + 1, favorito: false, editado_manual: false }));
    fs.writeFileSync(DEV_PONTOS, JSON.stringify(seed, null, 1));
  }
  return JSON.parse(fs.readFileSync(DEV_PONTOS, 'utf8'));
}
function fileSave(rows) {
  fs.writeFileSync(DEV_PONTOS, JSON.stringify(rows, null, 1));
}
function girasLoad() {
  if (!fs.existsSync(DEV_GIRAS)) fs.writeFileSync(DEV_GIRAS, '[]');
  return JSON.parse(fs.readFileSync(DEV_GIRAS, 'utf8'));
}
function girasSave(rows) {
  fs.writeFileSync(DEV_GIRAS, JSON.stringify(rows, null, 1));
}

// ---------- pontos ----------
export async function init() {
  if (!useDb) {
    fileLoad(); girasLoad();
    console.log('[db] modo arquivo local (sem DATABASE_URL). Use apenas em desenvolvimento.');
    return;
  }
  await pool.query(SCHEMA);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pontos');
  if (rows[0].n === 0) {
    const seed = lerSeed();
    for (const p of seed) {
      await pool.query(
        `INSERT INTO pontos (linha, entidade, entidade_especifica, momento, ritmos, ritmo_original, coringa, titulo, letra, seed_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.linha, p.entidade, p.entidade_especifica, p.momento, p.ritmos, p.ritmo_original, p.coringa, p.titulo, p.letra, p.id]
      );
    }
    console.log(`[db] seed carregado: ${seed.length} pontos`);
  } else {
    console.log(`[db] ${rows[0].n} pontos ja no banco, seed ignorado`);
  }
}

export async function listar() {
  if (!useDb) return fileLoad().sort((a, b) => a.id - b.id);
  const { rows } = await pool.query('SELECT * FROM pontos ORDER BY entidade, momento, id');
  return rows;
}

export async function criar(p) {
  if (!useDb) {
    const rows = fileLoad();
    const novo = { ...p, id: Math.max(0, ...rows.map(r => r.id)) + 1, favorito: false, editado_manual: false, seed_ref: null };
    rows.push(novo); fileSave(rows);
    return novo;
  }
  const { rows } = await pool.query(
    `INSERT INTO pontos (linha, entidade, entidade_especifica, momento, ritmos, ritmo_original, coringa, da_casa, titulo, letra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [p.linha, p.entidade, p.entidade_especifica, p.momento, p.ritmos, p.ritmo_original, p.coringa, p.da_casa, p.titulo, p.letra]
  );
  return rows[0];
}

export async function atualizar(id, p) {
  if (!useDb) {
    const rows = fileLoad();
    const i = rows.findIndex(r => r.id === id);
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...p, id, editado_manual: true };
    fileSave(rows);
    return rows[i];
  }
  const { rows } = await pool.query(
    `UPDATE pontos SET linha=$1, entidade=$2, entidade_especifica=$3, momento=$4, ritmos=$5,
            coringa=$6, da_casa=$7, titulo=$8, letra=$9, editado_manual=TRUE, atualizado_em=NOW()
     WHERE id=$10 RETURNING *`,
    [p.linha, p.entidade, p.entidade_especifica, p.momento, p.ritmos, p.coringa, p.da_casa, p.titulo, p.letra, id]
  );
  return rows[0] || null;
}

export async function excluir(id) {
  if (!useDb) {
    const rows = fileLoad();
    const restantes = rows.filter(r => r.id !== id);
    if (restantes.length === rows.length) return false;
    fileSave(restantes);
    const gs = girasLoad();
    for (const g of gs) g.pontos = g.pontos.filter(pid => pid !== id);
    girasSave(gs);
    return true;
  }
  const r = await pool.query('DELETE FROM pontos WHERE id=$1', [id]);
  return r.rowCount > 0;
}

export async function marcarFavorito(id, valor) {
  if (!useDb) {
    const rows = fileLoad();
    const i = rows.findIndex(r => r.id === id);
    if (i === -1) return null;
    rows[i].favorito = valor;
    fileSave(rows);
    return rows[i];
  }
  const { rows } = await pool.query(
    'UPDATE pontos SET favorito=$1, atualizado_em=NOW() WHERE id=$2 RETURNING *', [valor, id]
  );
  return rows[0] || null;
}

// ---------- giras (roteiros) ----------
export async function listarGiras() {
  if (!useDb) {
    return girasLoad().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  const { rows } = await pool.query(`
    SELECT g.id, g.nome, g.observacao, g.criado_em,
           COALESCE(ARRAY_AGG(gp.ponto_id ORDER BY gp.ordem)
                    FILTER (WHERE gp.ponto_id IS NOT NULL), '{}') AS pontos
    FROM giras g
    LEFT JOIN gira_pontos gp ON gp.gira_id = g.id
    GROUP BY g.id
    ORDER BY g.nome
  `);
  return rows;
}

async function gravarPontosDaGira(client, giraId, pontos) {
  await client.query('DELETE FROM gira_pontos WHERE gira_id=$1', [giraId]);
  let ordem = 0;
  for (const pid of pontos) {
    await client.query(
      'INSERT INTO gira_pontos (gira_id, ponto_id, ordem) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [giraId, pid, ordem++]
    );
  }
}

export async function criarGira({ nome, observacao, pontos }) {
  if (!useDb) {
    const gs = girasLoad();
    const nova = {
      id: Math.max(0, ...gs.map(g => g.id)) + 1,
      nome, observacao: observacao || null, pontos,
      criado_em: new Date().toISOString()
    };
    gs.push(nova); girasSave(gs);
    return nova;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO giras (nome, observacao) VALUES ($1,$2) RETURNING id', [nome, observacao || null]
    );
    await gravarPontosDaGira(client, rows[0].id, pontos);
    await client.query('COMMIT');
    return (await listarGiras()).find(g => g.id === rows[0].id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function atualizarGira(id, { nome, observacao, pontos }) {
  if (!useDb) {
    const gs = girasLoad();
    const i = gs.findIndex(g => g.id === id);
    if (i === -1) return null;
    gs[i] = { ...gs[i], nome, observacao: observacao || null, pontos };
    girasSave(gs);
    return gs[i];
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      'UPDATE giras SET nome=$1, observacao=$2 WHERE id=$3', [nome, observacao || null, id]
    );
    if (r.rowCount === 0) { await client.query('ROLLBACK'); return null; }
    await gravarPontosDaGira(client, id, pontos);
    await client.query('COMMIT');
    return (await listarGiras()).find(g => g.id === id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function excluirGira(id) {
  if (!useDb) {
    const gs = girasLoad();
    const restantes = gs.filter(g => g.id !== id);
    if (restantes.length === gs.length) return false;
    girasSave(restantes);
    return true;
  }
  const r = await pool.query('DELETE FROM giras WHERE id=$1', [id]);
  return r.rowCount > 0;
}

export { LINHAS, MOMENTOS, RITMOS };
