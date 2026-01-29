const Admin = require('./models/Admin');
const Report = require('./models/Report');
const ObjectModel = require('./models/Object');
const moment = require('moment-timezone');

// Function to send daily summary to the owner
// Function to send daily summary to the owner
// Function to send daily summary to the owner
const sendDailySummary = async (bot, ownerId) => {
  try {
    // Get today's date with timezone consideration
    const todayStart = moment().tz('Europe/Moscow').startOf('day').toDate();
    const todayEnd = moment().tz('Europe/Moscow').endOf('day').toDate();

    // Find today's reports
    const reports = await Report.find({
      date: {
        $gte: todayStart,
        $lte: todayEnd
      }
    })
    .populate('adminId')
    .populate('objectId')
    .populate('objectIds');

    if (reports.length === 0) {
      await bot.telegram.sendMessage(ownerId, `📊 Нет отчетов за ${moment().tz('Europe/Moscow').format('DD.MM.YYYY')}`);
      return;
    }

    let reportText = `📊 Отчеты за ${moment().tz('Europe/Moscow').format('DD.MM.YYYY')}:\n\n`;

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
        // Если у отчета есть массив объектов, отображаем все объекты
        if (report.objectIds && report.objectIds.length > 0) {
          // Получаем адреса всех объектов
          const objectAddresses = report.objectIds.map(obj => 
            obj.description || obj.address || 'Не указан'
          ).join(', ');
          reportText += `🏠 Объекты: ${objectAddresses}\n`;
        } else if (report.objectId) {
          // Для обратной совместимости - отображаем один объект
          reportText += `🏠 Объект: ${report.objectId?.description || report.objectId?.address || 'Не указан'}\n`;
        } else {
          reportText += `🏠 Объект: Не указан\n`;
        }

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
// Function to send reports for a specific date range
const sendReportsForDateRange = async (bot, ownerId, startDate, endDate) => {
  try {
    // Find reports in the date range
    const reports = await Report.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('adminId')
    .populate('objectId')
    .populate('objectIds')
    .sort({ date: -1 });

    if (reports.length === 0) {
      await bot.telegram.sendMessage(ownerId, `📊 Нет отчетов в периоде с ${moment(startDate).format('DD.MM.YYYY')} по ${moment(endDate).format('DD.MM.YYYY')}`);
      return;
    }

    let reportText = `📊 Отчеты с ${moment(startDate).format('DD.MM.YYYY')} по ${moment(endDate).format('DD.MM.YYYY')} (${reports.length}):\n\n`;

    // Limit to first 50 reports to prevent message too long error
    const reportsToShow = reports.slice(0, 50);

    // Group reports by date and admin
    const reportsByDate = {};
    for (const report of reportsToShow) {
      const reportDate = moment(report.date).tz('Europe/Moscow').format('DD.MM.YYYY');
      if (!reportsByDate[reportDate]) {
        reportsByDate[reportDate] = {};
      }

      const adminName = report.adminId.name;
      if (!reportsByDate[reportDate][adminName]) {
        reportsByDate[reportDate][adminName] = [];
      }

      reportsByDate[reportDate][adminName].push(report);
    }

    // Format the report text
    for (const [date, admins] of Object.entries(reportsByDate)) {
      reportText += `📅 ${date}\n`;

      for (const [adminName, adminReports] of Object.entries(admins)) {
        reportText += `  👤 ${adminName}:\n`;

        for (const report of adminReports) {
          // Если у отчета есть массив объектов, отображаем все объекты
          if (report.objectIds && report.objectIds.length > 0) {
            // Делаем отдельный запрос для получения информации об объектах
            const objects = await ObjectModel.find({ _id: { $in: report.objectIds } });
            const objectAddresses = objects.map(obj => obj.address || obj.description).join(', ');
            reportText += `    🏠 Объекты: ${objectAddresses}\n`;
          } else if (report.objectId) {
            // Для обратной совместимости - отображаем один объект
            reportText += `    🏠 Объект: ${report.objectId?.address || 'Не указан'}\n`;
          } else {
            reportText += `    🏠 Объект: Не указан\n`;
          }

          reportText += `    🧹 Горничные: ${report.cleaners}\n`;
          reportText += `    👷 Подсобные: ${report.helpers}\n`;
          reportText += `    💰 Доплаты: ${report.payments}\n`;
          reportText += `    🔧 Поломки: ${report.malfunctions}\n`;
          reportText += `    ✅ Готов к сдаче: ${report.readyForRent ? 'Да' : 'Нет'}\n\n`;
        }
      }
    }

    if (reports.length > 50) {
      reportText += `... и еще ${reports.length - 50} отчетов`;
    }

    // Send the report to the owner
    await bot.telegram.sendMessage(ownerId, reportText);
  } catch (error) {
    console.error('Error sending date range reports:', error);
  }
};

module.exports = { sendDailySummary, sendReportsForDateRange };