-- Usuario de prueba para el sistema Kardex Clínico
-- Primero créalo en Supabase Auth con el email y contraseña indicados en el README.
-- Luego ejecuta este script para asignarle el rol de administrador.

INSERT INTO profile_roles (profile_id, role)
SELECT p.id, 'admin'::user_role
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'demo@clinica.com'
ON CONFLICT (profile_id, role) DO NOTHING;