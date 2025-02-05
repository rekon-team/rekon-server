import express, { application } from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import bcrypt from 'bcrypt';
import { SimpleEmail } from './modules/RSimpleEmail.js'
import { VerificationGen } from './modules/RVerification.js'
import 'dotenv/config';
import ky from 'ky';

const required_tables = ['accounts', 'email_codes', 'access_tokens'];
const table_params = {'accounts': 'account_id VARCHAR(255) UNIQUE NOT NULL, email VARCHAR(100) UNIQUE NOT NULL, username VARCHAR(60) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, date_created VARCHAR(255) NOT NULL, last_login_date VARCHAR(255) NOT NULL, verified BOOLEAN NOT NULL, two_factor_approved BOOLEAN NOT NULL, bio VARCHAR(250) NOT NULL, team_number VARCHAR(10) NOT NULL, groups VARCHAR(255) [] NOT NULL',
'email_codes': 'account_id VARCHAR(255) UNIQUE NOT NULL, email_code VARCHAR(6) NOT NULL, send_time VARCHAR(255) NOT NULL',
'access_tokens': 'user_token VARCHAR(255) UNIQUE NOT NULL, account_id VARCHAR(255) UNIQUE NOT NULL, last_used VARCHAR(255) NOT NULL'};

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
    const gatewayResponse = await ky.put(`http://127.0.0.1:8234/accounts/status/heartbeat?secret=${process.env.SERVER_SECRET}`).json();
}, 10000)

let db = new SimpleDB();
await db.init(process.env.DB_USER, process.env.DB_PASS, process.env.DB_NAME)

let mailer = new SimpleEmail();
await mailer.init(process.env.EMAIL, process.env.EMAIL_PASS);

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

app.get('/getAccountID', async (req, res) => {
    if (req.query.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const email = req.query.email;
    const doesEmailExist = await db.checkIfValueExists('accounts', '*', 'email', email);
    if (!doesEmailExist) {
        return res.json({'error': true, 'message': 'The provided email is not registered with an account!', 'code': 'email-not-registered'});
    }
    const userData = db.selectRow('accounts', '*', 'email', email);
    return res.json({'error': false, 'account_id': userData.account_id});
});

app.get('/getAccountData', async (req, res) => {
    if (req.query.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const account_id = req.query.account_id;
    const userData = await db.selectRow('accounts', '*', 'account_id', account_id);
    return res.json({'error': false, 'accountData': userData});
});

app.post('/updateUsername', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const user_token = req.body.userToken;
    const new_username = req.body.newUsername;
    if (new_username.length > 60) {
        return res.json({'error': true, 'message': 'Username too long'});
    }
    
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: user_token}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'message': 'The provided user token is no longer valid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const doesAccountExist = await db.checkIfValueExists('accounts', '*', 'account_id', accountID);
    if (!doesAccountExist) {
        return res.json({'error': true, 'message': 'The provided account ID does not exist'});
    }

    await db.updateEntry('accounts', 'account_id', tokenInfo.info.account_id, 'username', new_username);
    return res.json({'error': false, 'message': 'Username updated successfully!'})
});

app.post('/updateTeamNumber', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const user_token = req.body.userToken;
    const new_team_number = req.body.newTeamNumber;
    console.log(new_team_number)
    if (new_team_number.length > 10) {
        return res.json({'error': true, 'message': 'Team number too long'});
    }
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: user_token}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'message': 'The provided user token is no longer valid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const doesAccountExist = await db.checkIfValueExists('accounts', '*', 'account_id', accountID);
    if (!doesAccountExist) {
        return res.json({'error': true, 'message': 'The provided account ID does not exist'});
    }
    await db.updateEntry('accounts', 'account_id', accountID, 'team_number', new_team_number);
    return res.json({'error': false, 'message': 'Team number updated successfully!'})
});

app.post('/updateBio', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const user_token = req.body.userToken;
    const new_bio = req.body.newBio;
    if (new_bio.length > 250) {
        return res.json({'error': true, 'message': 'Bio too long'});
    }
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: user_token}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'message': 'The provided user token is no longer valid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const doesAccountExist = await db.checkIfValueExists('accounts', '*', 'account_id', accountID);
    if (!doesAccountExist) {
        return res.json({'error': true, 'message': 'The provided account ID does not exist'});
    }
    await db.updateEntry('accounts', 'account_id', accountID, 'bio', new_bio);
    return res.json({'error': false, 'message': 'Bio updated successfully!'})
});

app.post('/registerUserAccount', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const email = req.body.email;
    const password = req.body.password;
    if (password.length < 8) {
        return res.json({'error': true, 'message': 'Password too short'});
    }
    if (password.includes(" ")) {
        return res.json({'error': true, 'message': 'Password can only contain alphanumeric characters.'});
    }
    const userID = crypto.randomUUID();
    const currentDate = new Date(Date.now());
    const isoDate = currentDate.toISOString();
    const doesEmailExist = await db.checkIfValueExists('accounts', '*', 'email', email);
    if (doesEmailExist) {
        return res.json({'error': true, 'message': 'The provided email is already in use!', 'code': 'ac-email-exists'});
    }
    bcrypt.hash(password, 10, async (err, hash) => {
        try {
            const code = verify.generateCode();
            await mailer.sendMail(email, 'Verify your email address.', `Your verification code is: ${code}. This will expire in 10 minutes. If you did not trigger this action, please ignore this email.`, `Your verification code is: <b>${code}</b>. The code will expire in 10 minutes. If you did not trigger this action, <b>please ignore this email.</b>`);
            await db.addEntry('accounts', [userID, email, userID, hash, isoDate, isoDate, false, false, '', '', []]);
            await db.addEntry('email_codes', [userID, code, isoDate]);
            return res.json({'error': false, 'message': 'Account created successfully!', 'id': userID});
        } catch (e) {
            console.log(e)
            if (e.responseCode == 555) {
                return res.json({'error': true, 'message': "Email invalid"});
            } else if (e.code == 'EENVELOPE') {
                return res.json({'error': true, 'message': 'Please use a valid email!'})
            } else if (e.code == 23505) {
                return res.json({'error': true, 'message': 'Email already in use!'})
            }
            return res.json({'error': true, 'message': JSON.stringify(e)});
        }
    });
});

app.post('/loginUserAccount', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const email = req.body.email;
    const password = req.body.password;
    const doesEmailExist = await db.checkIfValueExists('accounts', '*', 'email', email);
    if (!doesEmailExist) {
        return res.json({'error': true, 'message': 'Email has not been registered', 'code': 'si-email-not-registered'})
    }
    const userInfo = await db.selectRow('accounts', '*', 'email', email);
    const match = await bcrypt.compare(password, userInfo.password);
    if (match) {
        const userToken = crypto.randomUUID();
        const currentDate = new Date(Date.now());
        const isoDate = currentDate.toISOString();
        const doesUserTokenExist = await db.checkIfValueExists('access_tokens', '*', 'account_id', userInfo.account_id);
        if (!doesUserTokenExist) {
            await db.addEntry('access_tokens', [userToken, userInfo.account_id, isoDate]);
        }
        await db.updateEntry('accounts', 'account_id', userInfo.account_id, 'last_login_date', isoDate);
        if (userInfo.two_factor_approved) {
            await db.updateEntry('accounts', 'account_id', userInfo.account_id, 'two_factor_approved', false);
            return res.json({'error': false, 'message': 'You have been logged in!', 'token': userToken});
        } else {
            const code = verify.generateCode();
            await db.addEntry('email_codes', [userInfo.account_id, code, isoDate]);
            await mailer.sendMail(email, 'Verify your email address.', `Your login verification code is: ${code}. This will expire in 10 minutes. If you did not trigger this action, please ignore this email and reset your password.`, `Your login verification code is: <b>${code}</b>. The code will expire in 10 minutes. If you did not trigger this action, <b>please ignore this email and reset your password.</b>`);
            return res.json({'error': false, 'message': 'Please check your email for a login code.', 'token': 'verify'})
        }
    } else {
        return res.json({'error': true, 'message': 'Your email or password was incorrect.', 'token': null})
    }
});

app.post('/addGroup', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const user_token = req.body.userToken;
    const group_token = req.body.groupToken;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: user_token}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'message': 'The provided user token is no longer valid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const doesGroupExist = await db.checkIfValueExists('groups', '*', 'group_id', group_token);
    if (!doesGroupExist) {
        return res.json({'error': true, 'message': 'The provided group token does not exist.', 'code': 'group-not-found'});
    }
    const userInfo = await db.selectRow('accounts', '*', 'account_id', accountID);
    await db.updateEntry('accounts', 'account_id', accountID, 'groups', [...userInfo.groups, group_token]);
    return res.json({'error': false, 'message': 'Group added successfully!'})
});

app.post('/removeGroup', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const user_token = req.body.userToken;
    const group_token = req.body.groupToken;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: user_token}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'message': 'The provided user token is no longer valid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const userInfo = await db.selectRow('accounts', '*', 'account_id', accountID);
    await db.updateEntry('accounts', 'account_id', accountID, 'groups', userInfo.groups.filter(group => group !== group_token));
    return res.json({'error': false, 'message': 'Group removed successfully!'});
});

app.post('/verifyEmailCode', async (req, res) => {
    if (req.body.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const id = req.body.id;
    const code = req.body.code;
    const verify = req.body.verify;
    let code_data;
    let account_data;
    try {
        code_data = await db.selectRow('email_codes', '*', 'account_id', id);
        console.log(code_data)
        if (code_data == undefined) {
            return res.json({'error': true, 'message': 'Account ID does not exist', 'verified': false})
        }
    } catch (e) {
        return res.json({'error': true, 'message': e, 'verified': false})
    }
    const send_time = new Date(Date.parse(code_data.send_time));
    const current_time = new Date();
    const diff = current_time.getTime() - send_time.getTime();
    const minDiff = Math.floor(diff / (1000 * 60));
    if (code != code_data.email_code) {
        return res.json({'error': true, 'message': 'The code is incorrect', 'verified': false});
    }
    if (minDiff > 10) {
        await db.removeRow('email_codes', 'account_id', id);
        return res.json({'error': true, 'message': 'The code has expired', 'verified': false});
    }
    if (verify) {
        try {
            account_data = await db.selectRow('accounts', '*', 'account_id', id);
        } catch (e) {
            return res.json({'error': true, 'message': e, 'verified': false});
        }
        if (!account_data.verified) {
            try {
                await db.updateEntry('accounts', 'account_id', id, 'verified', true);
            } catch (e) {
                return res.json({'error': true, 'message': e, 'verified': false});
            }
        }
        if (!account_data.two_factor_approved) {
            try {
                await db.updateEntry('accounts', 'account_id', id, 'two_factor_approved', true);
            } catch (e) {
                return res.json({'error': true, 'message': e, 'verified': false});
            }
        }
        try {
            await db.removeRow('email_codes', 'account_id', id);
        } catch (e) {
            return res.json({'error': true, 'message': e, 'verified': false});
        }
        return res.json({'error': false, 'message': 'Account verified', 'verified': true});
    } else {
        console.log('assuming login verify');
        try {
            account_data = await db.selectRow('accounts', '*', 'account_id', id);
        } catch (e) {
            return res.json({'error': true, 'message': e, 'verified': false});
        }
        if (!account_data.verified) {
            return res.json({'error': true, 'message': 'Please verify your email first', 'verified': false});
        } else {
            const doesUserTokenExist = await db.checkIfValueExists('access_tokens', '*', 'account_id', id);
            if (!doesUserTokenExist) {
                return res.json({'error': true, 'message': 'Internal database error. Please try logging in again.'});
            }
            const userToken = await db.selectRow('access_tokens', '*', 'account_id', id);
            try {
                await db.removeRow('email_codes', 'account_id', id);
            } catch (e) {
                return res.json({'error': true, 'message': e, 'verified': false});
            }
            return res.json({'error': false, 'message': 'Verification successful, logging you in...', 'verified': true, 'token': userToken.user_token});
        }
    }
});

app.get('/getGroups', async (req, res) => {
    if (req.query.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const user_token = req.query.userToken;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: user_token}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'message': 'The provided user token is no longer valid.', 'code': 'token-invalid'});
    }
    const accountID = tokenInfo.info.account_id;
    const userInfo = await db.selectRow('accounts', '*', 'account_id', accountID);
    return res.json({'error': false, 'message': 'Groups fetched successfully!', 'groups': userInfo.groups});
});

app.get('/getIDfromToken', async (req, res) => {
    if (req.query.secret != process.env.SERVER_SECRET) {
        return res.json({'error': true, 'message': 'Please access this endpoint through the API gateway server.', 'code': 'ms-direct-access-disallowed'});
    }
    const user_token = req.query.userToken;
    const tokenInfo = await ky.post(`http://127.0.0.1:8234/internal/auth/verifyToken`, {json: {secret: process.env.SERVER_SECRET, token: user_token}}).json();
    if (!tokenInfo.valid) {
        return res.json({'error': true, 'message': 'The provided user token is no longer valid.', 'code': 'token-invalid'});
    }
    return res.json({'error': false, 'message': 'Account ID fetched successfully!', 'accountID': tokenInfo.info.account_id});
});

app.listen(8235, () => {
    console.log(`Rekon account server running at port 8235`);
});