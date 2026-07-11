-- Usuarios de prueba para el sistema Kardex Clínico
-- Primero créalos en Supabase Auth con el email y el nombre indicados en el README.
-- Luego ejecuta este script para asignarles el rol de administrador.
-- Contraseñas de referencia:
-- - angelloevolution@evolution.com -> angello0912
-- - janetevolution@evolution.com -> janet123
-- - evolutionadmin@evolution.com -> evolution1223

INSERT INTO profile_roles (profile_id, role)
SELECT p.id, 'admin'::user_role
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'evolutionadmin@evolution.com'
ON CONFLICT (profile_id, role) DO NOTHING;

INSERT INTO profile_roles (profile_id, role)
SELECT p.id, 'admin'::user_role
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'janetevolution@evolution.com'
ON CONFLICT (profile_id, role) DO NOTHING;

INSERT INTO profile_roles (profile_id, role)
SELECT p.id, 'admin'::user_role
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'angelloevolution@evolution.com'
ON CONFLICT (profile_id, role) DO NOTHING;