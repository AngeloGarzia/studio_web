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

