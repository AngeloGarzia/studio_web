/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origine de l’API en prod (ex. https://studio-api.onrender.com). Vide en local = proxy Vite. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
