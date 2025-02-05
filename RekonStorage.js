import express from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import 'dotenv/config';
import ky from 'ky';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import * as ThumbHash from 'thumbhash';
import sharp from 'sharp';

const required_tables = ['upload_tokens'];
const table_params = {
    'upload_tokens': 'upload_token VARCHAR(255) PRIMARY KEY, user_token VARCHAR(255), account_id VARCHAR(255), num_chunks INT, file_type VARCHAR(255), thumb_hash VARCHAR(255), upload_complete BOOLEAN'
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
        uploadToken = `${crypto.randomUUID()}-userblock`;
    } else if (uploadLocation == 'groupblock') {
        uploadToken = `${crypto.randomUUID()}-groupblock`;
    } else {
        return res.json({'error': true, 'message': 'Upload location invalid', 'code': 'store-location-invalid'});
    }
    if (await db.checkIfValueExists('upload_tokens', '*', 'upload_token', uploadToken)) {
        await db.removeRow('upload_tokens', 'upload_token', uploadToken);
    }
    await db.addEntry('upload_tokens', [uploadToken, userToken, tokenInfo.info.account_id, numChunks, fileType, null, false]);
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
    const writeStream = createWriteStream(finalFilePath);
    
    // Sort chunks numerically to ensure correct order
    const sortedChunks = chunkFiles.sort((a, b) => {
        return parseInt(a.split('.')[0]) - parseInt(b.split('.')[0]);
    });

    for (const chunk of sortedChunks) {
        const base64Data = await fs.readFile(path.join(fileChunkPath, chunk), 'utf8');
        const binaryData = Buffer.from(base64Data, 'base64');
        writeStream.write(binaryData);
        await fs.unlink(path.join(fileChunkPath, chunk));
    }
    
    await new Promise((resolve) => writeStream.end(resolve));

    let base64ThumbHash;
    try {
        const image = sharp(finalFilePath).resize(100, 100, { fit: 'inside' })
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        const binaryThumbHash = ThumbHash.rgbaToThumbHash(info.width, info.height, data)
        // Convert the binary ThumbHash to base64 string for storage
        base64ThumbHash = Buffer.from(binaryThumbHash).toString('base64')
    } catch (err) {
        console.error('Error generating thumbnail hash:', err);
        base64ThumbHash = null;
    }

    await db.updateEntry('upload_tokens', 'upload_token', uploadToken, 'upload_complete', true);
    await db.updateEntry('upload_tokens', 'upload_token', uploadToken, 'thumb_hash', base64ThumbHash);

    return res.json({'error': false, 'valid': true, 'message': 'Upload completed successfully.'});
});

app.get('/getUploadedFile', async (req, res) => {
    const secret = req.query.secret;
    if (secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const userToken = req.query.userToken;
    const uploadToken = req.query.uploadToken;
    console.log(req.query);
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    console.log(tokenInfo);
    const fileChunkPath = path.join(process.env.STORAGE_PATH, tokenInfo.info.account_id, uploadToken);
    try {
        const files = await fs.readdir(fileChunkPath);
        if (files.length === 0) {
            return res.json({'error': true, 'message': 'File not found.', 'code': 'file-not-found'});
        }
        const file = await fs.readFile(path.join(fileChunkPath, files[0]));
        return res.json({'error': false, 'valid': true, 'message': 'File retrieved successfully.', 'file': file, 'fileType': files[0].split('.')[1]});
    } catch (err) {
        return res.json({'error': true, 'message': 'File not found.', 'code': 'file-not-found'});
    }
});

app.get('/getUserFiles', async (req, res) => {
    const userToken = req.query.userToken;
    const secret = req.query.secret;
    if (secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const files = await db.selectRows('upload_tokens', '*', 'account_id', accountID);
    return res.json({'error': false, 'valid': true, 'message': 'Files retrieved successfully.', 'files': files});
})

app.post('/deleteFile', async (req, res) => {
    const userToken = req.body.userToken;
    const uploadToken = req.body.uploadToken;
    const secret = req.body.secret;
    if (secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const fileChunkPath = path.join(process.env.STORAGE_PATH, accountID, uploadToken);
    try {
        await fs.rm(fileChunkPath, { recursive: true, force: true });
        await db.removeRow('upload_tokens', 'upload_token', uploadToken);
        return res.json({'error': false, 'valid': true, 'message': 'File deleted successfully.'});
    } catch (err) {
        console.error('Error deleting file:', err);
        return res.json({'error': true, 'message': 'Error deleting file', 'code': 'file-delete-error'});
    }
})

app.get('/getProfilePicture', async (req, res) => {
    const accountID = req.query.accountID;
    const secret = req.query.secret;
    if (secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const profilePicturePath = path.join(process.env.STORAGE_PATH, accountID, accountID + '-profile');
    try {
        const files = await fs.readdir(profilePicturePath);
        if (files.length === 0) {
            return res.send(null);
        }
        const profilePicture = await fs.readFile(path.join(profilePicturePath, files[0]));
        return res.send(profilePicture);
    } catch (err) {
        return res.send(null);
    }
})

app.listen(8237, () => {
    console.log(`Rekon storage server running at port 8237`);
});