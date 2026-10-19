const Workspace = require('../models/Workspace');
const User = require('../models/User');
const WhatsAppService = require('../services/whatsappService');
const axios = require('axios');
const SystemSettings = require('../models/SystemSettings');

// @GET /api/workspaces
const getWorkspaces = async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id },
      ],
    }).populate('owner', 'name email');

    res.json({ success: true, data: workspaces });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/workspaces
const createWorkspace = async (req, res) => {
  try {
    const { name } = req.body;
    const workspace = await Workspace.create({
      name,
      owner: req.user._id,
      members: [{ user: req.user._id, role: 'owner' }],
    });

    res.status(201).json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/workspaces/:id
const getWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email avatar role');

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/workspaces/:id
const updateWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // SEC-IDOR：禁止经此接口改写的字段——owner 换绑会让 featureGate 按新 owner 判定
    // （付费开关绕过）、members 整组覆盖可夺权、waQr.dailyLimit 有专门接口且封顶 2000
    const body = { ...req.body };
    for (const k of ['owner', 'members', 'status', 'waQr', '_id', 'createdAt', 'updatedAt', '__v']) delete body[k];
    Object.assign(workspace, body);

    // Connecting a Telegram bot: validate the token and register the webhook
    if (req.body.telegram && req.body.telegram.enabled && req.body.telegram.botToken) {
      try {
        const tg = require('../services/telegramService');
        const me = await tg.getMe(req.body.telegram.botToken);
        workspace.telegram.botUsername = me?.username || '';
        await tg.setWebhook(req.body.telegram.botToken, workspace._id);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Telegram bot token is invalid: ' + (e.response?.data?.description || e.message) });
      }
    }

    // Aliyun Chat App: no lightweight "verify credentials" API is published,
    // so just require the fields needed to sign/route requests; real
    // send/receive errors surface later into chatApp.lastError.
    if (req.body.chatApp) {
      const ca = req.body.chatApp;
      if (ca.enabled) {
        if (!ca.accessKeyId || !ca.accessKeySecret || !ca.custSpaceId || !ca.phoneNumber) {
          return res.status(400).json({ success: false, message: 'Aliyun Chat App requires AccessKey ID, AccessKey Secret, CustSpaceId and a sender phone number' });
        }
        workspace.chatApp.isConnected = true;
        workspace.chatApp.lastError = '';
      } else {
        workspace.chatApp.isConnected = false;
      }
    }

    // Connecting Facebook Messenger / Instagram: subscribe the Page so its
    // messages reach our webhook.
    const mc = req.body.metaChat;
    if (mc && (mc.fbEnabled || mc.igEnabled) && mc.pageId && mc.pageAccessToken) {
      try {
        // Subscribe the Page to whichever app the token belongs to, so that
        // app forwards the Page's messages to our webhook. The Messenger app's
        // webhook must point to /api/webhook/whatsapp (any app is fine).
        await axios.post(
          `https://graph.facebook.com/v21.0/${mc.pageId}/subscribed_apps`,
          { subscribed_fields: 'messages,messaging_postbacks,message_reads,message_reactions' },
          { headers: { Authorization: `Bearer ${mc.pageAccessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        console.log('[Messenger] Page subscribed for webhooks:', mc.pageId);
        // Resolve the Instagram Business Account id linked to this Page and store it,
        // because Instagram messaging webhooks arrive with that id as entry.id. If the
        // client saved a different id, incoming IG DMs would not match this workspace.
        if (mc.igEnabled) {
          try {
            const igResp = await axios.get(
              `https://graph.facebook.com/v21.0/${mc.pageId}`,
              { params: { fields: 'instagram_business_account,connected_instagram_account', access_token: mc.pageAccessToken }, timeout: 10000 }
            );
            const igId = igResp.data?.instagram_business_account?.id || igResp.data?.connected_instagram_account?.id;
            if (igId) workspace.metaChat.igAccountId = String(igId);
          } catch (e) {
            console.error('[Instagram] IG account resolve failed:', e.response?.data?.error?.message || e.message);
          }
        }

        // Auto-configure the Facebook app's Messenger/Instagram webhook so this panel's
        // domain receives FB/IG events, without any manual Meta Dashboard step. Requires
        // the admin to have saved the Facebook App ID + Secret in Admin -> Settings.
        try {
          const settings = await SystemSettings.findOne();
          const fbAppId = settings?.facebook?.appId;
          const fbAppSecret = settings?.facebook?.appSecret;
          if (fbAppId && fbAppSecret) {
            const base = (process.env.BACKEND_URL || process.env.API_URL || '').replace(/\/$/, '');
            const callbackUrl = `${base}/api/webhook/whatsapp`;
            const verifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
            const appAccessToken = `${fbAppId}|${fbAppSecret}`;
            const objects = [];
            if (mc.fbEnabled) objects.push({ object: 'page', fields: 'messages,messaging_postbacks,message_reads,message_reactions,messaging_handovers' });
            if (mc.igEnabled) objects.push({ object: 'instagram', fields: 'messages,messaging_postbacks,messaging_referral,message_reactions,comments,live_comments,mentions' });
            for (const o of objects) {
              try {
                await axios.post(
                  `https://graph.facebook.com/v21.0/${fbAppId}/subscriptions`,
                  null,
                  { params: { object: o.object, callback_url: callbackUrl, verify_token: verifyToken, fields: o.fields, access_token: appAccessToken }, timeout: 10000 }
                );
                console.log(`[Messenger] App webhook set for object=${o.object} -> ${callbackUrl}`);
              } catch (e) {
                console.error(`[Messenger] App webhook set failed (object=${o.object}):`, e.response?.data?.error?.message || e.message);
              }
            }
          }
        } catch (e) {
          console.error('[Messenger] App webhook auto-config error:', e.message);
        }
      } catch (e) {
        const fbMsg = e.response?.data?.error?.message || e.message;
        return res.status(400).json({ success: false, message: 'Facebook Page could not be connected: ' + fbMsg });
      }
    }

    await workspace.save();

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/workspaces/:id/members
const addMember = async (req, res) => {
  try {
    const { email, role } = req.body;
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const existing = workspace.members.find(m => m.user.toString() === user._id.toString());
    if (existing) {
      return res.status(400).json({ success: false, message: 'User already a member' });
    }

    workspace.members.push({ user: user._id, role: role || 'agent' });
    await workspace.save();

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/workspaces/:id/members/:userId
const removeMember = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    workspace.members = workspace.members.filter(
      m => m.user.toString() !== req.params.userId
    );
    await workspace.save();

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/workspaces/:id
const deleteWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this workspace' });
    }

    await Workspace.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Workspace deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/workspaces/:id/whatsapp
const updateWhatsAppConfig = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    const updateData = { ...req.body };

    // When connecting via manual method, fetch phone details from Meta API
    if (updateData.isConnected && updateData.accessToken && updateData.phoneNumberId) {
      try {
        const waService = new WhatsAppService(updateData.accessToken, updateData.phoneNumberId);
        const phoneDetails = await waService.getPhoneNumberDetails();
        if (phoneDetails) {
          updateData.displayName = phoneDetails.verified_name || '';
          updateData.phoneNumber = phoneDetails.display_phone_number || '';
          updateData.qualityRating = phoneDetails.quality_rating || '';
        }
      } catch (metaErr) {
        console.error('Meta API fetch phone details error:', metaErr.response?.data || metaErr.message);
      }

      // Disconnect same WABA/phone from any OTHER workspace
      const wabaToCheck = updateData.wabaId || '';
      const phoneToCheck = updateData.phoneNumberId || '';
      if (wabaToCheck || phoneToCheck) {
        try {
          const query = { _id: { $ne: workspace._id } };
          if (wabaToCheck && phoneToCheck) {
            query.$or = [{ 'whatsapp.wabaId': wabaToCheck }, { 'whatsapp.phoneNumberId': phoneToCheck }];
          } else if (wabaToCheck) {
            query['whatsapp.wabaId'] = wabaToCheck;
          } else {
            query['whatsapp.phoneNumberId'] = phoneToCheck;
          }
          const others = await Workspace.find(query);
          for (const other of others) {
            console.log('[WhatsApp] Auto-disconnecting WABA from workspace:', other._id.toString(), other.whatsapp?.wabaId);
            try { await require('../services/ownerNotify').disconnectAlert(other); } catch (e) { /* noop */ }
            other.whatsapp = { ...other.whatsapp.toObject(), isConnected: false, accessToken: '', wabaId: '', phoneNumberId: '', displayName: '', phoneNumber: '' };
            await other.save();
          }
          if (others.length) console.log('[WhatsApp] Disconnected', others.length, 'other workspace(s) using same WABA/phone');
        } catch (dcErr) {
          console.error('[WhatsApp] Auto-disconnect check error:', dcErr.message);
        }
      }

      // Auto-subscribe webhook so messages come to WabaPanel
      if (updateData.wabaId) {
        try {
          const settings = await SystemSettings.findOne();
          const verifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
          const webhookUrl = `${(process.env.BACKEND_URL || 'https://api.wabapanel.com').replace(/\/$/, '')}/api/webhook/whatsapp`;
          // Subscribe app to the WABA
          await axios.post(
            `https://graph.facebook.com/v21.0/${updateData.wabaId}/subscribed_apps`,
            { override_callback_uri: webhookUrl, verify_token: verifyToken },
            { headers: { Authorization: `Bearer ${updateData.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
          );
          // Also register the phone number for webhooks
          await axios.post(
            `https://graph.facebook.com/v21.0/${updateData.phoneNumberId}/register`,
            { messaging_product: 'whatsapp', pin: '123456' },
            { headers: { Authorization: `Bearer ${updateData.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
          ).catch(() => {});
          console.log('[WhatsApp] Webhook + phone registration done for WABA:', updateData.wabaId);
        } catch (whErr) {
          console.error('[WhatsApp] Webhook subscription failed:', whErr.response?.data || whErr.message);
        }
      }
    }

    // Merge with existing whatsapp config
    const existingWa = workspace.whatsapp ? workspace.whatsapp.toObject() : {};
    workspace.whatsapp = { ...existingWa, ...updateData };
    await workspace.save();

    // For extra numbers on a DIFFERENT WABA (own access token + WABA id), subscribe the
    // app + register the phone so their inbound messages reach this panel. Best-effort.
    try {
      const extras = (workspace.whatsapp.extraNumbers || []).filter((n) => n && n.accessToken && n.wabaId);
      if (extras.length) {
        const settings = await SystemSettings.findOne();
        const verifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
        const webhookUrl = `${(process.env.BACKEND_URL || 'https://api.wabapanel.com').replace(/\/$/, '')}/api/webhook/whatsapp`;
        for (const n of extras) {
          try {
            await axios.post(
              `https://graph.facebook.com/v21.0/${n.wabaId}/subscribed_apps`,
              { override_callback_uri: webhookUrl, verify_token: verifyToken },
              { headers: { Authorization: `Bearer ${n.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
            );
            await axios.post(
              `https://graph.facebook.com/v21.0/${n.phoneNumberId}/register`,
              { messaging_product: 'whatsapp', pin: '123456' },
              { headers: { Authorization: `Bearer ${n.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
            ).catch(() => {});
          } catch (e) {
            console.error('[WhatsApp] Extra-number webhook subscribe failed:', n.phoneNumberId, e.response?.data?.error?.message || e.message);
          }
        }
      }
    } catch (e) { /* noop */ }

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const refreshWhatsAppDetails = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    const wa = workspace.whatsapp;
    if (!wa || !wa.accessToken || !wa.phoneNumberId) return res.status(400).json({ success: false, message: 'WhatsApp not connected or credentials missing' });
    const waService = new WhatsAppService(wa.accessToken, wa.phoneNumberId);
    const phoneDetails = await waService.getPhoneNumberDetails();
    if (phoneDetails) {
      workspace.whatsapp.displayName = phoneDetails.verified_name || '';
      workspace.whatsapp.phoneNumber = phoneDetails.display_phone_number || '';
      workspace.whatsapp.qualityRating = phoneDetails.quality_rating || '';
      await workspace.save();
    }
    res.json({ success: true, data: workspace });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    res.status(500).json({ success: false, message: msg });
  }
};

// @GET /api/workspaces/:id/whatsapp/health — live status from Meta Graph API
// WhatsApp 深诊断（前端 WhatsApp 设置页「诊断连接」）。?fix=1 时自动纠正 WABA ID 并重订阅。
const diagnoseWhatsApp = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    const wa = workspace.whatsapp || {};
    const out = {
      ok: true, issues: [], savedWabaId: wa.wabaId || '', grantedWabaIds: [],
      tokenValid: null, tokenAppId: '', scopes: [], appSubscribed: null, fixedWabaId: '',
      templateAccess: '', messagingAccess: '', wabaReviewStatus: '',
      businessVerificationStatus: '', wabaOwnerBusiness: '', wabaSharedWithBusiness: '', wabaTasks: [],
    };
    if (!wa.accessToken || !wa.phoneNumberId) {
      out.ok = false;
      out.issues.push('缺少 accessToken 或 phoneNumberId：请先连接 WhatsApp');
      return res.json({ success: true, data: out });
    }
    const headers = { Authorization: `Bearer ${wa.accessToken}` };

    // 1) 令牌有效性 + 号码状态
    try {
      const r = await axios.get(`https://graph.facebook.com/v21.0/${wa.phoneNumberId}`, {
        headers, timeout: 15000, params: { fields: 'display_phone_number,status,quality_rating' },
      });
      out.tokenValid = true;
      out.messagingAccess = r.data?.status || '';
    } catch (e) {
      const err = e.response?.data?.error;
      if (err && (err.code === 190 || err.type === 'OAuthException')) {
        out.tokenValid = false;
        out.issues.push(`访问令牌无效：${err.message}`);
      } else {
        out.issues.push(`号码查询失败：${err?.message || e.message}`);
      }
    }

    // 2) debug_token：应用归属、权限范围、被授予的 WABA（需要管理员配置的 App ID/Secret）
    try {
      const SystemSettings = require('../models/SystemSettings');
      const s = await SystemSettings.findOne().select('whatsapp').lean();
      const appId = s?.whatsapp?.appId, appSecret = s?.whatsapp?.appSecret;
      if (appId && appSecret) {
        const r = await axios.get('https://graph.facebook.com/v21.0/debug_token', {
          timeout: 15000,
          params: { input_token: wa.accessToken, access_token: `${appId}|${appSecret}` },
        });
        const d = r.data?.data || {};
        out.tokenAppId = String(d.app_id || '');
        out.scopes = d.scopes || [];
        for (const g of d.granular_scopes || []) {
          if (['whatsapp_business_management', 'whatsapp_business_messaging'].includes(g.scope)) {
            for (const id of g.target_ids || []) if (!out.grantedWabaIds.includes(id)) out.grantedWabaIds.push(id);
          }
        }
        if (out.savedWabaId && out.grantedWabaIds.length && !out.grantedWabaIds.includes(out.savedWabaId)) {
          out.issues.push(`保存的 WABA ID（${out.savedWabaId}）不在令牌被授予的范围内（${out.grantedWabaIds.join(', ')}）`);
        }
      }
    } catch (e) {
      // 没配 App Secret 或 debug 失败不致命
    }

    // ?fix=1：令牌只授予了一个 WABA 而保存的不对 → 自动纠正
    if (String(req.query.fix) === '1' && out.grantedWabaIds.length === 1 &&
        out.savedWabaId !== out.grantedWabaIds[0]) {
      workspace.whatsapp.wabaId = out.grantedWabaIds[0];
      await workspace.save();
      out.fixedWabaId = out.grantedWabaIds[0];
      out.savedWabaId = out.grantedWabaIds[0];
    }

    // 3) Webhook 订阅 + WABA 元信息 + 模板权限
    const wabaId = out.savedWabaId;
    if (wabaId) {
      try {
        const r = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, { headers, timeout: 15000 });
        out.appSubscribed = (r.data?.data || []).length > 0;
        if (!out.appSubscribed) {
          if (String(req.query.fix) === '1') {
            try {
              await axios.post(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {}, { headers, timeout: 15000 });
              out.appSubscribed = true;
            } catch (e2) {
              out.issues.push(`Webhook 自动订阅失败：${e2.response?.data?.error?.message || e2.message}`);
            }
          } else {
            out.issues.push('没有应用订阅此 WABA（收不到入站消息）——带修复重跑可自动订阅');
          }
        }
      } catch (e) {
        out.issues.push(`Webhook 订阅检查失败：${e.response?.data?.error?.message || e.message}`);
      }
      try {
        const r = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}`, {
          headers, timeout: 15000,
          params: { fields: 'account_review_status,owner_business_info{name},on_behalf_of_business_info{name},health_status' },
        });
        out.wabaReviewStatus = r.data?.account_review_status || '';
        out.wabaOwnerBusiness = r.data?.owner_business_info?.name || '';
        out.wabaSharedWithBusiness = r.data?.on_behalf_of_business_info?.name || '';
      } catch (e) { /* 元信息失败不致命 */ }
      try {
        await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
          headers, timeout: 15000, params: { limit: 1 },
        });
        out.templateAccess = 'OK';
      } catch (e) {
        out.templateAccess = e.response?.data?.error?.message || e.message;
        out.issues.push(`模板访问失败：${out.templateAccess}`);
      }
    } else {
      out.issues.push('未保存 WABA ID：模板和 Webhook 相关功能不可用');
    }

    out.ok = out.issues.length === 0;
    res.json({ success: true, data: out });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getWhatsAppHealth = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    const wa = workspace.whatsapp;
    if (!wa || !wa.accessToken || !wa.phoneNumberId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected or credentials missing' });
    }
    const headers = { Authorization: `Bearer ${wa.accessToken}` };
    const result = { tokenValid: true, phone: null, waba: null, errors: [] };
    try {
      const r = await axios.get(`https://graph.facebook.com/v21.0/${wa.phoneNumberId}`, {
        headers, timeout: 15000,
        params: { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,name_status,messaging_limit_tier,status,throughput' },
      });
      result.phone = r.data;
    } catch (e) {
      const err = e.response?.data?.error;
      if (err && (err.code === 190 || err.type === 'OAuthException')) result.tokenValid = false;
      result.errors.push(err?.message || e.message);
    }
    const wabaId = wa.wabaId || wa.businessAccountId;
    if (wabaId) {
      try {
        const r = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}`, {
          headers, timeout: 15000,
          params: { fields: 'name,account_review_status,business_verification_status,country,ownership_type,message_template_namespace' },
        });
        result.waba = r.data;
      } catch (e) {
        // some fields need extra permissions — retry with basic fields
        try {
          const r2 = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}`, {
            headers, timeout: 15000, params: { fields: 'name,account_review_status' },
          });
          result.waba = r2.data;
        } catch (e2) {
          result.errors.push(e2.response?.data?.error?.message || e2.message);
        }
      }
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
};

module.exports = {
  getWorkspaces, createWorkspace, getWorkspace, updateWorkspace,
  deleteWorkspace, addMember, removeMember, updateWhatsAppConfig, refreshWhatsAppDetails, getWhatsAppHealth, diagnoseWhatsApp,
};


