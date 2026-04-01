
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dowgtkscgnbhiwwqxyeb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvd2d0a3NjZ25iaGl3d3F4eWViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYxNjIzMSwiZXhwIjoyMDg3MTkyMjMxfQ.OA09_mp8WJnt9ZCg3cEjJj22RqdIH0sZfgjP1M4AJas';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupStorage() {
    const buckets = ['perfil_firmas', 'informes_multimedia'];

    for (const bucketName of buckets) {
        console.log(`Intentando crear bucket: ${bucketName}...`);
        const { data, error } = await supabase.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
        });

        if (error) {
            if (error.message.includes('already exists')) {
                console.log(`El bucket ${bucketName} ya existe.`);
            } else {
                console.log(`Error creando ${bucketName}:`, error.message);
            }
        } else {
            console.log(`Bucket ${bucketName} creado exitosamente.`);
        }
    }
}

setupStorage();
