// Configuración de Supabase para la tienda, el panel (/admin) y la confirmación (/pedido).
// Los valores están en Supabase → Project Settings → API (ver README.md, paso 5).
//
// La "anon key" es PÚBLICA por diseño: cualquiera puede verla en el navegador.
// La protección real está en las políticas RLS y las funciones de supabase/schema.sql.
// NUNCA pongas acá la "service_role key".
window.LP_CONFIG = {
SUPABASE_URL: 'https://aaulwfnwnzachwukmseo.supabase.co',
SUPABASE_ANON_KEY: 'sb_publishable__zV7UhDvy-ozJRxCf4ijwQ_Cd_E_xUg',
};
