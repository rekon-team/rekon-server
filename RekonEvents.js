import express from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import 'dotenv/config';
import ky from 'ky';

const required_tables = ['events'];
const table_params = {'events': 'event_id VARCHAR(255) UNIQUE NOT NULL, event_status VARCHAR(255) NOT NULL, event_created_at VARCHAR(255) NOT NULL, event_updated_at VARCHAR(255) NOT NULL, event_groups VARCHAR(255) [] NOT NULL'};

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
    const gatewayResponse = await ky.put(`http://127.0.0.1:8234/events/status/heartbeat?secret=${process.env.SERVER_SECRET}`).json();
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

app.post('/createEvent', async (req, res) => {
    const userToken = req.body.userToken;
    const groupID = req.body.groupID;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: userToken}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User token is invalid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const isGroupAdmin = await ky.post(`http://127.0.0.1:8234/internal/auth/isGroupAdmin`, {json: {secret: process.env.SERVER_SECRET, groupID: groupID, userID: accountID}}).json();
    if (!isGroupAdmin.valid) {
        return res.json({'error': true, 'valid': false, 'message': 'User is not a group admin. Only group admins can create events.', 'code': 'user-not-admin'});
    }
    const eventID = crypto.randomUUID();
    const currentDate = new Date(Date.now());
    const isoDate = currentDate.toISOString();
    await db.addEntry('events', [eventID, 'pending', isoDate, isoDate, groupID]);
    return res.json({'error': false, 'valid': true, 'message': 'Event created successfully.', 'eventID': eventID});
});



app.listen(8239, () => {
    console.log(`Rekon events server running at port 8239`);
});