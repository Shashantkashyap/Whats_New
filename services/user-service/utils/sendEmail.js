const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // Gmail use karenge -> to karna bc krta ku ni hain , hm b pareshan hain
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send an email
 * @param {string} to - Receiver email
 * @param {string} subject - Subject of email
 * @param {string} text - Plain text content
 * @param {string} html - Optional HTML content
 */
async function sendEmail(to, subject, text, html = null) {
  console.log("📧 Sending mail with:", {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS ? "✅ Loaded" : "❌ Missing",
  });

  return transporter.sendMail({
    from: `"MySaaS" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html: html || `<p>${text}</p>`,
  });
}

module.exports = { sendEmail };
