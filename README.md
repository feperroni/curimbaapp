# Curimba · Nosso Cazuá

Biblioteca de pontos de Umbanda para uso ao vivo em tablet de 10 polegadas.
147 pontos extraídos do songbook do terreiro, classificados por linha, entidade, momento litúrgico e ritmo.

## Como o acervo está organizado

**Linha** (menu fixo no topo, sempre visível):

| Linha | Entidades | Pontos |
|---|---|---|
| Ritual | Abertura, Lei Maior, Defumação, Olorum, Sete Linhas, Descarrego, Subida de Orixás | 20 |
| Orixás | Oxalá, Logunã, Oxum, Oxumaré, Oxóssi, Obá, Xangô, Oroiná, Ogum, Iansã, Obaluaê, Nanã, Yemanjá, Omulu | 58 |
| Esquerda | Exu, Pombagira, Exu Mirim, Pombagira Mirim | 25 |
| Direita | Preto Velho, Caboclo, Baiano, Malandro, Marinheiro, Boiadeiro, Cigano, Erê | 44 |

**Momento litúrgico** (filtro dentro da entidade), na ordem em que a gira acontece:
abertura, defumação, chamada, saudação, firmeza, paga, descarrego, subida.

**Ritmo**: Angola, Ijexá, Nagô, Congo, Samba, Samba de Caboclo, BV, Barravento, Cabula.

**Entidade específica**: nome próprio quando existe (Tranca Ruas, Tiriri, Zé Pelintra).

**Coringa**: ponto que serve qualquer entidade da linha. Aparece na lista de todas elas.

Títulos foram gerados a partir da primeira linha cantada, que é como o ponto é chamado na prática.
São editáveis pela interface.

Preto Velho e Caboclo ficam agrupados só pela entidade, sem nome próprio. `entidade_especifica`
existe e é preenchida onde o songbook marcava explicitamente (Tranca Ruas, Tiriri), mas não é
usada para subdividir as demais linhas.

## Favoritos, giras e pilha

**Favoritos.** Estrela em cada ponto, na lista e no card. Fica no servidor, então vale para
qualquer aparelho que abra a URL. É o único endpoint de escrita que não pede senha: é um toque
durante a gira, totalmente reversível, e exigir senha ali atrapalharia o uso ao vivo.

**Giras.** Roteiro nomeado e ordenado. Você cria a gira, navega pelo acervo normalmente e usa o
`＋` de cada ponto para escolher, na ordem. "Ver roteiro" mostra o que já entrou, com `↑ ↓ ✕`
para reordenar e tirar. Salvar exige a senha. Abrir uma gira empilha o roteiro inteiro no leitor.

**Pilha.** O leitor mostra vários pontos ao mesmo tempo, um embaixo do outro. Cada card ocupa
metade da altura útil, então dois cabem por tela, e cresce sozinho quando a letra é mais longa.
O scroll tem snap, então o card seguinte encaixa no topo. A lista lateral continua sempre
visível para você trocar rápido, e os pontos que estão na tela ficam marcados nela.

- Toque no corpo do item: abre sozinho, trocando o que estava na tela.
- `＋` no item: acrescenta à pilha sem tirar o que já está.
- "Empilhar tudo": joga a lista filtrada inteira na pilha.
- `✕` no card ou "Limpar" no rodapé: esvazia.

## Corrigir pontos

Todos os pontos são editáveis, os 147 importados do Word inclusive. O lápis fica direto na
lista, ao lado da estrela e do `＋`, e também no cabeçalho de cada card da pilha. Abre o mesmo
formulário do cadastro, já preenchido, onde dá para mexer em linha, entidade, momento, ritmos,
título e letra. Salvar e excluir pedem a senha; a senha fica guardada no tablet depois da
primeira vez, então numa sessão de correção você digita uma vez só.

Vale usar isso para arrumar o que a importação automática não teve como acertar: o Word junta
vários versos numa linha só em muitos pontos, e o título sai truncado quando a primeira linha
é longa demais.

## Levar correções do JSON para o banco (`npm run resync`)

O seed automático só roda com a tabela vazia, de propósito: senão todo deploy sobrescreveria
o que você editou. A consequência é que corrigir o `seed/pontos.json` depois do primeiro boot
não muda nada sozinho. O `resync` é a ponte.

```bash
npm run resync                      # só mostra o que mudaria, não grava
npm run resync -- --apply           # aplica
npm run resync -- --apply --force   # aplica também sobre pontos que você editou na interface
```

Sem `--apply` ele é somente leitura, então rodar por curiosidade é seguro. Contra o Postgres do
Railway, exporte a `DATABASE_URL` do banco antes de rodar (pega em Variables, ou use
`railway run npm run resync`).

O casamento entre JSON e banco é pela coluna `seed_ref`, que guarda o `id` do ponto no JSON.
Bancos populados antes dessa coluna existir têm ela vazia, e aí o script casa pela letra exata
e preenche o `seed_ref` na primeira execução.

Cinco situações, e o que ele faz em cada:

| Situação | O que acontece |
|---|---|
| Ponto do seed que ninguém tocou e mudou no JSON | Atualiza |
| Ponto do seed que **você editou pela interface** | Protege e lista, só muda com `--force` |
| Ponto novo no JSON | Insere |
| Ponto que saiu do JSON | Avisa, não exclui (excluir quebraria as giras) |
| Ponto que **você criou** pela interface | Ignora, não tem `seed_ref` |

Favoritos e giras nunca são tocados: o script só faz `UPDATE` e `INSERT`, nunca `DELETE`, e a
associação da gira é por `ponto_id`, que não muda. No Postgres tudo roda numa transação, então
um erro no meio não deixa o banco pela metade.

## Rodar local

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000`. Sem `DATABASE_URL` o app usa um arquivo JSON local
(`seed/.dev-db.json`, ignorado pelo git) e não precisa de banco nenhum para você mexer no layout.

Senha de edição padrão em desenvolvimento: `cazua`.

## Deploy no Railway

1. `railway init` na pasta, ou conecte o repositório pelo dashboard.
2. No projeto, **New → Database → PostgreSQL**.
3. No serviço do app, em **Variables**, adicione:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência, não cole o valor)
   - `SENHA_EDICAO` = a senha do terreiro
4. Deploy. No primeiro boot o servidor cria a tabela e carrega os 147 pontos do `seed/pontos.json`.
   Boots seguintes detectam que já há dados e não mexem em nada.
5. **Settings → Networking → Generate Domain** para pegar a URL pública.

No tablet, abra a URL no Chrome e use "Adicionar à tela inicial". Vira ícone e abre em tela cheia,
sem barra de endereço comendo espaço vertical.

## Endpoints

| Método | Rota | Senha | O que faz |
|---|---|---|---|
| GET | `/api/pontos` | não | Lista todos os pontos |
| GET | `/api/meta` | não | Linhas, momentos e ritmos válidos |
| POST | `/api/login` | corpo | Confere a senha |
| POST | `/api/pontos` | header | Cria ponto |
| PUT | `/api/pontos/:id` | header | Edita ponto |
| DELETE | `/api/pontos/:id` | header | Exclui ponto |
| GET | `/health` | não | Healthcheck do Railway |

A senha vai no header `x-senha`.

## Detalhes de uso ao vivo

- **Tela sempre acesa**: o app pede `wakeLock` ao carregar, então o tablet não apaga no meio de um ponto longo.
- **Tamanho da letra**: botões `A−` e `A+` no canto do ponto, de 17px a 56px. A escolha fica salva no tablet.
- **Queda de rede**: o acervo é guardado no `localStorage` quando carrega. Se o wifi cair, o app abre com a
  última cópia que o tablet viu, em vez de tela branca. Não substitui um PWA de verdade, mas evita o pior.
- **Cores por linha**: âmbar no Ritual, azul nos Orixás, vermelho na Esquerda, verde na Direita. Serve para
  você saber onde está pelo canto do olho, sem ler.

## Estrutura

```
src/server.js      API Express e validação
src/db.js          Camada de dados (Postgres, ou arquivo em dev) e seed
public/index.html  Estrutura da tela
public/style.css   Tema escuro, alvos de toque grandes
public/app.js      Navegação, filtros, busca e formulário
seed/pontos.json   Os 147 pontos classificados
```
