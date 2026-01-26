require('dotenv').config();
const bot = require('./bot');
const setupReminders = require('./reminders');

// Setup reminders
setupReminders(bot);

// Launch bot
bot.launch();

console.log('Bot is running...');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));