import express from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import 'dotenv/config';
import ky from 'ky';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';

const required_tables = ['upload_tokens'];
const table_params = {
    'upload_tokens': 'upload_token VARCHAR(255) PRIMARY KEY, user_token VARCHAR(255), account_id VARCHAR(255), num_chunks INT, file_type VARCHAR(255)'
};

let app = express();
app.use(express.json({limit: '1mb'}));
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
    const numChunks = req.body.numChunks;
    const fileType = req.body.fileType;
    console.log(req.body);
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
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
    if (await db.checkIfValueExists('upload_tokens', '*', 'upload_token', uploadToken)) {
        return res.json({'error': false, 'message': 'Upload token granted!', 'token': uploadToken});
    }
    await db.addEntry('upload_tokens', [uploadToken, userToken, tokenInfo.info.account_id, numChunks, fileType]);
    return res.json({'error': false, 'message': 'Upload token granted!', 'token': uploadToken});
});

app.post('/uploadChunk', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const userToken = req.body.userToken;
    const uploadToken = req.body.uploadToken;
    const fileChunk = req.body.chunk;
    const index = req.body.index;

    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const tokenDB = await db.selectRow('upload_tokens', '*', 'upload_token', uploadToken);
    if (!tokenDB) {
        return res.json({'error': true, 'valid': false, 'message': 'Upload token is invalid.', 'code': 'token-invalid'});
    }
    if (tokenDB.user_token != userToken) {
        return res.json({'error': true, 'valid': false, 'message': 'User token does not match upload token.', 'code': 'token-mismatch'});
    }
    const fileChunkPath = path.join(process.env.STORAGE_PATH, tokenDB.account_id, tokenDB.upload_token, `${index}.chunk`);
    await fs.mkdir(path.dirname(fileChunkPath), { recursive: true });
    await fs.writeFile(fileChunkPath, fileChunk);
    return res.json({'error': false, 'valid': true, 'message': 'Chunk uploaded successfully.'});
});

app.post('/completeUpload', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const userToken = req.body.userToken;
    const uploadToken = req.body.uploadToken;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const tokenDB = await db.selectRow('upload_tokens', '*', 'upload_token', uploadToken);
    if (!tokenDB) {
        return res.json({'error': true, 'valid': false, 'message': 'Upload token is invalid.', 'code': 'token-invalid'});
    }
    const fileChunkPath = path.join(process.env.STORAGE_PATH, tokenDB.account_id, tokenDB.upload_token);
    // merge chunks
    const fileType = tokenDB.file_type;
    const files = await fs.readdir(fileChunkPath);
    const chunkFiles = files.filter(f => f.endsWith('.chunk'));
    
    if (chunkFiles.length !== tokenDB.num_chunks) {
        // Delete all chunks if count doesn't match
        console.log("Number of chunks: ", tokenDB.num_chunks);
        console.log("Number of chunks uploaded: ", chunkFiles.length);
        console.log("Chunk files: ", chunkFiles);
        for (const chunk of chunkFiles) {
            await fs.unlink(path.join(fileChunkPath, chunk));
        }
        return res.json({
            'error': true, 
            'message': 'Number of uploaded chunks does not match expected count', 
            'code': 'chunk-count-mismatch'
        });
    }

    // Delete existing file if it exists
    const existingFile = path.join(fileChunkPath, `file${fileType}`);
    try {
        await fs.access(existingFile);
        // File exists, delete it
        await fs.unlink(existingFile);
    } catch {
        // File doesn't exist, continue
    }

    const finalFilePath = path.join(fileChunkPath, `file${fileType}`);
    for (const chunk of chunkFiles) {
        const base64Data = await fs.readFile(path.join(fileChunkPath, chunk), 'utf8');
        const binaryData = Buffer.from(base64Data, 'base64');
        await fs.appendFile(finalFilePath, binaryData);
        await fs.unlink(path.join(fileChunkPath, chunk));
    }

    await db.removeRow('upload_tokens', 'upload_token', uploadToken);

    return res.json({'error': false, 'valid': true, 'message': 'Upload completed successfully.'});
});

app.get('/getUploadedFile', async (req, res) => {
    const { userToken } = req.body.userToken;
    const { uploadToken } = req.body.uploadToken;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const fileChunkPath = path.join(process.env.STORAGE_PATH, tokenInfo.account_id, uploadToken);
    const file = await fs.readFile(fileChunkPath);
    return res.json({'error': false, 'valid': true, 'message': 'File retrieved successfully.', 'file': file});
});

app.listen(8237, () => {
    console.log(`Rekon storage server running at port 8237`);
});