const Admin = require('./models/Admin');
const Report = require('./models/Report');
const ObjectModel = require('./models/Object');
const moment = require('moment-timezone');

// Setup all bot commands
const setupCommands = (bot) => {
  // Report command - starts the reporting process
// Report command - starts the reporting process
bot.command('report', async (ctx) => {
  try {
    const admin = await Admin.findOne({ telegramId: ctx.from.id });
    if (!admin) {
      await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
      return;
    }

    // Check if already submitted today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingReport = await Report.findOne({
      adminId: admin._id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    if (existingReport) {
      await ctx.reply('Вы уже отправили отчет сегодня. Повторная отправка невозможна.');
      return;
    }

    // Ask for object selection
    const objects = await ObjectModel.find({});
    if (objects.length === 0) {
      await ctx.reply('Сначала добавьте объекты. Используйте команду /objects');
      return;
    }
    
    console.log('Objects found:', objects.length);
    
    // Создаем кнопки для клавиатуры - по 1 объекту на кнопку
    const buttons = objects.map(obj => ({
      text: obj.description || obj.address, 
      callback_data: `select_object_${obj._id}`
    }));
    
    // Группируем кнопки по 2 в ряд
    const keyboardRows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      const row = buttons.slice(i, i + 2);
      keyboardRows.push(row);
    }
    
    console.log('Keyboard rows created:', keyboardRows.length);
    
    await ctx.reply('Выберите объект, над которым работали сегодня:', {
      reply_markup: {
        inline_keyboard: keyboardRows
      }
    });
  } catch (error) {
    console.error('Error in report command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

  // Today's reports command
  bot.command('today', async (ctx) => {
    try {
      const admin = await Admin.findOne({ telegramId: ctx.from.id });
      if (!admin) {
        await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
        return;
      }

      // Get today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find today's reports
      const reports = await Report.find({
        date: {
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      }).populate('adminId').populate('objectId');

      if (reports.length === 0) {
        await ctx.reply('Сегодня еще нет отчетов.');
        return;
      }

      let reportText = `📊 Отчеты за ${today.toLocaleDateString('ru-RU')}:\n\n`;
      for (const report of reports) {
        reportText += `🏠 Объект: ${report.objectId?.address || 'Не указан'}\n`;
        reportText += `👤 Администратор: ${report.adminId.name}\n`;
        reportText += `🧹 Горничные: ${report.cleaners}\n`;
        reportText += `👷 Подсобные: ${report.helpers}\n`;
        reportText += `💰 Доплаты: ${report.payments}\n`;
        reportText += `🔧 Поломки: ${report.malfunctions}\n`;
        reportText += `✅ Готов к сдаче: ${report.readyForRent ? 'Да' : 'Нет'}\n\n`;
      }

      await ctx.reply(reportText);
    } catch (error) {
      console.error('Error in today command:', error);
      await ctx.reply('Произошла ошибка при получении отчетов.');
    }
  });

  // Objects management command
  bot.command('objects', async (ctx) => {
    try {
      const admin = await Admin.findOne({ telegramId: ctx.from.id });
      if (!admin) {
        await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
        return;
      }

      // Check if user is owner/admin (for simplicity, we'll allow all registered admins to manage objects)
      // In production, you might want to check for specific permissions
      
      await ctx.reply(
        'Управление объектами:\n' +
        '/add_object [адрес] - Добавить новый объект\n' +
        '/list_objects - Список всех объектов\n' +
        '/remove_object [id] - Удалить объект (id можно получить через /list_objects)'
      );
    } catch (error) {
      console.error('Error in objects command:', error);
      await ctx.reply('Произошла ошибка.');
    }
  });

  // Add object command
  bot.command('add_object', async (ctx) => {
    try {
      const admin = await Admin.findOne({ telegramId: ctx.from.id });
      if (!admin) {
        await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
        return;
      }

      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        await ctx.reply('Использование: /add_object [адрес объекта]');
        return;
      }

      const address = args.slice(1).join(' ');
      const newObject = new ObjectModel({
        address: address,
        name: address // Using address as name for simplicity
      });

      await newObject.save();
      await ctx.reply(`Объект "${address}" успешно добавлен!`);
    } catch (error) {
      console.error('Error in add_object command:', error);
      await ctx.reply('Произошла ошибка при добавлении объекта.');
    }
  });

  // List objects command
  bot.command('list_objects', async (ctx) => {
    try {
      const admin = await Admin.findOne({ telegramId: ctx.from.id });
      if (!admin) {
        await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
        return;
      }

      const objects = await ObjectModel.find({});
      if (objects.length === 0) {
        await ctx.reply('Нет добавленных объектов.');
        return;
      }

      let objectsList = 'Список объектов:\n';
      objects.forEach((obj, index) => {
        objectsList += `${index + 1}. ID: ${obj._id}, Адрес: ${obj.address}\n`;
      });

      await ctx.reply(objectsList);
    } catch (error) {
      console.error('Error in list_objects command:', error);
      await ctx.reply('Произошла ошибка при получении списка объектов.');
    }
  });

// Handle callback queries for object selection
bot.action(/^select_object_(.+)$/, async (ctx) => {
  try {
    console.log('Object selection callback triggered');
    
    // Инициализируем сессию, если она не существует
    if (!ctx.session) {
      ctx.session = {};
      console.log('Session initialized');
    }
    
    const objectId = ctx.match[1];
    console.log('Selected object ID:', objectId);
    
    ctx.session.selectedObjectId = objectId;
    ctx.session.waitingFor = 'cleaners';
    ctx.session.reportData = {};

    console.log('Session state:', {
      waitingFor: ctx.session.waitingFor,
      selectedObjectId: ctx.session.selectedObjectId
    });

    // Ask for cleaners
    await ctx.editMessageText('Введите список горничных, которые работали сегодня:');
    
    // Отвечаем на callback-запрос (убираем "часики" у кнопки)
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error in object selection:', error);
    await ctx.answerCbQuery('Ошибка при выборе объекта');
  }
});

// Handle text messages during report submission
bot.on('text', async (ctx) => {
  try {
    // Проверяем, что это не команда
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      // Это команда - пропускаем обработку здесь
      return;
    }

    // Only process if user is in the middle of submitting a report
    if (ctx.session && ctx.session.waitingFor) {
      console.log(`Processing text for waitingFor: ${ctx.session.waitingFor}`);
      console.log(`Session state:`, ctx.session);
      
      const admin = await Admin.findOne({ telegramId: ctx.from.id });
      if (!admin) {
        await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
        return;
      }

      switch (ctx.session.waitingFor) {
        case 'cleaners':
          // Сохраняем данные и переходим к следующему шагу
          ctx.session.reportData = ctx.session.reportData || {};
          ctx.session.reportData.cleaners = text;
          ctx.session.waitingFor = 'helpers';
          await ctx.reply('Введите список подсобных рабочих, которые работали сегодня:');
          break;

        case 'helpers':
          ctx.session.reportData.helpers = text;
          ctx.session.waitingFor = 'payments';
          await ctx.reply('Введите информацию о доплатах за проживание (сколько и по каким объектам):');
          break;

        case 'payments':
          ctx.session.reportData.payments = text;
          ctx.session.waitingFor = 'malfunctions';
          await ctx.reply('Введите информацию о поломках и неисправностях:');
          break;

        case 'malfunctions':
          ctx.session.reportData.malfunctions = text;
          
          // Ask for ready for rent status
          const keyboard = {
            inline_keyboard: [
              [
                { text: '✅ Да', callback_data: 'ready_for_rent_yes' },
                { text: '❌ Нет', callback_data: 'ready_for_rent_no' }
              ]
            ]
          };
          
          await ctx.reply('Готов ли объект к сдаче по чек-листу?', { reply_markup: keyboard });
          ctx.session.waitingFor = 'waiting_for_final_choice';
          break;

        default:
          console.log(`Unknown waitingFor state: ${ctx.session.waitingFor}`);
          await ctx.reply('Неизвестное состояние. Начните заново с командой /report');
          ctx.session.waitingFor = null;
          ctx.session.reportData = {};
          ctx.session.selectedObjectId = null;
          break;
      }
    } else {
      console.log('No waitingFor state or no session, ignoring text');
      // Можно добавить ответ для сообщений вне контекста отчета
      if (text && !text.startsWith('/')) {
        await ctx.reply('Чтобы начать отчет, используйте команду /report');
      }
    }
  } catch (error) {
    console.error('Error processing report data:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
    // Reset session on error
    if (ctx.session) {
      ctx.session.waitingFor = null;
      ctx.session.reportData = {};
      ctx.session.selectedObjectId = null;
    }
  }
});

  // Handle ready for rent selection
// Handle ready for rent selection
bot.action(/^ready_for_rent_(.+)$/, async (ctx) => {
  try {
    // Инициализируем сессию, если она не существует
    if (!ctx.session) {
      ctx.session = {};
    }
    
    const readyStatus = ctx.match[1] === 'yes';
    const admin = await Admin.findOne({ telegramId: ctx.from.id });
    
    if (!admin) {
      await ctx.answerCbQuery('Пожалуйста, сначала зарегистрируйтесь');
      return;
    }

    // Проверяем, что есть все необходимые данные
    if (!ctx.session.selectedObjectId || !ctx.session.reportData) {
      await ctx.answerCbQuery('Ошибка: данные отчета не найдены. Начните заново.');
      return;
    }

    // Create the report
    const newReport = new Report({
      adminId: admin._id,
      cleaners: ctx.session.reportData.cleaners,
      helpers: ctx.session.reportData.helpers,
      payments: ctx.session.reportData.payments,
      malfunctions: ctx.session.reportData.malfunctions,
      readyForRent: readyStatus,
      objectId: ctx.session.selectedObjectId,
      date: new Date()
    });

    await newReport.save();
    
    await ctx.editMessageText('✅ Отчет успешно отправлен!');
    
    // Reset session
    ctx.session.waitingFor = null;
    ctx.session.reportData = null;
    ctx.session.selectedObjectId = null;
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error saving report:', error);
    await ctx.answerCbQuery('Ошибка при сохранении отчета');
  }
});
};

module.exports = setupCommands;