declare module '*.png' {
  const value: string;
  export default value;
}

/* Vite injects these at build time. Declared here rather than pulling in
   vite/client, which the current tsconfig does not reference. */
interface ImportMetaEnv {
  readonly VITE_WS_URL?: string;
  readonly VITE_SSE_URL?: string;
  /** Backend origin for /api calls. Defaults to http://localhost:3007. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
