const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Template = require('../models/Template');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const WhatsAppService = require('../services/whatsappService');
const { sendPaginated } = require('../utils/apiResponse');

// Substitute {contact_name} / {phone} / {email} and any custom data field {fieldName}
// with the recipient's actual values so template variables auto-fill per contact.
const applyContactVars = (text, contact) => {
  const fullName = String(contact.name || contact.profileName || '').trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  let out = String(text == null ? '' : text)
    .replace(/\{contact_name\}/g, contact.name || contact.profileName || contact.phone || '')
    .replace(/\{name\}/g, contact.name || contact.profileName || contact.phone || '')
    .replace(/\{first_name\}/g, nameParts[0] || contact.profileName || '')
    .replace(/\{last_name\}/g, nameParts.slice(1).join(' ') || '')
    .replace(/\{profile_name\}/g, contact.profileName || contact.name || '')
    .replace(/\{country_code\}/g, contact.countryCode || '')
    .replace(/\{phone\}/g, contact.phone || '')
    .replace(/\{email\}/g, contact.email || '');
  const cf = contact.customFields;
  if (cf) {
    const keys = cf instanceof Map ? Array.from(cf.keys()) : Object.keys(cf);
    for (const k of keys) {
      const val = cf instanceof Map ? cf.get(k) : cf[k];
      out = out.replace(new RegExp('\\{' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g'), val == null ? '' : String(val));
    }
  }
  return out;
};

// @GET /api/campaigns
const getCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, sendChannel } = req.query;
    const query = { workspace: req.workspace._id };
    if (type) query.type = type;
    if (status) query.status = status;
    if (sendChannel === 'whatsapp_qr' || sendChannel === 'whatsapp_chatapp' || sendChannel === 'external_api') query.sendChannel = sendChannel;
    else if (sendChannel === 'cloud') query.sendChannel = { $nin: ['whatsapp_qr', 'whatsapp_chatapp', 'external_api'] };

    const total = await Campaign.countDocuments(query);
    let campaigns = await Campaign.find(query)
      .populate('template', 'name category status')
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Live stats: derive delivered/read/failed from the actual per-recipient
    // message statuses (updated by delivery webhooks) so the table is accurate.
    try {
      const campIds = campaigns.map(c => c._id);
      if (campIds.length) {
        const agg = await Message.aggregate([
          { $match: { workspace: req.workspace._id, 'metadata.campaignId': { $in: campIds } } },
          { $group: { _id: { c: '$metadata.campaignId', s: '$status' }, n: { $sum: 1 } } },
        ]);
        const byCamp = {};
        for (const r of agg) {
          const cid = String(r._id.c); const s = r._id.s || 'sent';
          byCamp[cid] = byCamp[cid] || { sent: 0, delivered: 0, read: 0, failed: 0 };
          if (s === 'read') byCamp[cid].read += r.n;
          else if (s === 'delivered') byCamp[cid].delivered += r.n;
          else if (s === 'failed') byCamp[cid].failed += r.n;
          else byCamp[cid].sent += r.n;
        }
        campaigns = campaigns.map(c => {
          const live = byCamp[String(c._id)];
          if (!live) return c;
          const obj = c.toObject();
          const deliveredTotal = live.delivered + live.read;
          const sentTotal = live.sent + live.delivered + live.read;
          obj.stats = { ...obj.stats, sent: sentTotal || obj.stats.sent, delivered: deliveredTotal, read: live.read, failed: live.failed };
          return obj;
        });
      }
    } catch (e) { /* fall back to stored stats */ }

    sendPaginated(res, campaigns, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns
const mapAudience = (body) => {
  const a = body.audience;
  if (!a) return body;
  const { audience, ...rest } = body;
  return {
    ...rest,
    targetType: a.type || 'all',
    targetChannel: a.channel || '',
    targetSegments: a.segments || [],
    targetTags: a.tags || [],
    targetContacts: a.contacts || [],
    targetNumbers: Array.from(new Set((a.numbers || []).map(n => String(n).replace(/\D/g, '')).filter(n => n.length >= 10))),
  };
};

// SEC-IDOR：template/presetMessage/abTest.templateB 引用必须归属本工作区
// （否则 getCampaign 的 populate('template') 会回显他人模板全文）
const assertCampaignRefs = async (req, body) => {
  const assertRef = require('../utils/assertWorkspaceRef');
  const Template = require('../models/Template');
  await assertRef(Template, body.template, req.workspace._id, '模板');
  await assertRef(require('../models/PresetMessage'), body.presetMessage, req.workspace._id, '预设消息');
  await assertRef(Template, body.abTest && body.abTest.templateB, req.workspace._id, 'A/B 测试模板B');
};

const createCampaign = async (req, res) => {
  try {
    await assertCampaignRefs(req, req.body);
    const campaign = await Campaign.create({
      ...mapAudience(req.body),
      workspace: req.workspace._id,
      createdBy: req.user._id,
      status: 'draft',
      stats: undefined,
    });

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// @GET /api/campaigns/:id
const getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    })
      .populate('template')
      .populate('createdBy', 'name email');

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/campaigns/:id
const updateCampaign = async (req, res) => {
  try {
    await assertCampaignRefs(req, req.body); // SEC-IDOR
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      (({ workspace, stats, createdBy, _id, status, ...rest }) => rest)(mapAudience(req.body)),
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/campaigns/:id
const deleteCampaign = async (req, res) => {
  try {
    // SEC-CONC：运行中的任务不允许删除（请先暂停）——原先删除后发送循环仍继续
    const campaign = await Campaign.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
      status: { $ne: 'running' },
    });

    if (!campaign) {
      const running = await Campaign.exists({ _id: req.params.id, workspace: req.workspace._id, status: 'running' });
      if (running) return res.status(400).json({ success: false, message: '任务正在发送中，请先暂停再删除' });
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/start
const nextRunDate = (rec) => {
  const d = new Date();
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  else if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  return d;
};

// Campaign sends: new_message only to the open chat's room (agents that joined
// conversation:<id>); the workspace room gets at most one conversation_updated
// per conversation per run so the inbox list learns about it without a per-recipient storm.
const emitCampaignMsg = (io, workspaceId, conversation, cMsg, seen) => {
  if (!io) return;
  const cid = String(conversation._id);
  io.to(`conversation:${cid}`).emit('new_message', { message: cMsg, conversationId: conversation._id });
  if (seen && !seen.has(cid)) {
    seen.add(cid);
    const plain = typeof conversation.toObject === 'function' ? conversation.toObject() : conversation;
    io.to(`workspace:${workspaceId}`).emit('conversation_updated', plain);
  }
};

const finishCampaign = async (campaign) => {
  // SEC-CONC：先持久化计数，再只从 running 原子收尾——
  // 原先无条件 save()：会把并发 pause 的 paused 覆盖成 completed，
  // 对已删除的任务还会抛未捕获的 DocumentNotFoundError
  try {
    await Campaign.updateOne({ _id: campaign._id }, { $set: {
      'stats.sent': campaign.stats.sent, 'stats.failed': campaign.stats.failed,
      'stats.skipped': campaign.stats.skipped, 'stats.totalRecipients': campaign.stats.totalRecipients,
    } });
    const isRecurring = campaign.recurrence && campaign.recurrence !== 'none';
    const upd = isRecurring
      ? { $set: { status: 'scheduled', scheduledAt: nextRunDate(campaign.recurrence) } }
      : { $set: { status: 'completed', completedAt: new Date() } };
    const done = await Campaign.findOneAndUpdate({ _id: campaign._id, status: 'running' }, upd, { new: true });
    if (done && done.status === 'completed') {
      require('../services/ownerNotify').broadcastDone(done).catch(() => {});
    }
  } catch (e) {
    console.error('[Campaign] finish:', e.message);
  }
};

// Runs a (non-drip) campaign: resolves audience and sends in background.
const runCampaignCore = async (campaign, workspace, io) => {
    // Get target contacts
    let contacts;
    if (campaign.targetType === 'all') {
      contacts = await Contact.find({ workspace: workspace._id, status: 'active', isGroup: { $ne: true } });
    } else if (campaign.targetType === 'segment') {
      // Resolve dynamic segments (field rules + broadcast retargeting rules)
      const Segment = require('../models/Segment');
      const { resolveSegmentContacts } = require('./segmentController');
      const segs = await Segment.find({ _id: { $in: campaign.targetSegments }, workspace: workspace._id });
      const seen = new Set();
      contacts = [];
      for (const seg of segs) {
        const segContacts = await resolveSegmentContacts(workspace._id, seg);
        for (const c of segContacts) {
          if (c.status !== 'active') continue;
          const id = c._id.toString();
          if (!seen.has(id)) { seen.add(id); contacts.push(c); }
        }
      }
    } else if (campaign.targetType === 'tag') {
      contacts = await Contact.find({ workspace: workspace._id, tags: { $in: campaign.targetTags }, status: 'active', isGroup: { $ne: true } });
    } else if (campaign.targetType === 'numbers') {
      contacts = (campaign.targetNumbers || []).map((p) => ({ _id: null, phone: p }));
    } else {
      contacts = await Contact.find({ _id: { $in: campaign.targetContacts }, workspace: workspace._id, status: 'active' });
    }

    // Restrict to a single platform if a channel filter is set (numbers list has no channel).
    if (campaign.targetChannel && campaign.targetType !== 'numbers') {
      contacts = contacts.filter((c) => (c.channel || 'whatsapp') === campaign.targetChannel);
    }

    // Opt-out guard: never message unsubscribed contacts (also covers the manual-numbers path,
    // which is built from raw phone strings and skips the status:'active' filter above).
    try {
      const optedOut = await Contact.find({ workspace: workspace._id, status: 'opted_out' }).select('phone').lean();
      if (optedOut.length) {
        const norm = (p) => String(p || '').replace(/\D/g, '').slice(-10);
        const blocked = new Set(optedOut.map((c) => norm(c.phone)));
        contacts = contacts.filter((c) => !blocked.has(norm(c.phone)));
      }
    } catch (e) { console.error('[Campaign] opt-out guard:', e.message); }

    // Resume-safe: drop recipients already messaged for this campaign so a
    // restart/crash continues from where it stopped instead of re-sending, and
    // reconcile prior progress into the stats.
    try {
      const prior = await Message.find({ workspace: workspace._id, 'metadata.campaignId': campaign._id, direction: 'outbound' }).select('contact status').lean();
      if (prior.length) {
        const done = new Set(prior.map((p) => String(p.contact)).filter(Boolean));
        contacts = contacts.filter((c) => !(c._id && done.has(String(c._id))));
        if (campaign.targetType === 'numbers') {
          // numbers targets have no _id: match by phone (last 10 digits) via the contacts upserted when sending
          const l10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
          const doneContacts = await Contact.find({ _id: { $in: [...done] } }).select('phone').lean();
          const donePhones = new Set(doneContacts.map((c) => l10(c.phone)).filter(Boolean));
          contacts = contacts.filter((c) => !donePhones.has(l10(c.phone)));
        }
        campaign.stats.sent = Math.max(campaign.stats.sent || 0, prior.filter((p) => p.status !== 'failed').length);
        campaign.stats.failed = Math.max(campaign.stats.failed || 0, prior.filter((p) => p.status === 'failed').length);
      }
    } catch (e) { console.error('[Campaign] resume dedupe:', e.message); }

    campaign.status = 'running';
    campaign.startedAt = campaign.startedAt || new Date();
    campaign.stats.totalRecipients = (campaign.stats.sent || 0) + (campaign.stats.failed || 0) + contacts.length;
    await campaign.save();

    // Free-text / preset (non-template) broadcasts must offer an opt-out so
    // recipients unsubscribe instead of blocking. Approved templates carry
    // their own opt-out (added in the template builder), so they are skipped.
    if (campaign.presetMessage && String(campaign.presetMessage.body || '').trim()) {
      try {
        const AutomationSettings = require('../models/AutomationSettings');
        const asx = await AutomationSettings.findOne({ workspace: workspace._id }).lean();
        const oo = (asx && asx.optOut) || {};
        if (oo.enabled !== false && oo.appendToBroadcasts !== false) {
          const { DEFAULT_BROADCAST_FOOTER } = require('../services/optOut');
          const line = (oo.broadcastFooter && oo.broadcastFooter.trim()) || DEFAULT_BROADCAST_FOOTER;
          if (line && !String(campaign.presetMessage.body).includes(line)) {
            campaign.presetMessage.body = String(campaign.presetMessage.body).trimEnd() + '\n\n' + line;
          }
        }
      } catch (e) { console.error('[Campaign] opt-out footer:', e.message); }
    }

    // Web WhatsApp (QR) campaigns go through the QR socket with its
    // warm-up/daily-limit engine — no Cloud API, no 24h-window restriction.
    if (campaign.sendChannel === 'whatsapp_qr' && campaign.presetMessage) {
      const qrCampaign = require('../services/qrCampaign');
      setImmediate(() => {
        qrCampaign.execute(campaign, workspace, contacts, io).catch((e) =>
          console.error('[QRCampaign] execute error:', e.message)
        );
      });
      return;
    }

    // Aliyun Chat App campaigns send through Alibaba Cloud (AK/SK) — also no
    // Cloud API template/24h-window restriction, and no warm-up cap either
    // since it is a rate-limited official API rather than a device session.
    if (campaign.sendChannel === 'whatsapp_chatapp' && campaign.presetMessage) {
      const chatAppCampaign = require('../services/chatAppCampaign');
      setImmediate(() => {
        chatAppCampaign.execute(campaign, workspace, contacts, io).catch((e) =>
          console.error('[ChatAppCampaign] execute error:', e.message)
        );
      });
      return;
    }

    // 外部 API 渠道群发 — 通过运营者自配的 HTTP endpoint 逐条发送
    if (campaign.sendChannel === 'external_api' && campaign.presetMessage) {
      const extCampaign = require('../services/extApiCampaign');
      setImmediate(() => {
        extCampaign.execute(campaign, workspace, contacts, io).catch((e) =>
          console.error('[ExtApiCampaign] execute error:', e.message)
        );
      });
      return;
    }

    // Send messages asynchronously — from the campaign's selected number if it
    // belongs to this workspace, otherwise the default number.
    const validSenderIds = [
      workspace.whatsapp.phoneNumberId,
      ...(workspace.whatsapp.extraNumbers || []).map((n) => n.phoneNumberId),
    ].filter(Boolean);
    // 号池轮询：senderNumberId='pool' 时按受众在同 WABA 号码间平均分摊（防单号
    // 集中发送）；已绑定发送号的会话仍走绑定号（粘住，客户视角不换号）
    const { poolNumbers } = require('../services/waNumberPool');
    const poolIds = campaign.senderNumberId === 'pool' ? poolNumbers(workspace.whatsapp) : [];
    const poolMode = poolIds.length > 1;
    const senderId = campaign.senderNumberId && campaign.senderNumberId !== 'pool' && validSenderIds.includes(campaign.senderNumberId)
      ? campaign.senderNumberId
      : workspace.whatsapp.phoneNumberId;
    const { resolveWaCreds } = require('../utils/waSender');
    const _svcCache = {};
    const svcFor = (sid) => {
      const key = sid || workspace.whatsapp.phoneNumberId;
      if (!_svcCache[key]) {
        const creds = resolveWaCreds(workspace.whatsapp, key);
        _svcCache[key] = new WhatsAppService(creds.accessToken, creds.phoneNumberId);
      }
      return _svcCache[key];
    };
    const waService = svcFor(senderId);

    const workspaceId = workspace._id;

    // Save Money campaign: free-form preset message, only to contacts whose
    // 24h customer-service window is open (no template charge).
    if (campaign.presetMessage) {
      const preset = campaign.presetMessage;
      // Campaign-time media override (in-memory only; the saved preset is untouched)
      const presetMediaOverride = campaign.variables && campaign.variables._headerMediaUrl;
      if (presetMediaOverride) preset.mediaUrl = presetMediaOverride;
      const emitSeen = new Set();
      setImmediate(async () => {
        for (let contact of contacts) {
          try {
            if (!contact._id) {
              const found = await Contact.findOne({ workspace: workspaceId, phone: new RegExp(contact.phone + '$') });
              if (!found) { campaign.stats.skipped++; continue; }
              contact = found;
            }
            const conversation = await Conversation.findOne({ workspace: workspaceId, contact: contact._id, windowExpiresAt: { $gt: new Date() } });
            if (!conversation) {
              campaign.stats.skipped++;
              continue;
            }
            const { sendPreset } = require('../services/presetSend');
            // 号池/粘住：优先用会话已绑定的发送号；池模式下未绑定的按序分摊
            const _presetSid = conversation.waNumberId || (poolMode ? poolIds[(campaign.stats.sent + campaign.stats.failed) % poolIds.length] : senderId);
            const { result, msgType, renderedText } = await sendPreset(svcFor(_presetSid), contact.phone, preset, contact);
            if (result.success) {
              campaign.stats.sent++;
              const cMsg = await Message.create({
                workspace: workspaceId,
                conversation: conversation._id,
                contact: contact._id,
                direction: 'outbound',
                type: msgType,
                text: renderedText || preset.body,
                media: preset.mediaUrl ? { url: preset.mediaUrl } : undefined,
                waMessageId: result.data?.messages?.[0]?.id || '',
                status: 'sent',
                metadata: { source: 'preset_campaign', campaignId: campaign._id },
              });
              await Conversation.findByIdAndUpdate(conversation._id, {
                lastMessage: { text: renderedText || preset.body, timestamp: new Date(), direction: 'outbound', type: 'text' },
              });
              emitCampaignMsg(io, workspaceId, { ...(conversation.toObject ? conversation.toObject() : conversation), lastMessage: { text: renderedText || preset.body, timestamp: new Date(), direction: 'outbound', type: 'text' } }, cMsg, emitSeen);
            } else {
              campaign.stats.failed++;
            }
          } catch {
            campaign.stats.failed++;
          }
        }
        await finishCampaign(campaign);
      });
      return;
    }

    const tmplName = campaign.template.name;
    const tplComponents = [];
    const tplHeader = campaign.template.header;
    if (tplHeader && ['image', 'video', 'document'].includes(tplHeader.type)) {
      // Campaign-time media override takes priority; else the template's own media;
      // else pull the approved header sample from Meta so old approved templates
      // with no locally-stored media still send.
      let headerLink = (campaign.variables && campaign.variables._headerMediaUrl) || tplHeader.mediaUrl || '';
      if (!headerLink) {
        try { headerLink = await require('./templateController').ensureTemplateHeaderMedia(campaign.template, workspace); } catch (e) { /* noop */ }
      }
      if (headerLink) {
        tplComponents.push({ type: 'header', parameters: [{ type: tplHeader.type, [tplHeader.type]: { link: headerLink } }] });
      }
    }
    try {
      const carTpl = await Template.findOne({ name: campaign.template.name, workspace: workspaceId });
      if (carTpl?.carousel?.cards?.length) {
        // Per-campaign card media override: Meta approves the template text, not the
        // media, so a different image/video can be sent without re-approval.
        const cards = carTpl.carousel.cards.map((c, i) => {
          const override = campaign.variables && campaign.variables['_carouselMedia' + i];
          if (!override) return c;
          const plain = typeof c.toObject === 'function' ? c.toObject() : c;
          return { ...plain, mediaUrl: override };
        });
        tplComponents.push(require('../utils/carousel').buildCarouselComponent(cards));
      }
      if (carTpl?.buttons?.some((b) => b.type === 'catalog')) {
        tplComponents.push({ type: 'button', sub_type: 'catalog', index: 0, parameters: [{ type: 'action', action: {} }] });
      }
    } catch (e) { /* noop */ }
    // Build body parameters from campaign.variables
    const vars = campaign.variables || {};
    const bodyText = campaign.template.body || '';
    const varMatches = bodyText.match(/\{\{\d+\}\}/g) || [];
    if (varMatches.length > 0) {
      const bodyParams = varMatches.map((m) => {
        const num = m.replace(/[{}]/g, '');
        const val = vars[num] || vars['var' + num] || '';
        return { type: 'text', text: val || '-' };
      });
      tplComponents.push({ type: 'body', parameters: bodyParams });
    }
    // Text-header variable(s): WhatsApp expects a header parameter for each {{n}} in a text header.
    if (tplHeader && tplHeader.type === 'text') {
      const hdrMatches = (tplHeader.content || '').match(/\{\{\d+\}\}/g) || [];
      if (hdrMatches.length > 0) {
        tplComponents.push({ type: 'header', parameters: hdrMatches.map((m) => {
          const num = m.replace(/[{}]/g, '');
          return { type: 'text', text: vars['h' + num] || vars['header' + num] || '{contact_name}' };
        }) });
      }
    }

    // Dynamic URL button(s): Meta rejects the send (#131008) unless the variable value is supplied.
    try {
      const _btnTpl = await Template.findOne({ name: campaign.template.name, workspace: workspaceId });
      const _ubComps = require('../utils/templateButtons').buildUrlButtonComponents(_btnTpl && _btnTpl.buttons, (b) => {
        const num = ((b.value || '').match(/\{\{(\d+)\}\}/) || [])[1] || '1';
        return vars['btn' + num] || vars['button' + num] || vars['url' + num] || '{contact_name}';
      });
      if (_ubComps.length) tplComponents.push(..._ubComps);
    } catch (e) { /* noop */ }

    // A/B test: preload template B
    let abTemplateB = null;
    if (campaign.abTest?.enabled && campaign.abTest?.templateB) {
      // SEC-IDOR：运行期也按 workspace 加载，拒绝外部模板 id
      try { abTemplateB = await require('../models/Template').findOne({ _id: campaign.abTest.templateB, workspace: campaign.workspace }); } catch (e) { /* noop */ }
    }
    const abSplit = Math.min(100, Math.max(0, campaign.abTest?.splitPercent || 50));

    const emitSeen = new Set();
    setImmediate(async () => {
      let contactIndex = -1;
      for (let contact of contacts) {
        contactIndex++;
        // Honor pause/stop requested while the campaign is running.
        if (contactIndex % 5 === 0) {
          const live = await Campaign.findById(campaign._id).select('status').lean();
          // SEC-CONC：live=null（任务被删）也必须停——原先条件写反，删除后"幽灵发送"会发完全部受众
          if (!live) return;
          if (live.status !== 'running') { campaign.status = live.status; await campaign.save().catch(() => {}); return; }
          // Persist progress so a mid-run restart resumes with correct counts.
          try { await Campaign.updateOne({ _id: campaign._id }, { $set: { 'stats.sent': campaign.stats.sent, 'stats.failed': campaign.stats.failed, 'stats.skipped': campaign.stats.skipped } }); } catch (e) { /* noop */ }
        }
        const abVariant = abTemplateB ? ((contactIndex % 100) < abSplit ? 'A' : 'B') : null;
        const useTemplate = abVariant === 'B' ? abTemplateB : campaign.template;
        try {
          const toPhone = toWaNumber(contact.phone);
          if (!toPhone) {
            campaign.stats.failed++;
            await recordFailedRecipient(workspaceId, campaign, contact, String(contact.phone || ''), useTemplate, abVariant, 'Invalid phone number');
            continue;
          }

          // Per-contact substitution in body params
          const contactComponents = JSON.parse(JSON.stringify(tplComponents));
          const bodyComp = contactComponents.find(c => c.type === 'body');
          if (bodyComp) {
            bodyComp.parameters = bodyComp.parameters.map(p => ({
              ...p,
              text: applyContactVars(p.text, contact),
            }));
          }
          const headerComp = contactComponents.find(c => c.type === 'header' && Array.isArray(c.parameters) && c.parameters.some(p => p.type === 'text'));
          if (headerComp) {
            headerComp.parameters = headerComp.parameters.map(p => (p.type === 'text' ? {
              ...p,
              text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 60),
            } : p));
          }

          contactComponents.filter(c => String(c.sub_type || '') === 'url' && Array.isArray(c.parameters)).forEach(bc => {
            bc.parameters = bc.parameters.map(p => (p.type === 'text' ? { ...p, text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 2000) } : p));
          });
          // 号池轮询：按受众序号在池内平均分摊发送号
          const sendSid = poolMode ? poolIds[contactIndex % poolIds.length] : senderId;
          const result = await svcFor(sendSid).sendTemplateMessage(
            toPhone,
            useTemplate.name,
            useTemplate.language,
            abVariant === 'B' ? [] : contactComponents
          );
          if (result.success) {
            campaign.stats.sent++;
            // For numbers-only targets, upsert a real contact so messages are tracked
            if (!contact._id) {
              const Contact = require('../models/Contact');
              const realContact = await Contact.findOneAndUpdate(
                { workspace: workspaceId, phone: toPhone },
                { workspace: workspaceId, phone: toPhone, source: 'manual', name: toPhone },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
              contact = realContact;
            }
            // Persist to the contact's chat thread so the broadcast is visible
            const conversation = await Conversation.findOneAndUpdate(
              { workspace: workspaceId, contact: contact._id },
              {
                $set: {
                  status: 'active',
                  lastMessage: { text: `Template: ${tmplName}`, timestamp: new Date(), direction: 'outbound', type: 'template' },
                },
                // 号池：新会话绑定本次发送号（粘住，后续接待同号回复）；已有绑定不覆盖
                $setOnInsert: { workspace: workspaceId, contact: contact._id, waNumberId: sendSid || '' },
              },
              { upsert: true, new: true }
            );
            const cMsg = await Message.create({
              workspace: workspaceId,
              conversation: conversation._id,
              contact: contact._id,
              direction: 'outbound',
              type: 'template',
              text: useTemplate.body || useTemplate.name,
              template: { name: useTemplate.name, language: useTemplate.language || 'en', components: [] },
              waMessageId: result.data?.messages?.[0]?.id || '',
              status: 'sent',
              metadata: { source: 'campaign', campaignId: campaign._id, ...(abVariant ? { abVariant } : {}) },
            });
            emitCampaignMsg(io, workspaceId, conversation, cMsg, emitSeen);
          } else {
            campaign.stats.failed++;
            await recordFailedRecipient(workspaceId, campaign, contact, toPhone, useTemplate, abVariant,
              result && (result.error?.message || result.error?.error_user_msg || result.error) ? String(result.error?.message || result.error?.error_user_msg || result.error) : 'Send failed');
          }
        } catch (e) {
          campaign.stats.failed++;
          try {
            const tp = toWaNumber(contact.phone) || String(contact.phone || '');
            await recordFailedRecipient(workspaceId, campaign, contact, tp, useTemplate, abVariant, e.message || 'Send error');
          } catch { /* noop */ }
        }
      }
      await finishCampaign(campaign);
    });

};

// Persist a per-recipient FAILED message so it shows in the campaign report
// and can be re-sent later. Upserts the contact/conversation when needed.
// Normalise a stored number to WhatsApp digits (drops separators and the trunk
// prefix 0 that many saved numbers carry); returns '' when it is not a number.
const toWaNumber = (raw) => {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '').replace(/^0+/, '');
  const full = digits.length === 10 ? '91' + digits : digits;
  return full.length >= 11 && full.length <= 15 ? full : '';
};

const recordFailedRecipient = async (workspaceId, campaign, contact, toPhone, useTemplate, abVariant, errorMessage) => {
  if (!contact || !contact._id) {
    contact = await Contact.findOneAndUpdate(
      { workspace: workspaceId, phone: toPhone },
      { workspace: workspaceId, phone: toPhone, source: 'manual', name: toPhone },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspaceId, contact: contact._id },
    { workspace: workspaceId, contact: contact._id, status: 'active' },
    { upsert: true, new: true }
  );
  await Message.create({
    workspace: workspaceId,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'outbound',
    type: 'template',
    text: useTemplate.body || useTemplate.name,
    template: { name: useTemplate.name },
    status: 'failed',
    errorMessage: errorMessage || 'Send failed',
    metadata: { source: 'campaign', campaignId: campaign._id, ...(abVariant ? { abVariant } : {}) },
  });
};

// @POST /api/campaigns/:id/start
const startCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    }).populate('template').populate('presetMessage');

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.sendChannel === 'whatsapp_qr') {
      const waQrSvc = require('../services/waQrService');
      if (campaign.senderNumberId === 'pool') {
        // 号池模式：任一槽位（含 default）已连接即可启动；
        // 全部已满额时允许启动，由 qrCampaign 自动暂停、resumePending 次日恢复
        const slots = await waQrSvc.listSlots(req.workspace._id);
        if (!slots.some((s) => s.enabled && s.status === 'connected')) {
          return res.status(400).json({ success: false, message: '号池中没有已连接的网页版 WhatsApp 号码（请先在渠道页扫码连接）' });
        }
      } else {
        const st = await waQrSvc.getStatus(req.workspace._id);
        if (st.status !== 'connected') {
          return res.status(400).json({ success: false, message: 'WhatsApp by QR is not connected (scan the QR on the Channels page)' });
        }
      }
    } else if (campaign.sendChannel === 'whatsapp_chatapp') {
      if (!req.workspace.chatApp?.enabled || !req.workspace.chatApp?.isConnected) {
        return res.status(400).json({ success: false, message: 'Aliyun Chat App is not connected (add your AccessKey on the Channels page)' });
      }
    } else if (campaign.sendChannel === 'external_api') {
      // externalApiSlots 是 select:false，req.workspace 上拿不到，走服务显式查
      const usable = await require('../services/externalApiService').usableSlots(req.workspace._id);
      if (!usable.length) {
        return res.status(400).json({ success: false, message: '专线通道未开通（请联系平台配置）' });
      }
    } else if (!req.workspace.whatsapp?.isConnected) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected' });
    }

    // Drip campaigns run step-by-step via the drip scheduler.
    if (campaign.type === 'drip') {
      if (!campaign.dripSteps || !campaign.dripSteps.length) {
        return res.status(400).json({ success: false, message: 'Drip campaign needs at least one step' });
      }
      // SEC-CONC：原子转 scheduled，运行中/已完成的不可重复排队
      const q = await Campaign.findOneAndUpdate(
        { _id: campaign._id, workspace: req.workspace._id, status: { $in: ['draft', 'paused', 'scheduled', 'failed'] } },
        { $set: { status: 'scheduled', scheduledAt: new Date() } }, { new: true });
      if (!q) return res.status(409).json({ success: false, message: '任务已在运行中或已完成' });
      return res.json({ success: true, data: q });
    }

    // 启动前置校验：没有模板也没有预设消息的任务直接拒绝
    // （原先会在置为 running 之后 500，任务卡死在"运行中"）
    if (!campaign.template && !(campaign.presetMessage && String(campaign.presetMessage.body || '').trim())) {
      return res.status(400).json({ success: false, message: '任务缺少模板或预设消息，请先编辑后再启动' });
    }

    // SEC-CONC：原子抢占启动——只有 draft/paused/scheduled/failed 能转 running。
    // 原先不筛状态也无抢占：并发点 N 次"开始"= 受众收到 N 遍重复消息（实测复现）
    const claimed = await Campaign.findOneAndUpdate(
      { _id: campaign._id, workspace: req.workspace._id, status: { $in: ['draft', 'paused', 'scheduled', 'failed'] } },
      { $set: { status: 'running', startedAt: campaign.startedAt || new Date() } });
    if (!claimed) {
      return res.status(409).json({ success: false, message: '任务已在运行中或已完成，不能重复启动' });
    }
    campaign.status = 'running';

    await runCampaignCore(campaign, req.workspace, req.app.get('io'));
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/pause
const pauseCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, status: 'running' },
      { status: 'paused' },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found or not running' });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/schedule
const scheduleCampaign = async (req, res) => {
  try {
    const { scheduledAt, recurrence } = req.body;
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.type === 'drip') return res.status(400).json({ success: false, message: 'Drip campaigns run via their own step schedule' });
    if (!scheduledAt) return res.status(400).json({ success: false, message: 'scheduledAt required' });
    campaign.scheduledAt = new Date(scheduledAt);
    campaign.recurrence = recurrence || 'none';
    campaign.status = 'scheduled';
    await campaign.save();
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/campaigns/:id/ab-results — compare variant A vs B performance
const getAbResults = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const Message = require('../models/Message');
    const results = {};
    for (const variant of ['A', 'B']) {
      const msgs = await Message.find({
        workspace: req.workspace._id, 'metadata.campaignId': campaign._id, 'metadata.abVariant': variant,
      }).select('contact status createdAt').lean();
      const contactIds = msgs.map(m => m.contact).filter(Boolean);
      let replied = 0;
      if (contactIds.length > 0) {
        const replies = await Message.aggregate([
          { $match: { workspace: req.workspace._id, direction: 'inbound', contact: { $in: contactIds } } },
          { $group: { _id: '$contact', lastAt: { $max: '$createdAt' } } },
        ]);
        const sentAt = {};
        msgs.forEach(m => { if (m.contact) sentAt[m.contact.toString()] = m.createdAt; });
        replies.forEach(r => { const c = r._id.toString(); if (sentAt[c] && new Date(r.lastAt) > new Date(sentAt[c])) replied++; });
      }
      results[variant] = {
        sent: msgs.length,
        delivered: msgs.filter(m => ['delivered', 'read'].includes(m.status)).length,
        read: msgs.filter(m => m.status === 'read').length,
        failed: msgs.filter(m => m.status === 'failed').length,
        replied,
      };
    }
    res.json({ success: true, data: { abTest: campaign.abTest, results } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/campaigns/:id/report — per-recipient delivery report
const getCampaignReport = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('template', 'name');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const msgs = await Message.find({ workspace: req.workspace._id, 'metadata.campaignId': campaign._id })
      .populate('contact', 'name phone')
      .select('contact status errorMessage createdAt conversation')
      .sort({ createdAt: -1 })
      .lean();

    const counts = { total: msgs.length, sent: 0, delivered: 0, read: 0, failed: 0 };
    // contactId -> earliest campaign send time, plus name/phone for click attribution
    const sendInfo = {};
    const recipients = msgs.map(m => {
      const s = m.status || 'sent';
      if (s === 'read') counts.read++;
      else if (s === 'delivered') counts.delivered++;
      else if (s === 'failed') counts.failed++;
      else counts.sent++;
      const cid = m.contact?._id ? String(m.contact._id) : '';
      if (cid) {
        const at = new Date(m.createdAt).getTime();
        if (!sendInfo[cid] || at < sendInfo[cid].at) {
          sendInfo[cid] = { at, name: m.contact?.name || '', phone: m.contact?.phone || '' };
        }
      }
      return {
        phone: m.contact?.phone || '',
        name: m.contact?.name || '',
        status: s,
        error: m.errorMessage || '',
        at: m.createdAt,
        chatId: m.conversation ? String(m.conversation) : '',
        _cid: cid,
      };
    });
    // delivered/read are progressive: a read message was also delivered
    counts.deliveredTotal = counts.delivered + counts.read;
    counts.sentTotal = counts.sent + counts.delivered + counts.read;

    // Replies & button clicks: inbound messages from these recipients AFTER their campaign send.
    // Quick-reply / interactive button taps come back as inbound messages whose text is the button label.
    const contactIds = Object.keys(sendInfo);
    const repliedSet = new Set();
    const buttonMap = {}; // label -> { label, count, seen:Set<cid>, contacts:[{name,phone}] }
    if (contactIds.length) {
      const inbound = await Message.find({
        workspace: req.workspace._id,
        contact: { $in: contactIds },
        direction: 'inbound',
      }).select('contact type text createdAt').sort({ createdAt: 1 }).lean();
      for (const m of inbound) {
        const cid = m.contact ? String(m.contact) : '';
        const info = sendInfo[cid];
        if (!info) continue;
        if (new Date(m.createdAt).getTime() < info.at) continue; // before this recipient got the campaign
        repliedSet.add(cid);
        if ((m.type === 'button' || m.type === 'interactive') && (m.text || '').trim()) {
          const label = m.text.trim();
          if (!buttonMap[label]) buttonMap[label] = { label, count: 0, seen: new Set(), contacts: [] };
          const b = buttonMap[label];
          if (!b.seen.has(cid)) {
            b.seen.add(cid);
            b.count++;
            b.contacts.push({ name: info.name, phone: info.phone });
          }
        }
      }
    }
    counts.replied = repliedSet.size;
    recipients.forEach(r => { r.replied = repliedSet.has(r._cid); delete r._cid; });
    const buttons = Object.values(buttonMap)
      .map(b => ({ label: b.label, count: b.count, contacts: b.contacts }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        campaign: { _id: campaign._id, name: campaign.name, status: campaign.status, template: campaign.template?.name || '', createdAt: campaign.createdAt },
        counts,
        recipients,
        buttons,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/campaigns/:id/resend-failed — re-send the template to recipients of a
// chosen category (failed by default; also sent / delivered / read / all for retargeting).
const resendFailed = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('template');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!req.workspace.whatsapp?.isConnected) return res.status(400).json({ success: false, message: 'WhatsApp not connected' });

    // Optionally resend using a different chosen template; default = campaign's own template
    let tpl = campaign.template;
    if (req.body && req.body.templateId) {
      tpl = await Template.findOne({ _id: req.body.templateId, workspace: req.workspace._id });
      if (!tpl) return res.status(400).json({ success: false, message: 'Selected template not found' });
      if (tpl.status !== 'approved') return res.status(400).json({ success: false, message: 'Selected template is not approved yet' });
    }
    if (!tpl) return res.status(400).json({ success: false, message: 'No template to resend — select an approved template' });

    // Which category to (re)send to. 'failed' keeps the old delete-and-replace behaviour;
    // the others are retargeting — a fresh message is sent without touching the original record.
    const audienceMap = {
      failed: ['failed'],
      sent: ['sent'],
      delivered: ['delivered', 'read'],
      read: ['read'],
      all: ['sent', 'delivered', 'read', 'failed'],
    };
    const audience = String((req.body && req.body.audience) || 'failed').toLowerCase();
    const statuses = audienceMap[audience] || audienceMap.failed;
    const isFailedResend = audience === 'failed';

    const matched = await Message.find({ workspace: req.workspace._id, 'metadata.campaignId': campaign._id, status: { $in: statuses } })
      .populate('contact', 'name phone profileName email customFields')
      .lean();
    // Dedupe by contact so a recipient with several campaign messages is targeted once.
    const seenContacts = new Set();
    const failedMsgs = [];
    for (const m of matched) {
      const cid = m.contact?._id ? String(m.contact._id) : '';
      if (!cid || seenContacts.has(cid)) continue;
      seenContacts.add(cid);
      failedMsgs.push(m);
    }
    if (!failedMsgs.length) return res.json({ success: true, data: { resent: 0, failed: 0, message: 'No recipients to resend' } });

    const validSenderIds = [
      req.workspace.whatsapp.phoneNumberId,
      ...(req.workspace.whatsapp.extraNumbers || []).map((n) => n.phoneNumberId),
    ].filter(Boolean);
    const senderId = campaign.senderNumberId && validSenderIds.includes(campaign.senderNumberId)
      ? campaign.senderNumberId : req.workspace.whatsapp.phoneNumberId;
    const _rCreds = require('../utils/waSender').resolveWaCreds(req.workspace.whatsapp, senderId);
    const waService = new WhatsAppService(_rCreds.accessToken, _rCreds.phoneNumberId);
    const workspaceId = req.workspace._id;

    // Rebuild template components (header media + body variables)
    const tplComponents = [];
    const tplHeader = tpl.header;
    if (tplHeader && ['image', 'video', 'document'].includes(tplHeader.type)) {
      let headerLink = (campaign.variables && campaign.variables._headerMediaUrl) || tplHeader.mediaUrl || '';
      if (!headerLink) {
        try { headerLink = await require('./templateController').ensureTemplateHeaderMedia(tpl, req.workspace); } catch (e) { /* noop */ }
      }
      if (headerLink) {
        tplComponents.push({ type: 'header', parameters: [{ type: tplHeader.type, [tplHeader.type]: { link: headerLink } }] });
      }
    }
    // Carousel cards must be rebuilt too, otherwise a resend delivers the body without any card.
    // The campaign's per-card media overrides only apply when resending its own template.
    try {
      if (tpl.carousel?.cards?.length) {
        const ownTemplate = !(req.body && req.body.templateId);
        const cards = tpl.carousel.cards.map((c, i) => {
          const override = ownTemplate && campaign.variables && campaign.variables['_carouselMedia' + i];
          if (!override) return c;
          const plain = typeof c.toObject === 'function' ? c.toObject() : c;
          return { ...plain, mediaUrl: override };
        });
        tplComponents.push(require('../utils/carousel').buildCarouselComponent(cards));
      }
      if (tpl.buttons?.some((b) => b.type === 'catalog')) {
        tplComponents.push({ type: 'button', sub_type: 'catalog', index: 0, parameters: [{ type: 'action', action: {} }] });
      }
    } catch (e) { /* noop */ }
    const vars = campaign.variables || {};
    const varMatches = (tpl.body || '').match(/\{\{\d+\}\}/g) || [];
    if (varMatches.length > 0) {
      tplComponents.push({ type: 'body', parameters: varMatches.map((m) => {
        const num = m.replace(/[{}]/g, '');
        return { type: 'text', text: vars[num] || vars['var' + num] || '-' };
      }) });
    }
    if (tplHeader && tplHeader.type === 'text') {
      const hdrMatches = (tplHeader.content || '').match(/\{\{\d+\}\}/g) || [];
      if (hdrMatches.length > 0) {
        tplComponents.push({ type: 'header', parameters: hdrMatches.map((m) => {
          const num = m.replace(/[{}]/g, '');
          return { type: 'text', text: vars['h' + num] || vars['header' + num] || '{contact_name}' };
        }) });
      }
    }

    try {
      const _ubComps = require('../utils/templateButtons').buildUrlButtonComponents(tpl.buttons, (b) => {
        const num = ((b.value || '').match(/\{\{(\d+)\}\}/) || [])[1] || '1';
        return vars['btn' + num] || vars['button' + num] || vars['url' + num] || '{contact_name}';
      });
      if (_ubComps.length) tplComponents.push(..._ubComps);
    } catch (e) { /* noop */ }

    let resent = 0, stillFailed = 0;
    const emitSeen = new Set();
    res.json({ success: true, data: { started: failedMsgs.length, message: `Resending to ${failedMsgs.length} ${audience} recipient(s)...` } });

    setImmediate(async () => {
      const io = req.app.get('io');
      for (const fm of failedMsgs) {
        const contact = fm.contact;
        const toPhone = toWaNumber(contact?.phone);
        if (!toPhone) { stillFailed++; continue; }
        try {
          const comps = JSON.parse(JSON.stringify(tplComponents));
          const bodyComp = comps.find(c => c.type === 'body');
          if (bodyComp) {
            bodyComp.parameters = bodyComp.parameters.map(p => ({
              ...p,
              text: applyContactVars(p.text, contact),
            }));
          }
          const headerComp = comps.find(c => c.type === 'header' && Array.isArray(c.parameters) && c.parameters.some(p => p.type === 'text'));
          if (headerComp) {
            headerComp.parameters = headerComp.parameters.map(p => (p.type === 'text' ? {
              ...p,
              text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 60),
            } : p));
          }
          comps.filter(c => String(c.sub_type || '') === 'url' && Array.isArray(c.parameters)).forEach(bc => {
            bc.parameters = bc.parameters.map(p => (p.type === 'text' ? { ...p, text: (applyContactVars(p.text, contact) || '-').replace(/[\n\t]+/g, ' ').slice(0, 2000) } : p));
          });
          const result = await waService.sendTemplateMessage(toPhone, tpl.name, tpl.language, comps);
          if (result.success) {
            resent++;
            // Failed resend replaces the old failed record; retargeting keeps the original
            // record intact and just logs a fresh outbound message.
            if (isFailedResend) await Message.deleteOne({ _id: fm._id });
            const conversation = await Conversation.findOneAndUpdate(
              { workspace: workspaceId, contact: contact._id },
              { workspace: workspaceId, contact: contact._id, status: 'active', lastMessage: { text: `Template: ${tpl.name}`, timestamp: new Date(), direction: 'outbound', type: 'template' } },
              { upsert: true, new: true }
            );
            const cMsg = await Message.create({
              workspace: workspaceId, conversation: conversation._id, contact: contact._id,
              direction: 'outbound', type: 'template', text: tpl.body || tpl.name,
              template: { name: tpl.name },
              waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent',
              metadata: { source: 'campaign', campaignId: campaign._id },
            });
            emitCampaignMsg(io, workspaceId, conversation, cMsg, emitSeen);
          } else {
            stillFailed++;
            if (isFailedResend) await Message.updateOne({ _id: fm._id }, { errorMessage: String(result.error?.message || result.error || 'Send failed'), createdAt: new Date() });
          }
        } catch (e) { stillFailed++; }
      }
      console.log(`[Campaign resend] ${campaign.name}: resent=${resent}, stillFailed=${stillFailed}`);
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// On boot, resume any campaign left "running" by a previous restart/crash so it
// finishes sending to the remaining recipients (already-sent contacts skipped
// by the resume-safe dedupe inside runCampaignCore).
const resumeRunningCampaigns = async (io) => {
  try {
    const Workspace = require('../models/Workspace');
    const running = await Campaign.find({ status: 'running', type: { $ne: 'drip' } }).populate('template').populate('presetMessage');
    let n = 0;
    for (const campaign of running) {
      const workspace = await Workspace.findById(campaign.workspace);
      if (!workspace) continue;
      n++;
      runCampaignCore(campaign, workspace, io).catch((e) => console.error('[Campaign] resume run error:', e.message));
    }
    if (n) console.log(`[Campaign] resuming ${n} running campaign(s) after restart`);
  } catch (e) { console.error('[Campaign] resume scan error:', e.message); }
};

module.exports = {
  getCampaigns, createCampaign, getCampaign, updateCampaign,
  deleteCampaign, startCampaign, pauseCampaign, scheduleCampaign, runCampaignCore, getAbResults,
  getCampaignReport, resendFailed, resumeRunningCampaigns,
};
