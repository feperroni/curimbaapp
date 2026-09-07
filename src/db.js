import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'seed', 'pontos.json');

const LINHAS = ['ritual', 'orixas', 'esquerda', 'direita'];
const MOMENTOS = ['abertura', 'defumacao', 'chamada', 'saudacao', 'firmeza', 'paga', 'descarrego', 'subida'];
const RITMOS = ['Angola', 'Ijexá', 'Nagô', 'Congo', 'Samba', 'Samba de Caboclo', 'BV', 'Barravento', 'Cabula'];

/*
 * Camada de dados. Com DATABASE_URL definida usa Postgres.
 * Sem ela, cai para um arquivo JSON local, so para desenvolvimento.
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
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pontos_linha    ON pontos (linha);
CREATE INDEX IF NOT EXISTS idx_pontos_entidade ON pontos (entidade);
`;

function lerSeed() {
  return JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
}

// ---------- modo arquivo (dev) ----------
const FILE_PATH = path.join(__dirname, '..', 'seed', '.dev-db.json');

function fileLoad() {
  if (!fs.existsSync(FILE_PATH)) {
    const seed = lerSeed().map((p, i) => ({ ...p, id: i + 1, favorito: false }));
    fs.writeFileSync(FILE_PATH, JSON.stringify(seed, null, 1));
  }
  return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
}

function fileSave(rows) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(rows, null, 1));
}

// ---------- API publica ----------
export async function init() {
  if (!useDb) {
    fileLoad();
    console.log('[db] modo arquivo local (sem DATABASE_URL). Use apenas em desenvolvimento.');
    return;
  }
  await pool.query(SCHEMA);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pontos');
  if (rows[0].n === 0) {
    const seed = lerSeed();
    for (const p of seed) {
      await pool.query(
        `INSERT INTO pontos (linha, entidade, entidade_especifica, momento, ritmos, ritmo_original, coringa, titulo, letra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.linha, p.entidade, p.entidade_especifica, p.momento, p.ritmos, p.ritmo_original, p.coringa, p.titulo, p.letra]
      );
    }
    console.log(`[db] seed carregado: ${seed.length} pontos`);
  } else {
    console.log(`[db] ${rows[0].n} pontos ja no banco, seed ignorado`);
  }
}

export async function listar() {
  if (!useDb) {
    return fileLoad().sort((a, b) => a.id - b.id);
  }
  const { rows } = await pool.query('SELECT * FROM pontos ORDER BY entidade, momento, id');
  return rows;
}

export async function criar(p) {
  if (!useDb) {
    const rows = fileLoad();
    const novo = { ...p, id: Math.max(0, ...rows.map(r => r.id)) + 1, favorito: false };
    rows.push(novo);
    fileSave(rows);
    return novo;
  }
  const { rows } = await pool.query(
    `INSERT INTO pontos (linha, entidade, entidade_especifica, momento, ritmos, ritmo_original, coringa, titulo, letra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [p.linha, p.entidade, p.entidade_especifica, p.momento, p.ritmos, p.ritmo_original, p.coringa, p.titulo, p.letra]
  );
  return rows[0];
}

export async function atualizar(id, p) {
  if (!useDb) {
    const rows = fileLoad();
    const i = rows.findIndex(r => r.id === id);
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...p, id };
    fileSave(rows);
    return rows[i];
  }
  const { rows } = await pool.query(
    `UPDATE pontos SET linha=$1, entidade=$2, entidade_especifica=$3, momento=$4, ritmos=$5,
            coringa=$6, titulo=$7, letra=$8, atualizado_em=NOW()
     WHERE id=$9 RETURNING *`,
    [p.linha, p.entidade, p.entidade_especifica, p.momento, p.ritmos, p.coringa, p.titulo, p.letra, id]
  );
  return rows[0] || null;
}

export async function excluir(id) {
  if (!useDb) {
    const rows = fileLoad();
    const restantes = rows.filter(r => r.id !== id);
    if (restantes.length === rows.length) return false;
    fileSave(restantes);
    return true;
  }
  const r = await pool.query('DELETE FROM pontos WHERE id=$1', [id]);
  return r.rowCount > 0;
}

export { LINHAS, MOMENTOS, RITMOS };
