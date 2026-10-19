const Conversation = require('../models/Conversation');
const escapeRegex = require('../utils/escapeRegex');
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const WhatsAppService = require('../services/whatsappService');
const { sendPaginated } = require('../utils/apiResponse');

// FIX-INBOX：非法 ObjectId（CastError）按 404 处理，不再 500 并泄漏 Mongoose 内部错误文本
const sendErr = (res, error) => {
  if (error && error.name === 'CastError') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  res.status(500).json({ success: false, message: error.message });
};

// @GET /api/conversations
const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, filter, search } = req.query;
    const query = { workspace: req.workspace._id };

    if (status) query.status = status;
    if (req.query.channel) {
      query.channel = req.query.channel === 'whatsapp' ? { $in: ['whatsapp', null] } : req.query.channel;
    }
    if (req.user && req.user.role === 'agent') {
      if (req.user.inboxScope === 'assigned') query.assignedAgent = req.user._id;
      const ac = req.user.allowedChannels || [];
      if (ac.length) query.channel = ac.includes('whatsapp') ? { $in: [...ac, null] } : { $in: ac };
    }
    if (filter === 'unread') query.unreadCount = { $gt: 0 };
    if (filter === 'assigned') query.assignedAgent = { $ne: null };
    if (filter === 'unassigned') query.assignedAgent = null;
    

    

    if (search) {
      const contacts = await Contact.find({
        workspace: req.workspace._id,
        $or: [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { phone: { $regex: escapeRegex(search), $options: 'i' } },
        ],
      }).select('_id');
      const searchIds = contacts.map(c => c._id);
      if (query.contact && query.contact.$in) {
        const set = new Set(query.contact.$in.map(String));
        query.contact = { $in: searchIds.filter(id => set.has(String(id))) };
      } else {
        query.contact = { $in: searchIds };
      }
    }

    const total = await Conversation.countDocuments(query);
    const conversations = await Conversation.find(query)
      .populate({ path: 'contact', select: 'name phone avatar profileName tags badges', populate: [{ path: 'tags', select: 'name color' }, { path: 'badges', select: 'name color icon' }] })
      .populate('assignedAgent', 'name avatar')
      .sort({ pinnedAt: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    sendPaginated(res, conversations, total, page, limit);
  } catch (error) {
    sendErr(res, error);
  }
};

// @GET /api/conversations/unread-counts
const getUnreadCounts = async (req, res) => {
  try {
    const agentMatch = {};
    if (req.user && req.user.role === 'agent') {
      if (req.user.inboxScope === 'assigned') agentMatch.assignedAgent = req.user._id;
      const ac = req.user.allowedChannels || [];
      if (ac.length) agentMatch.channel = ac.includes('whatsapp') ? { $in: [...ac, null] } : { $in: ac };
    }
    const rows = await Conversation.aggregate([
      { $match: { workspace: req.workspace._id, unreadCount: { $gt: 0 }, ...agentMatch } },
      { $group: { _id: { $ifNull: ['$channel', 'whatsapp'] }, count: { $sum: '$unreadCount' } } },
    ]);
    const counts = {};
    rows.forEach(r => { counts[r._id] = r.count; });
    res.json({ success: true, data: counts });
  } catch (error) {
    sendErr(res, error);
  }
};

// SEC-AGENT：inboxScope=assigned 的客服只能触达分配给自己的会话。
// 列表（getConversations）早有此过滤，这里补齐单条读取/消息/搜索，堵住
// "拿到会话 id 就能读全文"的绕过。
const agentScope = (req) => {
  if (req.user && req.user.role === 'agent' && req.user.inboxScope === 'assigned') {
    return { assignedAgent: req.user._id };
  }
  return {};
};

// @GET /api/conversations/:id
const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
      ...agentScope(req),
    })
      .populate({ path: 'contact', populate: [{ path: 'tags', select: 'name color' }, { path: 'badges', select: 'name color icon' }] })
      .populate('assignedAgent', 'name email avatar');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};

// @GET /api/conversations/:id/messages
const getMessages = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 2000);
    const owned = await Conversation.exists({ _id: req.params.id, workspace: req.workspace._id, ...agentScope(req) });
    if (!owned) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const total = await Message.countDocuments({ conversation: req.params.id });
    const messages = await Message.find({ conversation: req.params.id })
      .populate('sentBy', 'name avatar')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    sendPaginated(res, messages.reverse(), total, page, limit);
  } catch (error) {
    sendErr(res, error);
  }
};

// @POST /api/conversations/:id/messages
const sendMessage = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    }).populate('contact');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Assigned chats are locked to the assignee — others must take over first.
    if (conversation.assignedAgent && String(conversation.assignedAgent) !== String(req.user._id)) {
      const User = require('../models/User');
      const assignee = await User.findById(conversation.assignedAgent).select('name');
      return res.status(403).json({
        success: false,
        code: 'CHAT_TAKEN',
        message: `This chat is assigned to ${assignee?.name || 'another agent'} — take over to reply`,
      });
    }

    const { type, text, media, template, interactive, location, fromNumberId, replyToId } = req.body;

    // Quoted-reply: resolve the message being replied to so we can quote it on
    // the wire (WhatsApp context.message_id) and store a snapshot for the UI.
    let quotedContext;
    let contextWamid = '';
    if (replyToId) {
      const rep = await Message.findOne({ _id: replyToId, conversation: conversation._id }).select('waMessageId text type direction');
      if (rep) {
        contextWamid = String(rep.waMessageId || '').replace(/^(qr_|tg_|tgp_)/, '');
        quotedContext = { messageId: rep.waMessageId || '', text: String(rep.text || `[${rep.type}]`).slice(0, 240), from: rep.direction };
      }
    }

    // Create message in DB
    const message = await Message.create({
      workspace: req.workspace._id,
      conversation: conversation._id,
      contact: conversation.contact._id,
      direction: 'outbound',
      type: type || 'text',
      text,
      media,
      template,
      interactive,
      location,
      context: quotedContext,
      sentBy: req.user._id,
      status: 'pending',
    });

    // Telegram conversations send via the workspace bot token.
    if (conversation.channel === 'telegram') {
      const tg = req.workspace.telegram || {};
      if (!tg.botToken || !tg.enabled) {
        message.status = 'failed';
        message.errorMessage = 'Telegram is not connected (add your bot token on the Channels page)';
        await message.save();
      } else {
        try {
          const tgService = require('../services/telegramService');
          let result;
          if (['image', 'video', 'audio', 'document'].includes(type)) {
            result = await tgService.sendMedia(tg.botToken, conversation.contact.phone, type, media.url, media.caption || text);
          } else {
            result = await tgService.sendMessage(tg.botToken, conversation.contact.phone, text || '');
          }
          message.waMessageId = result?.message_id ? 'tg_' + result.message_id : '';
          message.status = 'sent';
        } catch (e) {
          message.status = 'failed';
          message.errorMessage = e.response?.data?.description || e.message;
        }
        await message.save();
      }
    }
    // Personal Telegram conversations send via the MTProto user session.
    else if (conversation.channel === 'telegram_personal') {
      try {
        const tgUser = require('../services/tgUserService');
        // 号池：会话已绑定账号则粘住；未绑定且开池时轮询取号并绑定
        let tgpSlot = 'default';
        const tm = /^tgp:(.+)$/.exec(conversation.waNumberId || '');
        if (tm) tgpSlot = tm[1];
        else if (req.workspace.tgPersonalPoolEnabled) {
          const picked = await tgUser.pickPoolSlot(req.workspace._id);
          if (picked) { tgpSlot = picked; conversation.waNumberId = 'tgp:' + picked; }
        }
        const result = await tgUser.send(req.workspace._id, conversation.contact.phone, { type: type || 'text', text, media, slotId: tgpSlot });
        message.waMessageId = result?.id ? 'tgp_' + result.id : '';
        message.status = 'sent';
      } catch (e) {
        message.status = 'failed';
        message.errorMessage = e.message;
      }
      await message.save();
    }
    // WhatsApp by QR conversations send via the Baileys session.
    else if (conversation.channel === 'whatsapp_qr') {
      try {
        const waQr = require('../services/waQrService');
        // 号池：会话已绑定槽位则粘住；未绑定且开池时轮询取槽并绑定
        let qrSlot = 'default';
        const qm = /^qr:(.+)$/.exec(conversation.waNumberId || '');
        if (qm) qrSlot = qm[1];
        else if (req.workspace.waQrPoolEnabled) {
          const picked = await waQr.pickPoolSlot(req.workspace._id);
          if (picked) { qrSlot = picked; conversation.waNumberId = 'qr:' + picked; }
        }
        const result = await waQr.sendMessage(req.workspace._id, conversation.contact.phone, { type: type || 'text', text, media, contextMessageId: contextWamid, contextFromMe: quotedContext && quotedContext.from === 'outbound', contextText: quotedContext && quotedContext.text }, qrSlot);
        message.waMessageId = result?.key?.id ? 'qr_' + result.key.id : '';
        message.status = 'sent';
      } catch (e) {
        message.status = 'failed';
        message.errorMessage = e.message;
      }
      await message.save();
    }
    // WhatsApp via Aliyun Chat App conversations send via Alibaba Cloud (AK/SK + CustSpaceId).
    else if (conversation.channel === 'whatsapp_chatapp') {
      const ca = req.workspace.chatApp || {};
      if (!ca.enabled || !ca.accessKeyId || !ca.accessKeySecret) {
        message.status = 'failed';
        message.errorMessage = 'Aliyun Chat App is not connected (add your AccessKey on the Channels page)';
        await message.save();
      } else {
        try {
          const chatApp = require('../services/chatAppService');
          const phone = conversation.contact.phone;
          let result;
          if (type === 'template') {
            result = await chatApp.sendTemplate(ca, phone, template.name, template.language, template.params);
          } else if (['image', 'video', 'audio', 'document'].includes(type)) {
            result = await chatApp.sendMedia(ca, phone, type, media.url, media.caption || text);
          } else {
            result = await chatApp.sendText(ca, phone, text || '', contextWamid);
          }
          message.waMessageId = result?.messageId ? 'ca_' + result.messageId : '';
          message.status = result?.success ? 'sent' : 'failed';
          if (!result?.success) message.errorMessage = result?.error || 'Failed to send';
        } catch (e) {
          message.status = 'failed';
          message.errorMessage = e.message;
        }
        await message.save();
      }
    }
    // Email conversations send via the workspace SMTP settings.
    else if (conversation.channel === 'email') {
      const ec = req.workspace.emailChannel || {};
      if (!ec.enabled || !ec.smtpHost || !ec.user) {
        message.status = 'failed';
        message.errorMessage = 'Email channel is not connected (configure SMTP on the Channels page)';
        await message.save();
      } else {
        try {
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: ec.smtpHost, port: ec.smtpPort || 587, secure: (ec.smtpPort || 587) === 465,
            auth: { user: ec.user, pass: ec.pass },
          });
          await transporter.sendMail({
            from: ec.fromName ? `"${ec.fromName}" <${ec.user}>` : ec.user,
            to: conversation.contact.email || conversation.contact.phone,
            subject: 'Re: ' + (conversation.lastSubject || 'Your message'),
            text: text || '',
          });
          message.status = 'sent';
        } catch (e) {
          message.status = 'failed';
          message.errorMessage = e.message;
        }
        await message.save();
      }
    }
    // Facebook Messenger / Instagram conversations send via the page token.
    else if (conversation.channel === 'facebook' || conversation.channel === 'instagram') {
      const mc = req.workspace.metaChat || {};
      if (!mc.pageAccessToken) {
        message.status = 'failed';
        message.errorMessage = 'Facebook/Instagram is not configured (add the page token in Settings)';
        await message.save();
      } else {
        try {
          const axios = require('axios');
          const payload = { recipient: { id: conversation.contact.phone }, messaging_type: 'RESPONSE' };
          if (type === 'image' || type === 'video' || type === 'audio' || type === 'document') {
            payload.message = { attachment: { type: type === 'document' ? 'file' : type, payload: { url: media.url, is_reusable: false } } };
          } else {
            payload.message = { text: text || '' };
          }
          const r = await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${mc.pageAccessToken}`, payload);
          message.waMessageId = r.data?.message_id || '';
          message.status = 'sent';
        } catch (e) {
          message.status = 'failed';
          message.errorMessage = e.response?.data?.error?.message || e.message;
        }
        await message.save();
      }
    }
    // 外部 API 占位渠道 — 发给运营者自配的 endpoint
    else if (conversation.channel === 'external_api') {
      try {
        const extSvc = require('../services/externalApiService');
        // 号池：会话已绑定槽位则粘住；未绑定且开池时轮询取槽并绑定
        let extSlot = null;
        const em = /^ext:(.+)$/.exec(conversation.waNumberId || '');
        if (em) {
          extSlot = em[1];
        } else if (req.workspace.externalApiPoolEnabled) {
          const picked = await extSvc.pickPoolSlot(req.workspace._id);
          if (picked) { extSlot = picked; conversation.waNumberId = 'ext:' + picked; }
        }
        if (!extSlot) {
          message.status = 'failed';
          message.errorMessage = '外部 API 渠道：未绑定槽位，请先在渠道页配置外部 API 并开启号池';
          await message.save();
        } else {
          const result = await extSvc.sendMessage(req.workspace._id, conversation.contact.phone, { type: type || 'text', text, media }, extSlot);
          message.waMessageId = result?.messageId ? 'ext_' + result.messageId : '';
          message.status = 'sent';
          await message.save();
        }
      } catch (e) {
        message.status = 'failed';
        message.errorMessage = e.message;
        await message.save();
      }
    }
    // Send via WhatsApp API
    else if (req.workspace.whatsapp?.isConnected) {
      // Optional per-message sender number override (must belong to this workspace)
      const waCfg = req.workspace.whatsapp;
      const validSenderIds = [waCfg.phoneNumberId, ...(waCfg.extraNumbers || []).map((n) => n.phoneNumberId)].filter(Boolean);
      let senderId = fromNumberId && validSenderIds.includes(fromNumberId)
        ? fromNumberId
        : (conversation.waNumberId || waCfg.phoneNumberId);
      // 号池：未绑定发送号的会话（客服新开聊/首次回复）从池里轮询取号并绑定粘住
      if (waCfg.poolEnabled && !conversation.waNumberId && !(fromNumberId && validSenderIds.includes(fromNumberId))) {
        const picked = await require('../services/waNumberPool').pickNumber(req.workspace._id, waCfg);
        if (picked) senderId = picked;
      }
      if (senderId && conversation.waNumberId !== senderId) {
        conversation.waNumberId = senderId;
      }
      const { resolveWaCreds } = require('../utils/waSender');
      const senderCreds = resolveWaCreds(waCfg, senderId);
      const waService = new WhatsAppService(senderCreds.accessToken, senderCreds.phoneNumberId);

      let result;
      const phone = conversation.contact.phone;

      if (type === 'template') {
        let tplComps = template.components || [];
        try {
          const tplDoc = await require('../models/Template').findOne({ name: template.name, workspace: req.workspace._id });
          if (tplDoc?.carousel?.cards?.length && !tplComps.some(c => String(c.type || '').toLowerCase() === 'carousel')) {
            tplComps = [...tplComps, require('../utils/carousel').buildCarouselComponent(tplDoc.carousel.cards)];
          }
          if (tplDoc?.buttons?.some(b => b.type === 'catalog') && !tplComps.some(c => String(c.sub_type || '').toLowerCase() === 'catalog')) {
            tplComps = [...tplComps, { type: 'button', sub_type: 'catalog', index: 0, parameters: [{ type: 'action', action: {} }] }];
          }
        } catch (e) { /* noop */ }
        // Safety net: guarantee required template variables so Meta does not reject with (#132000).
        try {
          const tplReq = await require('../models/Template').findOne({ name: template.name, workspace: req.workspace._id });
          if (tplReq) {
            const cname = String((conversation.contact && (conversation.contact.name || conversation.contact.profileName || conversation.contact.phone)) || '-').replace(/[\n\t]+/g, ' ').slice(0, 60);
            if (tplReq.header && tplReq.header.type === 'text') {
              const hv = (tplReq.header.content || '').match(/\{\{\d+\}\}/g) || [];
              const hasHeaderText = tplComps.some((c) => String(c.type || '').toLowerCase() === 'header' && Array.isArray(c.parameters) && c.parameters.some((p) => p.type === 'text'));
              if (hv.length && !hasHeaderText) {
                tplComps = [{ type: 'header', parameters: hv.map(() => ({ type: 'text', text: cname })) }, ...tplComps];
              }
            }
            const bv = (tplReq.body || '').match(/\{\{\d+\}\}/g) || [];
            const hasBody = tplComps.some((c) => String(c.type || '').toLowerCase() === 'body' && Array.isArray(c.parameters) && c.parameters.length);
            if (bv.length && !hasBody) {
              tplComps = [...tplComps, { type: 'body', parameters: bv.map((m, i) => ({ type: 'text', text: i === 0 ? cname : '-' })) }];
            }
            // Dynamic URL button(s): supply the variable value so Meta does not reject with (#131008).
            const hasUrlBtn = tplComps.some((c) => String(c.sub_type || '').toLowerCase() === 'url');
            if (!hasUrlBtn && Array.isArray(tplReq.buttons)) {
              const _ub = require('../utils/templateButtons').buildUrlButtonComponents(tplReq.buttons, () => cname);
              if (_ub.length) tplComps = [...tplComps, ..._ub];
            }
          }
        } catch (e) { /* noop */ }
        result = await waService.sendTemplateMessage(
          phone, template.name, template.language || 'en', tplComps
        );
      } else if (type === 'image' || type === 'video' || type === 'document' || type === 'audio' || type === 'sticker') {
        result = await waService.sendMediaMessage(phone, type, media.url, media.caption, contextWamid);
      } else if (type === 'interactive') {
        result = await waService.sendInteractiveMessage(phone, interactive);
      } else if (type === 'location') {
        result = await waService.sendLocationMessage(phone, location.latitude, location.longitude, location.name, location.address);
      } else {
        result = await waService.sendTextMessage(phone, text, contextWamid);
      }

      if (result.success) {
        message.waMessageId = result.data.messages?.[0]?.id || '';
        message.status = 'sent';
      } else {
        message.status = 'failed';
        message.errorMessage = result.error?.message || 'Failed to send';
      }
      await message.save();
    }
    // FIX-INBOX：没有任何渠道能发送时的最终兜底——原先 WhatsApp 未连接会静默
    // 跳过所有分支，消息以 pending 入库却返回 201"成功"，前端气泡永远转圈
    else {
      message.status = 'failed';
      message.errorMessage = 'WhatsApp 未连接（请到渠道页完成连接后再发送）';
      await message.save();
    }

    // Update conversation
    conversation.lastMessage = {
      text: text || `[${type}]`,
      timestamp: new Date(),
      direction: 'outbound',
      type,
    };
    await conversation.save();

    // Emit via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${req.workspace._id}`).emit('new_message', {
        message,
        conversationId: conversation._id,
      });
    }


    res.status(201).json({ success: true, data: message });
  } catch (error) {
    sendErr(res, error);
  }
};

// @POST /api/conversations/:id/react  { messageId, emoji }  (emoji '' removes)
const reactMessage = async (req, res) => {
  try {
    const { messageId, emoji } = req.body;
    const conversation = await Conversation.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('contact');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const target = await Message.findOne({ _id: messageId, conversation: conversation._id, workspace: req.workspace._id });
    if (!target) return res.status(404).json({ success: false, message: 'Message not found' });

    const wamid = String(target.waMessageId || '').replace(/^(qr_|tg_|tgp_)/, '');
    const phone = conversation.contact.phone;
    try {
      if (conversation.channel === 'whatsapp_qr') {
        const waQr = require('../services/waQrService');
        const qm = /^qr:(.+)$/.exec(conversation.waNumberId || '');
        await waQr.sendReaction(req.workspace._id, phone, wamid, emoji || '', target.direction === 'outbound', qm ? qm[1] : 'default');
      } else if (req.workspace.whatsapp && req.workspace.whatsapp.isConnected) {
        const waCfg = req.workspace.whatsapp;
        const senderId = conversation.waNumberId || waCfg.phoneNumberId;
        const { resolveWaCreds } = require('../utils/waSender');
        const senderCreds = resolveWaCreds(waCfg, senderId);
        const waService = new WhatsAppService(senderCreds.accessToken, senderCreds.phoneNumberId);
        await waService.sendReaction(phone, wamid, emoji || '');
      } else {
        return res.status(400).json({ success: false, message: 'Reactions are only supported on WhatsApp' });
      }
    } catch (e) {
      return res.status(400).json({ success: false, message: (e && e.message) || 'Failed to send reaction' });
    }

    const reactions = (target.reactions || []).filter((r) => r.from !== 'outbound');
    if (emoji) reactions.push({ emoji, from: 'outbound' });
    target.reactions = reactions;
    await target.save();
    const io = req.app.get('io');
    if (io) io.to(`workspace:${req.workspace._id}`).emit('message_reaction', { messageId: target._id, conversationId: conversation._id, reactions: target.reactions });
    res.json({ success: true, data: { reactions: target.reactions } });
  } catch (error) {
    sendErr(res, error);
  }
};

// @POST /api/conversations/:id/presence  — subscribe to QR presence (online/last-seen). QR only.
const subscribePresence = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('contact');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (conversation.channel !== 'whatsapp_qr') return res.json({ success: true, data: { supported: false } });
    const waQr = require('../services/waQrService');
    const qmP = /^qr:(.+)$/.exec(conversation.waNumberId || '');
    const ok = await waQr.subscribePresence(req.workspace._id, conversation.contact.phone, qmP ? qmP[1] : 'default');
    res.json({ success: true, data: { supported: ok, phone: conversation.contact.phone } });
  } catch (error) {
    sendErr(res, error);
  }
};

// @POST /api/conversations
const startConversation = async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ success: false, message: 'contactId is required' });
    }

    const contact = await Contact.findOne({ _id: contactId, workspace: req.workspace._id });
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    const initiatingAgent = req.user && req.user.role === 'agent' ? req.user._id : undefined;
    let conversation = await Conversation.findOne({ workspace: req.workspace._id, contact: contactId });

    if (conversation) {
      if (initiatingAgent && !conversation.assignedAgent) {
        conversation.assignedAgent = initiatingAgent;
        await conversation.save();
      }
      return res.json({ success: true, data: conversation });
    }

    conversation = await Conversation.create({
      workspace: req.workspace._id,
      contact: contactId,
      status: 'active',
      ...(initiatingAgent ? { assignedAgent: initiatingAgent } : {}),
    });

    conversation = await Conversation.findById(conversation._id)
      .populate('contact', 'name phone avatar profileName');

    res.status(201).json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};

// @PUT /api/conversations/:id/assign
const assignConversation = async (req, res) => {
  try {
    const { agentId, teamId } = req.body;
    // SEC-AGENT：客服只能把会话认领给自己（不能改派团队/他人）；
    // 只看已分配的客服连认领都不行——它本来就看不到未分配会话
    if (req.user.role === 'agent') {
      if (req.user.inboxScope === 'assigned') {
        return res.status(403).json({ success: false, message: '客服账号无权分配会话' });
      }
      if (teamId || (agentId && String(agentId) !== String(req.user._id))) {
        return res.status(403).json({ success: false, message: '客服只能把会话认领给自己' });
      }
    }
    // 目标客服必须是本工作区成员（防止把会话挂到外部用户名下）
    if (agentId) {
      const uid = String(agentId);
      const isMember = String(req.workspace.owner) === uid
        || (req.workspace.members || []).some((m) => String(m.user) === uid);
      if (!isMember) return res.status(400).json({ success: false, message: '目标客服不在本工作区' });
    }
    const update = {};
    if (agentId) update.assignedAgent = agentId;
    if (teamId) update.assignedTeam = teamId;

    // Capture old agent for reassign alert
    let oldAgentName = null;
    if (agentId) {
      const oldConv = await Conversation.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('assignedAgent', 'name').populate('contact', 'name profileName phone');
      if (oldConv?.assignedAgent && String(oldConv.assignedAgent._id) !== String(agentId)) {
        oldAgentName = oldConv.assignedAgent.name || '?';
      }
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      update,
      { new: true }
    ).populate('assignedAgent', 'name email avatar');

    if (oldAgentName && conversation?.assignedAgent) {
      const contact = await require('../models/Contact').findById(conversation.contact).select('name profileName phone').lean();
      require('../services/ownerNotify').chatReassigned(req.workspace._id, contact, oldAgentName, conversation.assignedAgent.name).catch(() => {});
    }

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};

// @PUT /api/conversations/:id/resolve
const resolveConversation = async (req, res) => {
  try {
    const existing = await Conversation.findOne({ _id: req.params.id, workspace: req.workspace._id }).select('status');
    if (!existing) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const reopen = existing.status === 'closed';
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      reopen
        ? { status: 'active', isResolved: false, resolvedAt: null, resolvedBy: null }
        : { status: 'closed', isResolved: true, resolvedAt: new Date(), resolvedBy: req.user._id },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Feedback message automation (fire and forget)
    (async () => {
      try {
        const AutomationSettings = require('../models/AutomationSettings');
        const settings = await AutomationSettings.findOne({ workspace: req.workspace._id });
        if (settings && settings.feedback && settings.feedback.enabled && settings.feedback.message) {
          const Contact = require('../models/Contact');
          const contact = await Contact.findById(conversation.contact);
          if (contact && contact.phone && (!conversation.channel || conversation.channel === 'whatsapp')) {
            const WhatsAppService = require('../services/whatsappService');
            const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
            await wa.sendInteractiveMessage(contact.phone, {
              type: 'list',
              body: { text: settings.feedback.message },
              action: { button: 'Rate us ⭐', sections: [{ title: 'Rating', rows: [5, 4, 3, 2, 1].map((r) => ({ id: `fbrate_${r}`, title: '⭐'.repeat(r), description: r + ' star' + (r > 1 ? 's' : '') })) }] },
            });
            if (settings.feedback.stickerUrl) {
              await wa.sendMediaMessage(contact.phone, 'sticker', settings.feedback.stickerUrl, '');
            }
            console.log('[Automation] Feedback message sent to', contact.phone);
          }
        }
      } catch (e) { console.error('[Automation] feedback send error:', e.message); }
    })();

    res.json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};

// @PUT /api/conversations/:id/read
const markAsRead = async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { unreadCount: 0 },
      { new: true }
    );

    res.json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};

// @PATCH /api/conversations/:id/ai-toggle
const toggleAI = async (req, res) => {
  try {
    const { enabled, mode } = req.body;
    // mode 'call' assigns AI to answer this contact's calls; otherwise chat replies.
    // Chat mode: aiEnabled forces AI ON (even if global auto-AI is off),
    // aiDisabled forces it OFF (even if global auto-AI is on).
    const update = mode === 'call'
      ? { aiCallEnabled: !!enabled }
      : { aiEnabled: !!enabled, aiDisabled: !enabled };
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      update,
      { new: true }
    ).populate('assignedAgent', 'name email avatar');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};


// @POST /api/conversations/by-phone — start/open a chat with any number (auto-creates contact)
const startConversationByPhone = async (req, res) => {
  try {
    let { phone, name, channel } = req.body;
    phone = String(phone || '').replace(/\D/g, '');
    // FIX-INBOX：移除"10 位补 91"的印度区号残留——本地商户输入 10 位号码会被
    // 建成错误的印度号码；请用户带国码输入（如 60123456789）
    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ success: false, message: '请输入带国码的完整号码（如 60123456789）' });
    }
    let contact = await Contact.findOne({ workspace: req.workspace._id, phone: new RegExp(phone + '$') });
    if (!contact) {
      contact = await Contact.create({ workspace: req.workspace._id, phone, name: name || phone });
    }
    const convQuery = { workspace: req.workspace._id, contact: contact._id };
    if (channel) convQuery.channel = channel;
    const initiatingAgent = req.user && req.user.role === 'agent' ? req.user._id : undefined;
    let conversation = await Conversation.findOne(convQuery);
    if (!conversation) {
      conversation = await Conversation.create({ ...convQuery, status: 'active', ...(initiatingAgent ? { assignedAgent: initiatingAgent } : {}) });
    } else if (initiatingAgent && !conversation.assignedAgent) {
      conversation.assignedAgent = initiatingAgent;
      await conversation.save();
    }
    conversation = await Conversation.findById(conversation._id).populate('contact', 'name phone avatar profileName');
    res.json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};

// @POST /api/conversations/by-email — compose a new email (creates contact + conversation, sends via SMTP)
const startConversationByEmail = async (req, res) => {
  try {
    const to = String(req.body.to || '').trim().toLowerCase();
    const cc = String(req.body.cc || '').trim();
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '');
    const html = String(req.body.html || '').trim();
    // SEC-LFI：nodemailer 的 path 接受本地文件路径——只允许指向本站 uploads 的 http(s) 绝对 URL，
    // 杜绝 {"url":"/path/to/.env"} 把服务器文件当附件发出去
    const selfHost = String(req.get('host') || '').toLowerCase();
    const backendHost = (() => { try { return new URL(process.env.BACKEND_URL || '').host.toLowerCase(); } catch { return ''; } })();
    const safeAttachment = (u) => {
      try {
        const url = new URL(String(u));
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
        const host = url.host.toLowerCase();
        if (host !== selfHost && (!backendHost || host !== backendHost)) return false;
        return url.pathname.startsWith('/api/uploads/') || url.pathname.startsWith('/uploads/');
      } catch { return false; }
    };
    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments
      .filter(a => a && typeof a.url === 'string' && safeAttachment(a.url))
      .map(a => ({ filename: a.filename || 'attachment', path: a.url })) : [];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(400).json({ success: false, message: 'A valid recipient email address is required' });
    }
    const ec = req.workspace.emailChannel || {};
    if (!ec.enabled || !ec.smtpHost || !ec.user) {
      return res.status(400).json({ success: false, message: 'Email channel is not connected (configure SMTP on the Channels page)' });
    }
    let contact = await Contact.findOne({ workspace: req.workspace._id, email: to });
    if (!contact) {
      contact = await Contact.create({ workspace: req.workspace._id, email: to, phone: to, name: to, source: 'email' });
    }
    const initiatingAgent = req.user && req.user.role === 'agent' ? req.user._id : undefined;
    let conversation = await Conversation.findOne({ workspace: req.workspace._id, contact: contact._id, channel: 'email' });
    if (!conversation) {
      conversation = await Conversation.create({ workspace: req.workspace._id, contact: contact._id, channel: 'email', status: 'active', lastSubject: subject, ...(initiatingAgent ? { assignedAgent: initiatingAgent } : {}) });
    } else {
      if (initiatingAgent && !conversation.assignedAgent) conversation.assignedAgent = initiatingAgent;
      conversation.lastSubject = subject;
      await conversation.save();
    }
    const attachNote = attachments.length ? '\n\n[' + attachments.length + ' attachment(s): ' + attachments.map(a => a.filename).join(', ') + ']' : '';
    const Message = require('../models/Message');
    const message = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: 'text',
      text: (subject ? 'Subject: ' + subject + '\n\n' : '') + body + attachNote,
      sentBy: req.user._id, status: 'pending', metadata: { source: 'email' },
    });
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: ec.smtpHost, port: ec.smtpPort || 587, secure: (ec.smtpPort || 587) === 465,
        auth: { user: ec.user, pass: ec.pass },
      });
      await transporter.sendMail({
        from: ec.fromName ? `"${ec.fromName}" <${ec.user}>` : ec.user,
        to, subject: subject || '(no subject)',
        text: body,
        ...(cc ? { cc } : {}),
        ...(html ? { html } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      message.status = 'sent';
    } catch (e) {
      message.status = 'failed';
      message.errorMessage = e.message;
    }
    await message.save();
    conversation = await Conversation.findById(conversation._id).populate('contact', 'name phone email avatar profileName');
    res.json({ success: true, data: { conversation, message } });
  } catch (error) {
    sendErr(res, error);
  }
};

// @GET /api/conversations/search-messages?q=
const searchMessages = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const Message = require('../models/Message');
    const filter = {
      workspace: req.workspace._id,
      text: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
    };
    if (req.query.conversation) filter.conversation = req.query.conversation;
    // SEC-AGENT：只看已分配的客服，全文搜索也只搜自己会话里的消息
    const scope = agentScope(req);
    if (scope.assignedAgent) {
      const mine = await Conversation.find({ workspace: req.workspace._id, assignedAgent: scope.assignedAgent }).select('_id').lean();
      const mineIds = mine.map((c) => c._id);
      filter.conversation = req.query.conversation
        ? (mineIds.some((id) => String(id) === String(req.query.conversation)) ? req.query.conversation : null)
        : { $in: mineIds };
      if (filter.conversation === null) return res.json({ success: true, data: [] });
    }
    const msgs = await Message.find(filter)
      .sort('-createdAt').limit(req.query.conversation ? 200 : 30)
      .populate('contact', 'name phone')
      .select('text direction type createdAt conversation contact')
      .lean();
    res.json({ success: true, data: msgs });
  } catch (error) {
    sendErr(res, error);
  }
};

const chatHtml = (title, msgs) => {
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = msgs.map((m) => {
    const d = new Date(m.createdAt);
    const when = d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const who = m.contactLabel ? `<div class="who">${esc(m.contactLabel)}</div>` : '';
    return `<div class="msg ${m.direction === 'outbound' ? 'out' : 'in'}">${who}<div class="text">${esc(m.text || '[' + (m.type || 'media') + ']')}</div><div class="meta">${when} · ${esc(m.direction)}${m.status ? ' · ' + esc(m.status) : ''}</div></div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:Arial,sans-serif;background:#ece5dd;margin:0;padding:20px}
h1{font-size:18px;color:#075e54}
.msg{max-width:70%;margin:6px 0;padding:8px 12px;border-radius:8px;background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.1)}
.msg.out{margin-left:auto;background:#dcf8c6}
.who{font-size:11px;font-weight:bold;color:#075e54;margin-bottom:2px}
.text{font-size:14px;white-space:pre-wrap;word-break:break-word}
.meta{font-size:10px;color:#8696a0;margin-top:4px;text-align:right}
</style></head><body><h1>${esc(title)}</h1>${rows}</body></html>`;
};

const chatPdf = (res, filename, title, msgs) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.fontSize(16).fillColor('#075e54').text(title);
  doc.moveDown(0.5);
  for (const m of msgs) {
    const d = new Date(m.createdAt);
    const when = d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const label = (m.contactLabel ? m.contactLabel + ' · ' : '') + (m.direction === 'outbound' ? 'Sent' : 'Received') + ' · ' + when + (m.status ? ' · ' + m.status : '');
    doc.fontSize(8).fillColor('#888888').text(label);
    doc.fontSize(11).fillColor('#111111').text(m.text || '[' + (m.type || 'media') + ']');
    doc.moveDown(0.6);
    if (doc.y > 760) doc.addPage();
  }
  doc.end();
};

const csvEsc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

// @GET /api/conversations/:id/export - one chat as CSV
const exportConversation = async (req, res) => {
  try {
    const Message = require('../models/Message');
    const conv = await Conversation.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('contact', 'name phone');
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const msgs = await Message.find({ conversation: conv._id }).sort('createdAt').lean();
    const lines = ['Date,Time,Direction,Type,Status,Message'];
    for (const m of msgs) {
      const d = new Date(m.createdAt);
      lines.push([
        d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        d.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        m.direction, m.type || 'text', m.status || '', csvEsc(m.text || ''),
      ].join(','));
    }
    const name = (conv.contact?.name || conv.contact?.phone || 'chat').replace(/[^a-zA-Z0-9]/g, '_');
    const fmt = (req.query.format || 'csv').toLowerCase();
    const title = 'Chat with ' + (conv.contact?.name || conv.contact?.phone || 'customer');
    if (fmt === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="chat-' + name + '.html"');
      return res.send(chatHtml(title, msgs));
    }
    if (fmt === 'pdf') {
      return chatPdf(res, 'chat-' + name + '.pdf', title, msgs);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="chat-' + name + '.csv"');
    res.send('\uFEFF' + lines.join('\n'));
  } catch (error) {
    sendErr(res, error);
  }
};

// @GET /api/conversations/export-all - all chats as CSV
const exportAllChats = async (req, res) => {
  try {
    const Message = require('../models/Message');
    const msgs = await Message.find({ workspace: req.workspace._id })
      .sort('createdAt').limit(50000)
      .populate('contact', 'name phone').lean();
    const lines = ['Contact Name,Phone,Date,Time,Direction,Type,Status,Message'];
    for (const m of msgs) {
      const d = new Date(m.createdAt);
      lines.push([
        csvEsc(m.contact?.name || ''), csvEsc(m.contact?.phone || ''),
        d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        d.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        m.direction, m.type || 'text', m.status || '', csvEsc(m.text || ''),
      ].join(','));
    }
    const fmt = (req.query.format || 'csv').toLowerCase();
    if (fmt === 'html' || fmt === 'pdf') {
      const withLabel = msgs.map((m) => ({ ...m, contactLabel: (m.contact?.name || '') + (m.contact?.phone ? ' (' + m.contact.phone + ')' : '') }));
      if (fmt === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="all-chats-export.html"');
        return res.send(chatHtml('All Chats Export', withLabel));
      }
      return chatPdf(res, 'all-chats-export.pdf', 'All Chats Export', withLabel.slice(0, 10000));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="all-chats-export.csv"');
    res.send('\uFEFF' + lines.join('\n'));
  } catch (error) {
    sendErr(res, error);
  }
};


// @PATCH /api/conversations/:id/pin
const pinConversation = async (req, res) => {
  try {
    const { pinned } = req.body;
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { pinnedAt: pinned ? new Date() : null },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, data: conversation });
  } catch (error) {
    sendErr(res, error);
  }
};

// @DELETE /api/conversations/:id
const deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    await Message.deleteMany({ conversation: conversation._id, workspace: req.workspace._id });
    await Conversation.deleteOne({ _id: conversation._id });
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    sendErr(res, error);
  }
};

module.exports = {
  searchMessages, exportConversation, exportAllChats,
  getConversations, getUnreadCounts, getConversation, getMessages, sendMessage,
  startConversation, startConversationByPhone, startConversationByEmail, assignConversation, resolveConversation, markAsRead, toggleAI, deleteConversation, pinConversation,
  reactMessage,
  subscribePresence,
};
