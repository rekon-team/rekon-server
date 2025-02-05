import ky from 'ky';
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import * as swaggerUI from 'swagger-ui-express';
import fs from 'fs';
import YAML from 'yaml';
import { Server } from 'socket.io';
import { createServer } from 'node:http';

const swaggerDocument = YAML.parse(fs.readFileSync('./swagger.yaml', 'utf8'));

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

app.use(cors());

app.use('/docs', swaggerUI.serve, swaggerUI.setup(swaggerDocument));

const server = createServer(app);
const io = new Server(server);

let LAST_HEARTBEATS = {'accounts': null, 'groups': null, 'storage': null, 'auth': null, 'events': null}

const START_TIME = performance.now();

if (process.env.DOCS_ENABLED) {

}

function formatDuration(ms) {
  // Convert milliseconds to hours, minutes, seconds
  let hours = Math.floor(ms / 3600000); // 1 hour = 3600000 ms
  let minutes = Math.floor((ms % 3600000) / 60000); // 1 minute = 60000 ms
  let seconds = Math.floor((ms % 60000) / 1000); // 1 second = 1000 ms
  let milliseconds = Math.floor(ms % 1000); // Remaining milliseconds

  // Format hours, minutes, seconds, and milliseconds
  return `${hours}h ${minutes}m ${seconds}s ${milliseconds}ms`;
}

// WebSockets forwarding
io.on('connection', (socket) => {
  console.log('socket connected');
});

// HTTP forwarding and delivery

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
    <html lang="en" >
    <head>
      <meta charset="UTF-8">
      <title>Rekon API Gateway</title>
      <style>body, html {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }</style>
    
    </head>
    <body>
    <!-- partial:index.partial.html -->
    <h1>404 - Page not found</h1>
    <p>Why are you trying to access this page anyway?</p>
    <!-- partial -->
      
    </body>
    </html>
    `)
})

app.post('/accounts/registerUserAccount', async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  console.log(email, password)
  const json = await ky.post('http://127.0.0.1:8235/registerUserAccount', {json: {email: email, password: password, secret: process.env.SERVER_SECRET}}).json();
  console.log(json)
  return res.json(json)
});

app.post('/accounts/verifyEmailCode', async (req, res) => {
  const id = req.body.id;
  const code = req.body.code;
  const verify = req.body.verify;
  const json = await ky.post('http://127.0.0.1:8235/verifyEmailCode', {json: {id: id, code: code, verify: verify, secret: process.env.SERVER_SECRET}}).json();
  console.log(json);
  return res.json(json);
});

app.get('/accounts/getAccountID' , async (req, res) => {
  const email = req.query.email;
  const json = await ky.get(`http://127.0.0.1:8235/getAccountID?email=${email}&secret=${process.env.SERVER_SECRET}`).json();
  return res.json(json);
});

app.post('/accounts/updateUsername', async (req, res) => {
  const user_token = req.body.userToken;
  const new_username = req.body.newUsername;
  const json = await ky.post('http://127.0.0.1:8235/updateUsername', {json: {userToken: user_token, newUsername: new_username, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.post('/accounts/updateTeamNumber', async (req, res) => {
  const user_token = req.body.userToken;
  const new_team_number = req.body.newTeamNumber;
  const json = await ky.post('http://127.0.0.1:8235/updateTeamNumber', {json: {userToken: user_token, newTeamNumber: new_team_number, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.post('/accounts/updateBio', async (req, res) => {
  const user_token = req.body.userToken;
  const new_bio = req.body.newBio;
  const json = await ky.post('http://127.0.0.1:8235/updateBio', {json: {userToken: user_token, newBio: new_bio, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.post('/accounts/loginUserAccount', async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  const json = await ky.post('http://127.0.0.1:8235/loginUserAccount', {json: {email: email, password: password, secret: process.env.SERVER_SECRET}}).json();
  console.log(json);
  return res.json(json);
});

app.post('/accounts/removeGroup', async (req, res) => {
  const user_token = req.body.userToken;
  const group_token = req.body.groupToken;
  const json = await ky.post('http://127.0.0.1:8235/removeGroup', {json: {userToken: user_token, groupToken: group_token, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.get('/accounts/getGroups', async (req, res) => {
  const user_token = req.query.userToken;
  const json = await ky.get(`http://127.0.0.1:8235/getGroups?userToken=${user_token}&secret=${process.env.SERVER_SECRET}`).json();
  return res.json(json);
});

app.get('/accounts/getAccountData', async (req, res) => {
  const account_id = req.query.account_id;
  const json = await ky.get(`http://127.0.0.1:8235/getAccountData?account_id=${account_id}&secret=${process.env.SERVER_SECRET}`).json();
  return res.json(json);
});

app.get('/accounts/getIDfromToken', async (req, res) => {
  const user_token = req.query.userToken;
  const json = await ky.get(`http://127.0.0.1:8235/getIDfromToken?userToken=${user_token}&secret=${process.env.SERVER_SECRET}`).json();
  return res.json(json);
});

app.post('/uploads/getUploadToken', async (req, res) => {
  const type = req.body.type;
  const token = req.body.token;
  const numChunks = req.body.numChunks;
  const fileType = req.body.fileType;
  const json = await ky.post('http://127.0.0.1:8237/getUploadToken', {json: {type: type, token: token, secret: process.env.SERVER_SECRET, numChunks: numChunks, fileType: fileType}}).json();
  return res.json(json);
});

app.post('/uploads/completeUpload', async (req, res) => {
  const userToken = req.body.userToken;
  const uploadToken = req.body.uploadToken;
  const numChunks = req.body.numChunks;
  const fileType = req.body.fileType;
  const json = await ky.post('http://127.0.0.1:8237/completeUpload', {json: {userToken: userToken, uploadToken: uploadToken, numChunks: numChunks, fileType: fileType, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.post('/uploads/uploadChunk', async (req, res) => {
  const userToken = req.body.userToken;
  const uploadToken = req.body.uploadToken;
  const chunk = req.body.chunk;
  const index = req.body.index;
  const json = await ky.post('http://127.0.0.1:8237/uploadChunk', {json: {userToken: userToken, uploadToken: uploadToken, chunk: chunk, index: index, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.get('/uploads/getUploadedFile', async (req, res) => {
  const userToken = req.query.userToken;
  const uploadToken = req.query.uploadToken;
  const json = await ky.get(`http://127.0.0.1:8237/getUploadedFile?userToken=${userToken}&uploadToken=${uploadToken}&secret=${process.env.SERVER_SECRET}`).json();
  
  // Map common file extensions to MIME types
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'pdf': 'application/pdf',
    'txt': 'text/plain'
  };

  // Get the file extension without the dot and convert to lowercase
  const fileExt = json.fileType.replace('.', '').toLowerCase();
  const mimeType = mimeTypes[fileExt] || 'application/octet-stream';
  
  console.log('File extension:', fileExt);
  console.log('MIME type:', mimeType);
  console.log('Content length:', json.file.length);
  
  res.set('Content-Type', mimeType);
  // Also set Content-Length header
  res.set('Content-Length', json.file.length);
  // Add Content-Disposition header to suggest filename
  res.set('Content-Disposition', `inline; filename="file.${fileExt}"`);
  
  return res.send(Buffer.from(json.file));
});

app.get('/uploads/getProfilePicture', async (req, res) => {
  const accountID = req.query.accountID;
  const image = await ky.get(`http://127.0.0.1:8237/getProfilePicture?accountID=${accountID}&secret=${process.env.SERVER_SECRET}`).arrayBuffer();
  res.set('Content-Type', 'image/jpeg');
  return res.send(Buffer.from(image));
});

app.get('/uploads/getUserFiles', async (req, res) => {
  const userToken = req.query.userToken;
  console.log('getting files for user', userToken);
  const json = await ky.get(`http://127.0.0.1:8237/getUserFiles?userToken=${userToken}&secret=${process.env.SERVER_SECRET}`).json();
  return res.json(json);
});

app.post('/uploads/deleteFile', async (req, res) => {
  const userToken = req.body.userToken;
  const uploadToken = req.body.uploadToken;
  const json = await ky.post('http://127.0.0.1:8237/deleteFile', {json: {userToken: userToken, uploadToken: uploadToken, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.post('/groups/createGroup', async (req, res) => {
  const groupName = req.body.group_name;
  const groupDescription = req.body.group_description;
  const teamNumber = req.body.team_number;
  const userToken = req.body.user_token;
  const json = await ky.post('http://127.0.0.1:8236/createGroup', {json: {group_name: groupName, group_description: groupDescription, team_number: teamNumber, user_token: userToken, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

app.get('/groups/groupInfo', async (req, res) => {
  const groupID = req.query.groupID;
  const json = await ky.get(`http://127.0.0.1:8236/groupInfo?groupID=${groupID}&secret=${process.env.SERVER_SECRET}`).json();
  return res.json(json);
});

// public status endpoints

app.get('/gateway/status', async (req, res) => {
  return res.json({'status': 'healthy', 'description': `The Rekon API Gateway has been online for ${formatDuration(performance.now() - START_TIME)}`})
})

app.get('/accounts/status', async (req, res) => {
  const currentTime = performance.now();
  if (LAST_HEARTBEATS.accounts == null) {
    res.json({'status': 'unknown', 'description': 'No heartbeat has been recieved by the account server.'});
  } else if (currentTime - LAST_HEARTBEATS.accounts > 15000 && currentTime - LAST_HEARTBEATS.accounts < 45000) {
    res.json({'status': 'healthy', 'description': `The account server hasn't responded in ${currentTime - LAST_HEARTBEATS.accounts}ms, server is likely under heavy load.`});
  } else if (currentTime - LAST_HEARTBEATS.accounts > 45000) {
    res.json({'status': 'offline', 'description': `The account server has not responded in ${currentTime - LAST_HEARTBEATS.accounts}ms. The service is likely offline.`});
  } else if (currentTime - LAST_HEARTBEATS.accounts < 15000) {
    res.json({'status': 'healthy', 'description': 'The account server is working as expected!'});
  } else {
    res.json({'status': 'error', 'description': 'There was an unexpected issue when reading the status of the account server.'});
  }
})

app.get('/groups/status', async (req, res) => {
  const currentTime = performance.now();
  if (LAST_HEARTBEATS.accounts == null) {
    res.json({'status': 'unknown', 'description': 'No heartbeat has been recieved by the group management server.'});
  } else if (currentTime - LAST_HEARTBEATS.accounts > 15000 && currentTime - LAST_HEARTBEATS.accounts < 45000) {
    res.json({'status': 'healthy', 'description': `The group management server hasn't responded in ${currentTime - LAST_HEARTBEATS.accounts}ms, server is likely under heavy load.`});
  } else if (currentTime - LAST_HEARTBEATS.accounts > 45000) {
    res.json({'status': 'offline', 'description': `The group management server has not responded in ${currentTime - LAST_HEARTBEATS.accounts}ms. The service is likely offline.`});
  } else if (currentTime - LAST_HEARTBEATS.accounts < 15000) {
    res.json({'status': 'healthy', 'description': 'The group management server is working as expected!'});
  } else {
    res.json({'status': 'error', 'description': 'There was an unexpected issue when reading the status of the group management server.'});
  }
})

// internal heartbeat endpoints, secured with a common secret.

app.put('/accounts/status/heartbeat', async (req, res) => {
  if (req.query.secret == process.env.SERVER_SECRET) {
    LAST_HEARTBEATS.accounts = performance.now();
    res.json({'response': 'Hello account server!!'})
  } else {
    res.json({'response': "You're not the account server >:("})
  }
});

app.put('/groups/status/heartbeat', async (req, res) => {
  if (req.query.secret == process.env.SERVER_SECRET) {
    LAST_HEARTBEATS.groups = performance.now();
    res.json({'response': 'Hello group server!!'})
  } else {
    res.json({'response': "You're not the group server >:("})
  }
});

app.put('/storage/status/heartbeat', async (req, res) => {
  if (req.query.secret == process.env.SERVER_SECRET) {
    LAST_HEARTBEATS.storage = performance.now();
    res.json({'response': 'Hello storage server!!'})
  } else {
    res.json({'response': "You're not the storage server >:("})
  }
});

app.put('/auth/status/heartbeat', async (req, res) => {
  if (req.query.secret == process.env.SERVER_SECRET) {
    LAST_HEARTBEATS.auth = performance.now();
    res.json({'response': 'Hello auth server!!'})
  } else {
    res.json({'response': "You're not the auth server >:("})
  }
});

app.put('/events/status/heartbeat', async (req, res) => {
  if (req.query.secret == process.env.SERVER_SECRET) {
    LAST_HEARTBEATS.events = performance.now();
    res.json({'response': 'Hello events server!!'})
  } else {
    res.json({'response': "You're not the events server >:("})
  }
});

// internal api endpoints, only meant for communication between internal microservices
app.post('/internal/auth/verifyToken', async (req, res) => {
  if (req.body.secret != process.env.SERVER_SECRET) {
    return res.json({'error': true, 'message': 'This is an internal endpoint. Client applications do not have permission to access this endpoint.', code: 'gateway-internal-endpoint'})
  }
  const tokenInfo = await ky.post(`http://127.0.0.1:8238/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: req.body.token}}).json();
  return res.json(tokenInfo);
});

app.post('/internal/accounts/addGroup', async (req, res) => {
  if (req.body.secret != process.env.SERVER_SECRET) {
    return res.json({'error': true, 'message': 'This is an internal endpoint. Client applications do not have permission to access this endpoint.', code: 'gateway-internal-endpoint'})
  }
  const user_token = req.body.userToken;
  const group_token = req.body.groupToken;
  const json = await ky.post('http://127.0.0.1:8235/addGroup', {json: {userToken: user_token, groupToken: group_token, secret: process.env.SERVER_SECRET}}).json();
  return res.json(json);
});

server.listen(8234, () => {
    console.log(`Rekon gateway running at port 8234`);
});