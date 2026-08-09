import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export interface OrderEmailDetails {
  orderId?: number;
  customerName: string;
  phone: string;
  email: string;
  fullAddress: string;
  thanaUpazila?: string;
  district?: string;
}

export async function sendOrderConfirmationEmail(details: OrderEmailDetails): Promise<boolean> {
  if (!details.email || !details.email.includes('@')) {
    console.log('Skipping email confirmation: No valid email provided.');
    return false;
  }

  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('Cannot send email: EMAIL_USER or EMAIL_PASS environment variables are missing.');
    return false;
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2e7d32; text-align: center;">অর্ডার সফলভাবে সম্পন্ন হয়েছে!</h2>
      <p>প্রিয় <strong>${details.customerName}</strong>,</p>
      <p>Sunnah Food BD-তে অর্ডার করার জন্য আপনাকে ধন্যবাদ। আপনার অর্ডারের তথ্য সফলভাবে গ্রহণ করা হয়েছে।</p>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #333;">অর্ডারের বিবরণ:</h3>
        ${details.orderId ? `<p><strong>অর্ডার আইডি:</strong> #${details.orderId}</p>` : ''}
        <p><strong>নাম:</strong> ${details.customerName}</p>
        <p><strong>মোবাইল নম্বর:</strong> ${details.phone}</p>
        <p><strong>ইমেইল:</strong> ${details.email}</p>
        <p><strong>সম্পূর্ণ ঠিকানা:</strong> ${details.fullAddress}</p>
        <p><strong>থানা/উপজেলা:</strong> ${details.thanaUpazila || 'N/A'}</p>
        <p><strong>জেলা:</strong> ${details.district || 'N/A'}</p>
      </div>

      <p>আমাদের কাস্টমার রিলেশনশিপ প্রতিনিধি খুব শীঘ্রই ডেলিভারির বিষয়ে আপনার সাথে যোগাযোগ করবেন।</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <div style="font-size: 13px; color: #555;">
        <p style="margin: 2px 0;"><strong>CEO</strong></p>
        <p style="margin: 2px 0; font-weight: bold; color: #2e7d32;">Md Toufiqul Islam</p>
        <p style="margin: 2px 0;">Software Engineer</p>
        <p style="margin: 2px 0; font-weight: 500;">ACS FUTURE SCHOOL</p>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #777; font-size: 12px; text-align: center;">Sunnah Food BD - 100% Premium Organic Food</p>
    </div>
  `;

  const mailOptions = {
    from: `"Sunnah Food BD" <${EMAIL_USER}>`,
    to: details.email.trim(),
    subject: `Order Confirmation ${details.orderId ? `#${details.orderId}` : ''} - Sunnah Food BD`,
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent successfully to ${details.email}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending order confirmation email via Nodemailer:', error);
    return false;
  }
}
