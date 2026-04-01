async function testUpload() {
    try {
        console.log("Probando subida a S3...");
        const response = await fetch('http://localhost:3001/api/upload-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: 'test_debug.txt',
                fileData: Buffer.from('Hola S3').toString('base64'),
                mimeType: 'text/plain'
            })
        });
        const data = await response.json();
        console.log("Respuesta del servidor:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error en la subida:", error.message);
    }
}

testUpload();
