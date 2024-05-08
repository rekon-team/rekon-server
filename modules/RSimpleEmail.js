import nodemailer from 'nodemailer';

class SimpleEmail {
    async init(user, pass) {
        this.transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
              user: user,
              pass: pass,
            },
        });
    }

    async sendMail(recipient, subject, textbody, htmlbody) {
        // send mail with defined transport object
        const info = await this.transporter.sendMail({
          from: '"Rēkon" <rekonsystem@gmail.com>', // sender address
          to: recipient, // list of receivers
          subject: subject, // Subject line
          text: textbody, // plain text body
          html: htmlbody, // html body
        });  
    }
}

export { SimpleEmail };