import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendRcaEmail = async (to: string, rcaContent: string, prLink: string) => {
  if (!to) {
    console.warn('No email address provided, skipping email notification.');
    return;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || '"AI RCA Service" <no-reply@example.com>',
    to,
    subject: `RCA Analysis for PR ${prLink}`,
    html: `
      <h2>AI Root Cause Analysis Report</h2>
      <p>A new analysis has been generated for your Pull Request: <a href="${prLink}">${prLink}</a></p>
      <hr />
      <div style="white-space: pre-wrap; font-family: monospace;">
        ${rcaContent.replace(/\n/g, '<br>')}
      </div>
      <hr />
      <p>This is an automated message from the AI RCA Service.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};
