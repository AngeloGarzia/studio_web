# Studio des Grenadiers (refonte)

Monorepo:

- `frontend/web`: React (Vite) — site public + espace client + admin
- `backend/api`: Node.js (Express) — API + auth + calendrier + messagerie + portfolio

## Démarrer en local

### 1) Pré-requis

- Node.js 20+
- Postgres 15+

### 2) Variables d’environnement

Créer `backend/api/.env` (exemple):

```env
NODE_ENV=development
PORT=4000
APP_ORIGIN=http://localhost:5173

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studio_grenadiers?schema=public
JWT_SECRET=change_me

ADMIN_EMAIL=admin@local.dev
ADMIN_PASSWORD=ChangeMe123!

# SMTP Brevo (optionnel — sans host/user/password, les mails sont désactivés)
MAIL_HOST=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_SENDER=noreply@ton-domaine.fr
MAIL_FROM_NAME=Studio des Grenadiers
# MAIL_ADMIN_TO=admin@ton-domaine.fr

# S3 (optionnel pour commencer)
S3_REGION=eu-west-3
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
```

### 3) Installer + lancer

```bash
npm install
npm run dev:api
npm run dev:web
```

API: `http://localhost:4000`
Web: `http://localhost:5173`

## Production (Render — front / back séparés)

### API (Web Service)

- Root Directory : racine du monorepo
- Build : `npm install --include=dev && npm run build:api`
- Start : `npm run start:api` (applique `prisma migrate deploy` puis démarre Node)
- Variables : `DATABASE_URL`, `JWT_SECRET`, `APP_ORIGIN` (= URL du Static Site), `ADMIN_*`, `MAIL_*`, `S3_*`, `NODE_ENV=production`

### Front (Static Site)

- Root Directory : racine du monorepo
- Build : `npm install --include=dev && npm run build:web`
- Publish directory : `frontend/web/dist`
- Variable de **build** : `VITE_API_URL=https://<ton-api>.onrender.com` (origine de l’API, sans slash final, sans `/api`)

En local, ne pas définir `VITE_API_URL` : le proxy Vite vers le port 4000 reste utilisé.

