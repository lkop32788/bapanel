// 管理员密码重置脚本 - 用法: node reset-admin-password.js [新密码] [邮箱]
// 默认重置 admin@qq.com 为 Admin@123456
require('dotenv').config();
const mongoose = require('mongoose');
async function main(){
  const newPassword = process.argv[2] || 'Admin@123456';
  const email = (process.argv[3] || 'admin@qq.com').toLowerCase();
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wabapanel');
  const User = require('./src/models/User');
  const u = await User.findOne({ email });
  if(!u){ console.error('用户不存在:',email); const all=await User.find({},{email:1,role:1}); console.log(all); process.exit(1); }
  u.password = newPassword;
  u.twoFactorEnabled=false; u.twoFactorSecret=''; u.twoFactorEmailOTP=''; u.status='active'; u.emailVerified=true;
  await u.save();
  console.log(`✅ 已重置 ${u.email} (${u.role}) 密码为: ${newPassword}`);
  console.log(`验证: ${await u.matchPassword(newPassword) ? '通过' : '失败'}`);
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
