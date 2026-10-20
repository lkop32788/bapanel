#!/usr/bin/env node
// 云仓历史数据导入脚本：把已有检测结果直接写入 cache 集合
// 用法：
//   node import-cache.js --kind wsValid --valid true  --file ws_open.txt
//   node import-cache.js --kind tgOpen  --valid false --file tg_dead.txt
//   node import-cache.js --help
//
// --kind 接受任务类型名（wsValid 等，自动映射到缓存命名空间）或命名空间名（wsOpen 等）；
// 未知值报错退出。phoneRoaming（开关机状态）是实时检测、缓存不生效，不支持导入。
//
// 文件格式：每行一条，# 或 // 开头的行跳过。行可按 , ; 或 Tab 分列：
//   第一列是号码/邮箱/用户名；有 ≥2 个非空列时，整行作为 extra（检测结果载荷）保存。
// 性别年龄/UID 等带载荷类型按 --valid true 导入时，没有 extra 的行会被跳过。

const { MongoClient } = require('mongodb');
const fs = require('fs');

// taskType → 缓存命名空间（与 yuncang-proxy main.go taskTypes 一致）；未列出的 taskType 同名
const ALIAS = {
  wsValid: 'wsOpen', wsSimpleValid: 'wsOpen',
  tgValid: 'tgOpen', tgNameValid: 'tgName',
  zaloGenderQuick: 'zaloGender',
};
// 全部缓存命名空间（phoneRoaming 除外：ttl=0 实时检测，缓存不生效）
const NAMESPACES = [
  'wsOpen', 'wsActive', 'wsGender',
  'tgOpen', 'tgActive', 'tgGender', 'tgName',
  'fbValid', 'fbGender', 'fbUid', 'fbEmail', 'insValid', 'insEmail',
  'twitterValid', 'twitterEmail', 'snapchatValid', 'linkedinValid', 'linkedinGender', 'tiktokUser',
  'lineValid', 'lineGender', 'signalValid', 'viberValid', 'viberGender', 'viberActive',
  'botimValid', 'botimGender', 'zaloValid', 'zaloGender', 'zaloActive',
  'wxValid', 'wxAll', 'rcsSystem',
  'phoneCheck', 'phoneActive', 'operatorStandard', 'numberStatus', 'phoneUsCarrier', 'phoneDnd',
  'iosBlueValid', 'iosValid', 'iosAll',
  'amazonEmail', 'amazonValid', 'teamsValid', 'sidelineValid', 'dhlValid',
  'binanceValid', 'okxValid', 'htxValid', 'kucoinValid', 'coinwValid', 'mexcValid',
];
const EMAIL_KINDS = new Set(['fbEmail', 'insEmail', 'amazonEmail', 'twitterEmail']);
const USERNAME_KINDS = new Set(['tgName', 'tiktokUser']);
// 结果带载荷的命名空间：有效行必须有 extra（否则商户命中后拿不到检测结果）
const PAYLOAD_KINDS = new Set([
  'wsGender', 'tgGender', 'fbGender', 'linkedinGender', 'lineGender', 'viberGender',
  'botimGender', 'zaloGender', 'fbUid', 'wxAll', 'iosAll',
  'numberStatus', 'operatorStandard', 'phoneUsCarrier',
]);

function die(msg) { console.error('错误：' + msg); process.exit(1); }

function resolveKind(kind) {
  if (kind === 'phoneRoaming') die('phoneRoaming（开关机状态）是实时检测，缓存不生效，不支持导入');
  if (ALIAS[kind]) return ALIAS[kind];
  if (NAMESPACES.includes(kind)) return kind;
  die('未知的 kind「' + kind + '」。合法值（任务类型名或命名空间名）：\n  别名：' +
    Object.entries(ALIAS).map(([k, v]) => k + '→' + v).join('、') +
    '\n  命名空间：' + NAMESPACES.join('、'));
}

function parseArgs() {
  const a = process.argv.slice(2);
  const r = { kind: '', file: '', valid: null, mongo: 'mongodb://127.0.0.1:27017', db: 'yuncang', dry: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--help') { printHelp(); process.exit(0); }
    if (a[i] === '--kind')  { r.kind  = a[++i] || ''; continue; }
    if (a[i] === '--file')  { r.file  = a[++i] || ''; continue; }
    if (a[i] === '--valid') {
      const v = a[++i];
      if (v !== 'true' && v !== 'false') die('--valid 只接受 true 或 false（收到「' + (v == null ? '' : v) + '」）');
      r.valid = v === 'true';
      continue;
    }
    if (a[i] === '--mongo') { r.mongo = a[++i] || r.mongo; continue; }
    if (a[i] === '--db')    { r.db    = a[++i] || r.db;    continue; }
    if (a[i] === '--dry')   { r.dry   = true;              continue; }
  }
  return r;
}

function printHelp() {
  console.log(`
云仓历史数据导入脚本（写入 cache 集合，商户后续检测直接命中、不再扣积分）

用法：
  node import-cache.js --kind <kind> --valid true|false --file <file.txt> [选项]

必填：
  --kind   任务类型名或缓存命名空间名。常用任务类型会自动映射到命名空间：
             wsValid / wsSimpleValid → wsOpen    tgValid → tgOpen
             tgNameValid → tgName               zaloGenderQuick → zaloGender
           其余任务类型与命名空间同名（wsActive、wsGender、tgActive、fbValid、
           insValid、viberValid、zaloValid、phoneCheck …）。未知值会报错并列出全部合法值。
           注意：phoneRoaming（开关机状态）是实时检测，不支持导入。
  --valid  true（有效/已开通）或 false（无效/未注册），必须显式指定
  --file   数据文件路径（txt/csv）

文件格式：
  每行一条，# 或 // 开头的行跳过。行可按 , ; 或 Tab 分列：
    第一列是号码（或邮箱/用户名，取决于 kind）；
    有第二列及以后内容时，整行作为检测结果（extra）一并保存。
  性别年龄 / UID / 运营商等带结果载荷的类型按 --valid true 导入时，
  行必须带结果列（格式：号码,检测结果），没有结果的行会被跳过。

选项：
  --mongo  MongoDB URI（默认 mongodb://127.0.0.1:27017）
  --db     数据库名（默认 yuncang）
  --dry    只解析，不写入（预览条数和前几条内容）

示例：
  # 导入一批 WS 已开通号码（wsValid 自动映射到命名空间 wsOpen）
  node import-cache.js --kind wsValid --valid true --file ws_valid.txt

  # 标记一批号码为 WS 未注册（下次提交直接命中缓存，返回无效）
  node import-cache.js --kind wsOpen --valid false --file ws_invalid.txt

  # 导入 WS 性别年龄结果（每行：号码,性别年龄结果）
  node import-cache.js --kind wsGender --valid true --file ws_gender.csv

  # 先预览不写库
  node import-cache.js --kind wsValid --valid true --file ws_valid.txt --dry
`);
}

const stripBOM = (s) => s.replace(/^﻿/, '');

function parseValue(firstCol, inputType) {
  if (inputType === 'email') {
    const s = stripBOM(firstCol).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
  }
  if (inputType === 'username') {
    const s = stripBOM(firstCol).trim().replace(/^@/, '');
    return s && s.length <= 64 && !/[\s,;]/.test(s) ? s : null;
  }
  const digits = firstCol.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 17 ? digits : null;
}

// 返回 { rows: [{value, extra}], skippedInvalid, skippedNoExtra }
function parseFile(filePath, inputType, needExtra) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  let skippedInvalid = 0, skippedNoExtra = 0;
  for (const line of raw.split(/\r?\n/)) {
    const s = stripBOM(line).trim();
    if (!s || s.startsWith('#') || s.startsWith('//')) continue;
    const cols = s.split(/[,;\t]/);
    const value = parseValue(cols[0].trim(), inputType);
    if (!value) { skippedInvalid++; continue; }
    const extra = cols.filter((c) => c.trim()).length >= 2 ? s : '';
    if (needExtra && !extra) { skippedNoExtra++; continue; }
    rows.push({ value, extra });
  }
  return { rows, skippedInvalid, skippedNoExtra };
}

async function run() {
  const args = parseArgs();
  if (!args.kind) die('缺少 --kind');
  if (args.valid === null) die('缺少 --valid（必须显式指定 true 或 false）');
  if (!args.file) die('缺少 --file');
  if (!fs.existsSync(args.file)) die('文件不存在：' + args.file);

  const kind = resolveKind(args.kind);
  const inputType = EMAIL_KINDS.has(kind) ? 'email' : USERNAME_KINDS.has(kind) ? 'username' : 'phone';
  const needExtra = PAYLOAD_KINDS.has(kind) && args.valid;

  const { rows, skippedInvalid, skippedNoExtra } = parseFile(args.file, inputType, needExtra);
  const skipped = skippedInvalid + skippedNoExtra;
  console.log(`解析完成：${rows.length} 条（kind=${args.kind}→${kind} 类型=${inputType} valid=${args.valid}）`);
  if (skippedInvalid) console.warn(`警告：${skippedInvalid} 行格式无效已跳过`);
  if (skippedNoExtra) console.warn(`警告：${skippedNoExtra} 行缺少检测结果列已跳过（该类型有效数据需要「号码,检测结果」格式）`);

  if (rows.length === 0) {
    if (skippedNoExtra) die('所有行都缺少检测结果列。该类型（' + kind + '）的有效数据必须带结果，格式：号码,检测结果');
    die('文件里没有识别到有效内容');
  }

  if (args.dry) {
    console.log('--dry 模式，不写入数据库。前5条预览：');
    rows.slice(0, 5).forEach((r) => console.log('  value=' + r.value + (r.extra ? '  extra=' + r.extra : '')));
    return;
  }

  const client = new MongoClient(args.mongo);
  await client.connect();
  const col = client.db(args.db).collection('cache');
  const now = Math.floor(Date.now() / 1000);
  const BATCH = 2000;
  let written = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const ops = batch.map((r) => ({
      replaceOne: {
        filter: { kind, value: r.value },
        replacement: { kind, value: r.value, valid: args.valid, extra: r.extra, checkedAt: now },
        upsert: true,
      },
    }));
    await col.bulkWrite(ops, { ordered: false });
    written += batch.length;
    process.stdout.write(`\r写入进度：${written}/${rows.length}（跳过 ${skipped}）`);
  }
  console.log(`\n完成！解析 ${rows.length} / 写入 ${written} / 跳过 ${skipped}（kind=${kind}）。`);
  await client.close();
}

run().catch((err) => { console.error('导入失败：', err.message); process.exit(1); });
