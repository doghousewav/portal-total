
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dowgtkscgnbhiwwqxyeb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvd2d0a3NjZ25iaGl3d3F4eWViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYxNjIzMSwiZXhwIjoyMDg3MTkyMjMxfQ.OA09_mp8WJnt9ZCg3cEjJj22RqdIH0sZfgjP1M4AJas';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConnection() {
    try {
        // Intentar listar perfiles (que suele ser una tabla comun)
        const { data, error } = await supabase.from('profiles').select('*').limit(1);

        if (error) {
            console.log('Error al conectar o tabla no existe:', error.message);
        } else {
            console.log('Conexión exitosa. Datos encontrados en profiles:', data);
        }

        // Intentar crear un bucket de prueba para ver si el Service Key funciona para Storage
        const { data: bucketData, error: bucketError } = await supabase.storage.listBuckets();
        if (bucketError) {
            console.log('Error en Storage:', bucketError.message);
        } else {
            console.log('Buckets encontrados:', bucketData.map(b => b.name));
        }

    } catch (err) {
        console.error('Error fatal:', err);
    }
}

checkConnection();
