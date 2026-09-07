# Curimba · Nosso Casuá

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

**Casa**: aba própria, para os pontos do terreiro. É uma marcação (`da_casa`), não uma linha
separada, então um ponto da casa para Ogum continua aparecendo em Orixás → Ogum **e** na aba
Casa. Marque no formulário, tanto ao criar quanto ao editar um ponto que já existe. Se você
preferir que Casa seja uma quinta linha exclusiva, é uma troca pequena.

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

**Leitor.** Por padrão ele mostra **todos** os pontos da seleção atual, um após o outro, e você
rola a página. A lista da esquerda é o índice: tocar num item **pula** até ele no leitor, não
troca o que está na tela. Trocar de entidade ou mexer nos filtros recarrega o leitor inteiro.

No rodapé:

- **Tudo / Seleção.** `Tudo` é o padrão descrito acima. `Seleção` mostra só os pontos que você
  juntou com o `＋`, para quando quiser dois específicos lado a lado sem o resto no meio.
- **1 col / 2 col.** Uma coluna cabem dois pontos por tela, com a letra maior. Duas colunas
  cabem quatro, em 2x2, com a letra a 80% do tamanho. A escolha fica salva no tablet.
- **A− / A+.** Tamanho da letra, de 17px a 56px, também salvo no tablet.

O scroll tem snap, então o card seguinte encaixa no topo em vez de parar pela metade.

## Corrigir pontos

Todos os pontos são editáveis, os 147 importados do Word inclusive. O lápis fica direto na
lista, ao lado da estrela e do `＋`, e também no cabeçalho de cada card da pilha. Abre o mesmo
formulário do cadastro, já preenchido, onde dá para mexer em linha, entidade, momento, ritmos,
título e letra. Salvar e excluir pedem a senha; a senha fica guardada no tablet depois da
primeira vez, então numa sessão de correção você digita uma vez só.

Vale usar isso para arrumar o que a importação automática não teve como acertar: o Word junta
vários versos numa linha só em muitos pontos, e o título sai truncado quando a primeira linha
é longa demais.

## Garantir que um deploy não apague nada

Duas travas, nessa ordem de importância.

**O app se recusa a subir em produção sem banco.** O modo arquivo grava no disco do container,
que o Railway recria a cada deploy. Rodar assim em produção apaga tudo que foi cadastrado sem
mostrar erro nenhum: a tela abre normal, com os 147 do seed, e o resto sumiu. Por isso, quando
detecta ambiente de produção (`NODE_ENV=production` ou qualquer variável `RAILWAY_*`) e não
encontra `DATABASE_URL`, o processo para com uma mensagem explicando o que fazer. O deploy falha
no healthcheck e o Railway mantém no ar a versão anterior, com os dados dela intactos. Falha
barulhenta em vez de perda silenciosa. Para rodar sem banco de propósito, passe
`PERMITIR_MODO_ARQUIVO=1`.

**Com o Postgres ligado, deploy nenhum apaga dado.** O seed só roda com a tabela vazia, e não
existe caminho no código que apague algo no boot. Quem apaga é só você, pelo botão Excluir da
interface.

**Backup e restauração:**

```bash
npm run backup                                       # salva em backups/curimba-AAAA-MM-DD.json
npm run backup -- --restaurar arquivo.json           # mostra o que entraria, não grava
npm run backup -- --restaurar arquivo.json --apply   # grava
```

Contra o banco do Railway, use `railway run npm run backup`.

A restauração só **insere o que está faltando**. Nunca apaga e nunca sobrescreve o que já existe,
então rodar duas vezes não duplica nem estraga nada. Ela casa os pontos por `seed_ref` e, para os
que você criou, pela dupla entidade mais letra. As giras são recriadas com os ids remapeados,
então o roteiro continua apontando para os pontos certos mesmo que os ids tenham mudado.

A pasta `backups/` está no `.gitignore`: o repositório é público e o acervo não precisa ir junto.

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

Senha de edição padrão em desenvolvimento: `casua`. **Troque a `SENHA_EDICAO` em produção.**

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
| POST | `/api/pontos` | header | Cria ponto |
| PUT | `/api/pontos/:id` | header | Edita ponto |
| DELETE | `/api/pontos/:id` | header | Exclui ponto |
| PATCH | `/api/pontos/:id/favorito` | não | Liga e desliga o favorito |
| GET | `/api/giras` | não | Lista as giras com os pontos em ordem |
| POST | `/api/giras` | header | Cria gira |
| PUT | `/api/giras/:id` | header | Edita gira |
| DELETE | `/api/giras/:id` | header | Exclui gira |
| GET | `/health` | não | Healthcheck do Railway |

A senha vai no header `x-senha`.

## Detalhes de uso ao vivo

- **Tela sempre acesa**: o app pede `wakeLock` ao carregar, então o tablet não apaga no meio de um ponto longo.
- **Tamanho da letra**: botões `A−` e `A+` no canto do ponto, de 17px a 56px. A escolha fica salva no tablet.
- **Queda de rede**: o acervo é guardado no `localStorage` quando carrega. Se o wifi cair, o app abre com a
  última cópia que o tablet viu, em vez de tela branca. Não substitui um PWA de verdade, mas evita o pior.
- **Cores por linha**: âmbar no Ritual, azul nos Orixás, vermelho na Esquerda, verde na Direita. Serve para
  você saber onde está pelo canto do olho, sem ler.

## Segurança

O que está no lugar:

- **Senha em tempo constante.** Compara o SHA-256 dos dois lados, então nem o valor nem o
  tamanho da senha vazam por timing.
- **Limitador de força bruta.** Conta só as tentativas que falham, então corrigir cinquenta
  pontos numa sessão nunca esbarra nele. Passadas 10 falhas em 15 minutos, o IP fica bloqueado
  por 1 min, depois 5, 15 e 60 a cada nova rodada. Toda falha ainda leva 400ms fixos de atraso,
  o que encarece força bruta mesmo distribuída. É em memória: reiniciar o serviço zera, e se um
  dia rodar em mais de uma instância isto precisa ir para Redis ou para o banco.
- **Teto de volume no favorito**, que é a única rota de escrita sem senha: 120 chamadas por
  minuto por IP, muito acima de qualquer uso humano.
- **Cabeçalhos**: CSP restrita a `'self'` (o app não tem script nem style inline),
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`
  liberando só o wake lock, e HSTS quando servido por HTTPS.
- **`trust proxy` ligado**, senão atrás do proxy do Railway todos os acessos teriam o mesmo IP e
  um atacante bloquearia o terreiro inteiro.
- **SQL sempre parametrizado**, inclusive no resync.
- **Sem CORS aberto.** Como a senha vai num header customizado, o navegador não a envia em
  requisição cross-origin sem preflight, o que já protege contra CSRF.
- Corpo limitado a 256kb, erro genérico sem stack, e linha, momento e ritmo validados contra
  allowlist.

O que continua sendo risco, de propósito ou por decisão sua:

- **Quem tem a URL lê o acervo inteiro.** Não há autenticação de leitura.
- **A senha fica em `localStorage` no tablet**, em texto plano, para não redigitar. Num aparelho
  compartilhado, qualquer um lê pelo devtools.
- **Uma senha só, para todo mundo.** Não há como saber quem editou o quê.
- **Sem backup e sem lixeira.** Quem tem a senha apaga em definitivo. Vale um `pg_dump` periódico.
- **`rejectUnauthorized: false`** na conexão com o Postgres. Baixo risco na rede interna do
  Railway, mas é verificação de certificado desligada. Passe `PGSSL=disable` em ambiente sem TLS.

## Estrutura

```
src/server.js      API Express e validação
src/db.js          Camada de dados (Postgres, ou arquivo em dev) e seed
public/index.html  Estrutura da tela
public/style.css   Tema escuro, alvos de toque grandes
public/app.js      Navegação, filtros, busca e formulário
src/resync.js      Leva correções do JSON para um banco já populado
seed/pontos.json   Os 147 pontos classificados
```
