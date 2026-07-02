const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const BIN_ID = process.env.BIN_ID;
const API_KEY = process.env.API_KEY;
const CHANNEL_RUT_TIEN = process.env.CHANNEL_RUT_TIEN;
const CHANNEL_DA_DONE = process.env.CHANNEL_DA_DONE;
const SITE_URL = process.env.SITE_URL || 'https://iumoney.netlify.app';

console.log('DEBUG API_KEY length:', API_KEY ? API_KEY.length : 'undefined');
console.log('DEBUG BIN_ID:', BIN_ID);
console.log('DEBUG BOT_TOKEN exists:', !!TOKEN);
console.log('DEBUG OWNER_ID:', OWNER_ID);

const BASE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

const DEFAULT_TASKS = {
  l4m:  { name: 'Link4M', reward: 300, max: 2, apiUrlTemplate: 'https://link4m.co/api-shorten/v2?api=698ecc57359ef273e479d96b&url={url}' },
  uto1: { name: 'Uptolink 1 Step', reward: 350, max: 3636, apiUrlTemplate: 'https://uptolink.vip/api?api=3c317fd7948df64ff7925c395c1db4dc5bf92527&url={url}&type=2' },
  uto2: { name: 'Uptolink 2 Step', reward: 350, max: 3636, apiUrlTemplate: 'https://uptolink.vip/api?api=3c317fd7948df64ff7925c395c1db4dc5bf92527&url={url}&type=3' },
  uto3: { name: 'Uptolink 3 Step', reward: 400, max: 3636, apiUrlTemplate: 'https://uptolink.vip/api?api=3c317fd7948df64ff7925c395c1db4dc5bf92527&url={url}&type=4' },
  uto4: { name: 'Uptolink 4 Step', reward: 400, max: 3636, apiUrlTemplate: 'https://uptolink.vip/api?api=3c317fd7948df64ff7925c395c1db4dc5bf92527&url={url}&type=5' },
};

async function getBin() {
  const r = await fetch(BASE_URL + '/latest', { headers: { 'X-Access-Key': API_KEY } });
  console.log('DEBUG getBin status:', r.status);
  const d = await r.json();
  console.log('DEBUG getBin response keys:', Object.keys(d));
  return d.record;
}
async function saveBin(data) {
  const r = await fetch(BASE_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Access-Key': API_KEY },
    body: JSON.stringify(data)
  });
  console.log('DEBUG saveBin status:', r.status);
}
function getNowVN() {
  const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  return `${nowVN.getFullYear()}-${nowVN.getMonth()}-${nowVN.getDate()}`;
}
function vnTime() {
  return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
async function getTasks(binData) {
  if (!binData.tasksConfig) {
    binData.tasksConfig = DEFAULT_TASKS;
    await saveBin(binData);
  }
  return binData.tasksConfig;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName('money').setDescription('Xem số dư của người dùng')
    .addUserOption(o => o.setName('user').setDescription('Người dùng').setRequired(true)),
  new SlashCommandBuilder().setName('pay').setDescription('Chuyển tiền cho người khác (phí 20%)')
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('set').setDescription('[Owner] Set số dư cho người dùng')
    .addUserOption(o => o.setName('user').setDescription('Người dùng').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('ditu').setDescription('[Owner] Khóa tài khoản Discord')
    .addUserOption(o => o.setName('user').setDescription('Người dùng').setRequired(true)),
  new SlashCommandBuilder().setName('tudo').setDescription('[Owner] Mở khóa tài khoản Discord')
    .addUserOption(o => o.setName('user').setDescription('Người dùng').setRequired(true)),
  new SlashCommandBuilder().setName('done').setDescription('[Owner] Xác nhận đã xử lý xong đơn rút tiền')
    .addStringOption(o => o.setName('madon').setDescription('Mã đơn').setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addStringOption(o => o.setName('ghichu').setDescription('Ghi chú / mã thẻ / serial (nếu có)').setRequired(false)),
  new SlashCommandBuilder().setName('addtask').setDescription('[Owner] Thêm nhiệm vụ mới')
    .addStringOption(o => o.setName('id').setDescription('ID ngắn gọn, không dấu (vd: l4m, uto5)').setRequired(true))
    .addStringOption(o => o.setName('name').setDescription('Tên hiển thị nhiệm vụ').setRequired(true))
    .addIntegerOption(o => o.setName('reward').setDescription('Số đ thưởng mỗi lượt').setRequired(true))
    .addIntegerOption(o => o.setName('max').setDescription('Số lượt tối đa/ngày').setRequired(true))
    .addStringOption(o => o.setName('apiurl').setDescription('URL API rút gọn, dùng {url} làm chỗ trống').setRequired(true)),
  new SlashCommandBuilder().setName('removetask').setDescription('[Owner] Xóa nhiệm vụ')
    .addStringOption(o => o.setName('id').setDescription('ID nhiệm vụ cần xóa').setRequired(true)),
  new SlashCommandBuilder().setName('listtask').setDescription('[Owner] Xem danh sách nhiệm vụ hiện có'),
  new SlashCommandBuilder().setName('dieuchinh').setDescription('[Owner] Điều chỉnh số lượt/số đ của nhiệm vụ có sẵn')
    .addStringOption(o => o.setName('id').setDescription('ID nhiệm vụ cần sửa').setRequired(true))
    .addIntegerOption(o => o.setName('reward').setDescription('Số đ thưởng mới (bỏ trống nếu không đổi)').setRequired(false))
    .addIntegerOption(o => o.setName('max').setDescription('Số lượt tối đa mới (bỏ trống nếu không đổi)').setRequired(false)),
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Bot đã online: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Đã đăng ký slash commands!');
  } catch (e) { console.error('Lỗi đăng ký commands:', e); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  await interaction.deferReply();

  try {
    const binData = await getBin();

    if (!binData) {
      console.error('DEBUG: binData is null/undefined!');
      return interaction.editReply({ content: '❌ Lỗi kết nối database, thử lại sau!' });
    }

    if (!binData.users) binData.users = {};

    if (commandName === 'money') {
      const target = interaction.options.getUser('user');
      const userData = binData.users[target.id] || {};
      if (userData.banned) return interaction.editReply({ content: `❌ Tài khoản **${target.username}** đã bị khóa!` });
      const todayStr = getNowVN();
      const todayLinks = userData.lastDate === todayStr ? (userData.todayLinks || 0) : 0;
      const embed = new EmbedBuilder().setColor(0x6c47ff).setTitle(`💰 Thông tin tài khoản`).setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '👤 Người dùng', value: `${target.username}`, inline: true },
          { name: '💜 Số dư', value: `${(userData.balance || 0).toLocaleString('vi')}đ`, inline: true },
          { name: '🔗 Tổng link vượt', value: `${userData.totalLinks || 0} link`, inline: true },
          { name: '⚡ Hôm nay vượt', value: `${todayLinks} link`, inline: true },
          { name: '📈 Tổng đã kiếm', value: `${(userData.totalEarned || 0).toLocaleString('vi')}đ`, inline: true },
          { name: '👥 Đã giới thiệu', value: `${(userData.refs || []).length} người`, inline: true },
        ).setFooter({ text: 'IUMoney' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'pay') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const senderId = interaction.user.id;
      if (target.id === senderId) return interaction.editReply({ content: '❌ Không thể chuyển tiền cho chính mình!' });
      if (amount <= 0) return interaction.editReply({ content: '❌ Số tiền phải lớn hơn 0!' });
      const senderData = binData.users[senderId] || {};
      if (senderData.banned) return interaction.editReply({ content: '❌ Tài khoản của bạn đã bị khóa!' });
      if ((senderData.balance || 0) < amount) return interaction.editReply({ content: `❌ Số dư không đủ! Bạn chỉ có **${(senderData.balance || 0).toLocaleString('vi')}đ**` });

      const fee = Math.floor(amount * 0.2);
      const received = amount - fee;
      senderData.balance = (senderData.balance || 0) - amount;
      if (!senderData.history) senderData.history = [];
      senderData.history.unshift({ type: 'withdraw', desc: `Chuyển tiền cho ${target.username}`, amount: -amount, time: vnTime() });

      if (!binData.users[target.id]) binData.users[target.id] = {};
      const targetData = binData.users[target.id];
      targetData.balance = (targetData.balance || 0) + received;
      if (!targetData.history) targetData.history = [];
      targetData.history.unshift({ type: 'earn', desc: `Nhận tiền từ ${interaction.user.username}`, amount: received, time: vnTime() });

      binData.users[senderId] = senderData;
      binData.users[target.id] = targetData;
      await saveBin(binData);

      const embed = new EmbedBuilder().setColor(0x4ade80).setTitle('💸 Chuyển tiền thành công!')
        .addFields(
          { name: '👤 Người gửi', value: interaction.user.username, inline: true },
          { name: '👤 Người nhận', value: target.username, inline: true },
          { name: '💰 Số tiền gửi', value: `${amount.toLocaleString('vi')}đ`, inline: true },
          { name: '💸 Phí (20%)', value: `${fee.toLocaleString('vi')}đ`, inline: true },
          { name: '✅ Người nhận được', value: `${received.toLocaleString('vi')}đ`, inline: true },
        ).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'set') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      if (!binData.users[target.id]) binData.users[target.id] = {};
      binData.users[target.id].balance = amount;
      await saveBin(binData);
      return interaction.editReply({ content: `✅ Đã set số dư của **${target.username}** thành **${amount.toLocaleString('vi')}đ**` });
    }

    if (commandName === 'ditu') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const target = interaction.options.getUser('user');
      if (!binData.users[target.id]) binData.users[target.id] = {};
      binData.users[target.id].banned = true;
      await saveBin(binData);
      return interaction.editReply({ content: `🔒 Đã khóa tài khoản **${target.username}**! Họ sẽ không vào được web.` });
    }

    if (commandName === 'tudo') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const target = interaction.options.getUser('user');
      if (binData.users[target.id]) binData.users[target.id].banned = false;
      await saveBin(binData);
      return interaction.editReply({ content: `🔓 Đã mở khóa tài khoản **${target.username}**!` });
    }

    if (commandName === 'done') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const maDon = interaction.options.getString('madon');
      const target = interaction.options.getUser('user');
      const ghiChu = interaction.options.getString('ghichu') || 'Không có';

      const userData = binData.users[target.id] || {};
      if (userData.history) {
        const order = userData.history.find(h => h.orderId === maDon);
        if (order) order.status = 'done';
      }
      binData.users[target.id] = userData;
      await saveBin(binData);

      try {
        const dmEmbed = new EmbedBuilder().setColor(0x4ade80).setTitle('✅ Yêu cầu rút tiền đã hoàn thành!')
          .addFields(
            { name: '🧾 Mã đơn', value: maDon, inline: true },
            { name: '📝 Ghi chú', value: ghiChu, inline: false },
          ).setFooter({ text: 'IUMoney' }).setTimestamp();
        await target.send({ embeds: [dmEmbed] });
      } catch (e) { console.log('Không gửi được DM'); }

      try {
        const doneChannel = await client.channels.fetch(CHANNEL_DA_DONE);
        const logEmbed = new EmbedBuilder().setColor(0x4ade80).setTitle('✅ Đơn đã xử lý xong')
          .addFields(
            { name: '👤 Người dùng', value: target.username, inline: true },
            { name: '🧾 Mã đơn', value: maDon, inline: true },
            { name: '👮 Xử lý bởi', value: interaction.user.username, inline: true },
            { name: '📝 Ghi chú', value: ghiChu, inline: false },
          ).setTimestamp();
        await doneChannel.send({ embeds: [logEmbed] });
      } catch (e) { console.log('Lỗi gửi kênh done:', e.message); }

      return interaction.editReply({ content: `✅ Đã xác nhận done đơn **${maDon}** cho **${target.username}**!` });
    }

    if (commandName === 'addtask') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const id = interaction.options.getString('id').trim();
      const name = interaction.options.getString('name').trim();
      const reward = interaction.options.getInteger('reward');
      const max = interaction.options.getInteger('max');
      const apiurl = interaction.options.getString('apiurl').trim();

      if (!apiurl.includes('{url}')) {
        return interaction.editReply({ content: '❌ apiurl phải chứa `{url}` làm chỗ trống cho link đích!' });
      }

      const tasks = await getTasks(binData);
      tasks[id] = { name, reward, max, apiUrlTemplate: apiurl };
      binData.tasksConfig = tasks;
      await saveBin(binData);

      const embed = new EmbedBuilder().setColor(0x4ade80).setTitle('✅ Đã thêm nhiệm vụ mới')
        .addFields(
          { name: 'ID', value: id, inline: true },
          { name: 'Tên', value: name, inline: true },
          { name: 'Thưởng', value: `${reward.toLocaleString('vi')}đ`, inline: true },
          { name: 'Tối đa/ngày', value: `${max} lượt`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'removetask') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const id = interaction.options.getString('id').trim();
      const tasks = await getTasks(binData);
      if (!tasks[id]) return interaction.editReply({ content: `❌ Không tìm thấy nhiệm vụ ID **${id}**!` });
      delete tasks[id];
      binData.tasksConfig = tasks;
      await saveBin(binData);
      return interaction.editReply({ content: `🗑️ Đã xóa nhiệm vụ **${id}**!` });
    }

    if (commandName === 'listtask') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const tasks = await getTasks(binData);
      const ids = Object.keys(tasks);
      if (ids.length === 0) return interaction.editReply({ content: 'Chưa có nhiệm vụ nào.' });

      const embed = new EmbedBuilder().setColor(0x6c47ff).setTitle('📋 Danh sách nhiệm vụ');
      ids.forEach(id => {
        const t = tasks[id];
        embed.addFields({ name: `${id} — ${t.name}`, value: `Thưởng: ${t.reward.toLocaleString('vi')}đ | Tối đa: ${t.max} lượt/ngày`, inline: false });
      });
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'dieuchinh') {
      if (interaction.user.id !== OWNER_ID) return interaction.editReply({ content: '❌ Bạn không có quyền dùng lệnh này!' });
      const id = interaction.options.getString('id').trim();
      const reward = interaction.options.getInteger('reward');
      const max = interaction.options.getInteger('max');

      const tasks = await getTasks(binData);
      if (!tasks[id]) return interaction.editReply({ content: `❌ Không tìm thấy nhiệm vụ ID **${id}**!` });

      if (reward !== null) tasks[id].reward = reward;
      if (max !== null) tasks[id].max = max;
      binData.tasksConfig = tasks;
      await saveBin(binData);

      return interaction.editReply({
        content: `✅ Đã cập nhật **${id}**: Thưởng ${tasks[id].reward.toLocaleString('vi')}đ, Tối đa ${tasks[id].max} lượt/ngày`
      });
    }

  } catch (e) {
    console.error('LỖI CHI TIẾT:', e);
    return interaction.editReply({ content: '❌ Có lỗi xảy ra, thử lại sau!' });
  }
});

client.login(TOKEN);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/tasks', async (req, res) => {
  try {
    const binData = await getBin();
    const tasks = await getTasks(binData);
    res.json(tasks);
  } catch (e) {
    console.error('LỖI /api/tasks:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/user/:id', async (req, res) => {
  try {
    const binData = await getBin();
    const userData = (binData.users && binData.users[req.params.id]) || {};
    const todayStr = getNowVN();
    const todayLinks = userData.lastDate === todayStr ? (userData.todayLinks || 0) : 0;
    const taskState = userData.lastDate === todayStr ? (userData.taskState || {}) : {};

    res.json({
      balance: userData.balance || 0,
      totalLinks: userData.totalLinks || 0,
      totalEarned: userData.totalEarned || 0,
      todayLinks,
      taskState,
      banned: userData.banned || false,
      refs: userData.refs || [],
      refEarned: userData.refEarned || 0,
      history: userData.history || [],
    });
  } catch (e) {
    console.error('LỖI /api/user:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/create-link', async (req, res) => {
  try {
    const { userId, taskId } = req.body;
    const binData = await getBin();
    const tasksConfig = await getTasks(binData);
    const task = tasksConfig[taskId];
    if (!task || !userId) return res.status(400).json({ error: 'invalid_request' });

    if (!binData.users) binData.users = {};
    const userData = binData.users[userId] || {};
    if (userData.banned) return res.status(403).json({ error: 'banned' });

    const todayStr = getNowVN();
    if (userData.lastDate !== todayStr) {
      userData.taskState = {};
      userData.todayLinks = 0;
      userData.lastDate = todayStr;
    }
    if (!userData.taskState) userData.taskState = {};
    const done = userData.taskState[taskId] || 0;
    if (done >= task.max) return res.status(400).json({ error: 'max_reached' });

    const token = crypto.randomBytes(32).toString('hex');
    const destUrl = `${SITE_URL}/claim/${token}`;

    const apiUrl = task.apiUrlTemplate.replace('{url}', encodeURIComponent(destUrl));
    const r = await fetch(apiUrl);
    const d = await r.json();
    if (d.status !== 'success') return res.status(500).json({ error: 'shorten_failed', detail: d.message });
    const shortUrl = d.shortenedUrl;

    if (!binData.tokens) binData.tokens = {};
    binData.tokens[token] = { userId, taskId, used: false, createdAt: Date.now() };
    binData.users[userId] = userData;
    await saveBin(binData);

    res.json({ shortUrl, token });
  } catch (e) {
    console.error('LỖI /api/create-link:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/cancel-task', async (req, res) => {
  try {
    const { token } = req.body;
    const binData = await getBin();
    if (binData.tokens && binData.tokens[token]) {
      delete binData.tokens[token];
      await saveBin(binData);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/claim/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { userId } = req.body;
    const binData = await getBin();
    const tasksConfig = await getTasks(binData);

    if (!binData.tokens || !binData.tokens[token]) return res.status(400).json({ error: 'invalid_token' });
    const tokenData = binData.tokens[token];
    if (tokenData.used) return res.status(400).json({ error: 'already_used' });
    if (tokenData.userId !== userId) return res.status(403).json({ error: 'wrong_user' });

    const task = tasksConfig[tokenData.taskId];
    if (!task) return res.status(400).json({ error: 'invalid_task' });

    if (!binData.users) binData.users = {};
    const userData = binData.users[userId] || {};
    if (userData.banned) return res.status(403).json({ error: 'banned' });

    const todayStr = getNowVN();
    if (userData.lastDate !== todayStr) {
      userData.taskState = {};
      userData.todayLinks = 0;
      userData.lastDate = todayStr;
    }
    if (!userData.taskState) userData.taskState = {};

    const done = userData.taskState[tokenData.taskId] || 0;
    if (done >= task.max) return res.status(400).json({ error: 'max_reached' });

    userData.taskState[tokenData.taskId] = done + 1;
    userData.balance = (userData.balance || 0) + task.reward;
    userData.totalLinks = (userData.totalLinks || 0) + 1;
    userData.todayLinks = (userData.todayLinks || 0) + 1;
    userData.totalEarned = (userData.totalEarned || 0) + task.reward;

    if (!userData.history) userData.history = [];
    userData.history.unshift({ type: 'earn', desc: `Vượt link ${task.name}`, amount: task.reward, time: vnTime() });
    if (userData.history.length > 50) userData.history = userData.history.slice(0, 50);

    if (userData.refBy && binData.users[userData.refBy]) {
      const refUser = binData.users[userData.refBy];
      const commission = Math.floor(task.reward * 0.05);
      refUser.balance = (refUser.balance || 0) + commission;
      refUser.refEarned = (refUser.refEarned || 0) + commission;
      if (!refUser.history) refUser.history = [];
      refUser.history.unshift({ type: 'ref', desc: `Hoa hồng từ giới thiệu`, amount: commission, time: vnTime() });
      binData.users[userData.refBy] = refUser;
    }

    tokenData.used = true;
    binData.tokens[token] = tokenData;
    binData.users[userId] = userData;
    await saveBin(binData);

    res.json({ ok: true, reward: task.reward, taskName: task.name, newBalance: userData.balance });
  } catch (e) {
    console.error('LỖI /api/claim:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/token-info/:token', async (req, res) => {
  try {
    const binData = await getBin();
    const tasksConfig = await getTasks(binData);
    const tokenData = binData.tokens && binData.tokens[req.params.token];
    if (!tokenData) return res.status(400).json({ error: 'invalid_token' });
    const task = tasksConfig[tokenData.taskId];
    res.json({ used: tokenData.used, taskName: task ? task.name : '', reward: task ? task.reward : 0, userId: tokenData.userId });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, username, method, amount, info } = req.body;
    if (!userId || !amount || amount < 10000) return res.status(400).json({ error: 'invalid_request' });

    const binData = await getBin();
    if (!binData.users) binData.users = {};
    const userData = binData.users[userId] || {};
    if (userData.banned) return res.status(403).json({ error: 'banned' });
    if ((userData.balance || 0) < amount) return res.status(400).json({ error: 'insufficient_balance' });

    const orderId = 'DH' + Date.now().toString(36).toUpperCase();

    userData.balance -= amount;
    if (!userData.history) userData.history = [];
    userData.history.unshift({
      type: 'withdraw', desc: `Rút tiền: ${method}`, amount: -amount, time: vnTime(),
      status: 'pending', orderId, method, info,
    });
    binData.users[userId] = userData;
    await saveBin(binData);

    try {
      const channel = await client.channels.fetch(CHANNEL_RUT_TIEN);
      const embed = new EmbedBuilder().setColor(0xfbbf24).setTitle('💸 Yêu cầu rút tiền mới')
        .addFields(
          { name: '👤 Người dùng', value: `${username} (${userId})`, inline: false },
          { name: '💳 Hình thức', value: method, inline: true },
          { name: '💰 Số tiền', value: `${amount.toLocaleString('vi')}đ`, inline: true },
          { name: '🧾 Mã đơn', value: orderId, inline: true },
          { name: '📋 Thông tin', value: info || 'Không có', inline: false },
          { name: '⏰ Thời gian', value: vnTime(), inline: false },
        ).setFooter({ text: 'Dùng /done để xác nhận đã xử lý' }).setTimestamp();
      await channel.send({ embeds: [embed] });
    } catch (e) { console.log('Lỗi gửi kênh rút tiền:', e.message); }

    res.json({ ok: true, orderId, newBalance: userData.balance });
  } catch (e) {
    console.error('LỖI /api/withdraw:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API server chạy ở port ${PORT}`));
