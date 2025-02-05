import express from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import 'dotenv/config';
import ky from 'ky';

const required_tables = ['groups'];
const table_params = {'groups': 'group_id VARCHAR(255) UNIQUE NOT NULL, group_name VARCHAR(255) UNIQUE NOT NULL, group_description VARCHAR(255) NOT NULL, group_owner VARCHAR(255) NOT NULL, group_members VARCHAR(255) [] NOT NULL, group_admins VARCHAR(255) [] NOT NULL, team_number VARCHAR(10) NOT NULL',
    'pending_invites': 'group_id VARCHAR(255) NOT NULL, user_id VARCHAR(255) NOT NULL, secret VARCHAR(255) NOT NULL, expires_at VARCHAR(255) NOT NULL'
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
    const gatewayResponse = await ky.put(`http://127.0.0.1:8234/groups/status/heartbeat?secret=${process.env.SERVER_SECRET}`).json();
}, 10000)

let db = new SimpleDB();
await db.init(process.env.DB_USER, process.env.DB_PASS, process.env.DB_NAME)

let verify = new VerificationGen();

for (const table of required_tables) {
    const table_exists = await db.checkIfTableExists(table);
    if (!table_exists) {
        await db.createTable(table, table_params[table]);
        console.warn(`Table "${table}" was missing. If this is the first boot, ignore this message.`);
    } else {
        console.log(`Table "${table}" initialized.`);
    }
}

app.post('/createGroup', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const groupName = req.body.group_name;
    const groupDescription = req.body.group_description;
    const teamNumber = req.body.team_number;
    const userToken = req.body.user_token;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const groupID = crypto.randomUUID();
    await db.addEntry('groups', [groupID, groupName, groupDescription, accountID, [accountID], [accountID], teamNumber]);
    await ky.post(`http://127.0.0.1:8234/internal/accounts/addGroup`, {json: {userToken: userToken, groupToken: groupID, secret: process.env.SERVER_SECRET}});
    return res.json({'error': false, 'message': 'Group successfully created.'});
});

app.get('/groupInfo', async (req, res) => {
    if (req.query.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const groupID = req.query.groupID;
    const groupExists = await db.checkIfValueExists('groups', '*', 'group_id', groupID);
    if (!groupExists) {
        return res.json({'error': true, 'message': 'The provided group ID does not exist.', 'code': 'group-not-found'});
    }
    const groupInfo = await db.selectRow('groups', '*', 'group_id', groupID);
    return res.json({'error': false, 'message': 'Group info fetched successfully!', 'groupInfo': groupInfo});
});

app.post('/createInvite', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const groupID = req.body.groupID;
    const userID = req.body.userID;
    const userToken = req.body.userToken;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const isGroupAdmin = await ky.post(`http://127.0.0.1:8234/auth/isGroupAdmin`, {json: {secret: process.env.SERVER_SECRET, groupID: groupID, userID: accountID}}).json();
    if (!isGroupAdmin.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User is not a group admin. Only group admins can create invites.', 'code': 'user-not-admin'});
    }
    const secret = verify.generateSecret();
    const currentDate = new Date(Date.now());
    const isoDate = currentDate.toISOString();
    await db.addEntry('pending_invites', [groupID, userID, secret, isoDate]);
    return res.json({'error': false, 'message': 'Invite created successfully!', 'secret': secret});
});

app.post('/acceptInvite', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const secret = req.body.secret;
    const inviteInfo = await db.selectRow('pending_invites', '*', 'secret', secret);
    if (!inviteInfo) {
        return res.json({'error': true, 'message': 'The provided invite secret does not exist.', 'code': 'invite-not-found'});
    }
    const groupInfo = await db.selectRow('groups', '*', 'group_id', inviteInfo.group_id);
    await db.updateEntry('groups', 'group_id', inviteInfo.group_id, 'group_members', [...groupInfo.group_members, inviteInfo.user_id]);
    await db.deleteEntry('pending_invites', 'secret', secret);
    return res.json({'error': false, 'message': 'Invite accepted successfully!', 'groupInfo': groupInfo});
});

app.listen(8236, () => {
    console.log(`Rekon group server running at port 8236`);
});