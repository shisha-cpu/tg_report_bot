const Admin = require('./models/Admin');
const Report = require('./models/Report');
const ObjectModel = require('./models/Object');
const moment = require('moment-timezone');

// Function to send daily summary to the owner
const sendDailySummary = async (bot, ownerId) => {
  try {
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's reports
    const reports = await Report.find({
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    })
    .populate('adminId')
    .populate('objectId');

    if (reports.length === 0) {
      await bot.telegram.sendMessage(ownerId, `📊 Нет отчетов за ${today.toLocaleDateString('ru-RU')}`);
      return;
    }

    let reportText = `📊 Отчеты за ${today.toLocaleDateString('ru-RU')}:\n\n`;
    
    // Group reports by admin
    const reportsByAdmin = {};
    for (const report of reports) {
      const adminName = report.adminId.name;
      if (!reportsByAdmin[adminName]) {
        reportsByAdmin[adminName] = [];
      }
      reportsByAdmin[adminName].push(report);
    }

    // Format the report text
    for (const [adminName, adminReports] of Object.entries(reportsByAdmin)) {
      reportText += `👤 Администратор: ${adminName}\n`;
      
      for (const report of adminReports) {
        reportText += `🏠 Объект: ${report.objectId?.address || 'Не указан'}\n`;
        reportText += `🧹 Горничные: ${report.cleaners}\n`;
        reportText += `👷 Подсобные: ${report.helpers}\n`;
        reportText += `💰 Доплаты: ${report.payments}\n`;
        reportText += `🔧 Поломки: ${report.malfunctions}\n`;
        reportText += `✅ Готов к сдаче: ${report.readyForRent ? 'Да' : 'Нет'}\n\n`;
      }
    }

    // Send the report to the owner
    await bot.telegram.sendMessage(ownerId, reportText);
  } catch (error) {
    console.error('Error sending daily summary:', error);
  }
};

module.exports = { sendDailySummary };