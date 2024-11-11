import express from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import 'dotenv/config';
import ky from 'ky';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';

const required_tables = ['upload_tokens'];
const table_params = {
    'upload_tokens': 'upload_token VARCHAR(255) PRIMARY KEY, user_token VARCHAR(255), account_id VARCHAR(255)'
};

let app = express();
app.use(express.json());
app.use(
    express.urlencoded({
      extended: true,
    })
);

app.use((err, req, res, next) => {
    // Handle the error here
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

setInterval(async () => {
    const gatewayResponse = await ky.put(`http://127.0.0.1:8234/storage/status/heartbeat?secret=${process.env.SERVER_SECRET}`).json();
}, 10000)

let db = new SimpleDB();
await db.init(process.env.DB_USER, process.env.DB_PASS, process.env.DB_NAME)

for (const table of required_tables) {
    const table_exists = await db.checkIfTableExists(table);
    if (!table_exists) {
        await db.createTable(table, table_params[table]);
        console.warn(`Table "${table}" was missing. If this is the first boot, ignore this message.`);
    } else {
        console.log(`Table "${table}" initialized.`);
    }
}

app.post('/getUploadToken', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const uploadLocation = req.body.type;
    const userToken = req.body.token;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    let uploadToken;
    if (uploadLocation == 'profile') {
        uploadToken = `${tokenInfo.info.account_id}-profile`;
    } else if (uploadLocation == 'userblock') {
        uploadToken = `${tokenInfo.info.account_id}-${crypto.randomUUID()}-userblock`;
    } else if (uploadLocation == 'groupblock') {
        uploadToken = `unfinished-feature`;
    } else {
        return res.json({'error': true, 'message': 'Upload location invalid', 'code': 'store-location-invalid'});
    }
    await db.addEntry('upload_tokens', [uploadToken, userToken, tokenInfo.info.account_id]);
    return res.json({'error': false, 'message': 'Upload token granted!', 'token': uploadToken});
});

app.post('/upload/:uploadToken', async (req, res) => {
    const { uploadToken } = req.params;
    
    // Verify the upload token exists in database
    const tokenExists = await db.query('SELECT * FROM upload_tokens WHERE upload_token = ?', [uploadToken]);
    if (!tokenExists.length) {
        return res.status(401).json({ error: true, message: 'Invalid upload token' });
    }

    // Get total size from headers for progress tracking
    const totalSize = parseInt(req.headers['content-length']);
    let bytesReceived = 0;

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Create write stream
    const filePath = path.join(uploadsDir, uploadToken);
    const writeStream = createWriteStream(filePath);

    // Handle incoming data chunks
    req.on('data', (chunk) => {
        bytesReceived += chunk.length;
        // You could emit progress through WebSocket here if needed
        // For now, progress will be estimated on the client side based on bytes sent
        const progress = (bytesReceived / totalSize) * 100;
    });

    // Pipe the request to the file
    // TODO: Check if this will work with cloud-based storage solutions like Backblaze B2
    req.pipe(writeStream);

    // Handle completion
    writeStream.on('finish', () => {
        res.json({ 
            error: false, 
            message: 'Upload completed successfully',
            filePath: filePath
        });
    });

    // Handle errors
    writeStream.on('error', (error) => {
        console.error('Write stream error:', error);
        res.status(500).json({ error: true, message: 'Upload failed' });
    });

    req.on('error', (error) => {
        console.error('Upload error:', error);
        res.status(500).json({ error: true, message: 'Upload failed' });
    });
});

app.listen(8237, () => {
    console.log(`Rekon storage server running at port 8237`);
});