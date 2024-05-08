import ky from 'ky';
import express from 'express';

let app = express();
app.use(express.json());
app.use(
    express.urlencoded({
      extended: true,
    })
);

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
  const json = await ky.post('http://127.0.0.1:8235/registerUserAccount', {json: {email: email, password: password}}).json();
  console.log(json)
  return res.json(json)
});

app.post('/accounts/verifyEmailCode', async (req, res) => {
  const id = req.body.id;
  const code = req.body.code;
  const json = await ky.post('http://127.0.0.1:8235/verifyEmailCode', {json: {id: id, code: code, verify: true}}).json();
  console.log(json);
  return res.json(json);
});

app.listen(8234, () => {
    console.log(`Rekon gateway running at port 8234`);
});