-- Generado por scripts/generar_seed.py desde sources/Candidatos/candidaturas_prefectura_alcaldia.json. No editar a mano.
-- Prefectura: provincia de Imbabura (10). Alcaldía: cantón Cotacachi (40).
insert into public.candidaturas (dignidad, provincia_id, canton_id, lista, organizacion_politica, candidato, binomio, color) values
  ('prefectura', 10, null, '7', 'MOVIMIENTO ACCION DEMOCRATICA NACIONAL, ADN', 'BLANCA DEL CONSUELO UNDA', 'ALFONSO VILLARROEL', '#6F2C90'),
  ('prefectura', 10, null, '8', 'PARTIDO AVANZA', 'MAURICIO LARREA', 'ASTRID COTACACHI CORDOVA', '#1A47BA'),
  ('prefectura', 10, null, '62', 'MOVIMIENTO SOMOS LIBRES', 'JOMAR CEVALLOS', 'MICHELLE PEREZ', '#D6298A'),
  ('prefectura', 10, null, '70-17', 'JUNTOS POR LA TRANSFORMACIÓN', 'PAOLINA VERCOUTERE', 'MICHAEL ENCALADA', '#F51A27'),
  ('alcaldia', 10, 40, '7', 'MOVIMIENTO ACCION DEMOCRATICA NACIONAL, ADN', 'ALICIA ANDRADE', null, '#6F2C90'),
  ('alcaldia', 10, 40, '8', 'PARTIDO AVANZA', 'MARIA BELEN TAMBACO', null, '#1A47BA'),
  ('alcaldia', 10, 40, '17', 'PARTIDO SOCIALISTA ECUATORIANO', 'DAMARIS LOZANO REINOSO', null, '#FD0000'),
  ('alcaldia', 10, 40, '20', 'MOVIMIENTO FUTURO', 'PETER UBIDIA', null, '#0BBAC1'),
  ('alcaldia', 10, 40, '103-62', 'SOMOS LIBRES POR EL VIVIR BIEN', 'ALFARO VALLEJO', null, '#E50167')
on conflict on constraint candidaturas_lista_uk do nothing;
