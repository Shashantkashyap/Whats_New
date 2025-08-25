require("dotenv").config({ path: "../.env" });
console.log("Loaded ENV raw:", process.env);
const { sendEmail } = require("./sendEmail");

(async () => {
  try {
    console.log("👉 EMAIL_USER:", process.env.EMAIL_USER);
    console.log(
      "👉 EMAIL_PASS:",
      process.env.EMAIL_PASS ? "Loaded" : "Missing"
    );

    const to = "shashant.kashyap@regrip.in";
    const subject = "SMTP Test Mail ✅";
    const text = "Hello! Ye test mail hai Gmail SMTP se.";

    const info = await sendEmail(to, subject, text);
    console.log("✅ Test mail sent successfully!");
    console.log(info);
  } catch (err) {
    console.error("❌ Error sending mail:", err);
  }
})();
