require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const connectDB = require('./db/connectDB');
const Admin = require('./models/Admin');
const Report = require('./models/Report');
const ObjectModel = require('./models/Object');

// Initialize bot with token
const bot = new Telegraf(process.env.BOT_TOKEN);

// Подключаем middleware для сессии
bot.use(session({
  defaultSession: () => ({
    waitingFor: null,
    reportData: {},
    selectedObjectId: null
  })
}));

// Middleware для логирования (опционально, для отладки)
bot.use(async (ctx, next) => {
  console.log(`[${new Date().toISOString()}] Update received:`, {
    update_id: ctx.update.update_id,
    type: ctx.updateType,
    chat_id: ctx.chat?.id,
    from_id: ctx.from?.id,
    text: ctx.message?.text?.substring(0, 50) || ctx.callbackQuery?.data,
    session_state: ctx.session ? {
      waitingFor: ctx.session.waitingFor,
      hasSelectedObjectId: !!ctx.session.selectedObjectId,
      hasReportData: !!ctx.session.reportData && Object.keys(ctx.session.reportData).length > 0
    } : 'NO SESSION'
  });
  await next();
});

// Connect to database
connectDB();

// Bot start command
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userExists = await Admin.findOne({ telegramId: userId });
    
    if (!userExists) {
      // Register new admin
      const newAdmin = new Admin({
        telegramId: userId,
        name: ctx.from.first_name,
        username: ctx.from.username || null
      });
      
      await newAdmin.save();
      await ctx.reply(`Добро пожаловать! Вы зарегистрированы как администратор.`);
    } else {
      await ctx.reply(`Здравствуйте, ${ctx.from.first_name}!`);
    }
    
    // Send help message
    await ctx.reply(
      `🤖 Привет! Это бот для сбора ежедневных отчетов.\n\n` +
      `/report - Отправить ежедневный отчет\n` +
      `/today - Посмотреть сегодняшние отчеты\n` +
      `/objects - Управление объектами\n` +
      `/help - Показать это сообщение`
    );
    
    // Сбрасываем сессию при старте
    if (ctx.session) {
      ctx.session.waitingFor = null;
      ctx.session.reportData = {};
      ctx.session.selectedObjectId = null;
    }
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

// Help command
bot.help(async (ctx) => {
  await ctx.reply(
    `🤖 Команды бота:\n\n` +
    `/report - Отправить ежедневный отчет\n` +
    `/today - Посмотреть сегодняшние отчеты\n` +
    `/objects - Управление объектами\n` +
    `/help - Показать это сообщение`
  );
});

// Export bot for use in other files
module.exports = bot;