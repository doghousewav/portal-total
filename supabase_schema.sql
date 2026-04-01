  -- 0. Perfiles de usuario (Extensión de auth.users)
  DROP TABLE IF EXISTS public.visita_fotografias CASCADE;
  CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    name TEXT,
    role TEXT DEFAULT 'comercial' CHECK (role IN ('comercial', 'gerencia')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );

  -- LIMPIEZA DE POLÍTICAS PREVIAS (Para evitar conflictos)
  DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON public.profiles;
  DROP POLICY IF EXISTS "Gerencia puede ver todos los perfiles" ON public.profiles;
  DROP POLICY IF EXISTS "Gerencia puede ver todos los perfiles (Usando la función para evitar recursión)" ON public.profiles;
  DROP POLICY IF EXISTS "Select Profiles Policy" ON public.profiles;
  DROP POLICY IF EXISTS "Comerciales pueden ver sus propios informes" ON public.informe_visita;
  DROP POLICY IF EXISTS "Comerciales pueden insertar sus propios informes" ON public.informe_visita;
  DROP POLICY IF EXISTS "Comerciales pueden actualizar sus propios informes" ON public.informe_visita;
  DROP POLICY IF EXISTS "Gerencia puede ver todos los informes" ON public.informe_visita;
  DROP POLICY IF EXISTS "Acceso total dueño" ON public.informe_visita;

  -- FUNCIÓN DEFINITIVA PARA EVITAR RECURSIÓN
  -- SECURITY DEFINER hace que la función ignore RLS al ejecutarse
  CREATE OR REPLACE FUNCTION public.check_is_gerencia()
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'gerencia'
    );
  END;
  $$;

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  -- Política Única: Usuarios ven su perfil O gerencia ve todo (Usa cortocircuito para evitar recursión)
  CREATE POLICY "Select Profiles Policy" 
  ON public.profiles FOR SELECT 
  USING (
    auth.uid() = id 
    OR 
    public.check_is_gerencia()
  );

  -- 1. Crear la tabla principal si no existe
  CREATE TABLE IF NOT EXISTS public.informe_visita (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    comercial_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );

  -- 2. Asegurarnos de que todas las columnas necesarias existan
  ALTER TABLE public.informe_visita 
    ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Borrador' CHECK (estado IN ('Borrador', 'Completo')),
    ADD COLUMN IF NOT EXISTS ruc TEXT,
    ADD COLUMN IF NOT EXISTS razon_social TEXT,
    ADD COLUMN IF NOT EXISTS fecha_visita DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS lugar_visita TEXT,
    ADD COLUMN IF NOT EXISTS departamento TEXT,
    ADD COLUMN IF NOT EXISTS provincia TEXT,
    ADD COLUMN IF NOT EXISTS distrito TEXT,
    ADD COLUMN IF NOT EXISTS referencia_direccion TEXT,
    ADD COLUMN IF NOT EXISTS google_maps_url TEXT,
    ADD COLUMN IF NOT EXISTS tipo_visita TEXT,
    ADD COLUMN IF NOT EXISTS lugar_visita_cat TEXT,
    ADD COLUMN IF NOT EXISTS local_visita TEXT,
    ADD COLUMN IF NOT EXISTS validacion_negativa BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS servicios_adicionales BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS historia TEXT,
    ADD COLUMN IF NOT EXISTS ciclo_negocio TEXT,
    ADD COLUMN IF NOT EXISTS activos_empresa TEXT,
    
    -- PARTICIPANTES (Aplanados para AWS)
    ADD COLUMN IF NOT EXISTS entrevistado1_nombres TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado1_apellidos TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado1_cargo TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado1_contacto TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado2_nombres TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado2_apellidos TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado2_cargo TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado2_contacto TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado3_nombres TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado3_apellidos TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado3_cargo TEXT,
    ADD COLUMN IF NOT EXISTS entrevistado3_contacto TEXT,
    
    ADD COLUMN IF NOT EXISTS ejecutivo1_nombre TEXT,
    ADD COLUMN IF NOT EXISTS ejecutivo1_cargo TEXT,
    ADD COLUMN IF NOT EXISTS ejecutivo2_nombre TEXT,
    ADD COLUMN IF NOT EXISTS ejecutivo2_cargo TEXT,
    ADD COLUMN IF NOT EXISTS ejecutivo3_nombre TEXT,
    ADD COLUMN IF NOT EXISTS ejecutivo3_cargo TEXT,
    
    ADD COLUMN IF NOT EXISTS funcionario_nombre TEXT,
    ADD COLUMN IF NOT EXISTS valido_hasta DATE,
    ADD COLUMN IF NOT EXISTS firma_url TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

  -- 3. Agregar columna para fotos directamente en la tabla principal (Evita tablas extra)
  ALTER TABLE public.informe_visita 
    ADD COLUMN IF NOT EXISTS fotografias JSONB DEFAULT '[]'::jsonb;

  -- 4. Habilitar RLS y agregar políticas de seguridad
  ALTER TABLE public.informe_visita ENABLE ROW LEVEL SECURITY;

  -- Políticas para informe_visita (Dueño o Gerencia)
  DROP POLICY IF EXISTS "Acceso total dueño" ON public.informe_visita;
  CREATE POLICY "Acceso total dueño" 
  ON public.informe_visita FOR ALL
  USING (auth.uid() = comercial_id OR public.check_is_gerencia());

  -- 6. MIGRACIÓN DE DATOS (Opcional: Si ya tenías datos en la tabla 'informes')
  -- Este bloque mueve los datos de la tabla vieja 'informes' a 'informe_visita'
  DO $$ 
  BEGIN
      -- Solo si la tabla informes existe
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'informes' AND table_schema = 'public') THEN
          INSERT INTO public.informe_visita (
              id, comercial_id, created_at, estado, ruc, razon_social, 
              fecha_visita, lugar_visita, departamento, provincia, distrito, 
              referencia_direccion, google_maps_url, tipo_visita, lugar_visita_cat, 
              local_visita, validacion_negativa, servicios_adicionales, historia, 
              ciclo_negocio, activos_empresa, funcionario_nombre, valido_hasta
          )
          SELECT 
              id, 
              comercial_id, 
              created_at, 
              estado, 
              COALESCE(ruc, (detalles->'visita'->>'ruc')),
              COALESCE(razon_social, (detalles->'visita'->>'razon_social')),
              COALESCE(fecha_visita, (detalles->'visita'->>'fecha_visita')::DATE),
              (detalles->'visita'->>'lugar_visita'),
              (detalles->'visita'->>'departamento'),
              (detalles->'visita'->>'provincia'),
              (detalles->'visita'->>'distrito'),
              (detalles->'visita'->>'referencia_direccion'),
              (detalles->'visita'->>'google_maps'),
              (detalles->'visita'->>'tipo_visita'),
              (detalles->'visita'->>'lugar_visita_cat'),
              (detalles->'visita'->>'local_visita'),
              (detalles->'visita'->>'validacion_negativa' = 'si'),
              (detalles->'visita'->>'servicios_adicionales' = 'si'),
              (detalles->'visita'->>'historia'),
              (detalles->'visita'->>'ciclo_negocio'),
              (detalles->'visita'->>'activos'),
              (detalles->'visita'->>'funcionario_nombre'),
              (detalles->'visita'->>'valido_hasta')::DATE
          FROM public.informes
          ON CONFLICT (id) DO NOTHING;
          
          -- Migrar participantes si es posible (solo el primero para simplificar migración)
          UPDATE public.informe_visita iv
          SET 
              entrevistado1_nombres = (i.detalles->'visita'->'entrevistados'->0->>'nombres'),
              entrevistado1_apellidos = (i.detalles->'visita'->'entrevistados'->0->>'apellidos'),
              entrevistado1_cargo = (i.detalles->'visita'->'entrevistados'->0->>'cargo'),
              entrevistado1_contacto = (i.detalles->'visita'->'entrevistados'->0->>'contacto'),
              ejecutivo1_nombre = (i.detalles->'visita'->'ejecutivos'->0->>'nombre'),
              ejecutivo1_cargo = (i.detalles->'visita'->'ejecutivos'->0->>'cargo')
          FROM public.informes i
          WHERE iv.id = i.id AND iv.entrevistado1_nombres IS NULL;
          
      END IF;
  END $$;

  -- 7. CONFIGURACIÓN DE STORAGE (BUCKETS)
  -- Crear el bucket para fotos de visitas si no existe
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('visita-fotos', 'visita-fotos', true)
  ON CONFLICT (id) DO NOTHING;

  -- Políticas de Storage (Muy permisivas para evitar errores)
  DROP POLICY IF EXISTS "Acceso Total Storage" ON storage.objects;
  CREATE POLICY "Acceso Total Storage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'visita-fotos');

  DROP POLICY IF EXISTS "Lectura Pública Storage" ON storage.objects;
  CREATE POLICY "Lectura Pública Storage"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'visita-fotos');
