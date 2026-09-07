'use strict';

const CACHE_KEY = 'curimba.pontos.v1';
const SENHA_KEY = 'curimba.senha';
const TAM_KEY = 'curimba.tamanho';

const ROTULO_LINHA = { ritual: 'Ritual', orixas: 'Orixás', esquerda: 'Esquerda', direita: 'Direita' };
const ROTULO_MOMENTO = {
  abertura: 'Abertura', defumacao: 'Defumação', chamada: 'Chamada', saudacao: 'Saudação',
  firmeza: 'Firmeza', paga: 'Paga', descarrego: 'Descarrego', subida: 'Subida'
};
// ordem litúrgica, não alfabética: é a ordem em que a gira acontece
const ORDEM_MOMENTO = ['abertura', 'defumacao', 'chamada', 'saudacao', 'firmeza', 'paga', 'descarrego', 'subida'];

// entidades vazias que devem aparecer no menu mesmo sem ponto cadastrado
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
let META = { linhas: [], momentos: [], ritmos: [] };
const est = { linha: 'ritual', entidade: null, momento: null, ritmo: null, busca: '', selecionado: null, editando: null };

const $ = id => document.getElementById(id);

/* ---------------- carga ---------------- */

async function carregar() {
  try {
    const [pontos, meta] = await Promise.all([
      fetch('/api/pontos').then(r => r.json()),
      fetch('/api/meta').then(r => r.json())
    ]);
    PONTOS = pontos;
    META = meta;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ pontos, meta })); } catch (_) {}
  } catch (e) {
    // rede caiu no meio da gira: segue com a última cópia que o tablet viu
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cache) {
        PONTOS = cache.pontos;
        META = cache.meta;
        aviso('Sem conexão. Usando a última cópia salva no tablet.');
      } else {
        aviso('Não consegui carregar os pontos e não há cópia salva.');
      }
    } catch (_) {}
  }
}

/* ---------------- filtros ---------------- */

function normaliza(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function daLinha(linha) {
  return PONTOS.filter(p => p.linha === linha);
}

function entidadesDaLinha(linha) {
  const mapa = new Map();
  for (const p of daLinha(linha)) mapa.set(p.entidade, (mapa.get(p.entidade) || 0) + 1);
  for (const nome of (ENTIDADES_EXTRA[linha] || [])) if (!mapa.has(nome)) mapa.set(nome, 0);
  return [...mapa.entries()];
}

function visiveis() {
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
  let l = daLinha(est.linha);
  if (est.entidade) l = l.filter(p => p.entidade === est.entidade || (p.coringa && p.linha === est.linha));
  if (est.momento) l = l.filter(p => p.momento === est.momento);
  if (est.ritmo) l = l.filter(p => p.ritmos.includes(est.ritmo));
  return l.sort((a, b) => ORDEM_MOMENTO.indexOf(a.momento) - ORDEM_MOMENTO.indexOf(b.momento) || a.id - b.id);
}

/* ---------------- render ---------------- */

function renderLinhas() {
  for (const b of document.querySelectorAll('.linha-btn')) {
    b.setAttribute('aria-selected', String(b.dataset.linha === est.linha));
  }
  document.body.dataset.linha = est.linha;
}

function renderEntidades() {
  const nav = $('navEntidades');
  nav.innerHTML = '';
  for (const [nome, qtd] of entidadesDaLinha(est.linha)) {
    const b = document.createElement('button');
    b.className = 'ent-btn';
    b.setAttribute('aria-selected', String(est.entidade === nome));
    b.innerHTML = `${nome}<span class="qtd">${qtd}</span>`;
    b.onclick = () => {
      est.entidade = est.entidade === nome ? null : nome;
      est.momento = null;
      renderEntidades(); renderFiltros(); renderLista();
    };
    nav.appendChild(b);
  }
  nav.scrollLeft = 0;
}

function renderFiltros() {
  const base = est.entidade
    ? daLinha(est.linha).filter(p => p.entidade === est.entidade)
    : daLinha(est.linha);

  const cm = $('chipsMomento');
  cm.innerHTML = '';
  const momentos = ORDEM_MOMENTO.filter(m => base.some(p => p.momento === m));
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
  const ritmos = META.ritmos.filter(r => base.some(p => p.ritmos.includes(r)));
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
  ul.innerHTML = '';
  $('contador').textContent = itens.length === 1 ? '1 ponto' : `${itens.length} pontos`;

  for (const p of itens) {
    const li = document.createElement('li');
    li.className = 'item';
    li.setAttribute('aria-current', String(est.selecionado === p.id));
    const espec = p.entidade_especifica ? ` · ${p.entidade_especifica}` : '';
    const cor = p.coringa ? '<span class="tag">coringa</span>' : '';
    li.innerHTML =
      `<div class="item-tit">${escapa(p.titulo)}</div>` +
      `<div class="item-sub">${cor}<span class="tag">${ROTULO_MOMENTO[p.momento] || p.momento}</span>` +
      `${escapa(p.ritmos.join(' / '))}${escapa(espec)}</div>`;
    li.onclick = () => abrir(p.id);
    ul.appendChild(li);
  }
  ul.scrollTop = 0;
}

function abrir(id) {
  const p = PONTOS.find(x => x.id === id);
  if (!p) return;
  est.selecionado = id;
  $('vazio').hidden = true;
  $('ponto').hidden = false;
  $('pTitulo').textContent = p.titulo;
  const partes = [
    ROTULO_LINHA[p.linha],
    p.entidade + (p.entidade_especifica ? ` · ${p.entidade_especifica}` : ''),
    ROTULO_MOMENTO[p.momento] || p.momento,
    p.ritmos.join(' / ')
  ];
  const sauda = SAUDACOES[p.entidade];
  if (sauda) partes.push(sauda);
  $('pMeta').textContent = partes.join('  ·  ');
  $('pLetra').textContent = p.letra;
  $('leitor').scrollTop = 0;
  renderLista();
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
  avisoTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

/* ---------------- tamanho da letra ---------------- */

function aplicaTamanho(px) {
  document.documentElement.style.setProperty('--letra-tam', px + 'px');
  try { localStorage.setItem(TAM_KEY, String(px)); } catch (_) {}
}
function tamanhoAtual() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--letra-tam'), 10) || 30;
}

/* ---------------- modal ---------------- */

function abrirModal(ponto) {
  est.editando = ponto || null;
  $('modalTitulo').textContent = ponto ? 'Editar ponto' : 'Novo ponto';
  $('btnExcluir').hidden = !ponto;
  $('formErro').hidden = true;

  $('fLinha').value = ponto?.linha || est.linha;
  $('fEntidade').value = ponto?.entidade || est.entidade || '';
  $('fEspecifica').value = ponto?.entidade_especifica || '';
  $('fTitulo').value = ponto?.titulo || '';
  $('fLetra').value = ponto?.letra || '';
  $('fCoringa').checked = Boolean(ponto?.coringa);
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

  const dl = $('listaEntidades');
  dl.innerHTML = '';
  for (const nome of [...new Set(PONTOS.map(p => p.entidade))].sort()) {
    const o = document.createElement('option');
    o.value = nome;
    dl.appendChild(o);
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
  est.editando = null;
}

async function salvar(ev) {
  ev.preventDefault();
  const senha = $('fSenha').value;
  const corpo = {
    linha: $('fLinha').value,
    entidade: $('fEntidade').value.trim(),
    entidade_especifica: $('fEspecifica').value.trim() || null,
    momento: $('fMomento').value,
    ritmos: [...$('fRitmos').querySelectorAll('[aria-pressed="true"]')].map(b => b.dataset.ritmo),
    coringa: $('fCoringa').checked,
    titulo: $('fTitulo').value.trim(),
    letra: $('fLetra').value.trim()
  };

  if (!corpo.ritmos.length) return erroForm('Escolha ao menos um ritmo.');
  if (!corpo.entidade) return erroForm('Informe a entidade.');
  if (!corpo.letra) return erroForm('A letra não pode ficar vazia.');

  const editando = est.editando;
  const url = editando ? `/api/pontos/${editando.id}` : '/api/pontos';
  const metodo = editando ? 'PUT' : 'POST';

  try {
    const r = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'x-senha': senha },
      body: JSON.stringify(corpo)
    });
    if (r.status === 401) return erroForm('Senha incorreta.');
    if (!r.ok) return erroForm((await r.json()).erro || 'Não foi possível salvar.');

    localStorage.setItem(SENHA_KEY, senha);
    const salvo = await r.json();
    await carregar();
    fecharModal();
    est.linha = salvo.linha;
    est.entidade = salvo.entidade;
    est.momento = null; est.ritmo = null; est.busca = '';
    $('campoBusca').value = '';
    $('buscaBarra').hidden = true;
    renderLinhas(); renderEntidades(); renderFiltros(); renderLista();
    abrir(salvo.id);
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

async function excluir() {
  const p = est.editando;
  if (!p || !confirm(`Excluir "${p.titulo}"? Isso não tem volta.`)) return;
  const senha = $('fSenha').value;
  const r = await fetch(`/api/pontos/${p.id}`, { method: 'DELETE', headers: { 'x-senha': senha } });
  if (r.status === 401) return erroForm('Senha incorreta.');
  if (!r.ok) return erroForm('Não foi possível excluir.');
  await carregar();
  fecharModal();
  est.selecionado = null;
  $('ponto').hidden = true;
  $('vazio').hidden = false;
  renderEntidades(); renderFiltros(); renderLista();
  aviso('Ponto excluído.');
}

/* ---------------- eventos ---------------- */

function ligarEventos() {
  for (const b of document.querySelectorAll('.linha-btn')) {
    b.onclick = () => {
      est.linha = b.dataset.linha;
      est.entidade = null; est.momento = null; est.ritmo = null;
      renderLinhas(); renderEntidades(); renderFiltros(); renderLista();
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

  $('btnNovo').onclick = () => abrirModal(null);
  $('btnEditar').onclick = () => {
    const p = PONTOS.find(x => x.id === est.selecionado);
    if (p) abrirModal(p);
  };
  $('fecharModal').onclick = fecharModal;
  $('cancelar').onclick = fecharModal;
  $('btnExcluir').onclick = excluir;
  $('form').onsubmit = salvar;
  $('fLinha').onchange = atualizaEntidadesSugeridas;
  $('modal').onclick = e => { if (e.target === $('modal')) fecharModal(); };

  $('btnMaior').onclick = () => aplicaTamanho(Math.min(56, tamanhoAtual() + 3));
  $('btnMenor').onclick = () => aplicaTamanho(Math.max(17, tamanhoAtual() - 3));

  document.onkeydown = e => {
    if (e.key === 'Escape') { fecharModal(); }
  };
}

/* ---------------- tela sempre acesa ---------------- */

async function manterAcesa() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const pedir = async () => {
    try { lock = await navigator.wakeLock.request('screen'); } catch (_) {}
  };
  await pedir();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && lock?.released !== false) pedir();
  });
}

/* ---------------- start ---------------- */

(async function () {
  const salvo = localStorage.getItem(TAM_KEY);
  if (salvo) aplicaTamanho(parseInt(salvo, 10));
  await carregar();
  ligarEventos();
  renderLinhas();
  renderEntidades();
  renderFiltros();
  renderLista();
  manterAcesa();
})();
