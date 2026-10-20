#!/usr/bin/env node
// 云仓历史数据导入脚本
// 用法：
//   node import-cache.js --kind wsOpen   --valid true  --file ws_open.txt
//   node import-cache.js --kind wsActive --valid true  --file ws_active.txt
//   node import-cache.js --kind tgOpen   --valid true  --file tg_open.txt
//   node import-cache.js --help
//
// 支持的 kind 值（见 main.go taskTypes）：
//   wsOpen wsActive wsGender tgOpen tgActive tgGender
//   fbValid fbGender insValid twitterValid snapchatValid
//   viberValid viberActive zaloValid zaloActive
//   wxValid lineValid signalValid botimValid
//   phoneCheck phoneActive operatorStandard
//   binanceValid okxValid ... 其余同名
//
// --valid 默认 true（已开通/有效），传 false 表示无效号码
// --extra 可选附加信息（如性别 M/F，年龄等），整批统一写入
// --mongo  MongoDB URI（默认 mongodb://127.0.0.1:27017）
// --db     数据库名（默认 yuncang）
// --dry    只解析不写库（预览条数）

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const a = process.argv.slice(2);
  const r = { kind: '', file: '', valid: true, extra: '', mongo: 'mongodb://127.0.0.1:27017', db: 'yuncang', dry: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--help') { printHelp(); process.exit(0); }
    if (a[i] === '--kind')  { r.kind  = a[++i]; continue; }
    if (a[i] === '--file')  { r.file  = a[++i]; continue; }
    if (a[i] === '--valid') { r.valid = a[++i] !== 'false'; continue; }
    if (a[i] === '--extra') { r.extra = a[++i]; continue; }
    if (a[i] === '--mongo') { r.mongo = a[++i]; continue; }
    if (a[i] === '--db')    { r.db    = a[++i]; continue; }
    if (a[i] === '--dry')   { r.dry   = true;   continue; }
  }
  return r;
}

function printHelp() {
  console.log(`
云仓历史数据导入脚本

用法：
  node import-cache.js --kind <kind> --file <file.txt> [选项]

必填：
  --kind   缓存命名空间（见下方列表）
  --file   数据文件路径（txt/csv，每行一个号码，# 或 // 开头的行跳过）

选项：
  --valid  true|false  是否有效（默认 true）
  --extra  附加信息，整批统一（如 M 表示男性）
  --mongo  MongoDB URI（默认 mongodb://127.0.0.1:27017）
  --db     数据库名（默认 yuncang）
  --dry    只解析，不写入（查看条数）

常用 kind 值：
  wsOpen      WS 已开通（有效）/ WS 未注册（--valid false）
  wsActive    WS 筛活跃
  wsGender    WS 性别年龄（--extra M 或 F）
  tgOpen      TG 已开通
  tgActive    TG 筛活跃
  tgGender    TG 性别年龄
  fbValid     Facebook 已开通
  insValid    Instagram 已开通
  viberValid  Viber 已开通
  zaloValid   Zalo 已开通
  phoneCheck  空号检测

示例：
  # 导入一批 WS 已开通号码
  node import-cache.js --kind wsOpen --valid true --file ws_valid.txt

  # 导入一批 TG 活跃号码
  node import-cache.js --kind tgActive --valid true --file tg_active.txt

  # 标记一批号码为 WS 未注册（下次提交直接命中缓存，返回无效）
  node import-cache.js --kind wsOpen --valid false --file ws_invalid.txt

  # 先预览不写库
  node import-cache.js --kind wsOpen --file ws_valid.txt --dry
`);
}

function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const nums = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith('//')) continue;
    // 取第一列（csv 支持）
    const col = s.split(/[,;\t]/)[0].trim();
    // 去掉 + 号，保留纯数字
    const digits = col.replace(/\D/g, '');
    if (digits.length >= 6 && digits.length <= 17) {
      nums.push(digits);
    }
  }
  return nums;
}

async function run() {
  const args = parseArgs();
  if (!args.kind) { console.error('错误：缺少 --kind'); process.exit(1); }
  if (!args.file) { console.error('错误：缺少 --file'); process.exit(1); }
  if (!fs.existsSync(args.file)) { console.error('错误：文件不存在：' + args.file); process.exit(1); }

  const nums = parseFile(args.file);
  console.log(`解析完成：${nums.length} 条号码，kind=${args.kind} valid=${args.valid} extra="${args.extra}"`);

  if (args.dry) {
    console.log('--dry 模式，不写入数据库。前5条预览：');
    nums.slice(0, 5).forEach(n => console.log(' ', n));
    return;
  }

  if (nums.length === 0) { console.log('没有可导入的号码，退出。'); return; }

  const client = new MongoClient(args.mongo);
  await client.connect();
  const col = client.db(args.db).collection('cache');
  const now = Math.floor(Date.now() / 1000);
  const BATCH = 2000;
  let total = 0;

  for (let i = 0; i < nums.length; i += BATCH) {
    const batch = nums.slice(i, i + BATCH);
    const ops = batch.map(v => ({
      replaceOne: {
        filter: { kind: args.kind, value: v },
        replacement: { kind: args.kind, value: v, valid: args.valid, extra: args.extra, checkedAt: now },
        upsert: true,
      },
    }));
    await col.bulkWrite(ops, { ordered: false });
    total += batch.length;
    process.stdout.write(`\r写入进度：${total}/${nums.length}`);
  }
  console.log(`\n完成！共导入 ${total} 条到 cache 集合（kind=${args.kind}）。`);
  await client.close();
}

run().catch(err => { console.error('导入失败：', err.message); process.exit(1); });
