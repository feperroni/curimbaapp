'use strict';

const CACHE_KEY = 'curimba.cache.v2';
const SENHA_KEY = 'curimba.senha';
const TAM_KEY = 'curimba.tamanho';
const MODO_KEY = 'curimba.modo';
const COL_KEY = 'curimba.colunas';
const VEL_KEY = 'curimba.velocidade';

const LINHAS = ['ritual', 'orixas', 'esquerda', 'direita'];
const ROTULO_LINHA = { ritual: 'Ritual', orixas: 'Orixás', esquerda: 'Esquerda', direita: 'Direita' };
const ROTULO_MOMENTO = {
  abertura: 'Abertura', defumacao: 'Defumação', chamada: 'Chamada', saudacao: 'Saudação',
  firmeza: 'Firmeza', paga: 'Paga', descarrego: 'Descarrego', subida: 'Subida'
};
// ordem litúrgica, não alfabética: é a ordem em que a gira acontece
const ORDEM_MOMENTO = ['abertura', 'defumacao', 'chamada', 'saudacao', 'firmeza', 'paga', 'descarrego', 'subida'];

// entidades que devem aparecer no menu mesmo sem ponto cadastrado
const ENTIDADES_EXTRA = { esquerda: ['Pombagira Mirim'] };

// ordem fixa dos orixás no menu, da esquerda para a direita (não é alfabética)
const ORDEM_ORIXAS = [
  'Oxalá', 'Logunã', 'Oxum', 'Oxumaré', 'Oxóssi', 'Obá', 'Xangô',
  'Oroiná', 'Ogum', 'Iansã', 'Obaluaê', 'Nanã', 'Yemanjá', 'Omulu'
];
// grafias alternativas que devem cair na mesma posição da lista acima
const VARIANTES_ORIXAS = {
  'Obaluaê': ['Obaluaiê', 'Obaluaye'],
  'Yemanjá': ['Iemanjá'],
  'Iansã': ['Yansã', 'Oyá'],
  'Oxóssi': ['Oxosse'],
  'Oxalá': ['Oxalufã', 'Oxaguiã']
};

// nome normalizado -> posição no menu
const POS_ORIXA = new Map();
ORDEM_ORIXAS.forEach((nome, i) => {
  POS_ORIXA.set(normaliza(nome), i);
  for (const alt of (VARIANTES_ORIXAS[nome] || [])) POS_ORIXA.set(normaliza(alt), i);
});

const SAUDACOES = {
  'Oxalá': 'Exê Babá', 'Logunã': 'Olha o tempo minha mãe', 'Yemanjá': 'Adociaba minha mãe',
  'Omulu': 'Atotô meu pai', 'Obaluaê': 'Atotô meu pai', 'Oxum': 'Ora iê iê mamãe Oxum',
  'Oxumaré': 'Aroboboi meu pai', 'Oxóssi': 'Okê Arô', 'Obá': 'Akiro Obá Yê',
  'Xangô': 'Kaô Kabecilê', 'Ogum': 'Ogunhê', 'Iansã': 'Eparrey Oyá', 'Nanã': 'Saluba Nanã',
  'Oroiná': 'Saluba Oroiná', 'Exu': 'Laroyê', 'Pombagira': 'Laroyê',
  'Exu Mirim': 'Laroyê', 'Pombagira Mirim': 'Laroyê', 'Preto Velho': 'Adorei as almas',
  'Caboclo': 'Okê Caboclo', 'Erê': 'Oni Beijada'
};

let PONTOS = [];
let GIRAS = [];
let META = { linhas: [], momentos: [], ritmos: [] };

const est = {
  vista: 'ritual',        // uma das LINHAS, ou 'favoritos', ou 'giras'
  entidade: null,
  giraAberta: null,       // id da gira sendo tocada
  momento: null,
  ritmo: null,
  busca: '',
  modo: 'tudo',           // 'tudo' espelha a lista inteira; 'selecao' so o que voce escolheu
  colunas: 1,
  pilha: [],              // ids, usado apenas no modo 'selecao'
  montando: null,         // { id|null, nome, observacao, pontos:[ids] }
  verRoteiro: false,      // na montagem, mostra o roteiro em vez do acervo
  editandoPonto: null,
  cheia: false,           // esconde menus e lista, so as letras na tela
  velocidade: 'lento'     // da rolagem automatica
};

const $ = id => document.getElementById(id);
const acha = id => PONTOS.find(p => p.id === id);

/* Escreve numa propriedade de um elemento que pode nao existir. Protege contra
   o caso de um index.html velho em cache do navegador com um app.js novo. */
function poe(id, prop, valor) {
  const el = $(id);
  if (el) el[prop] = valor;
}

/* ---------------- carga ---------------- */

async function carregar() {
  try {
    const [pontos, giras, meta] = await Promise.all([
      fetch('/api/pontos').then(r => r.json()),
      fetch('/api/giras').then(r => r.json()),
      fetch('/api/meta').then(r => r.json())
    ]);
    PONTOS = pontos; GIRAS = giras; META = meta;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ pontos, giras, meta })); } catch (_) {}
  } catch (_) {
    // rede caiu no meio da gira: segue com a última cópia que o tablet viu
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cache) {
        PONTOS = cache.pontos; GIRAS = cache.giras || []; META = cache.meta;
        aviso('Sem conexão. Usando a última cópia salva no tablet.');
      } else {
        aviso('Não consegui carregar os pontos e não há cópia salva.');
      }
    } catch (__) {}
  }
}

/* ---------------- seleção da lista ---------------- */

function normaliza(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const daLinha = linha => PONTOS.filter(p => p.linha === linha);

// conjunto de pontos que a aba do topo representa, antes de entidade e filtros
function conjuntoDaVista(vista) {
  if (vista === 'favoritos') return PONTOS.filter(p => p.favorito);
  if (vista === 'casa') return PONTOS.filter(p => p.da_casa);
  if (vista === 'giras') return [];
  return daLinha(vista);
}

function entidadesDaVista(vista) {
  const mapa = new Map();
  for (const p of conjuntoDaVista(vista)) mapa.set(p.entidade, (mapa.get(p.entidade) || 0) + 1);
  if (vista !== 'casa') {
    for (const nome of (ENTIDADES_EXTRA[vista] || [])) if (!mapa.has(nome)) mapa.set(nome, 0);
  }
  const lista = [...mapa.entries()];
  if (vista === 'orixas') {
    // fora da lista fixa vai para o fim, em ordem alfabética
    const pos = n => POS_ORIXA.has(normaliza(n)) ? POS_ORIXA.get(normaliza(n)) : ORDEM_ORIXAS.length;
    lista.sort((a, b) => pos(a[0]) - pos(b[0]) || a[0].localeCompare(b[0], 'pt-BR'));
  }
  return lista;
}

// pontos que servem de base para os chips de filtro
function baseAtual() {
  const conj = conjuntoDaVista(est.vista);
  return est.entidade ? conj.filter(p => p.entidade === est.entidade) : conj;
}

function ordenaLiturgico(l) {
  return [...l].sort((a, b) =>
    ORDEM_MOMENTO.indexOf(a.momento) - ORDEM_MOMENTO.indexOf(b.momento) || a.id - b.id);
}

function visiveis() {
  // durante a montagem, a aba "Ver roteiro" mostra o que já foi escolhido, na ordem
  if (est.montando && est.verRoteiro) {
    return est.montando.pontos.map(acha).filter(Boolean);
  }

  if (est.busca.trim()) {
    const q = normaliza(est.busca);
    return PONTOS.filter(p =>
      normaliza(p.titulo).includes(q) ||
      normaliza(p.letra).includes(q) ||
      normaliza(p.entidade).includes(q) ||
      normaliza(p.entidade_especifica).includes(q) ||
      p.ritmos.some(r => normaliza(r).includes(q))
    );
  }

  // gira aberta: ordem do roteiro manda, nada de reordenar
  if (est.vista === 'giras') {
    const g = GIRAS.find(x => x.id === est.giraAberta);
    if (!g) return [];
    return g.pontos.map(acha).filter(Boolean);
  }

  let l = conjuntoDaVista(est.vista);

  if (est.entidade) {
    l = l.filter(p => p.entidade === est.entidade ||
      (p.coringa && est.vista !== 'favoritos' && est.vista !== 'casa' && p.linha === est.vista));
  }
  if (est.momento) l = l.filter(p => p.momento === est.momento);
  if (est.ritmo) l = l.filter(p => p.ritmos.includes(est.ritmo));
  return ordenaLiturgico(l);
}


/* ---------------- toques de atabaque ----------------
 * Fonte: o guia de toques do proprio songbook do terreiro, no fim do Word.
 * As figuras e a grade de batidas foram desenhadas aqui a partir dele.
 * Nada foi copiado de livro: o que existe de material publicado sobre toque
 * de umbanda e obra protegida, e alem disso a grafia varia de casa para casa.
 * Confira com o oga da casa antes de tomar isto como padrao.
 */
const ZONAS = {
  grave: { nome: 'Centro', como: 'mão aberta no meio da pele', som: 'DUM, TUM' },
  medio: { nome: 'Meia pele', como: 'mão chapada entre o centro e a borda', som: 'pa, ta, tchê' },
  agudo: { nome: 'Borda', como: 'ponta dos dedos junto ao aro', som: 'tchi, ca, tique' }
};

const TOQUES = [
  {
    id: 'angola', nome: 'Angola', tempo: 'Ternário, 3 tempos',
    clima: 'Terra firme, ancestralidade, peso',
    uso: 'Exus, Pombagiras, Pretos Velhos, Caboclos, Ogum nas chamadas, abertura de gira',
    padrao: 'DUM — pa — DUM — pa',
    nota: 'Pesado e arrastado. Não corra: o peso é o que caracteriza o toque.'
  },
  {
    id: 'ijexa', nome: 'Ijexá', tempo: 'Binário, 2 tempos',
    clima: 'Água corrente, leveza, suavidade',
    uso: 'Oxum, Iemanjá, Oxalá, Obaluaê, Pretos Velhos, Oxóssi, Iansã',
    padrao: 'DUM — ca-DUM — ca',
    nota: 'Fluido e ondulante. É o toque mais usado do acervo, com 70 pontos.'
  },
  {
    id: 'nago', nome: 'Nagô', tempo: 'Ternário, 3 tempos',
    clima: 'Majestade, reverência, fundamento',
    uso: 'Oxalá nos pontos solenes, Oxóssi, Xangô, abertura de fundamentos',
    padrao: 'DUM — DUM — pa — DUM',
    nota: 'Mais aberto e solene que o Angola. Mesmo compasso ternário, outra intenção.'
  },
  {
    id: 'congo', nome: 'Congo', tempo: 'Binário, 2 tempos',
    clima: 'Festa, movimento, leveza alegre',
    uso: 'Baianos, Ciganos, Exu Mirim, Oxumaré, entidades festivas',
    padrao: 'DUM-pa — DUM — DUM-pa',
    nota: 'Também chamado Congo de Ouro. Alegre e bem marcado.'
  },
  {
    id: 'samba', nome: 'Samba de Caboclo', tempo: 'Binário, 2 tempos',
    clima: 'Mata, galope, natureza viva',
    uso: 'Caboclos, Baianos, Boiadeiros, Marinheiros, pontos animados',
    padrao: 'DUM — ca-DUM — pa-DUM',
    nota: 'Sincopado, ágil e saltitante. A síncope é o que separa ele do Congo.'
  },
  {
    id: 'cabula', nome: 'Angola / Samba Cabula', tempo: 'Ternário puxado',
    clima: 'Chão batido, cadência de roda',
    uso: 'Variação do Angola em pontos que pedem mais movimento',
    padrao: 'TUM — TA — TA — TUM — TUM',
    nota: 'A volta repete começando pelo TA: TA — TA — TUM — TUM — TUM.'
  },
  {
    id: 'bv', nome: 'BV (Batucada Variada)', tempo: 'Livre ou misto',
    clima: 'Suporte neutro, acompanhamento',
    uso: 'Pontos de abertura geral, entidades diversas, transições',
    padrao: 'DUM — pa — DUM-DUM — pa',
    nota: 'Não tem padrão fixo. O ogã acompanha a melodia do ponto; a base acima é ponto de partida, não regra.'
  }
];

function zonaDoGolpe(g) {
  const t = g.toLowerCase();
  if (t.startsWith('dum') || t.startsWith('tum')) return 'grave';
  if (t.startsWith('pa') || t.startsWith('ta') || t.startsWith('tch\u00ea')) return 'medio';
  return 'agudo';
}

/* Desenho do atabaque com as tres zonas marcadas. Vale para qualquer toque:
   o que muda de um para outro e a sequencia, nao onde se bate. */
function svgAtabaque() {
  return `
  <svg class="atabaque" viewBox="0 0 150 165" role="img" aria-label="Atabaque visto de frente, com as três zonas de batida">
    <defs>
      <linearGradient id="corpoAtb" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6d4a2f"/><stop offset=".45" stop-color="#9a6b41"/><stop offset="1" stop-color="#5c3d26"/>
      </linearGradient>
    </defs>
    <path d="M28,40 L40,140 Q75,152 110,140 L122,40 Z" fill="url(#corpoAtb)"/>
    <path d="M40,140 Q75,152 110,140 L108,148 Q75,159 42,148 Z" fill="#4a3020"/>
    <ellipse cx="75" cy="40" rx="47" ry="18" fill="#e8d5b5"/>
    <ellipse cx="75" cy="40" rx="47" ry="18" fill="none" stroke="#3a2a1c" stroke-width="4"/>
    <ellipse cx="75" cy="40" rx="47" ry="18" fill="none" stroke="var(--z-agudo)" stroke-width="2.5" stroke-dasharray="5 4"/>
    <ellipse cx="75" cy="40" rx="30" ry="11" fill="none" stroke="var(--z-medio)" stroke-width="2.5" stroke-dasharray="5 4"/>
    <ellipse cx="75" cy="40" rx="14" ry="5.5" fill="var(--z-grave)" opacity=".85"/>
  </svg>`;
}

function svgLegendaZonas() {
  return `<ul class="zonas">
    ${Object.entries(ZONAS).map(([k, z]) => `
      <li>
        <span class="bola z-${k}"></span>
        <div>
          <b>${escapa(z.nome)}</b><span class="silaba">${escapa(z.som)}</span>
          <em>${escapa(z.como)}</em>
        </div>
      </li>`).join('')}
  </ul>`;
}

/* Transforma "DUM — ca-DUM — ca" numa grade de tempos.
   Cada tempo vira uma celula; golpes ligados por hifen dividem o mesmo tempo. */
function gradeDoPadrao(padrao) {
  const tempos = padrao.split(/\s*[\u2014-]{1}\s+|\s+[\u2014]\s*/)
    .map(t => t.trim()).filter(Boolean);
  const celulas = padrao.split(/\s+\u2014\s+/).map(t => t.trim()).filter(Boolean);
  return celulas.map((cel, i) => {
    if (cel === '\u2014' || !cel) return { n: i + 1, golpes: [] };
    const golpes = cel.split('-').map(g => g.trim()).filter(Boolean)
      .map(g => ({ texto: g, zona: zonaDoGolpe(g) }));
    return { n: i + 1, golpes };
  });
}

function renderToques() {
  const box = $('pilha');
  box.innerHTML = '';
  box.dataset.colunas = '1';
  poe('vazio', 'hidden', true);
  poe('rodapePilha', 'hidden', false);
  poe('pilhaInfo', 'textContent', `${TOQUES.length} toques`);
  poe('limparPilha', 'hidden', true);

  for (const t of TOQUES) {
    const grade = gradeDoPadrao(t.padrao);
    const card = document.createElement('article');
    card.className = 'card card-toque';
    card.id = `toque-${t.id}`;
    card.innerHTML = `
      <h2 class="card-tit">${escapa(t.nome)}</h2>
      <p class="card-meta">${escapa(t.tempo)}  ·  ${escapa(t.clima)}</p>
      <div class="toque-corpo">
        <div class="toque-figura">${svgAtabaque()}</div>
        <div class="toque-vozes">
          <div class="grade">
            ${grade.map(c => `
              <div class="tempo">
                <span class="tempo-n">${c.n}</span>
                <div class="golpes">
                  ${c.golpes.length
                    ? c.golpes.map(g => `<span class="golpe z-${g.zona}">${escapa(g.texto)}</span>`).join('')
                    : '<span class="golpe pausa">·</span>'}
                </div>
              </div>`).join('')}
          </div>
          ${svgLegendaZonas()}
          <p class="toque-uso"><b>Quando:</b> ${escapa(t.uso)}</p>
          <p class="toque-nota">${escapa(t.nota)}</p>
        </div>
      </div>`;
    box.appendChild(card);
  }
}

function renderListaToques() {
  const ul = $('lista');
  ul.innerHTML = '';
  poe('contador', 'textContent', `${TOQUES.length} toques`);
  poe('empilharTudo', 'hidden', true);

  for (const t of TOQUES) {
    const li = document.createElement('li');
    li.className = 'item';
    const corpo = document.createElement('div');
    corpo.className = 'item-corpo';
    corpo.innerHTML =
      `<div class="item-tit">${escapa(t.nome)}</div>` +
      `<div class="item-sub"><span class="tag">${escapa(t.tempo.split(',')[0])}</span>${escapa(t.clima)}</div>`;
    corpo.onclick = () => document.getElementById(`toque-${t.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    li.appendChild(corpo);
    ul.appendChild(li);
  }
}

/* ---------------- render ---------------- */

function render() {
  renderVista();
  if (est.vista === 'toques') {
    $('navEntidades').hidden = true;
    $('filtros').hidden = true;
    $('buscaBarra').hidden = true;
    renderListaToques();
    renderToques();
    renderBanner();
    $('leitor').scrollTop = 0;
    return;
  }
  renderSegundaFaixa();
  renderFiltros();
  renderLista();
  renderPilha();
  renderBanner();
}

function renderVista() {
  if (est.cheia) poe('cheiaOnde', 'textContent', ondeEstou());
  for (const b of document.querySelectorAll('.linha-btn')) {
    b.setAttribute('aria-selected', String(b.dataset.vista === est.vista));
  }
  document.body.dataset.vista = est.vista;
}

function renderSegundaFaixa() {
  const nav = $('navEntidades');
  nav.innerHTML = '';

  if (est.vista === 'favoritos') {
    nav.hidden = true;
    return;
  }
  if (est.vista === 'casa' && !conjuntoDaVista('casa').length) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;

  if (est.vista === 'giras') {
    for (const g of GIRAS) {
      const b = document.createElement('button');
      b.className = 'ent-btn';
      b.setAttribute('aria-selected', String(est.giraAberta === g.id));
      b.innerHTML = `${escapa(g.nome)}<span class="qtd">${g.pontos.length}</span>`;
      b.onclick = () => {
        est.giraAberta = est.giraAberta === g.id ? null : g.id;
        // no modo tudo o leitor ja segue a lista, que aqui e o roteiro na ordem
        est.pilha = [];
        render();
      };
      nav.appendChild(b);
    }
    const nova = document.createElement('button');
    nova.className = 'ent-btn ent-btn-acao';
    nova.textContent = '＋ Nova gira';
    nova.onclick = () => abrirModalGira(null);
    nav.appendChild(nova);

    if (est.giraAberta) {
      const ed = document.createElement('button');
      ed.className = 'ent-btn ent-btn-acao';
      ed.textContent = 'Editar roteiro';
      ed.onclick = () => {
        const g = GIRAS.find(x => x.id === est.giraAberta);
        if (g) iniciarMontagem({ id: g.id, nome: g.nome, observacao: g.observacao, pontos: [...g.pontos] });
      };
      nav.appendChild(ed);
    }
    return;
  }

  for (const [nome, qtd] of entidadesDaVista(est.vista)) {
    const b = document.createElement('button');
    b.className = 'ent-btn';
    b.setAttribute('aria-selected', String(est.entidade === nome));
    b.innerHTML = `${escapa(nome)}<span class="qtd">${qtd}</span>`;
    b.onclick = () => {
      est.entidade = est.entidade === nome ? null : nome;
      est.momento = null;
      render();
    };
    nav.appendChild(b);
  }
  nav.scrollLeft = 0;
}

function renderFiltros() {
  const base = baseAtual();
  const esconde = est.vista === 'giras' || (est.montando && est.verRoteiro);

  const cm = $('chipsMomento');
  cm.innerHTML = '';
  const momentos = esconde ? [] : ORDEM_MOMENTO.filter(m => base.some(p => p.momento === m));
  for (const m of momentos) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = ROTULO_MOMENTO[m];
    b.setAttribute('aria-pressed', String(est.momento === m));
    b.onclick = () => {
      est.momento = est.momento === m ? null : m;
      renderFiltros(); renderLista(); renderPilha();
    };
    cm.appendChild(b);
  }

  const cr = $('chipsRitmo');
  cr.innerHTML = '';
  const ritmos = esconde ? [] : META.ritmos.filter(r => base.some(p => p.ritmos.includes(r)));
  for (const r of ritmos) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = r;
    b.setAttribute('aria-pressed', String(est.ritmo === r));
    b.onclick = () => {
      est.ritmo = est.ritmo === r ? null : r;
      renderFiltros(); renderLista(); renderPilha();
    };
    cr.appendChild(b);
  }

  $('filtros').hidden = !momentos.length && !ritmos.length;
}

function renderLista() {
  const itens = visiveis();
  const ul = $('lista');
  const noRoteiro = Boolean(est.montando && est.verRoteiro);
  ul.innerHTML = '';
  $('contador').textContent = itens.length === 1 ? '1 ponto' : `${itens.length} pontos`;
  poe('empilharTudo', 'hidden', est.modo === 'tudo');

  itens.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'item';
    if (est.modo === 'selecao' && est.pilha.includes(p.id)) li.classList.add('na-pilha');

    const espec = p.entidade_especifica ? ` · ${p.entidade_especifica}` : '';
    const tagCoringa = p.coringa ? '<span class="tag">coringa</span>' : '';
    const ondeEsta = (est.vista === 'favoritos' || est.busca.trim() || est.vista === 'giras' || noRoteiro)
      ? `<span class="tag">${escapa(p.entidade)}</span>` : '';
    const tagCasa = (p.da_casa && est.vista !== 'casa') ? '<span class="tag tag-casa">casa</span>' : '';

    const corpo = document.createElement('div');
    corpo.className = 'item-corpo';
    corpo.innerHTML =
      `<div class="item-tit">${noRoteiro || est.vista === 'giras' ? `<span class="ordem">${i + 1}</span>` : ''}${escapa(p.titulo)}</div>` +
      `<div class="item-sub">${ondeEsta}${tagCasa}${tagCoringa}<span class="tag">${escapa(ROTULO_MOMENTO[p.momento] || p.momento)}</span>` +
      `${escapa(p.ritmos.join(' / '))}${escapa(espec)}</div>`;
    corpo.onclick = () => abrirSozinho(p.id);
    li.appendChild(corpo);

    const acoes = document.createElement('div');
    acoes.className = 'item-acoes';

    if (noRoteiro) {
      acoes.classList.add('item-acoes-linha');
      acoes.appendChild(botaozinho('↑', 'Subir no roteiro', () => moverNoRoteiro(p.id, -1), i === 0));
      acoes.appendChild(botaozinho('↓', 'Descer no roteiro', () => moverNoRoteiro(p.id, +1), i === itens.length - 1));
      acoes.appendChild(botaozinho('✕', 'Tirar do roteiro', () => tirarDoRoteiro(p.id)));
    } else {
      const fav = botaozinho(p.favorito ? '★' : '☆', 'Favorito', () => alternarFavorito(p.id));
      if (p.favorito) fav.classList.add('ativo');
      acoes.appendChild(fav);

      if (est.montando) {
        const dentro = est.montando.pontos.includes(p.id);
        const b = botaozinho(dentro ? '✓' : '＋', dentro ? 'Já está no roteiro' : 'Adicionar ao roteiro',
          () => porNoRoteiro(p.id));
        b.classList.add('acao-gira');
        if (dentro) b.classList.add('ativo');
        acoes.appendChild(b);
      } else {
        acoes.appendChild(botaozinho('＋', 'Empilhar junto', () => empilhar(p.id)));
      }

      // lapis na propria lista: qualquer ponto do acervo pode ser corrigido sem abrir antes
      acoes.appendChild(botaozinho('✏️', `Editar "${p.titulo}"`, () => abrirModal(p)));
    }

    li.appendChild(acoes);
    ul.appendChild(li);
  });

  if (!itens.length) {
    const li = document.createElement('li');
    li.className = 'lista-vazia';
    li.textContent = est.vista === 'favoritos'
      ? 'Nenhum favorito ainda. Toque na estrela de um ponto para marcar.'
      : est.vista === 'casa'
        ? 'Nenhum ponto da casa ainda. Use o ＋ do topo para cadastrar, ou marque "Ponto da casa" ao editar um ponto que já existe.'
        : est.vista === 'giras' && !est.giraAberta
          ? 'Escolha uma gira acima, ou crie uma nova.'
          : 'Nada aqui com esses filtros.';
    ul.appendChild(li);
  }
}

function botaozinho(txt, titulo, onClick, desabilitado = false) {
  const b = document.createElement('button');
  b.className = 'mini-btn';
  b.textContent = txt;
  b.title = titulo;
  b.disabled = desabilitado;
  b.onclick = e => { e.stopPropagation(); onClick(); };
  return b;
}

function pontosNoLeitor() {
  return est.modo === 'tudo' ? visiveis() : est.pilha.map(acha).filter(Boolean);
}

function renderPilha() {
  const box = $('pilha');
  box.innerHTML = '';
  const pontos = pontosNoLeitor();

  box.dataset.colunas = String(est.colunas);
  poe('vazio', 'hidden', pontos.length > 0);
  poe('limparPilha', 'hidden', est.modo !== 'selecao' || !pontos.length);
  poe('pilhaInfo', 'textContent', !pontos.length
    ? ''
    : pontos.length === 1 ? '1 ponto' : `${pontos.length} pontos na tela`);

  for (const b of ($('altModo')?.children || [])) b.setAttribute('aria-pressed', String(b.dataset.modo === est.modo));
  for (const b of ($('altColunas')?.children || [])) b.setAttribute('aria-pressed', String(Number(b.dataset.colunas) === est.colunas));

  pontos.forEach((p, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.id = `card-${p.id}`;

    const partes = [
      ROTULO_LINHA[p.linha],
      p.entidade + (p.entidade_especifica ? ` · ${p.entidade_especifica}` : ''),
      ROTULO_MOMENTO[p.momento] || p.momento,
      p.ritmos.join(' / ')
    ];
    const sauda = SAUDACOES[p.entidade];
    if (sauda) partes.push(sauda);

    const cab = document.createElement('div');
    cab.className = 'card-cab';
    cab.innerHTML =
      `<div class="card-tit-wrap">` +
      `<h2 class="card-tit"><span class="card-num">${i + 1}</span>${escapa(p.titulo)}</h2>` +
      `<p class="card-meta">${escapa(partes.join('  ·  '))}</p></div>`;

    const acoes = document.createElement('div');
    acoes.className = 'card-acoes';
    const fav = botaozinho(p.favorito ? '★' : '☆', 'Favorito', () => alternarFavorito(p.id));
    if (p.favorito) fav.classList.add('ativo');
    acoes.appendChild(fav);
    const ed = botaozinho('Editar', 'Editar este ponto', () => abrirModal(p));
    ed.classList.add('mini-btn-txt');
    acoes.appendChild(ed);
    if (est.modo === 'selecao') {
      acoes.appendChild(botaozinho('✕', 'Tirar da tela', () => desempilhar(p.id)));
    }
    cab.appendChild(acoes);

    const letra = document.createElement('pre');
    letra.className = 'letra';
    letra.dataset.id = String(p.id);
    letra.textContent = p.letra;

    card.appendChild(cab);
    card.appendChild(letra);
    box.appendChild(card);
  });

  ajustarLetras();
}

/* ---------------- tamanho automatico da letra ----------------
 * Toda caixa tem a mesma altura (meia tela), entao ponto curto e ponto longo
 * ocupam o mesmo espaco. Para nao sobrar buraco no curto nem cortar o longo,
 * a fonte de cada ponto cresce ou encolhe ate a letra caber na caixa.
 * Ponto comprido demais para o menor tamanho rola dentro da propria caixa.
 */
const FIT_CACHE = new Map();
let observadorLetra = null;

// tamanho de referencia: o que o A+/A- define, menor em duas colunas
function tamanhoAlvo() {
  const base = tamanhoAtual();
  return est.colunas === 2 ? Math.round(base * 0.8) : base;
}

function ajustaUmaLetra(pre) {
  const alt = pre.clientHeight;
  const larg = pre.clientWidth;
  if (!alt || !larg) return;                 // caixa ainda sem medida

  const alvo = tamanhoAlvo();
  const chave = `${pre.dataset.id}|${larg}x${alt}|${alvo}`;
  const guardado = FIT_CACHE.get(chave);
  if (guardado) { pre.style.fontSize = guardado + 'px'; marcaSobra(pre); return; }

  const min = Math.max(16, Math.round(alvo * 0.55));   // piso de leitura no tablet
  const max = Math.round(alvo * 2);                    // ponto curto ocupa a caixa toda

  // busca binaria: o maior tamanho em que a letra ainda cabe sem rolar
  let lo = min, hi = max, melhor = min;
  while (lo <= hi) {
    const meio = Math.floor((lo + hi) / 2);
    pre.style.fontSize = meio + 'px';
    if (pre.scrollHeight <= pre.clientHeight + 1) { melhor = meio; lo = meio + 1; }
    else hi = meio - 1;
  }
  pre.style.fontSize = melhor + 'px';
  FIT_CACHE.set(chave, melhor);
  marcaSobra(pre);
}

// ponto que nem no menor tamanho coube: a caixa ganha uma sombra no pe avisando
// que tem mais letra pra baixo
function marcaSobra(pre) {
  const card = pre.closest('.card');
  if (card) card.classList.toggle('tem-mais', pre.scrollHeight > pre.clientHeight + 1);
}

/* Ajusta so o que esta perto da tela: com 50 pontos na lista, medir todos de
   uma vez travaria o tablet. O observer cuida do resto conforme voce rola. */
function ajustarLetras() {
  const leitor = $('leitor');
  const pilha = $('pilha');
  if (!leitor || !pilha) return;

  if (observadorLetra) observadorLetra.disconnect();
  const pres = [...pilha.querySelectorAll('.letra')];
  if (!pres.length) return;

  // as primeiras caixas ja entram ajustadas, sem piscar
  for (const pre of pres.slice(0, est.colunas === 2 ? 4 : 2)) ajustaUmaLetra(pre);

  if (!('IntersectionObserver' in window)) {
    for (const pre of pres) ajustaUmaLetra(pre);
    return;
  }
  observadorLetra = new IntersectionObserver(entradas => {
    for (const e of entradas) if (e.isIntersecting) ajustaUmaLetra(e.target);
  }, { root: leitor, rootMargin: '400px 0px' });
  for (const pre of pres) {
    observadorLetra.observe(pre);
    pre.onscroll = () => {
      const card = pre.closest('.card');
      if (card) card.classList.toggle('tem-mais',
        pre.scrollTop + pre.clientHeight < pre.scrollHeight - 1);
    };
  }
}

// girar o tablet ou mudar a janela muda a altura da caixa
let respiroResize = null;
window.addEventListener('resize', () => {
  clearTimeout(respiroResize);
  respiroResize = setTimeout(ajustarLetras, 150);
});

function renderBanner() {
  const b = $('banner');
  b.hidden = !est.montando;
  if (!est.montando) return;
  $('bannerNome').textContent = est.montando.nome;
  const n = est.montando.pontos.length;
  $('bannerQtd').textContent = n === 1 ? '1 ponto' : `${n} pontos`;
  $('verRoteiro').textContent = est.verRoteiro ? 'Voltar ao acervo' : 'Ver roteiro';
}

function escapa(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

let avisoTimer;
function aviso(msg) {
  const el = $('aviso');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ---------------- pilha ---------------- */

function abrirSozinho(id) {
  if (est.modo === 'tudo') {
    // o leitor ja tem todos: em vez de trocar a tela, pula ate o ponto
    document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  est.pilha = [id];
  renderLista(); renderPilha();
  $('leitor').scrollTop = 0;
}

function empilhar(id) {
  if (est.modo === 'tudo') {
    // primeiro ＋ tira do modo tudo e comeca uma selecao com esse ponto
    est.modo = 'selecao';
    est.pilha = [id];
    salvarModo();
    renderLista(); renderPilha();
    $('leitor').scrollTop = 0;
    aviso('Modo seleção. Use o ＋ para juntar mais pontos.');
    return;
  }
  if (est.pilha.includes(id)) { aviso('Esse ponto já está na tela.'); return; }
  est.pilha.push(id);
  renderLista(); renderPilha();
  requestAnimationFrame(() => {
    const cards = $('pilha').children;
    cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function salvarModo() {
  try {
    localStorage.setItem(MODO_KEY, est.modo);
    localStorage.setItem(COL_KEY, String(est.colunas));
  } catch (_) {}
}

function desempilhar(id) {
  est.pilha = est.pilha.filter(x => x !== id);
  renderLista(); renderPilha();
}

/* ---------------- favoritos ---------------- */

async function alternarFavorito(id) {
  const p = acha(id);
  if (!p) return;
  const novo = !p.favorito;
  p.favorito = novo;                 // otimista: a estrela responde na hora
  renderLista(); renderPilha();
  try {
    const r = await fetch(`/api/pontos/${id}/favorito`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorito: novo })
    });
    if (!r.ok) throw new Error();
  } catch (_) {
    p.favorito = !novo;              // desfaz se o servidor recusou
    renderLista(); renderPilha();
    aviso('Não consegui salvar o favorito.');
  }
}

/* ---------------- montagem de gira ---------------- */

function iniciarMontagem(gira) {
  est.montando = gira;
  est.verRoteiro = false;
  if (est.vista === 'giras') est.vista = 'esquerda';
  render();
  aviso('Navegue pelo acervo e use o ＋ para montar o roteiro.');
}

function pararMontagem() {
  est.montando = null;
  est.verRoteiro = false;
  render();
}

function porNoRoteiro(id) {
  const lista = est.montando.pontos;
  const i = lista.indexOf(id);
  if (i === -1) lista.push(id); else lista.splice(i, 1);
  renderLista(); renderBanner();
}

function tirarDoRoteiro(id) {
  est.montando.pontos = est.montando.pontos.filter(x => x !== id);
  renderLista(); renderPilha(); renderBanner();
}

function moverNoRoteiro(id, passo) {
  const l = est.montando.pontos;
  const i = l.indexOf(id);
  const j = i + passo;
  if (i === -1 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  renderLista(); renderPilha();
}

async function salvarMontagem() {
  const g = est.montando;
  if (!g.pontos.length && !confirm('Salvar a gira sem nenhum ponto?')) return;
  const senha = localStorage.getItem(SENHA_KEY);
  if (!senha) { abrirModalGira(g, true); return; }

  const url = g.id ? `/api/giras/${g.id}` : '/api/giras';
  try {
    const r = await fetch(url, {
      method: g.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-senha': senha },
      body: JSON.stringify(g)
    });
    if (r.status === 401) { abrirModalGira(g, true); return aviso('Confirme a senha.'); }
    if (r.status === 429) return aviso((await r.json()).erro || 'Muitas tentativas. Espere um pouco.');
    if (!r.ok) return aviso('Não consegui salvar a gira.');
    const salva = await r.json();
    await carregar();
    est.montando = null;
    est.verRoteiro = false;
    est.vista = 'giras';
    est.giraAberta = salva.id;
    est.pilha = [];
    render();
    aviso('Gira salva.');
  } catch (_) {
    aviso('Sem conexão com o servidor.');
  }
}

/* ---------------- modais ---------------- */

function abrirModalGira(gira, apenasSenha = false) {
  const emEdicao = gira && gira.id;
  $('modalGiraTitulo').textContent = emEdicao ? 'Editar gira' : 'Nova gira';
  $('gNome').value = gira?.nome || '';
  $('gObs').value = gira?.observacao || '';
  $('gSenha').value = localStorage.getItem(SENHA_KEY) || '';
  $('giraErro').hidden = true;
  $('btnExcluirGira').hidden = !emEdicao;
  $('gDica').textContent = apenasSenha
    ? 'Confirme a senha para salvar o roteiro.'
    : 'Depois de criar, você navega pelo acervo e usa o ＋ para escolher os pontos, na ordem.';
  $('modalGira').dataset.giraId = gira?.id || '';
  $('modalGira').dataset.pontos = JSON.stringify(gira?.pontos || []);
  $('modalGira').hidden = false;
}

async function salvarGiraModal(ev) {
  ev.preventDefault();
  const nome = $('gNome').value.trim();
  const senha = $('gSenha').value;
  if (!nome) { $('giraErro').textContent = 'A gira precisa de um nome.'; $('giraErro').hidden = false; return; }

  const id = $('modalGira').dataset.giraId;
  const pontos = JSON.parse($('modalGira').dataset.pontos || '[]');
  const corpo = { nome, observacao: $('gObs').value.trim() || null, pontos };

  try {
    const r = await fetch(id ? `/api/giras/${id}` : '/api/giras', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-senha': senha },
      body: JSON.stringify(corpo)
    });
    if (r.status === 401) { $('giraErro').textContent = 'Senha incorreta.'; $('giraErro').hidden = false; return; }
    if (r.status === 429) { $('giraErro').textContent = (await r.json()).erro || 'Muitas tentativas.'; $('giraErro').hidden = false; return; }
    if (!r.ok) { $('giraErro').textContent = 'Não consegui salvar.'; $('giraErro').hidden = false; return; }
    localStorage.setItem(SENHA_KEY, senha);
    const salva = await r.json();
    await carregar();
    $('modalGira').hidden = true;
    est.montando = null;
    est.vista = 'giras';
    est.giraAberta = salva.id;
    est.pilha = [];
    render();
    if (!salva.pontos.length) {
      iniciarMontagem({ id: salva.id, nome: salva.nome, observacao: salva.observacao, pontos: [] });
    } else {
      aviso('Gira salva.');
    }
  } catch (_) {
    $('giraErro').textContent = 'Sem conexão com o servidor.';
    $('giraErro').hidden = false;
  }
}

async function excluirGira() {
  const id = $('modalGira').dataset.giraId;
  const g = GIRAS.find(x => String(x.id) === String(id));
  if (!id || !confirm(`Excluir a gira "${g?.nome || ''}"? Os pontos continuam no acervo.`)) return;
  const r = await fetch(`/api/giras/${id}`, { method: 'DELETE', headers: { 'x-senha': $('gSenha').value } });
  if (r.status === 401) { $('giraErro').textContent = 'Senha incorreta.'; $('giraErro').hidden = false; return; }
  if (r.status === 429) { $('giraErro').textContent = (await r.json()).erro || 'Muitas tentativas.'; $('giraErro').hidden = false; return; }
  await carregar();
  $('modalGira').hidden = true;
  est.giraAberta = null;
  est.pilha = [];
  render();
  aviso('Gira excluída.');
}

function abrirModal(ponto) {
  est.editandoPonto = ponto || null;
  $('modalTitulo').textContent = ponto ? 'Editar ponto' : 'Novo ponto';
  $('btnExcluir').hidden = !ponto;
  $('formErro').hidden = true;

  const linhaPadrao = LINHAS.includes(est.vista) ? est.vista : 'ritual';
  $('fLinha').value = ponto?.linha || linhaPadrao;
  $('fEntidade').value = ponto?.entidade || (LINHAS.includes(est.vista) ? est.entidade || '' : '');
  $('fEspecifica').value = ponto?.entidade_especifica || '';
  $('fTitulo').value = ponto?.titulo || '';
  $('fLetra').value = ponto?.letra || '';
  $('fCoringa').checked = Boolean(ponto?.coringa);
  $('fDaCasa').checked = ponto ? Boolean(ponto.da_casa) : est.vista === 'casa';
  $('fSenha').value = localStorage.getItem(SENHA_KEY) || '';

  const sm = $('fMomento');
  sm.innerHTML = '';
  for (const m of ORDEM_MOMENTO) {
    const o = document.createElement('option');
    o.value = m; o.textContent = ROTULO_MOMENTO[m];
    sm.appendChild(o);
  }
  sm.value = ponto?.momento || 'firmeza';

  const fr = $('fRitmos');
  fr.innerHTML = '';
  for (const r of META.ritmos) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = r;
    b.dataset.ritmo = r;
    b.setAttribute('aria-pressed', String(Boolean(ponto?.ritmos?.includes(r))));
    b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    fr.appendChild(b);
  }

  atualizaEntidadesSugeridas();
  $('modal').hidden = false;
}

function atualizaEntidadesSugeridas() {
  const linha = $('fLinha').value;
  const dl = $('listaEntidades');
  dl.innerHTML = '';
  const nomes = new Set(PONTOS.filter(p => p.linha === linha).map(p => p.entidade));
  for (const n of (ENTIDADES_EXTRA[linha] || [])) nomes.add(n);
  for (const n of [...nomes].sort()) {
    const o = document.createElement('option');
    o.value = n;
    dl.appendChild(o);
  }
}

function fecharModal() {
  $('modal').hidden = true;
  est.editandoPonto = null;
}

async function salvarPonto(ev) {
  ev.preventDefault();
  const senha = $('fSenha').value;
  const corpo = {
    linha: $('fLinha').value,
    entidade: $('fEntidade').value.trim(),
    entidade_especifica: $('fEspecifica').value.trim() || null,
    momento: $('fMomento').value,
    ritmos: [...$('fRitmos').querySelectorAll('[aria-pressed="true"]')].map(b => b.dataset.ritmo),
    coringa: $('fCoringa').checked,
    da_casa: $('fDaCasa').checked,
    titulo: $('fTitulo').value.trim(),
    letra: $('fLetra').value.trim()
  };

  if (!corpo.entidade) return erroForm('Informe a entidade.');
  if (!corpo.ritmos.length) return erroForm('Escolha ao menos um ritmo.');
  if (!corpo.letra) return erroForm('A letra não pode ficar vazia.');

  const editando = est.editandoPonto;
  try {
    const r = await fetch(editando ? `/api/pontos/${editando.id}` : '/api/pontos', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-senha': senha },
      body: JSON.stringify(corpo)
    });
    if (r.status === 401) return erroForm('Senha incorreta.');
    if (r.status === 429) return erroForm((await r.json()).erro || 'Muitas tentativas. Espere um pouco.');
    if (!r.ok) return erroForm((await r.json()).erro || 'Não foi possível salvar.');

    localStorage.setItem(SENHA_KEY, senha);
    const salvo = await r.json();
    await carregar();
    fecharModal();
    if (!est.montando && est.vista !== 'giras' && est.vista !== 'casa' && est.vista !== 'favoritos') {
      est.vista = salvo.linha;
      est.entidade = salvo.entidade;
      est.momento = null; est.ritmo = null; est.busca = '';
      $('campoBusca').value = '';
      $('buscaBarra').hidden = true;
    }
    est.pilha = [salvo.id];
    render();
    aviso(editando ? 'Ponto atualizado.' : 'Ponto adicionado.');
  } catch (_) {
    erroForm('Sem conexão com o servidor.');
  }
}

function erroForm(msg) {
  const el = $('formErro');
  el.textContent = msg;
  el.hidden = false;
}

async function excluirPonto() {
  const p = est.editandoPonto;
  if (!p || !confirm(`Excluir "${p.titulo}"? Isso não tem volta.`)) return;
  const r = await fetch(`/api/pontos/${p.id}`, { method: 'DELETE', headers: { 'x-senha': $('fSenha').value } });
  if (r.status === 401) return erroForm('Senha incorreta.');
  if (r.status === 429) return erroForm((await r.json()).erro || 'Muitas tentativas. Espere um pouco.');
  if (!r.ok) return erroForm('Não foi possível excluir.');
  await carregar();
  fecharModal();
  est.pilha = est.pilha.filter(x => x !== p.id);
  render();
  aviso('Ponto excluído.');
}

/* ---------------- rolagem automática ----------------
 * Para cantar sem tirar a mão do atabaque. Anda por tempo decorrido, nao por
 * quadro, entao a velocidade e a mesma em tablet lento ou rapido.
 * Encostar na tela pausa: se voce tocou, e porque quis intervir. */

const VELOCIDADES = { lento: 10, medio: 20, rapido: 36 }; // pixels por segundo
let rolagem = null;   // id do requestAnimationFrame
let ultimoQuadro = 0;
let sobra = 0;        // fracao de pixel guardada entre quadros

function rolando() { return rolagem !== null; }

function passoRolagem(agora) {
  const leitor = $('leitor');
  if (!leitor) return pararRolagem();
  const dt = Math.min((agora - ultimoQuadro) / 1000, 0.1); // ignora pausas longas de aba
  ultimoQuadro = agora;

  const avanco = VELOCIDADES[est.velocidade] * dt + sobra;
  const px = Math.floor(avanco);
  sobra = avanco - px;
  if (px > 0) leitor.scrollTop += px;

  const fim = leitor.scrollHeight - leitor.clientHeight;
  if (leitor.scrollTop >= fim - 1) {
    pararRolagem();
    aviso('Chegou ao fim.');
    return;
  }
  rolagem = requestAnimationFrame(passoRolagem);
}

function comecarRolagem() {
  if (rolando()) return;
  /* O scroll-snap do leitor puxa de volta a cada pixel andado, entao a rolagem
     automatica ficava parada no lugar. Desligo o snap enquanto ela roda. */
  $('leitor')?.classList.add('sem-snap');
  ultimoQuadro = performance.now();
  sobra = 0;
  rolagem = requestAnimationFrame(passoRolagem);
  atualizaBotaoRolagem();
}

function pararRolagem() {
  if (rolagem !== null) cancelAnimationFrame(rolagem);
  rolagem = null;
  $('leitor')?.classList.remove('sem-snap');
  atualizaBotaoRolagem();
}

function atualizaBotaoRolagem() {
  poe('rolar', 'textContent', rolando() ? '❚❚' : '▶');
  poe('rolar', 'title', rolando() ? 'Parar a rolagem' : 'Rolar sozinho');
  const el = $('rolar');
  if (el) el.setAttribute('aria-pressed', String(rolando()));
  for (const b of ($('velocidades')?.children || [])) {
    b.setAttribute('aria-pressed', String(b.dataset.vel === est.velocidade));
  }
}

/* ---------------- tela cheia ----------------
 * Duas camadas: a classe no body esconde os menus, e a API de fullscreen do
 * navegador tira as barras do sistema no tablet. A segunda pode falhar sem o
 * gesto do usuario ou em navegador que nao suporta, e ai a primeira ja resolve
 * a maior parte do ganho de tela. */

function ondeEstou() {
  if (est.vista === 'toques') return 'Toques';
  if (est.vista === 'favoritos') return 'Favoritos';
  if (est.vista === 'giras') {
    const g = GIRAS.find(x => x.id === est.giraAberta);
    return g ? g.nome : 'Giras';
  }
  const linha = ROTULO_LINHA[est.vista] || (est.vista === 'casa' ? 'Casa' : est.vista);
  return est.entidade ? `${linha} · ${est.entidade}` : linha;
}

function aplicaCheia(ligar) {
  est.cheia = ligar;
  document.body.dataset.cheia = ligar ? '1' : '';
  poe('sairCheia', 'hidden', !ligar);
  poe('cheiaOnde', 'textContent', ligar ? ondeEstou() : '');
  poe('telaCheia', 'textContent', ligar ? '⤡ Reduzir' : '⤢ Tela cheia');

  // a caixa muda de tamanho: refaz o ajuste da letra
  requestAnimationFrame(() => ajustarLetras());

  try {
    if (ligar && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (!ligar && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  } catch (_) {}
}

/* ---------------- tamanho da letra ---------------- */

function aplicaTamanho(px) {
  document.documentElement.style.setProperty('--letra-tam', px + 'px');
  try { localStorage.setItem(TAM_KEY, String(px)); } catch (_) {}
  ajustarLetras();
}
function tamanhoAtual() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--letra-tam'), 10) || 30;
}

/* ---------------- eventos ---------------- */

function liga(id, evento, fn) {
  const el = $(id);
  if (!el) { console.warn(`[curimba] elemento ausente: ${id}`); return null; }
  el[evento] = fn;
  return el;
}

function ligarEventos() {
  for (const b of document.querySelectorAll('.linha-btn')) {
    b.onclick = () => {
      pararRolagem();
      est.vista = b.dataset.vista;
      est.entidade = null; est.momento = null; est.ritmo = null;
      est.verRoteiro = false;
      if (est.vista !== 'giras') est.giraAberta = null;
      render();
    };
  }

  $('btnBusca').onclick = () => {
    const barra = $('buscaBarra');
    barra.hidden = !barra.hidden;
    if (!barra.hidden) $('campoBusca').focus();
  };
  $('fecharBusca').onclick = () => {
    $('buscaBarra').hidden = true;
    $('campoBusca').value = '';
    est.busca = '';
    renderLista(); renderPilha();
  };
  $('campoBusca').oninput = e => {
    est.busca = e.target.value;
    if (est.vista === 'toques') est.vista = 'ritual';
    render();
  };

  $('empilharTudo').onclick = () => {
    est.modo = 'tudo'; est.pilha = [];
    salvarModo(); renderLista(); renderPilha();
    $('leitor').scrollTop = 0;
  };
  $('limparPilha').onclick = () => {
    est.modo = 'tudo'; est.pilha = [];
    salvarModo(); renderLista(); renderPilha();
  };

  for (const b of ($('altModo')?.children || [])) {
    b.onclick = () => {
      est.modo = b.dataset.modo;
      if (est.modo === 'selecao' && !est.pilha.length) {
        const primeiro = visiveis()[0];
        if (primeiro) est.pilha = [primeiro.id];
      }
      salvarModo(); renderLista(); renderPilha();
      $('leitor').scrollTop = 0;
    };
  }
  for (const b of ($('altColunas')?.children || [])) {
    b.onclick = () => { est.colunas = Number(b.dataset.colunas); salvarModo(); renderPilha(); };
  }

  $('btnNovo').onclick = () => abrirModal(null);
  $('fecharModal').onclick = fecharModal;
  $('cancelar').onclick = fecharModal;
  $('btnExcluir').onclick = excluirPonto;
  $('form').onsubmit = salvarPonto;
  $('fLinha').onchange = atualizaEntidadesSugeridas;
  $('modal').onclick = e => { if (e.target === $('modal')) fecharModal(); };

  $('verRoteiro').onclick = () => { est.verRoteiro = !est.verRoteiro; render(); };
  $('cancelarGira').onclick = pararMontagem;
  $('salvarGira').onclick = salvarMontagem;
  $('formGira').onsubmit = salvarGiraModal;
  $('fecharModalGira').onclick = () => { $('modalGira').hidden = true; };
  $('cancelarGiraModal').onclick = () => { $('modalGira').hidden = true; };
  $('btnExcluirGira').onclick = excluirGira;
  $('modalGira').onclick = e => { if (e.target === $('modalGira')) $('modalGira').hidden = true; };

  liga('rolar', 'onclick', () => (rolando() ? pararRolagem() : comecarRolagem()));
  for (const b of ($('velocidades')?.children || [])) {
    b.onclick = () => {
      est.velocidade = b.dataset.vel;
      try { localStorage.setItem(VEL_KEY, est.velocidade); } catch (_) {}
      atualizaBotaoRolagem();
    };
  }
  // encostar na tela do leitor pausa
  $('leitor')?.addEventListener('touchstart', () => { if (rolando()) pararRolagem(); }, { passive: true });
  $('leitor')?.addEventListener('wheel', () => { if (rolando()) pararRolagem(); }, { passive: true });

  liga('telaCheia', 'onclick', () => aplicaCheia(!est.cheia));
  liga('sairCheia', 'onclick', () => aplicaCheia(false));

  // sair pelo Esc ou pelo botao voltar do tablet devolve os menus
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && est.cheia) aplicaCheia(false);
  });

  $('btnMaior').onclick = () => aplicaTamanho(Math.min(56, tamanhoAtual() + 3));
  $('btnMenor').onclick = () => aplicaTamanho(Math.max(17, tamanhoAtual() - 3));

  document.onkeydown = e => {
    if (e.key === 'Escape') {
      if (!$('modal').hidden || !$('modalGira').hidden) { fecharModal(); $('modalGira').hidden = true; return; }
      if (est.cheia) aplicaCheia(false);
    }
  };
}

/* ---------------- tela sempre acesa ---------------- */

async function manterAcesa() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const pedir = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch (_) {} };
  await pedir();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && lock?.released !== false) pedir();
  });
}

/* ---------------- start ---------------- */

(async function () {
  const salvo = localStorage.getItem(TAM_KEY);
  if (salvo) aplicaTamanho(parseInt(salvo, 10));
  if (localStorage.getItem(MODO_KEY) === 'selecao') est.modo = 'selecao';
  est.colunas = localStorage.getItem(COL_KEY) === '2' ? 2 : 1;
  const vel = localStorage.getItem(VEL_KEY);
  if (vel && VELOCIDADES[vel]) est.velocidade = vel;
  await carregar();
  try { ligarEventos(); } catch (e) { console.error('[curimba] falha ao ligar eventos', e); }
  atualizaBotaoRolagem();
  try { render(); } catch (e) {
    console.error('[curimba] falha ao desenhar', e);
    aviso('Algo quebrou ao desenhar a tela. Recarregue com Ctrl+Shift+R.');
  }
  manterAcesa();
})();
