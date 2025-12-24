import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

import { marked } from 'marked';
import { getConfig } from './configService';

dotenv.config();

export const sendRcaEmail = async (recipientEmail: string | string[], rcaReport: string, prUrl: string) => {
  // Check if SMTP configuration is present
  if (!process.env.SMTP_HOST) {
    console.log('⚠️ SMTP_HOST not set. Email sending simulated.');
    console.log(`[Simulated Email] To: ${Array.isArray(recipientEmail) ? recipientEmail.join(', ') : recipientEmail}`);
    console.log(`[Simulated Email] Subject: RCA Report for PR`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const toAddress = Array.isArray(recipientEmail) ? recipientEmail.join(', ') : recipientEmail;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"AI RCA Service" <no-reply@example.com>',
    to: toAddress,
    subject: `RCA Report for PR`,
    html: `
      <h2>AI Root Cause Analysis Report</h2>
      <p>A new RCA report has been generated for your Pull Request: <a href="${prUrl}">${prUrl}</a></p>
      <hr />
      ${marked(rcaReport)}
      <hr />
      <p>This is an automated message from the AI RCA Service.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
  } catch (error: any) {
    console.error('Error sending email:', error);
    if (error.code === 'ECONNREFUSED' && (process.env.SMTP_HOST === 'localhost' || process.env.SMTP_HOST === '127.0.0.1')) {
      console.log('💡 HINT: If running in Docker and trying to reach a local SMTP server, use "host.docker.internal" instead of "localhost".');
    }
  }
};

