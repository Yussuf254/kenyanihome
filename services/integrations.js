const nodemailer = require('nodemailer');
const axios = require('axios');

async function sendEmail({ smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, from, fromName, to, subject, text, html }) {
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    throw new Error('SMTP configuration is incomplete.');
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: String(smtpSecure).toLowerCase() === 'ssl',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const fromAddress = from ? `${fromName ? fromName + ' ' : ''}<${from}>` : smtpUser;

  const info = await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    text: text || '',
    html: html || ''
  });

  return info;
}

async function sendSms({ provider, key, secret, from, to, message, endpoint }) {
  if (!provider) {
    throw new Error('SMS provider is not selected.');
  }
  if (!key || !secret) {
    throw new Error('SMS credentials are incomplete.');
  }
  if (!to || !message) {
    throw new Error('Recipient and message are required.');
  }

  switch (provider) {
    case 'twilio':
      return sendTwilioSms({ accountSid: key, authToken: secret, from, to, message });
    case 'nexmo':
      return sendNexmoSms({ apiKey: key, apiSecret: secret, from, to, message });
    case 'aws':
      return sendAwsSnsSms({ accessKeyId: key, secretAccessKey: secret, from, to, message });
    case 'custom':
      return sendCustomSms({ endpoint, key, secret, from, to, message });
    default:
      throw new Error(`Unsupported SMS provider: ${provider}`);
  }
}

async function sendTwilioSms({ accountSid, authToken, from, to, message }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', from);
  params.append('Body', message);

  const response = await axios.post(url, params, {
    auth: {
      username: accountSid,
      password: authToken
    },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return response.data;
}

async function sendNexmoSms({ apiKey, apiSecret, from, to, message }) {
  const url = 'https://rest.nexmo.com/sms/json';

  const payload = {
    api_key: apiKey,
    api_secret: apiSecret,
    to,
    from: from,
    text: message
  };

  const response = await axios.post(url, payload);

  return response.data;
}

async function sendAwsSnsSms({ accessKeyId, secretAccessKey, from, to, message }) {
  const url = 'https://sns.us-east-1.amazonaws.com/';

  const params = new URLSearchParams();
  params.append('Action', 'Publish');
  params.append('Version', '2010-03-31');
  params.append('Message', message);
  params.append('PhoneNumber', to);
  params.append('SenderId', from || 'KenyaNiHome');

  const response = await axios.post(url, params, {
    auth: {
      username: accessKeyId,
      password: secretAccessKey
    },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return response.data;
}

async function sendCustomSms({ endpoint, key, secret, from, to, message }) {
  if (!endpoint) {
    throw new Error('Custom SMS endpoint is not configured.');
  }

  const response = await axios.post(endpoint, {
    to,
    from,
    message,
    key,
    secret
  }, {
    headers: { 'Content-Type': 'application/json' }
  });

  return response.data;
}

const MPESA_BASE = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke'
};

async function getMpesaAccessToken(environment, consumerKey, consumerSecret) {
  if (!consumerKey || !consumerSecret) {
    throw new Error('M-Pesa Consumer Key and Secret are required.');
  }
  const base = MPESA_BASE[environment] || MPESA_BASE.sandbox;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const url = `${base}/oauth/v1/generate?grant_type=client_credentials`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  });

  if (response.data && response.data.access_token) {
    return response.data.access_token;
  }
  throw new Error('Failed to retrieve M-Pesa access token.');
}

function generateMpesaPassword(shortcode, passkey, timestamp) {
  const raw = (shortcode || '') + (passkey || '') + timestamp;
  return Buffer.from(raw).toString('base64');
}

async function initiateMpesaStkPush({
  environment,
  shortcode,
  passkey,
  consumerKey,
  consumerSecret,
  amount,
  phoneNumber,
  callbackUrl,
  accountReference,
  transactionDesc
}) {
  const accessToken = await getMpesaAccessToken(environment, consumerKey, consumerSecret);
  const base = MPESA_BASE[environment] || MPESA_BASE.sandbox;

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 14);
  const password = generateMpesaPassword(shortcode, passkey, timestamp);

  const url = `${base}/mpesa/stkpush/v1/processrequest`;
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionReceiver: phoneNumber,
    Amount: Number(amount) || 1,
    AccountReference: accountReference || 'Kenya ni Home',
    TransactionDesc: transactionDesc || 'News subscription payment',
    CallbackURL: callbackUrl,
    Type: 'STKPush'
  };

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data;
}

async function queryMpesaTransaction(environment, accessToken, requestId) {
  const base = MPESA_BASE[environment] || MPESA_BASE.sandbox;
  const url = `${base}/mpesa/stkpush/v1/query`;
  const response = await axios.post(url, { requestId }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

module.exports = {
  sendEmail,
  sendSms,
  getMpesaAccessToken,
  initiateMpesaStkPush,
  queryMpesaTransaction
};
