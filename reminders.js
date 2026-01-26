const { CronJob } = require('cron');
const Admin = require('./models/Admin');
const { sendDailySummary } = require('./reportUtils');

const setupReminders = (bot) => {
  // Schedule daily reminder at 15:00 Moscow time
  const reminderJob = new CronJob(
    '00 15 * * *', // At 15:00 every day
    async () => {
      try {
        // Get all registered admins
        const admins = await Admin.find({});

        for (const admin of admins) {
          try {
            await bot.telegram.sendMessage(
              admin.telegramId,
              '⏰ Напоминание: Не забудьте отправить ежедневный отчет!\n\n' +
              'Используйте команду /report для отправки информации о проделанной работе.'
            );
          } catch (error) {
            console.error(`Failed to send reminder to admin ${admin.telegramId}:`, error);
          }
        }
      } catch (error) {
        console.error('Error sending daily reminders:', error);
      }
    },
    null,
    true, // Start the job immediately
    'Europe/Moscow' // Timezone
  );

  // Schedule daily summary at 18:00 Moscow time (to collect all reports from the day)
  const summaryJob = new CronJob(
    '00 18 * * *', 
    async () => {
      try {
        // Get the owner's Telegram ID from environment variable
        const ownerId = process.env.OWNER_ID;

        // if (!ownerId) {
        //   console.error('OWNER_ID is not set in environment variables');
        //   return;
        // }

        // Send daily summary to owner
        await sendDailySummary(bot, parseInt(ownerId));
      } catch (error) {
        console.error('Error sending daily summary:', error);
      }
    },
    null,
    true, // Start the job immediately
    'Europe/Moscow' // Timezone
  );

  console.log('Daily reminder job scheduled for 15:00 Moscow time');
  console.log('Daily summary job scheduled for 18:00 Moscow time');
};

module.exports = setupReminders;