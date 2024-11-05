import express from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import 'dotenv/config';
import ky from 'ky';

const required_tables = [];
const table_params = {};

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
    const gatewayResponse = await ky.put(`http://127.0.0.1:8234/auth/status/heartbeat?secret=${process.env.SERVER_SECRET}`).json();
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

app.post('/verifyToken', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const userToken = req.body.token;
    const doesTokenExist = await db.checkIfValueExists('access_tokens', '*', 'user_token', userToken);
    if (!doesTokenExist) {
        return res.json({'error': true, 'message': 'User token does not exist.', 'code': 'token-invalid'});
    }
    const tokenInfo = await db.selectRow('access_tokens', '*', 'user_token', userToken);
    return res.json({'error': false, 'valid': true, 'info': tokenInfo});
});

app.listen(8238, () => {
    console.log(`Rekon auth server running at port 8238`);
});