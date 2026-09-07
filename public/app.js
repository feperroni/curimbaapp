'use strict';

const CACHE_KEY = 'curimba.cache.v2';
const SENHA_KEY = 'curimba.senha';
const TAM_KEY = 'curimba.tamanho';
const MODO_KEY = 'curimba.modo';
const COL_KEY = 'curimba.colunas';

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
  editandoPonto: null
};

const $ = id => document.getElementById(id);
const acha = id => PONTOS.find(p => p.id === id);

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
  return [...mapa.entries()];
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

/* ---------------- render ---------------- */

function render() {
  renderVista();
  renderSegundaFaixa();
  renderFiltros();
  renderLista();
  renderPilha();
  renderBanner();
}

function renderVista() {
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
    b.onclick = () => { est.momento = est.momento === m ? null : m; renderFiltros(); renderLista(); };
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
    b.onclick = () => { est.ritmo = est.ritmo === r ? null : r; renderFiltros(); renderLista(); };
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
  $('empilharTudo').hidden = est.modo === 'tudo';

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
      `<div class="item-sub">${ondeEsta}${tagCasa}${tagCoringa}<span class="tag">${ROTULO_MOMENTO[p.momento] || p.momento}</span>` +
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
  $('vazio').hidden = pontos.length > 0;
  $('limparPilha').hidden = est.modo !== 'selecao' || !pontos.length;
  $('pilhaInfo').textContent = !pontos.length
    ? ''
    : pontos.length === 1 ? '1 ponto' : `${pontos.length} pontos na tela`;

  for (const b of $('altModo').children) b.setAttribute('aria-pressed', String(b.dataset.modo === est.modo));
  for (const b of $('altColunas').children) b.setAttribute('aria-pressed', String(Number(b.dataset.colunas) === est.colunas));

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
    letra.textContent = p.letra;

    card.appendChild(cab);
    card.appendChild(letra);
    box.appendChild(card);
  });
}

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
  renderLista(); renderBanner();
}

function moverNoRoteiro(id, passo) {
  const l = est.montando.pontos;
  const i = l.indexOf(id);
  const j = i + passo;
  if (i === -1 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  renderLista();
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
  if (!r.ok) return erroForm('Não foi possível excluir.');
  await carregar();
  fecharModal();
  est.pilha = est.pilha.filter(x => x !== p.id);
  render();
  aviso('Ponto excluído.');
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

function ligarEventos() {
  for (const b of document.querySelectorAll('.linha-btn')) {
    b.onclick = () => {
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
    renderLista();
  };
  $('campoBusca').oninput = e => { est.busca = e.target.value; renderLista(); };

  $('empilharTudo').onclick = () => {
    est.modo = 'tudo'; est.pilha = [];
    salvarModo(); renderLista(); renderPilha();
    $('leitor').scrollTop = 0;
  };
  $('limparPilha').onclick = () => {
    est.modo = 'tudo'; est.pilha = [];
    salvarModo(); renderLista(); renderPilha();
  };

  for (const b of $('altModo').children) {
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
  for (const b of $('altColunas').children) {
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

  $('btnMaior').onclick = () => aplicaTamanho(Math.min(56, tamanhoAtual() + 3));
  $('btnMenor').onclick = () => aplicaTamanho(Math.max(17, tamanhoAtual() - 3));

  document.onkeydown = e => {
    if (e.key === 'Escape') { fecharModal(); $('modalGira').hidden = true; }
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
  await carregar();
  ligarEventos();
  render();
  manterAcesa();
})();
