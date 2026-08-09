import { sendOrderConfirmationEmail } from '../services/emailService';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const recipients = [
    '21224103018@cse.bubt.edu.bd',
    'tahmeedsadiq13@gmail.com'
  ];

  console.log('Sending test order confirmation emails via Nodemailer...');
  console.log('Sender:', process.env.EMAIL_USER);

  for (const email of recipients) {
    console.log(`\nAttempting to send email to: ${email}`);
    const success = await sendOrderConfirmationEmail({
      orderId: 102,
      customerName: 'Md Toufiqul Islam',
      phone: '01791925020',
      email: email,
      fullAddress: 'Savar, Boliyarpur, Konda, Dhaka',
      thanaUpazila: 'Savar',
      district: 'Dhaka'
    });

    if (success) {
      console.log(`SUCCESS: Order confirmation email sent to ${email}`);
    } else {
      console.error(`FAILED: Could not send email to ${email}`);
    }
  }

  process.exit(0);
}

main();
