/*
 * resync: leva correcoes do seed/pontos.json para o banco ja populado.
 *
 * Por padrao NAO grava nada, so mostra o que mudaria. Para aplicar de verdade,
 * rode com --apply.
 *
 *   npm run resync                 mostra o diff
 *   npm run resync -- --apply      aplica
 *   npm run resync -- --apply --force   aplica tambem sobre pontos editados a mao
 *
 * O que ele preserva sempre:
 *   - favoritos
 *   - giras (mexe em UPDATE, nunca em DELETE, entao o roteiro nao perde ponto)
 *   - pontos que voce criou pela interface (nao tem seed_ref, sao ignorados)
 *   - pontos do seed que voce corrigiu pela interface, a menos que use --force
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'seed', 'pontos.json');
const DEV_PONTOS = path.join(__dirname, '..', 'seed', '.dev-db.json');

const APLICAR = process.argv.includes('--apply');
const FORCAR = process.argv.includes('--force');
const usaDb = Boolean(process.env.DATABASE_URL);

const CAMPOS = ['linha', 'entidade', 'entidade_especifica', 'momento', 'ritmos', 'coringa', 'titulo', 'letra'];

const c = {
  cinza: s => `\x1b[90m${s}\x1b[0m`,
  verde: s => `\x1b[32m${s}\x1b[0m`,
  amarelo: s => `\x1b[33m${s}\x1b[0m`,
  vermelho: s => `\x1b[31m${s}\x1b[0m`,
  forte: s => `\x1b[1m${s}\x1b[0m`
};

function iguais(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = a || [], y = b || [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? null) === (b ?? null);
}

function resumo(v) {
  if (Array.isArray(v)) return v.join(' / ') || '(vazio)';
  if (v === null || v === undefined || v === '') return '(vazio)';
  const s = String(v).replace(/\n/g, ' ⏎ ');
  return s.length > 70 ? s.slice(0, 70) + '…' : s;
}

function diffDe(seedP, linhaBanco) {
  const mudancas = [];
  for (const campo of CAMPOS) {
    if (!iguais(seedP[campo], linhaBanco[campo])) {
      mudancas.push({ campo, de: linhaBanco[campo], para: seedP[campo] });
    }
  }
  return mudancas;
}

/* ---------------- coleta ---------------- */

async function lerBanco(pool) {
  if (usaDb) {
    const { rows } = await pool.query('SELECT * FROM pontos ORDER BY id');
    return rows;
  }
  if (!fs.existsSync(DEV_PONTOS)) {
    console.error(c.vermelho('Não achei o banco local. Rode `npm run dev` uma vez para criá-lo.'));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DEV_PONTOS, 'utf8'));
}

/* Bancos populados antes da coluna seed_ref existir ficam com ela vazia.
   Nesse caso, casamos pela letra exata, que e o campo mais distintivo. */
function adotarSeedRef(banco, seed) {
  const porLetra = new Map();
  for (const p of seed) {
    const k = p.letra.trim();
    if (porLetra.has(k)) porLetra.set(k, null); // letra repetida nao serve de chave
    else porLetra.set(k, p.id);
  }
  const adotados = [];
  for (const linha of banco) {
    if (linha.seed_ref != null) continue;
    const ref = porLetra.get((linha.letra || '').trim());
    if (ref != null && !banco.some(o => o.seed_ref === ref)) {
      linha.seed_ref = ref;
      adotados.push({ id: linha.id, ref });
    }
  }
  return adotados;
}

/* ---------------- gravacao ---------------- */

async function gravar(pool, banco, plano) {
  if (usaDb) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { linha, ref } of plano.adotar) {
        await client.query('UPDATE pontos SET seed_ref=$1 WHERE id=$2', [ref, linha.id]);
      }
      for (const it of plano.atualizar) {
        await client.query(
          `UPDATE pontos SET linha=$1, entidade=$2, entidade_especifica=$3, momento=$4, ritmos=$5,
                  ritmo_original=$6, coringa=$7, titulo=$8, letra=$9, atualizado_em=NOW()
           WHERE id=$10`,
          [it.seedP.linha, it.seedP.entidade, it.seedP.entidade_especifica, it.seedP.momento,
           it.seedP.ritmos, it.seedP.ritmo_original, it.seedP.coringa, it.seedP.titulo,
           it.seedP.letra, it.linhaBanco.id]
        );
      }
      for (const seedP of plano.inserir) {
        await client.query(
          `INSERT INTO pontos (linha, entidade, entidade_especifica, momento, ritmos, ritmo_original, coringa, titulo, letra, seed_ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [seedP.linha, seedP.entidade, seedP.entidade_especifica, seedP.momento, seedP.ritmos,
           seedP.ritmo_original, seedP.coringa, seedP.titulo, seedP.letra, seedP.id]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  // modo arquivo
  for (const { linha, ref } of plano.adotar) linha.seed_ref = ref;
  for (const it of plano.atualizar) {
    Object.assign(it.linhaBanco, {
      linha: it.seedP.linha, entidade: it.seedP.entidade,
      entidade_especifica: it.seedP.entidade_especifica, momento: it.seedP.momento,
      ritmos: it.seedP.ritmos, ritmo_original: it.seedP.ritmo_original,
      coringa: it.seedP.coringa, titulo: it.seedP.titulo, letra: it.seedP.letra
    });
  }
  let proximo = Math.max(0, ...banco.map(r => r.id)) + 1;
  for (const seedP of plano.inserir) {
    banco.push({ ...seedP, id: proximo++, seed_ref: seedP.id, favorito: false, editado_manual: false });
  }
  fs.writeFileSync(DEV_PONTOS, JSON.stringify(banco, null, 1));
}

/* ---------------- principal ---------------- */

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const pool = usaDb
    ? new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
      })
    : null;

  const banco = await lerBanco(pool);
  console.log(c.cinza(`Origem: ${usaDb ? 'Postgres' : 'arquivo local (.dev-db.json)'}`));
  console.log(c.cinza(`Seed: ${seed.length} pontos · Banco: ${banco.length} pontos\n`));

  const adotadosBrutos = adotarSeedRef(banco, seed);
  const plano = {
    adotar: adotadosBrutos.map(a => ({ linha: banco.find(b => b.id === a.id), ref: a.ref })),
    atualizar: [], inserir: [], protegidos: [], sumidos: []
  };

  const porRef = new Map(banco.filter(b => b.seed_ref != null).map(b => [b.seed_ref, b]));

  for (const seedP of seed) {
    const linhaBanco = porRef.get(seedP.id);
    if (!linhaBanco) { plano.inserir.push(seedP); continue; }
    const mudancas = diffDe(seedP, linhaBanco);
    if (!mudancas.length) continue;
    if (linhaBanco.editado_manual && !FORCAR) {
      plano.protegidos.push({ seedP, linhaBanco, mudancas });
    } else {
      plano.atualizar.push({ seedP, linhaBanco, mudancas });
    }
  }

  const refsDoSeed = new Set(seed.map(p => p.id));
  for (const b of banco) {
    if (b.seed_ref != null && !refsDoSeed.has(b.seed_ref)) plano.sumidos.push(b);
  }

  const criadosPorVoce = banco.filter(b => b.seed_ref == null).length;

  /* ---- relatorio ---- */

  if (plano.adotar.length) {
    console.log(c.amarelo(`${plano.adotar.length} ponto(s) do banco casados com o seed pela letra (seed_ref estava vazio).\n`));
  }

  if (plano.atualizar.length) {
    console.log(c.forte(`A ATUALIZAR (${plano.atualizar.length})`));
    for (const it of plano.atualizar) {
      console.log(`  #${it.linhaBanco.id} ${it.linhaBanco.entidade} · ${resumo(it.linhaBanco.titulo)}`);
      for (const m of it.mudancas) {
        console.log(`     ${m.campo}`);
        console.log(c.vermelho(`      - ${resumo(m.de)}`));
        console.log(c.verde(`      + ${resumo(m.para)}`));
      }
    }
    console.log('');
  }

  if (plano.inserir.length) {
    console.log(c.forte(`A INSERIR (${plano.inserir.length})`));
    for (const p of plano.inserir) console.log(c.verde(`  + ${p.entidade} · ${resumo(p.titulo)}`));
    console.log('');
  }

  if (plano.protegidos.length) {
    console.log(c.forte(`PROTEGIDOS (${plano.protegidos.length}) — você editou pela interface, o seed não passa por cima`));
    for (const it of plano.protegidos) {
      console.log(c.amarelo(`  ~ #${it.linhaBanco.id} ${it.linhaBanco.entidade} · ${resumo(it.linhaBanco.titulo)} (${it.mudancas.map(m => m.campo).join(', ')})`));
    }
    console.log(c.cinza('    Use --force se quiser que o seed vença mesmo assim.\n'));
  }

  if (plano.sumidos.length) {
    console.log(c.forte(`SÓ NO BANCO (${plano.sumidos.length}) — saíram do seed, mas não vou excluir`));
    for (const b of plano.sumidos) console.log(c.cinza(`  ? #${b.id} ${b.entidade} · ${resumo(b.titulo)}`));
    console.log(c.cinza('    Excluir aqui quebraria as giras que os usam. Tire pela interface se quiser.\n'));
  }

  if (criadosPorVoce) {
    console.log(c.cinza(`${criadosPorVoce} ponto(s) criados por você pela interface. Intocados.\n`));
  }

  const mexe = plano.atualizar.length + plano.inserir.length + plano.adotar.length;
  if (!mexe) {
    console.log(c.verde('Banco já está em dia com o seed. Nada a fazer.'));
    await pool?.end();
    return;
  }

  if (!APLICAR) {
    console.log(c.amarelo(`Nada foi gravado. Para aplicar: ${c.forte('npm run resync -- --apply')}`));
    await pool?.end();
    return;
  }

  await gravar(pool, banco, plano);
  console.log(c.verde(`Pronto. ${plano.atualizar.length} atualizado(s), ${plano.inserir.length} inserido(s).`));
  console.log(c.cinza('Favoritos e giras não foram tocados.'));
  await pool?.end();
}

main().catch(e => {
  console.error(c.vermelho('Falhou, nada foi gravado:'), e.message);
  process.exit(1);
});
