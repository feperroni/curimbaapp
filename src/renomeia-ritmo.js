/*
 * renomeia-ritmo: troca o nome de um ritmo em todos os pontos, de uma vez.
 *
 * Nasceu de um caso concreto: "BV" e "Barravento" eram o mesmo toque marcado
 * com dois nomes, entao viravam dois filtros diferentes na tela. Ficou generico
 * porque isso acontece de novo toda vez que a grafia de um toque muda.
 *
 * Por padrao NAO grava nada, so mostra o que mudaria. Para aplicar de verdade,
 * rode com --apply.
 *
 *   npm run renomeia-ritmo -- BV Barravento
 *   npm run renomeia-ritmo -- BV Barravento --apply
 *
 * Funciona nos dois modos: com DATABASE_URL mexe no Postgres, sem ela mexe no
 * arquivo local de desenvolvimento. Ponto que ja tinha os dois nomes fica com
 * um so, sem duplicar. O campo ritmo_original nao e tocado: ele guarda o que
 * estava escrito no songbook e serve de historico.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { URL_BANCO, RITMOS } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_PONTOS = path.join(__dirname, '..', 'seed', '.dev-db.json');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const APLICAR = process.argv.includes('--apply');
const [DE, PARA] = args;

const c = {
  cinza: s => `\x1b[90m${s}\x1b[0m`,
  verde: s => `\x1b[32m${s}\x1b[0m`,
  amarelo: s => `\x1b[33m${s}\x1b[0m`,
  forte: s => `\x1b[1m${s}\x1b[0m`
};

if (!DE || !PARA) {
  console.error('uso: npm run renomeia-ritmo -- <ritmo antigo> <ritmo novo> [--apply]');
  console.error('exemplo: npm run renomeia-ritmo -- BV Barravento --apply');
  process.exit(1);
}

if (!RITMOS.includes(PARA)) {
  console.error(`"${PARA}" nao esta na lista de ritmos do db.js. Adicione la primeiro,`);
  console.error(`senao o ponto salvo pela interface perde esse ritmo na validacao.`);
  console.error(`Ritmos validos: ${RITMOS.join(', ')}`);
  process.exit(1);
}

// troca o nome preservando a ordem e sem deixar repetido
function trocar(ritmos) {
  const saida = [];
  for (const r of ritmos || []) {
    const novo = r === DE ? PARA : r;
    if (!saida.includes(novo)) saida.push(novo);
  }
  return saida;
}

async function alvos(carregar) {
  const linhas = await carregar();
  return linhas
    .map(p => ({ p, novos: trocar(p.ritmos) }))
    .filter(({ p, novos }) => (p.ritmos || []).includes(DE) || novos.join('|') !== (p.ritmos || []).join('|'));
}

function mostrar(lista) {
  for (const { p, novos } of lista) {
    console.log(`  ${c.cinza(String(p.id).padStart(4))}  ${p.titulo.slice(0, 52)}`);
    console.log(`        ${c.amarelo((p.ritmos || []).join(' / '))}  ->  ${c.verde(novos.join(' / '))}`);
  }
}

async function main() {
  const usaDb = Boolean(URL_BANCO);
  console.log(c.forte(`\nrenomeia-ritmo: "${DE}" -> "${PARA}"`));
  console.log(c.cinza(usaDb ? 'banco: Postgres' : 'banco: arquivo local de desenvolvimento'));

  if (!usaDb) {
    if (!fs.existsSync(DEV_PONTOS)) {
      console.log('Nao achei o arquivo local. Rode o servidor uma vez para ele ser criado.');
      return;
    }
    const linhas = JSON.parse(fs.readFileSync(DEV_PONTOS, 'utf8'));
    const lista = await alvos(async () => linhas);
    console.log(`\n${lista.length} ponto(s) a mudar:\n`);
    mostrar(lista);
    if (!APLICAR) return console.log(c.cinza('\nNada gravado. Rode de novo com --apply para aplicar.\n'));
    for (const { p, novos } of lista) {
      const i = linhas.findIndex(x => x.id === p.id);
      linhas[i] = { ...linhas[i], ritmos: novos };
    }
    fs.writeFileSync(DEV_PONTOS, JSON.stringify(linhas, null, 1));
    return console.log(c.verde(`\n${lista.length} ponto(s) atualizado(s).\n`));
  }

  const pool = new pg.Pool({
    connectionString: URL_BANCO,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  try {
    const lista = await alvos(async () => {
      const { rows } = await pool.query('SELECT id, titulo, ritmos FROM pontos ORDER BY id');
      return rows;
    });
    console.log(`\n${lista.length} ponto(s) a mudar:\n`);
    mostrar(lista);
    if (!APLICAR) return console.log(c.cinza('\nNada gravado. Rode de novo com --apply para aplicar.\n'));

    // tudo ou nada: nao da para ficar metade dos pontos com cada nome
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      for (const { p, novos } of lista) {
        await cliente.query(
          'UPDATE pontos SET ritmos = $1, atualizado_em = NOW() WHERE id = $2',
          [novos, p.id]
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
    console.log(c.verde(`\n${lista.length} ponto(s) atualizado(s).\n`));
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
