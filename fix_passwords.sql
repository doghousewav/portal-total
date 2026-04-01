-- ACTUALIZAR CONTRASEÑAS CON HASH REAL (bcrypt)
-- La contraseña será: total2024

UPDATE profiles 
SET password_hash = '$2b$10$hmKfP782UE5ZmOW4746gJeLooKeHuuOQd8DGzmjZDsE7oHK8HrUkm'
WHERE email IN ('alonso.rodriguez@tuempresa.com', 'gerencia.riesgos@tuempresa.com');

-- VERIFICAR QUE EXISTAN LAS COLUMNAS NECESARIAS
-- Si alguna falla, ejecuta el mysql_setup.sql completo que te envié antes.
SELECT id, name, email, role FROM profiles;
