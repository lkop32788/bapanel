// Aliyun Chat App Message Service (CAMS) — Alibaba Cloud's Meta Premier BSP
// offering. Lets a workspace send/receive official WhatsApp messages through
// an Alibaba Cloud account (AccessKey + CustSpaceId) instead of a direct Meta
// access token. https://www.alibabacloud.com/help/en/chatapp/
//
// No official Node.js SDK is published for this product (Java/Go/PHP/Python
// only), so requests are signed by hand here following Alibaba Cloud's RPC
// "V3" signature spec (ACS3-HMAC-SHA256):
// https://www.alibabacloud.com/help/en/sdk/product-overview/v3-request-structure-and-signature
//
// NOTE: written from Alibaba Cloud's published docs without a live account to
// test against. Verify SendChatappMessage's exact parameter names (in
// particular the media/caption fields) against the OpenAPI Explorer once real
// AccessKey credentials are available, before relying on this in production.
const crypto = require('crypto');
const https = require('https');

const API_VERSION = '2020-06-06';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmacSha256Hex(key, input) {
  return crypto.createHmac('sha256', key).update(input, 'utf8').digest('hex');
}

// RFC3986 percent-encoding (stricter than encodeURIComponent: also escapes !'()*).
function rfc3986Encode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function canonicalQueryString(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]))}`)
    .join('&');
}

// Signs and sends one CAMS RPC action as a parameter-less-body POST (business
// params travel in the querystring, per Alibaba Cloud's documented RPC V3
// example). Resolves with { status, body } even on API-level errors; only
// rejects on transport failure.
function callAction(creds, action, params) {
  return new Promise((resolve, reject) => {
    const host = String(creds.endpoint || 'cams.ap-southeast-1.aliyuncs.com')
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const query = canonicalQueryString(params || {});
    const emptyBodyHash = sha256Hex('');
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const nonce = crypto.randomBytes(16).toString('hex');

    const signedHeaders = {
      host,
      'x-acs-action': action,
      'x-acs-version': API_VERSION,
      'x-acs-date': nowIso,
      'x-acs-signature-nonce': nonce,
      'x-acs-content-sha256': emptyBodyHash,
    };
    const headerNames = Object.keys(signedHeaders).sort();
    const canonicalHeaders = headerNames.map((k) => `${k}:${String(signedHeaders[k]).trim()}\n`).join('');
    const signedHeadersList = headerNames.join(';');

    const canonicalRequest = [
      'POST',
      '/',
      query,
      canonicalHeaders,
      signedHeadersList,
      emptyBodyHash,
    ].join('\n');

    const stringToSign = `ACS3-HMAC-SHA256\n${sha256Hex(canonicalRequest)}`;
    const signature = hmacSha256Hex(creds.accessKeySecret, stringToSign);
    const authorization = `ACS3-HMAC-SHA256 Credential=${creds.accessKeyId},SignedHeaders=${signedHeadersList},Signature=${signature}`;

    const req = https.request({
      method: 'POST',
      host,
      path: `/${query ? '?' + query : ''}`,
      headers: { ...signedHeaders, authorization, 'content-length': 0 },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }); }
        catch (e) { resolve({ status: res.statusCode, body: { Code: 'ParseError', Message: data.slice(0, 500) } }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Aliyun Chat App request timed out')));
    req.end();
  });
}

function credsFromWorkspace(chatApp) {
  return {
    accessKeyId: chatApp?.accessKeyId || '',
    accessKeySecret: chatApp?.accessKeySecret || '',
    endpoint: chatApp?.endpoint || 'cams.ap-southeast-1.aliyuncs.com',
    custSpaceId: chatApp?.custSpaceId || '',
    from: chatApp?.phoneNumber || '',
  };
}

async function sendChatappMessage(creds, params) {
  if (!creds.accessKeyId || !creds.accessKeySecret) throw new Error('Aliyun Chat App is not configured (missing AccessKey)');
  const { status, body } = await callAction(creds, 'SendChatappMessage', {
    ChannelType: 'whatsapp',
    CustSpaceId: creds.custSpaceId,
    From: creds.from,
    ...params,
  });
  if (status >= 200 && status < 300 && (body.Code === 'OK' || body.MessageId)) {
    return { success: true, messageId: body.MessageId || '', raw: body };
  }
  return { success: false, error: body.Message || body.Code || `HTTP ${status}`, raw: body };
}

async function sendText(chatApp, to, text, contextMessageId) {
  const creds = credsFromWorkspace(chatApp);
  return sendChatappMessage(creds, {
    Type: 'message', MessageType: 'text', To: to, Content: text || '',
    ...(contextMessageId ? { ContextMessageId: contextMessageId } : {}),
  });
}

async function sendMedia(chatApp, to, mediaType, url, caption) {
  const creds = credsFromWorkspace(chatApp);
  const result = await sendChatappMessage(creds, {
    Type: 'message', MessageType: mediaType, To: to, Content: url,
  });
  // No dedicated caption field is documented for media messages — follow the
  // panel's Facebook-channel convention and send the caption as a second text.
  if (result.success && caption) {
    await sendChatappMessage(creds, { Type: 'message', MessageType: 'text', To: to, Content: caption });
  }
  return result;
}

async function sendTemplate(chatApp, to, templateCode, language, templateParams) {
  const creds = credsFromWorkspace(chatApp);
  return sendChatappMessage(creds, {
    Type: 'template', To: to, TemplateCode: templateCode, Language: language || 'en',
    TemplateParams: templateParams && Object.keys(templateParams).length ? JSON.stringify(templateParams) : undefined,
  });
}

// Best-effort text/media extraction from the inbound `Message` object — the
// per-type sub-schema isn't fully published, so several plausible key names
// are tried.
function extractInboundText(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  return msg.Text || msg.Content || msg.Body || msg.Caption || '';
}
function extractInboundMediaUrl(msg) {
  if (!msg || typeof msg !== 'object') return '';
  return msg.Url || msg.MediaUrl || msg.Link || '';
}

// Normalizes a ChatAppInbound (or status) callback body into a flat shape the
// webhook controller can act on regardless of exact nested field names.
function parseInboundEvent(body) {
  const b = body || {};
  const isStatus = String(b.NoticeType || '').toLowerCase() === 'status' || !!b.Status;
  return {
    isStatus,
    messageId: b.MessageId || '',
    custSpaceId: b.CustSpaceId || '',
    from: b.From || '',
    to: b.To || '',
    name: b.Name || b.DisplayName || '',
    type: String(b.Type || '').toLowerCase(),
    text: extractInboundText(b.Message),
    mediaUrl: extractInboundMediaUrl(b.Message),
    status: b.Status || '',
    timestamp: b.Timestamp ? new Date(Number(b.Timestamp)) : new Date(),
  };
}

// Required response body so Alibaba Cloud does not retry the callback.
function ackBody() {
  return { code: 0, msg: 'Success' };
}

module.exports = {
  sendText,
  sendMedia,
  sendTemplate,
  parseInboundEvent,
  ackBody,
  credsFromWorkspace,
};
