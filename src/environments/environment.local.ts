// Entorno LOCAL: Supabase en Docker en esta computadora (se levanta desde el repo del backend).
// Uso: `npm run start:local`. La key es la publishable key fija del stack local
// de Supabase CLI (pública y solo válida en tu máquina).
export const environment = {
  production: false,
  supabase: {
    url: 'http://127.0.0.1:54321',
    anonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  },
};
