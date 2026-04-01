xINSERT INTO auth_users (id, email, password_hash) VALUES 
('uuid-comercial-1', 'alonso.rodriguez@tuempresa.com', '$2b$10$hmKfP782UE5ZmOW4746gJeLooKeHuuOQd8DGzmjZDsE7oHK8HrUkm'),
('uuid-gerencia-1', 'gerencia.riesgos@tuempresa.com', '$2b$10$hmKfP782UE5ZmOW4746gJeLooKeHuuOQd8DGzmjZDsE7oHK8HrUkm')
ON DUPLICATE KEY UPDATE email=email;

INSERT INTO profiles (id, name, role) VALUES 
('uuid-comercial-1', 'Alonso Rodriguez', 'comercial'),
('uuid-gerencia-1', 'Gerencia Riesgos', 'gerencia')
ON DUPLICATE KEY UPDATE id=id;

-- 5. Índices de Rendimiento
CREATE INDEX idx_comercial ON informe_visita(comercial_id);
CREATE INDEX idx_estado ON informe_visita(estado);
