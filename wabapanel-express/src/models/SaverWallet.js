const mongoose = require('mongoose');

// 省钱专家：商家积分钱包（计量收费）
const saverWalletSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  balance: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('SaverWallet', saverWalletSchema);
