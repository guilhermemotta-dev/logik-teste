# Lead Manager (Netlify Ready)

Sistema completo de cadastro e gestão de leads desenvolvido para ser executado em ambientes serverless como Netlify ou Vercel. O backend roda como função serverless, enquanto o front-end é totalmente estático e responsivo.

## Stack

- **Backend:** Função serverless Node.js (Netlify Functions)
- **Frontend:** HTML, CSS e JavaScript vanilla (páginas estáticas)
- **Persistência:** Netlify Blob Store (quando disponível) ou arquivo JSON (`data/leads.json`)
- **Autenticação:** Basic Auth configurável via variáveis de ambiente

> ⚠️ Em plataformas serverless o projeto usa automaticamente o Netlify Blob Store para manter os dados entre execuções. Caso o recurso não esteja disponível, os leads são gravados em arquivo local efêmero; para produção recomenda-se trocar a persistência por um banco gerenciado (PostgreSQL, MySQL, MongoDB etc.).

## Executando localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Opcionalmente, configure as variáveis de ambiente (`ADMIN_USER` e `ADMIN_PASS`) para substituir as credenciais padrão (`admin`/`admin`). No Netlify CLI, utilize `netlify env:set ADMIN_USER seu_usuario`.

3. Inicie o ambiente de desenvolvimento com o Netlify CLI:

   ```bash
   npm run dev
   ```

   O comando executa `netlify dev`, servindo os arquivos estáticos de `public/` e expondo a função serverless em `http://localhost:8888/api/*`.

4. Rode os testes automatizados para garantir que as credenciais padrão (`admin`/`admin`) continuam válidas:

   ```bash
   npm test
   ```

### Deploy na Netlify

1. Faça login com o CLI (`netlify login`).
2. Crie um novo site (`netlify init`) e vincule o repositório.
3. Caso deseje alterar as credenciais padrão (`admin`/`admin`), defina as variáveis `ADMIN_USER` e `ADMIN_PASS` no painel ou via CLI.
4. (Opcional) Para armazenar os leads em um espaço dedicado, configure `NETLIFY_BLOB_STORE` com o nome do bucket de blobs desejado (padrão: `leads`).
5. A Netlify usará o `netlify.toml` deste projeto:
   - Diretório publicado: `public`
   - Funções: `netlify/functions`
   - Build command: `npm run build` (não há build, apenas mensagem informativa)

### Deploy na Vercel

O repositório já inclui uma rota serverless em `api/leads.js`, compatível com o modelo de funções da Vercel:

1. Crie o projeto na Vercel apontando para este repositório.
2. Em **Root Directory**, mantenha `./`.
3. Não é necessário comando de build (a Vercel detectará automaticamente).
4. Caso deseje alterar as credenciais padrão (`admin`/`admin`), defina as variáveis `ADMIN_USER` e `ADMIN_PASS` no painel.
5. (Opcional) Ajuste `LEADS_STORAGE_FILE` para apontar para um caminho de escrita permitido (por exemplo, `/tmp/leads.json`). Sem essa configuração, a Vercel utilizará o diretório temporário padrão.
6. Faça o deploy: o formulário estático será servido a partir de `public/` e os endpoints REST ficarão acessíveis em `/api/leads`.

Durante o desenvolvimento local, você pode usar `vercel dev` para testar a função da Vercel juntamente com os arquivos estáticos.

## Variáveis de ambiente

- `ADMIN_USER`: usuário para autenticação básica do painel e endpoints protegidos. Padrão: `admin`.
- `ADMIN_PASS`: senha para autenticação básica. Padrão: `admin`.
- `LEADS_STORAGE_FILE`: caminho personalizado para o arquivo JSON (utilize, por exemplo, `/tmp/leads.json` em ambientes somente leitura).
- `NETLIFY_BLOB_STORE`: nome do bucket usado no Netlify Blob Store para persistir os dados (padrão: `leads`).

## Estrutura de pastas

```
public/                Páginas estáticas (formulário, painel e detalhes)
├── admin.html         Painel administrativo
├── lead.html          Detalhe do lead
├── index.html         Formulário público
├── admin.js           Lógica do painel
├── lead.js            Lógica da página de detalhes
├── auth.js            Utilidades de autenticação no front-end
├── *.css              Estilos compartilhados
├── api/leads.js       Função REST para deploy na Vercel
├── netlify/functions/api.js  Função serverless REST
└── lib/               Utilidades compartilhadas pela função
    ├── auth.js        Verificação de Basic Auth
    ├── storage.js     Persistência em JSON e exportação CSV
    └── validation.js  Regras de validação de payload
```

## Formulário público

Disponível em `/` com os campos obrigatórios:

- nome
- e-mail
- telefone (validação brasileira)
- cargo
- data de nascimento
- mensagem

O formulário captura automaticamente os parâmetros `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid` e `fbclid` da URL e os envia junto com o lead.

## Painel administrativo (`/admin.html`)

- Credenciais padrão: usuário `admin`, senha `admin` (pode ser alterado via variáveis de ambiente).
- Autenticação básica via `ADMIN_USER`/`ADMIN_PASS`
- Listagem com busca por nome ou e-mail
- Criação, edição e exclusão de leads
- Visualização completa do lead (`lead.html?id=<id>`)
- Exportação dos leads filtrados em CSV

## API REST

Todos os endpoints estão disponíveis em `/api/leads` e exigem autenticação básica, exceto o `POST` público.

| Método | Endpoint | Autenticação | Descrição |
| ------ | -------- | ------------ | --------- |
| `POST` | `/api/leads` | Não | Cria um novo lead com os dados do formulário público. |
| `GET` | `/api/leads` | Sim | Lista leads cadastrados. Aceita `?search=<termo>` para filtrar por nome ou e-mail. |
| `GET` | `/api/leads/:id` | Sim | Retorna os detalhes completos de um lead. |
| `PUT` | `/api/leads/:id` | Sim | Atualiza todas as informações de um lead. |
| `DELETE` | `/api/leads/:id` | Sim | Remove um lead definitivamente. |
| `GET` | `/api/leads/export` | Sim | Retorna os leads em CSV (considera `search`). |

### Exemplo de payload (`POST /api/leads`)

```json
{
  "name": "Nome do Lead",
  "email": "lead@email.com",
  "phone": "+55 11 91234-5678",
  "role": "Cargo",
  "birthDate": "1990-01-01",
  "message": "Mensagem do lead",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "campanha",
  "utm_term": "keyword",
  "utm_content": "anuncio-a",
  "gclid": "123",
  "fbclid": "456"
}
```

### Regras de validação

- Todos os campos acima são obrigatórios.
- E-mail precisa ter formato válido.
- Telefone deve corresponder ao padrão brasileiro.
- Data de nascimento deve ser uma data válida.

## Exportação CSV

O arquivo gerado contém as colunas: `id`, `name`, `email`, `phone`, `role`, `birthDate`, `message`, `createdAt`, `updatedAt`, além de todas as UTMs (`utm_*`, `gclid`, `fbclid`).

## Licença

Projeto criado para avaliação técnica.
