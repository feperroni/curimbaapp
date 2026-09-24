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
  entidades: [],          // entidade escolhida; duas quando o lado a lado esta ligado
  comparar: false,        // modo lado a lado: duas entidades, uma coluna cada
  paneAtiva: 0,           // no lado a lado, a coluna que os botoes de ponto comandam
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

/* Cada escolha guarda a linha junto com o nome: no lado a lado da para pegar
   uma guia da Direita e uma da Esquerda ao mesmo tempo, entao "Exu" sozinho
   nao diz de onde veio. */
const selecionada = (vista, nome) =>
  est.entidades.findIndex(e => e.vista === vista && e.nome === nome);
// a entidade da linha aberta, para quando so uma faz sentido
const entidadeAtual = () => {
  const e = est.entidades.find(x => x.vista === est.vista);
  return e ? e.nome : null;
};
// a tela esta partida em duas colunas de entidade?
const dividido = () => est.comparar && est.entidades.length >= 2;

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
  // no lado a lado os chips valem para as duas colunas, mesmo de linhas diferentes
  if (dividido()) return est.entidades.flatMap(e => daEntidade(conjuntoDaVista(e.vista), e));
  const conj = conjuntoDaVista(est.vista);
  const escolhidas = est.entidades.filter(e => e.vista === est.vista).map(e => e.nome);
  if (!escolhidas.length) return conj;
  return conj.filter(p => escolhidas.includes(p.entidade));
}

// coringa serve qualquer entidade da propria linha
function daEntidade(lista, sel) {
  return lista.filter(p => p.entidade === sel.nome ||
    (p.coringa && LINHAS.includes(sel.vista) && p.linha === sel.vista));
}

function aplicaFiltros(lista) {
  let l = lista;
  if (est.momento) l = l.filter(p => p.momento === est.momento);
  if (est.ritmo) l = l.filter(p => p.ritmos.includes(est.ritmo));
  return l;
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

  const escolhidas = est.entidades.filter(e => e.vista === est.vista).map(e => e.nome);
  if (escolhidas.length) {
    l = l.filter(p => escolhidas.includes(p.entidade) ||
      (p.coringa && LINHAS.includes(est.vista) && p.linha === est.vista));
  }
  return ordenaLiturgico(aplicaFiltros(l));
}


/* ---------------- toques de atabaque ----------------
 * Fonte: o guia de toques do proprio songbook do terreiro, no fim do Word.
 * As figuras e a grade de batidas foram desenhadas aqui a partir dele.
 * Nada foi copiado de livro: o que existe de material publicado sobre toque
 * de umbanda e obra protegida, e alem disso a grafia varia de casa para casa.
 * Confira com o oga da casa antes de tomar isto como padrao.
 *
 * Cada card responde quatro coisas, nesta ordem: de onde o toque vem, que
 * energia ele carrega, quando se usa, e o que o separa do toque vizinho --
 * que e a duvida real na hora de escolher.
 *
 * Nenhum toque e amarrado a um orixa: quem decide e quem compos o ponto.
 * As entidades listadas em "Quando" sao o uso comum, nao regra.
 */
const ZONAS = {
  grave: { nome: 'Centro', como: 'mão aberta no meio da pele', som: 'DUM, TUM' },
  medio: { nome: 'Meia pele', como: 'mão chapada entre o centro e a borda', som: 'pa, ta, tchê' },
  agudo: { nome: 'Borda', como: 'ponta dos dedos junto ao aro', som: 'tchi, ca, tique' }
};

const TOQUES = [
  {
    id: 'ijexa', nome: 'Ijexá', tempo: 'Binário, cadenciado',
    origem: 'Nação iorubá, da cidade de Ilexá; chegou ao Brasil pela Bahia',
    clima: 'Água corrente, acolhimento, tranquilidade',
    uso: 'Oxum e Logunã por fundamento, mas serve quase todas as linhas: Yemanjá, Oxalá, Obaluaiê, Oxóssi, Iansã, Pretos Velhos',
    padrao: 'DUM — ca-DUM — ca',
    diferenca: 'É o avesso do Barra-Vento, que vem da mesma raiz: onde o Barra-Vento acelera e arrebata, o Ijexá acalma.',
    nota: 'Tocado só com as mãos, fluido e sem pressa. É o toque mais usado do acervo.'
  },
  {
    id: 'nago', nome: 'Nagô', tempo: 'Marcado, solene',
    origem: 'Nação iorubá (nagô)',
    clima: 'Majestade, reverência, fundamento',
    uso: 'Pontos solenes de orixá e abertura de fundamento: Oxalá, Oxóssi, Xangô, Ogum',
    padrao: 'DUM — DUM — pa — DUM',
    diferenca: 'Mais grave e mais quadrado que o Ijexá; mais sério que o Congo. É o toque de reverência, não de festa.',
    nota: 'Aberto e sem correria. A solenidade está no espaço entre as batidas.'
  },
  {
    id: 'angola', nome: 'Angola', tempo: 'Pesado, arrastado',
    origem: 'Família banto (Angola)',
    clima: 'Terra firme, ancestralidade, peso',
    uso: 'Pretos Velhos, Exus, Pombagiras, Caboclos, Ogum nas chamadas, abertura de gira',
    padrao: 'DUM — pa — DUM — pa',
    diferenca: 'Mesma família do Congo, intenção oposta: o Congo é festa, o Angola é chão.',
    nota: 'Não corra: o peso é o que caracteriza o toque. Angola apressado vira outra coisa.'
  },
  {
    id: 'congo', nome: 'Congo (Congo de Ouro)', tempo: 'Binário, bem marcado',
    origem: 'Família banto (Congo)',
    clima: 'Festa, movimento, alegria marcada',
    uso: 'Ogum, Oxóssi, Xangô, Iansã, Oxumaré e as linhas festivas: baianos, ciganos, marinheiros, Exu Mirim',
    padrao: 'DUM-pa — DUM — DUM-pa',
    diferenca: 'Marca em cima do tempo, sem a síncope do Samba de Caboclo; e sem o peso do Angola.',
    nota: 'Alegre e bem marcado. É o toque que levanta a roda sem acelerar a gira.'
  },
  {
    id: 'samba', nome: 'Samba de Caboclo', tempo: 'Binário, sincopado',
    origem: 'Raiz banto, pelo samba de roda brasileiro',
    clima: 'Mata, galope, natureza viva',
    uso: 'Caboclos, Boiadeiros, Baianos, Marinheiros, pontos animados',
    padrao: 'DUM — ca-DUM — pa-DUM',
    diferenca: 'A síncope é o que separa ele do Congo: o Congo marca no tempo, o samba adianta.',
    nota: 'Ágil e saltitante. Pede corpo se mexendo, não só mão no couro.'
  },
  {
    id: 'cabula', nome: 'Cabula (Samba de Cabula)', tempo: 'Cadência de roda',
    origem: 'Família banto; aparece tanto no terreiro quanto na roda de capoeira',
    clima: 'Chão batido, corpo em movimento',
    uso: 'Pontos que pedem mais movimento que o Angola sem chegar na festa do Congo',
    padrao: 'TUM — TA — TA — TUM — TUM',
    diferenca: 'Fica entre o Angola e o Congo: mantém o chão do Angola, mas com a roda girando.',
    nota: 'A volta repete começando pelo TA: TA — TA — TUM — TUM — TUM.'
  },
  {
    id: 'barravento', nome: 'Barra-Vento (BV)', tempo: 'Cíclico e acelerado',
    origem: 'Família banto; também usado na capoeira',
    clima: 'Movimento, energia, arrebatamento',
    uso: 'Iansã; toque de puxada, para levantar a gira e firmar a chegada',
    padrao: null,
    diferenca: 'O contrário do Ijexá: mais rápido e mais forte, cadência cíclica, sem começo nem fim marcados.',
    nota: 'BV é a sigla de Barra-Vento — não é batida livre. A batida da casa ainda não está registrada aqui: confira com o ogã antes de tomar qualquer coisa como padrão.'
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
    const card = document.createElement('article');
    card.className = 'card card-toque';
    card.id = `toque-${t.id}`;

    // toque sem batida registrada mostra um aviso no lugar da grade
    const grade = t.padrao
      ? `<div class="grade">${gradeDoPadrao(t.padrao).map(c => `
              <div class="tempo">
                <span class="tempo-n">${c.n}</span>
                <div class="golpes">
                  ${c.golpes.length
                    ? c.golpes.map(g => `<span class="golpe z-${g.zona}">${escapa(g.texto)}</span>`).join('')
                    : '<span class="golpe pausa">·</span>'}
                </div>
              </div>`).join('')}</div>${svgLegendaZonas()}`
      : `<p class="toque-sem-grade">Batida ainda não registrada nesta casa.</p>`;

    card.innerHTML = `
      <h2 class="card-tit">${escapa(t.nome)}</h2>
      <p class="card-meta">${escapa(t.tempo)}  ·  ${escapa(t.clima)}</p>
      <div class="toque-corpo">
        <div class="toque-figura">${svgAtabaque()}</div>
        <div class="toque-vozes">
          ${grade}
          <p class="toque-uso"><b>De onde vem:</b> ${escapa(t.origem)}</p>
          <p class="toque-uso"><b>Quando:</b> ${escapa(t.uso)}</p>
          <p class="toque-uso"><b>Diferença:</b> ${escapa(t.diferenca)}</p>
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

function rotuloVista(v) {
  return ROTULO_LINHA[v] || (v === 'casa' ? 'Casa' : v === 'favoritos' ? 'Favoritos' : v);
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

  /* Lado a lado: com o modo ligado, dois toques escolhem duas entidades e o
     leitor parte em duas colunas. Desligado, um toque troca de entidade como
     sempre -- o gesto de sempre nao pode ficar mais lento por causa do modo.

     As duas escolhas nao precisam ser da mesma linha: da para por um Caboclo
     da Direita ao lado de um Exu da Esquerda. Por isso, com o modo ligado,
     trocar de linha no menu de cima NAO apaga o que ja foi escolhido -- e as
     escolhidas aparecem como etiqueta no comeco da barra, para voce sempre ver
     o par montado, esteja em que linha estiver. */
  const cmp = document.createElement('button');
  cmp.className = 'ent-btn ent-btn-modo';
  cmp.textContent = '⇆ Lado a lado';
  cmp.setAttribute('aria-pressed', String(est.comparar));
  cmp.title = est.comparar
    ? 'Sair do lado a lado'
    : 'Escolher duas entidades, de qualquer linha, e ver uma em cada coluna';
  cmp.onclick = () => {
    est.comparar = !est.comparar;
    if (!est.comparar) {
      // ao sair, fica so a escolha da linha aberta (ou nenhuma)
      est.entidades = est.entidades.filter(e => e.vista === est.vista).slice(0, 1);
    } else {
      est.modo = 'tudo';    // selecao manual nao vale no lado a lado
    }
    render();
  };
  nav.appendChild(cmp);

  if (est.comparar) {
    for (const [i, sel] of est.entidades.entries()) {
      const et = document.createElement('button');
      et.className = 'ent-escolhida';
      et.title = `Tirar ${sel.nome} do lado a lado`;
      et.innerHTML = `<span class="lado">${i + 1}</span>` +
        `<span class="ent-linha">${escapa(rotuloVista(sel.vista))}</span>` +
        `${escapa(sel.nome)}<span class="tira">✕</span>`;
      et.style.setProperty('--acento', `var(--cor-${sel.vista})`);
      et.onclick = () => {
        est.entidades.splice(i, 1);
        est.paneAtiva = 0;
        render();
      };
      nav.appendChild(et);
    }

    const dica = document.createElement('span');
    dica.className = 'dica-modo';
    dica.textContent = est.entidades.length >= 2
      ? '· trocar de linha não desfaz'
      : est.entidades.length
        ? 'escolha a segunda, de qualquer linha →'
        : 'escolha duas, de qualquer linha →';
    nav.appendChild(dica);
  }

  for (const [nome, qtd] of entidadesDaVista(est.vista)) {
    const i = selecionada(est.vista, nome);
    const b = document.createElement('button');
    b.className = 'ent-btn';
    b.setAttribute('aria-selected', String(i !== -1));
    const lado = (est.comparar && i !== -1) ? `<span class="lado">${i + 1}</span>` : '';
    b.innerHTML = `${lado}${escapa(nome)}<span class="qtd">${qtd}</span>`;
    b.onclick = () => {
      if (est.comparar) {
        if (i !== -1) est.entidades.splice(i, 1);
        else {
          // a terceira escolhida empurra a mais antiga para fora
          if (est.entidades.length >= 2) est.entidades.shift();
          est.entidades.push({ vista: est.vista, nome });
        }
      } else {
        est.entidades = (i !== -1) ? [] : [{ vista: est.vista, nome }];
      }
      est.momento = null;
      est.paneAtiva = 0;
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
  const ul = $('lista');
  const noRoteiro = Boolean(est.montando && est.verRoteiro);
  ul.innerHTML = '';
  poe('empilharTudo', 'hidden', est.modo === 'tudo' || dividido());

  /* No lado a lado a lista vira indice das duas colunas: cada grupo tem o nome
     da entidade e tocar num item salta na coluna daquela entidade. */
  if (dividido()) {
    const colunas = colunasDoLeitor();
    const total = colunas.reduce((n, c) => n + c.pontos.length, 0);
    $('contador').textContent = total === 1 ? '1 ponto' : `${total} pontos`;
    colunas.forEach((col, ci) => {
      const tit = document.createElement('li');
      tit.className = 'grupo-ent';
      tit.innerHTML = `<span class="lado">${ci + 1}</span>` +
        `<span class="grupo-linha">${escapa(rotuloVista(col.vista))}</span>${escapa(col.nome)}` +
        `<span class="grupo-qtd">${col.pontos.length}</span>`;
      tit.style.setProperty('--acento', `var(--cor-${col.vista})`);
      tit.onclick = () => marcaPaneAtiva(ci);
      ul.appendChild(tit);

      if (!col.pontos.length) {
        const vazio = document.createElement('li');
        vazio.className = 'lista-vazia';
        vazio.textContent = 'Nada aqui com esses filtros.';
        ul.appendChild(vazio);
        return;
      }

      col.pontos.forEach((p, i) => {
        const li = document.createElement('li');
        li.className = 'item';
        const corpo = document.createElement('div');
        corpo.className = 'item-corpo';
        corpo.innerHTML =
          `<div class="item-tit"><span class="ordem">${i + 1}</span>${escapa(p.titulo)}</div>` +
          `<div class="item-sub"><span class="tag">${escapa(ROTULO_MOMENTO[p.momento] || p.momento)}</span>` +
          `${escapa(p.ritmos.join(' / '))}</div>`;
        corpo.onclick = () => {
          marcaPaneAtiva(ci);
          document.getElementById(`card-${p.id}-c${ci}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        li.appendChild(corpo);

        const acoes = document.createElement('div');
        acoes.className = 'item-acoes';
        const fav = botaozinho(p.favorito ? '★' : '☆', 'Favorito', () => alternarFavorito(p.id));
        if (p.favorito) fav.classList.add('ativo');
        acoes.appendChild(fav);
        acoes.appendChild(botaozinho('✏️', `Editar "${p.titulo}"`, () => abrirModal(p)));
        li.appendChild(acoes);
        ul.appendChild(li);
      });
    });
    return;
  }

  const itens = visiveis();
  $('contador').textContent = itens.length === 1 ? '1 ponto' : `${itens.length} pontos`;

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

/* O leitor e sempre uma lista de colunas. Normalmente uma so; no lado a lado,
   uma por entidade, cada uma com a propria rolagem. */
function colunasDoLeitor() {
  if (!dividido()) return [{ nome: null, vista: est.vista, pontos: pontosNoLeitor() }];
  return est.entidades.map(sel => ({
    nome: sel.nome,
    vista: sel.vista,
    pontos: ordenaLiturgico(aplicaFiltros(daEntidade(conjuntoDaVista(sel.vista), sel)))
  }));
}

function criaCard(p, i, sufixo) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = `card-${p.id}${sufixo}`;

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
  return card;
}

function renderPilha() {
  const box = $('pilha');
  box.innerHTML = '';
  const colunas = colunasDoLeitor();
  const total = colunas.reduce((n, c) => n + c.pontos.length, 0);
  const parte = dividido();

  box.dataset.colunas = String(parte ? 1 : est.colunas);
  box.classList.toggle('dividido', parte);
  $('leitor').classList.toggle('dividido', parte);
  poe('vazio', 'hidden', total > 0 || parte);
  poe('limparPilha', 'hidden', est.modo !== 'selecao' || !total);
  poe('pilhaInfo', 'textContent', !total
    ? ''
    : total === 1 ? '1 ponto' : `${total} pontos na tela`);

  // no lado a lado nao existe "seleção" nem 2 colunas de card: some com os botões
  poe('altModo', 'hidden', parte);
  poe('altColunas', 'hidden', parte);
  for (const b of ($('altModo')?.children || [])) b.setAttribute('aria-pressed', String(b.dataset.modo === est.modo));
  for (const b of ($('altColunas')?.children || [])) b.setAttribute('aria-pressed', String(Number(b.dataset.colunas) === est.colunas));

  if (!parte) {
    const pontos = colunas[0].pontos;
    if (est.colunas === 2) distribuiEmDuasPilhas(box, pontos);
    else pontos.forEach((p, i) => box.appendChild(criaCard(p, i, '')));
    return;
  }

  colunas.forEach((col, ci) => {
    const pane = document.createElement('section');
    pane.className = 'pane';
    pane.dataset.coluna = String(ci);
    pane.setAttribute('aria-current', String(ci === est.paneAtiva));

    // cada coluna usa a cor da propria linha: da para saber de onde e sem ler
    pane.style.setProperty('--acento', `var(--cor-${col.vista})`);

    const cab = document.createElement('header');
    cab.className = 'pane-cab';
    cab.innerHTML = `<span class="pane-linha">${escapa(rotuloVista(col.vista))}</span>` +
      `<b>${escapa(col.nome)}</b>` +
      `<span>${col.pontos.length === 1 ? '1 ponto' : col.pontos.length + ' pontos'}</span>`;
    pane.appendChild(cab);

    const dentro = document.createElement('div');
    dentro.className = 'pane-pontos';
    if (!col.pontos.length) {
      const vazio = document.createElement('p');
      vazio.className = 'pane-vazio';
      vazio.textContent = 'Nada aqui com esses filtros.';
      dentro.appendChild(vazio);
    }
    col.pontos.forEach((p, i) => dentro.appendChild(criaCard(p, i, `-c${ci}`)));
    pane.appendChild(dentro);

    // a coluna em que voce encostou por ultimo e a que os botoes de ponto comandam
    pane.addEventListener('pointerdown', () => marcaPaneAtiva(ci), { passive: true });
    box.appendChild(pane);
  });
}

/* Duas colunas de card: cada ponto vai para a coluna que estiver mais curta
   naquele momento. Assim um ponto curto nao deixa um buraco esperando o vizinho
   comprido terminar -- o proximo ponto sobe e ocupa o espaco.
   O numero no titulo continua marcando a ordem liturgica, que e o que vale na
   hora de seguir a gira. */
function distribuiEmDuasPilhas(box, pontos) {
  const colA = document.createElement('div');
  const colB = document.createElement('div');
  colA.className = colB.className = 'coluna-massa';
  box.appendChild(colA);
  box.appendChild(colB);

  pontos.forEach((p, i) => {
    const menor = colA.offsetHeight <= colB.offsetHeight ? colA : colB;
    menor.appendChild(criaCard(p, i, ''));
  });
}

function marcaPaneAtiva(ci) {
  if (est.paneAtiva === ci) return;
  est.paneAtiva = ci;
  for (const pane of $('pilha').querySelectorAll('.pane')) {
    pane.setAttribute('aria-current', String(Number(pane.dataset.coluna) === ci));
  }
}

/* ---------------- enquadramento da letra ----------------
 * O ponto aparece inteiro, sempre: a caixa tem a altura que a letra pedir e
 * nada rola dentro dela. A fonte e a mesma em todos os pontos, a que voce
 * escolheu no A+/A-.
 *
 * Tentei dividir o ponto longo em duas colunas de texto para ele caber numa
 * tela so. Nao serve para este acervo: as letras vem do songbook em linhas
 * corridas e compridas, que ja quebram sozinhas na largura da tela. Em duas
 * colunas cada linha quebra o dobro de vezes e a altura fica igual -- medido,
 * 758px nos dois casos. Entao a rolagem e mesmo o caminho, e o que da para
 * fazer e ela ser boa: veja pulaPonto() e a rolagem automatica mais abaixo.
 */

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
  $('fEntidade').value = ponto?.entidade || (LINHAS.includes(est.vista) ? entidadeAtual() || '' : '');
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
      est.entidades = [{ vista: salvo.linha, nome: salvo.entidade }];
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

/* ---------------- rolagem ----------------
 * Tres coisas diferentes:
 *   1. a rolagem automatica, para cantar sem tirar a mao do atabaque;
 *   2. os botoes de ponto anterior / proximo ponto, que sao o jeito preciso de
 *      andar no acervo -- melhor que arrastar com a mao suada no meio da gira;
 *   3. no lado a lado, tudo isso vale para a coluna em que voce encostou.
 *
 * A rolagem automatica anda por tempo decorrido e guarda a posicao em numero
 * quebrado, atribuindo o valor com casa decimal. A versao antiga somava pixels
 * inteiros por quadro: no passo lento dava um pulo de 1px a cada 100ms, que e
 * exatamente a tranquinha que incomodava.
 */

// velocidade em LINHAS por minuto: mudar o tamanho da letra nao muda o ritmo
const VELOCIDADES = { lento: 14, medio: 24, rapido: 40 };
let rolagem = null;      // id do requestAnimationFrame
let ultimoQuadro = 0;
let posicoes = [];       // posicao em numero quebrado, uma por area

function rolando() { return rolagem !== null; }

// onde a rolagem acontece: o leitor inteiro, ou cada coluna do lado a lado
function areasDeRolagem() {
  const colunas = [...$('pilha').querySelectorAll('.pane-pontos')];
  return colunas.length ? colunas : [$('leitor')];
}

function areaAtiva() {
  const areas = areasDeRolagem();
  return areas[Math.min(est.paneAtiva, areas.length - 1)] || areas[0];
}

function pxPorSegundo() {
  const linha = tamanhoAtual() * 1.58;             // mesma entrelinha do CSS
  return VELOCIDADES[est.velocidade] * linha / 60;
}

function passoRolagem(agora) {
  const dt = Math.min((agora - ultimoQuadro) / 1000, 0.1);  // ignora aba em segundo plano
  ultimoQuadro = agora;
  const avanco = pxPorSegundo() * dt;

  const areas = areasDeRolagem();
  let todasNoFim = true;
  areas.forEach((area, i) => {
    if (posicoes[i] === undefined) posicoes[i] = area.scrollTop;
    const fim = area.scrollHeight - area.clientHeight;
    if (fim <= 0) return;
    // alguem arrastou com a mao: segue de onde a tela esta, nao de onde estava
    if (Math.abs(area.scrollTop - posicoes[i]) > 2) posicoes[i] = area.scrollTop;
    posicoes[i] = Math.min(posicoes[i] + avanco, fim);
    area.scrollTop = posicoes[i];
    if (posicoes[i] < fim - 1) todasNoFim = false;
  });

  if (todasNoFim) {
    pararRolagem();
    aviso('Chegou ao fim.');
    return;
  }
  rolagem = requestAnimationFrame(passoRolagem);
}

function comecarRolagem() {
  if (rolando()) return;
  ultimoQuadro = performance.now();
  const areas = areasDeRolagem();
  for (const a of areas) a.classList.add('rolando');
  posicoes = areas.map(a => a.scrollTop);
  rolagem = requestAnimationFrame(passoRolagem);
  atualizaBotaoRolagem();
}

function pararRolagem() {
  if (rolagem !== null) cancelAnimationFrame(rolagem);
  rolagem = null;
  posicoes = [];
  for (const a of areasDeRolagem()) a.classList.remove('rolando');
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

/* Anda de ponto em ponto.
 *
 * Trabalha com as POSICOES onde a tela pode parar, nao com a lista de cards:
 * em duas colunas os dois primeiros pontos comecam na mesma altura, e andar
 * "um card" levaria para o vizinho de lado em vez do proximo de cima para
 * baixo. Duas caixas que comecam quase na mesma linha valem uma parada so.
 */
function paradasDaArea(area) {
  const topoArea = area.getBoundingClientRect().top;
  const paradas = [];
  for (const card of area.querySelectorAll('.card')) {
    const y = Math.round(area.scrollTop + (card.getBoundingClientRect().top - topoArea));
    if (!paradas.some(v => Math.abs(v - y) < 24)) paradas.push(y);
  }
  return paradas.sort((a, b) => a - b);
}

function pulaPonto(passo) {
  pararRolagem();
  const area = areaAtiva();
  if (!area) return;

  const paradas = paradasDaArea(area);
  if (!paradas.length) return;

  const agora = area.scrollTop;
  const alvo = passo > 0
    ? paradas.find(y => y > agora + 8)
    : [...paradas].reverse().find(y => y < agora - 8);

  const fim = area.scrollHeight - area.clientHeight;
  const destino = Math.max(0, Math.min(alvo ?? (passo > 0 ? fim : 0), fim));
  area.scrollTo({ top: destino, behavior: 'smooth' });
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
  if (!est.entidades.length) return linha;
  if (dividido()) {
    return est.entidades.map(e => `${rotuloVista(e.vista)} · ${e.nome}`).join('   |   ');
  }
  return `${linha} · ${est.entidades.map(e => e.nome).join(', ')}`;
}

function aplicaCheia(ligar) {
  est.cheia = ligar;
  document.body.dataset.cheia = ligar ? '1' : '';
  poe('sairCheia', 'hidden', !ligar);
  poe('cheiaOnde', 'textContent', ligar ? ondeEstou() : '');
  poe('telaCheia', 'textContent', ligar ? '⤡ Reduzir' : '⤢ Tela cheia');

  // a caixa muda de tamanho: refaz o ajuste da letra

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
      /* No lado a lado a linha de cima e so navegacao: o par escolhido fica de
         pe enquanto voce passeia pelas linhas atras da segunda entidade. */
      if (!est.comparar) est.entidades = [];
      est.momento = null; est.ritmo = null;
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
  liga('pontoAnterior', 'onclick', () => pulaPonto(-1));
  liga('proximoPonto', 'onclick', () => pulaPonto(+1));
  for (const b of ($('velocidades')?.children || [])) {
    b.onclick = () => {
      est.velocidade = b.dataset.vel;
      try { localStorage.setItem(VEL_KEY, est.velocidade); } catch (_) {}
      atualizaBotaoRolagem();
    };
  }
  /* Encostar na tela pausa: se voce tocou, e porque quis intervir. Fica no
     leitor inteiro, entao vale tambem para as colunas do lado a lado. */
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
    // teclado: seta/espaco anda de ponto em ponto, sem precisar mirar no botao
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (!digitando && $('modal').hidden && $('modalGira').hidden) {
      if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); pulaPonto(+1); return; }
      if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); pulaPonto(-1); return; }
      if (e.key === 'ArrowLeft' && dividido()) { marcaPaneAtiva(0); return; }
      if (e.key === 'ArrowRight' && dividido()) { marcaPaneAtiva(1); return; }
    }
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
