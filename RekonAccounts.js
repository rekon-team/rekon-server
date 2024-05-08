import express from 'express';
import { SimpleDB } from './modules/HSimpleDB.js';
import bcrypt from 'bcrypt';
import { SimpleEmail } from './modules/RSimpleEmail.js'
import { VerificationGen } from './modules/RVerification.js'
import 'dotenv/config';

const required_tables = ['accounts', 'email_codes'];
const table_params = {'accounts': 'user_token TEXT UNIQUE NOT NULL, email VARCHAR(100) UNIQUE NOT NULL, username VARCHAR(60) UNIQUE NOT NULL, password TEXT NOT NULL, date_created TEXT NOT NULL, last_login_date TEXT NOT NULL, verified BOOLEAN NOT NULL, two_factor_approved BOOLEAN NOT NULL',
'email_codes': 'user_token TEXT UNIQUE NOT NULL, email_code VARCHAR(6) NOT NULL, send_time TEXT NOT NULL'};

let app = express();
app.use(express.json());
app.use(
    express.urlencoded({
      extended: true,
    })
);

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

app.post('/registerUserAccount', async (req, res) => {
    const email = req.body.email
    const password = req.body.password
    if (password.length < 8) {
        return res.json({'error': true, 'message': 'Password too short'});
    }
    if (password.includes(" ")) {
        return res.json({'error': true, 'message': 'Password can only contain alphanumeric characters.'});
    }
    const userID = crypto.randomUUID();
    const currentDate = new Date(Date.now());
    const isoDate = currentDate.toISOString();
    bcrypt.hash(password, 10, async (err, hash) => {
        try {
            const code = verify.generateCode();
            await mailer.sendMail(email, 'Verify your email address.', `Your verification code is: ${code}. This will expire in 10 minutes. If you did not trigger this action, please ignore this email.`, `Your verification code is: <b>${code}</b>. The code will expire in 10 minutes. If you did not trigger this action, <b>please ignore this email.</b>`);
            await db.addEntry('accounts', [userID, email, userID, hash, isoDate, isoDate, false, false]);
            await db.addEntry('email_codes', [userID, code, isoDate]);
            return res.json({'error': false, 'message': 'Account created successfully!', 'id': userID});
        } catch (e) {
            console.log(e)
            if (e.responseCode == 555) {
                return res.json({'error': true, 'message': "Email invalid"});
            }
            return res.json({'error': true, message: JSON.stringify(e)});
        }
    });
});

app.post('/verifyEmailCode', async (req, res) => {
    const id = req.body.id;
    const code = req.body.code;
    const verify = req.body.verify;
    let code_data;
    let account_data;
    try {
        code_data = await db.selectRow('email_codes', '*', 'user_token', id);
        console.log(code_data)
    } catch (e) {
        return res.json({'error': true, 'message': e, 'verified': false})
    }
    const send_time = new Date(Date.parse(code_data.send_time));
    const current_time = new Date();
    const diff = current_time.getTime() - send_time.getTime();
    const minDiff = Math.floor(diff / (1000 * 60));
    if (minDiff > 10) {
        return res.json({'error': true, 'message': 'The code has expired', 'verified': false});
    }
    if (code != code_data.email_code) {
        return res.json({'error': true, 'message': 'The code is incorrect', 'verified': false});
    }
    if (verify) {
        try {
            account_data = await db.selectRow('accounts', '*', 'user_token', id);
        } catch (e) {
            return res.json({'error': true, 'message': e, 'verified': false});
        }
        if (!account_data.verified) {
            try {
                await db.updateEntry('accounts', 'user_token', id, 'verified', true);
            } catch (e) {
                return res.json({'error': true, 'message': e, 'verified': false});
            }
        }
        if (!account_data.two_factor_approved) {
            try {
                await db.updateEntry('accounts', 'user_token', id, 'two_factor_approved', true);
            } catch (e) {
                return res.json({'error': true, 'message': e, 'verified': false});
            }
        }
        try {
            await db.removeRow('email_codes', 'user_token', id);
        } catch (e) {
            return res.json({'error': true, 'message': e, 'verified': false});
        }
        return res.json({'error': false, 'message': 'Account verified', 'verified': true});
    }
});

app.listen(8235, () => {
    console.log(`Rekon account server running at port 8235`);
});