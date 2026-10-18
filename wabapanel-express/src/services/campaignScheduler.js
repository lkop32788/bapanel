const Campaign = require('../models/Campaign');
const Workspace = require('../models/Workspace');

class CampaignScheduler {
  constructor(io) { this.io = io; }

  start() {
    setInterval(() => this.tick().catch(e => console.error('[CampaignScheduler]', e.message)), 60 * 1000);
    console.log('Campaign scheduler started');
  }

  async tick() {
    const due = await Campaign.find({
      status: 'scheduled',
      type: { $ne: 'drip' },
      scheduledAt: { $lte: new Date() },
    }).populate('template').populate('presetMessage');
    for (const campaign of due) {
      try {
        const workspace = await Workspace.findById(campaign.workspace);
        if (!workspace) continue;
        const usesOwnChannel = campaign.sendChannel === 'whatsapp_qr' || campaign.sendChannel === 'whatsapp_chatapp';
        if (!usesOwnChannel && !workspace.whatsapp?.isConnected) continue;
        // Atomic claim: only one tick/process may start this campaign.
        const claimed = await Campaign.findOneAndUpdate({ _id: campaign._id, status: 'scheduled' }, { $set: { status: 'running' } });
        if (!claimed) continue;
        campaign.status = 'running';
        const { runCampaignCore } = require('../controllers/campaignController');
        console.log('[CampaignScheduler] running scheduled campaign', String(campaign._id), campaign.name);
        await runCampaignCore(campaign, workspace, this.io);
      } catch (e) {
        console.error('[CampaignScheduler] run failed', String(campaign._id), e.message);
      }
    }
  }
}

module.exports = CampaignScheduler;
