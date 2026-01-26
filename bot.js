require('dotenv').config();
const { Telegraf, session, Markup } = require('telegraf');
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
    selectedObjectId: null,
    menuState: 'main' // Добавляем состояние меню
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
      hasReportData: !!ctx.session.reportData && Object.keys(ctx.session.reportData).length > 0,
      menuState: ctx.session.menuState
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
    const ownerId = parseInt(process.env.OWNER_ID);

    // Check if user is owner
    const isOwner = userId === ownerId;

    // Register admin if not exists
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

    // Устанавливаем начальное состояние меню
    ctx.session.menuState = 'main';

    // Create menu buttons based on user role
    let keyboard;
    if (isOwner) {
      // Owner menu - full access
      keyboard = Markup.keyboard([
        ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
        ['📝 Отправить отчет', 'ℹ️ Помощь']
      ]).resize();
    } else {
      // Regular admin menu - limited access
      keyboard = Markup.keyboard([
        ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
        ['ℹ️ Помощь']
      ]).resize();
    }

    await ctx.reply(
      `🤖 Привет! Это бот для сбора ежедневных отчетов.\n\n` +
      `Выберите действие на клавиатуре.`,
      keyboard
    );
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

// Help command
bot.help(async (ctx) => {
  const userId = ctx.from.id;
  const ownerId = parseInt(process.env.OWNER_ID);

  // Check if user is owner
  const isOwner = userId === ownerId;

  let helpMessage;
  if (isOwner) {
    helpMessage =
      `🤖 Помощь (владелец):\n\n` +
      `Бот работает через кнопки. Используйте клавиатуру для навигации.`;
  } else {
    helpMessage =
      `🤖 Помощь (администратор):\n\n` +
      `Бот работает через кнопки. Используйте клавиатуру для навигации.`;
  }

  // Возвращаем пользователя в главное меню
  ctx.session.menuState = 'main';

  let keyboard;
  if (isOwner) {
    // Owner menu - full access
    keyboard = Markup.keyboard([
      ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
      ['📝 Отправить отчет', 'ℹ️ Помощь']
    ]).resize();
  } else {
    // Regular admin menu - limited access
    keyboard = Markup.keyboard([
      ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
      ['ℹ️ Помощь']
    ]).resize();
  }

  await ctx.reply(helpMessage, keyboard);
});

// Keyboard button handlers
bot.hears('📝 Отправить отчет', async (ctx) => {
  ctx.session.menuState = 'report_start';

  // Get all objects
  const objects = await ObjectModel.find({});
  if (objects.length === 0) {
    await ctx.reply('Сначала добавьте объекты. Обратитесь к владельцу бота.');
    return;
  }

  // Create inline keyboard for object selection
  const keyboard = {
    inline_keyboard: objects.map(obj => [
      { text: obj.description || obj.address, callback_data: `select_object_${obj._id}` }
    ]).concat([[{ text: '🔙 Назад', callback_data: 'back_to_main' }]])
  };

  await ctx.reply('Выберите объект, над которым работали сегодня:', {
    reply_markup: keyboard
  });
});

bot.hears('📊 Сегодняшние отчеты', async (ctx) => {
  ctx.session.menuState = 'view_reports';

  const userId = ctx.from.id;
  const ownerId = parseInt(process.env.OWNER_ID);

  // Only allow owner to view all reports
  if (userId !== ownerId) {
    // Regular admin can only see their own reports
    const admin = await Admin.findOne({ telegramId: userId });
    if (!admin) {
      await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
      return;
    }

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's reports for this admin only
    const reports = await Report.find({
      adminId: admin._id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    }).populate('adminId').populate('objectId');

    if (reports.length === 0) {
      await ctx.reply('У вас сегодня нет отчетов.');
      // Return to main menu
      ctx.session.menuState = 'main';

      let keyboard;
      if (userId === ownerId) {
        keyboard = Markup.keyboard([
          ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
          ['📝 Отправить отчет', 'ℹ️ Помощь']
        ]).resize();
      } else {
        keyboard = Markup.keyboard([
          ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
          ['ℹ️ Помощь']
        ]).resize();
      }

      await ctx.reply('Выберите действие:', {
        reply_markup: keyboard
      });
      return;
    }

    let reportText = `📊 Ваши отчеты за ${today.toLocaleDateString('ru-RU')}:\n\n`;
    for (const report of reports) {
      reportText += `🏠 Объект: ${report.objectId?.address || 'Не указан'}\n`;
      reportText += `🧹 Горничные: ${report.cleaners}\n`;
      reportText += `👷 Подсобные: ${report.helpers}\n`;
      reportText += `💰 Доплаты: ${report.payments}\n`;
      reportText += `🔧 Поломки: ${report.malfunctions}\n`;
      reportText += `✅ Готов к сдаче: ${report.readyForRent ? 'Да' : 'Нет'}\n\n`;
    }

    // Return to main menu
    ctx.session.menuState = 'main';

    let keyboard;
    if (userId === ownerId) {
      keyboard = Markup.keyboard([
        ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
        ['📝 Отправить отчет', 'ℹ️ Помощь']
      ]).resize();
    } else {
      keyboard = Markup.keyboard([
        ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
        ['ℹ️ Помощь']
      ]).resize();
    }

    await ctx.reply(reportText, {
      reply_markup: keyboard
    });
    return;
  }

  // Owner can see all reports
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
  } else {
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
  }

  // Return to main menu
  ctx.session.menuState = 'main';

  let keyboard;
  // const userId = ctx.from.id;
  // const ownerId = parseInt(process.env.OWNER_ID);
  if (userId === ownerId) {
    keyboard = Markup.keyboard([
      ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
      ['📝 Отправить отчет', 'ℹ️ Помощь']
    ]).resize();
  } else {
    keyboard = Markup.keyboard([
      ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
      ['ℹ️ Помощь']
    ]).resize();
  }

  await ctx.reply('Выберите действие:', {
    reply_markup: keyboard
  });
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  await ctx.reply('/help');
});

bot.hears('🔧 Управление объектами', async (ctx) => {
  const userId = ctx.from.id;
  const ownerId = parseInt(process.env.OWNER_ID);

  // Only allow owner to manage objects
  if (userId !== ownerId) {
    await ctx.reply('❌ У вас нет прав для управления объектами.');

    // Return to main menu
    ctx.session.menuState = 'main';

    let keyboard = Markup.keyboard([
      ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
      ['📝 Отправить отчет', 'ℹ️ Помощь']
    ]).resize();

    await ctx.reply('Выберите действие:', keyboard);
    return;
  }

  ctx.session.menuState = 'manage_objects';

  const keyboard = Markup.keyboard([
    ['➕ Добавить объект', '📋 Список объектов'],
    ['🗑️ Удалить объект', '🔙 Назад']
  ]).resize();

  await ctx.reply('Управление объектами:', keyboard);
});

// Handle callback queries for object selection
bot.action(/^select_object_(.+)$/, async (ctx) => {
  try {
    const objectId = ctx.match[1];
    ctx.session.selectedObjectId = objectId;

    // Ask for cleaners
    await ctx.editMessageText('Введите список горничных, которые работали сегодня:');
    ctx.session.waitingFor = 'cleaners';
    ctx.session.menuState = 'report_cleaners';
  } catch (error) {
    console.error('Error in object selection:', error);
    await ctx.answerCbQuery('Ошибка при выборе объекта');
  }
});

// Handle callback queries for back button
bot.action('back_to_main', async (ctx) => {
  ctx.session.menuState = 'main';
  ctx.session.waitingFor = null;
  ctx.session.reportData = {};
  ctx.session.selectedObjectId = null;

  const userId = ctx.from.id;
  const ownerId = parseInt(process.env.OWNER_ID);

  let keyboard;
  if (userId === ownerId) {
    // Owner menu - full access
    keyboard = Markup.keyboard([
      ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
      ['📝 Отправить отчет', 'ℹ️ Помощь']
    ]).resize();
  } else {
    // Regular admin menu - limited access
    keyboard = Markup.keyboard([
      ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
      ['ℹ️ Помощь']
    ]).resize();
  }

  await ctx.editMessageText('Выберите действие:', {
    reply_markup: keyboard
  });
});

// Handle callback queries for back to manage objects
bot.action('back_to_manage_objects', async (ctx) => {
  ctx.session.menuState = 'manage_objects';

  const keyboard = Markup.keyboard([
    ['➕ Добавить объект', '📋 Список объектов'],
    ['🗑️ Удалить объект', '🔙 Назад']
  ]).resize();

  await ctx.editMessageText('Управление объектами:', {
    reply_markup: keyboard
  });
});

// Handle callback queries for deleting object
bot.action(/^delete_object_(.+)$/, async (ctx) => {
  try {
    const objectId = ctx.match[1];

    // Delete the object
    const deletedObject = await ObjectModel.findByIdAndDelete(objectId);

    if (deletedObject) {
      await ctx.editMessageText(`Объект "${deletedObject.description || deletedObject.address}" успешно удален!`);
    } else {
      await ctx.editMessageText('Ошибка: объект не найден.');
    }

    // Return to manage objects menu
    ctx.session.menuState = 'manage_objects';

    const keyboard = Markup.keyboard([
      ['➕ Добавить объект', '📋 Список объектов'],
      ['🗑️ Удалить объект', '🔙 Назад']
    ]).resize();

    await ctx.reply('Управление объектами:', {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error deleting object:', error);
    await ctx.answerCbQuery('Ошибка при удалении объекта');
  }
});

// Handle callback queries for back to select object
bot.action('back_to_select_object', async (ctx) => {
  // Get all objects
  const objects = await ObjectModel.find({});
  if (objects.length === 0) {
    await ctx.editMessageText('Сначала добавьте объекты. Обратитесь к владельцу бота.');
    return;
  }

  // Create inline keyboard for object selection
  const keyboard = {
    inline_keyboard: objects.map(obj => [
      { text: obj.description || obj.address, callback_data: `select_object_${obj._id}` }
    ]).concat([[{ text: '🔙 Назад', callback_data: 'back_to_main' }]])
  };

  await ctx.editMessageText('Выберите объект, над которым работали сегодня:', {
    reply_markup: keyboard
  });
});

// Handle text messages during report submission
bot.on('text', async (ctx) => {
  if (!ctx.session) {
    ctx.session = {};
  }

  // Only process if user is in the middle of submitting a report
  if (ctx.session.waitingFor) {
    try {
      const admin = await Admin.findOne({ telegramId: ctx.from.id });
      if (!admin) {
        await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
        return;
      }

      switch (ctx.session.waitingFor) {
        case 'cleaners':
          ctx.session.reportData = { ...ctx.session.reportData, cleaners: ctx.message.text };
          ctx.session.waitingFor = 'helpers';
          await ctx.reply('Введите список подсобных рабочих, которые работали сегодня:');
          break;

        case 'helpers':
          ctx.session.reportData = { ...ctx.session.reportData, helpers: ctx.message.text };
          ctx.session.waitingFor = 'payments';
          await ctx.reply('Введите информацию о доплатах за проживание (сколько и по каким объектам):');
          break;

        case 'payments':
          ctx.session.reportData = { ...ctx.session.reportData, payments: ctx.message.text };
          ctx.session.waitingFor = 'malfunctions';
          await ctx.reply('Введите информацию о поломках и неисправностях:');
          break;

        case 'malfunctions':
          ctx.session.reportData = { ...ctx.session.reportData, malfunctions: ctx.message.text };

          // Ask for ready for rent status
          const keyboard = {
            inline_keyboard: [
              [
                { text: 'Да', callback_data: 'ready_for_rent_yes' },
                { text: 'Нет', callback_data: 'ready_for_rent_no' }
              ],
              [
                { text: '🔙 Назад', callback_data: 'back_to_select_object' }
              ]
            ]
          };

          await ctx.reply('Готов ли объект к сдаче по чек-листу?', {
            reply_markup: keyboard
          });
          break;

        default:
          await ctx.reply('Неизвестное состояние. Начните заново с командой /start');
          ctx.session.waitingFor = null;
          ctx.session.reportData = null;
          break;
      }
    } catch (error) {
      console.error('Error processing report data:', error);
      await ctx.reply('Произошла ошибка. Попробуйте позже.');
      ctx.session.waitingFor = null;
      ctx.session.reportData = null;
    }
  } else if (ctx.session.menuState === 'manage_objects' && ctx.message.text === '➕ Добавить объект') {
    // Handle add object
    ctx.session.waitingFor = 'add_object_address';
    await ctx.reply('Введите адрес нового объекта:');
  } else if (ctx.session.menuState === 'manage_objects' && ctx.message.text === '📋 Список объектов') {
    // Handle list objects
    const objects = await ObjectModel.find({});
    if (objects.length === 0) {
      await ctx.reply('Нет добавленных объектов.');
    } else {
      let objectsList = 'Список объектов:\n';
      objects.forEach((obj, index) => {
        objectsList += `${index + 1}. ${obj.description || obj.address}\n`;
      });

      await ctx.reply(objectsList);
    }

    // Return to manage objects menu
    const keyboard = Markup.keyboard([
      ['➕ Добавить объект', '📋 Список объектов'],
      ['🗑️ Удалить объект', '🔙 Назад']
    ]).resize();

    await ctx.reply('Управление объектами:', {
      reply_markup: keyboard
    });
  } else if (ctx.session.menuState === 'manage_objects' && ctx.message.text === '🗑️ Удалить объект') {
    // Handle delete object
    const objects = await ObjectModel.find({});
    if (objects.length === 0) {
      await ctx.reply('Нет добавленных объектов для удаления.');

      // Return to manage objects menu
      const keyboard = Markup.keyboard([
        ['➕ Добавить объект', '📋 Список объектов'],
        ['🗑️ Удалить объект', '🔙 Назад']
      ]).resize();

      await ctx.reply('Управление объектами:', keyboard);
      return;
    }

    // Create inline keyboard for object selection for deletion
    const keyboard = {
      inline_keyboard: objects.map(obj => [
        { text: obj.description || obj.address, callback_data: `delete_object_${obj._id}` }
      ]).concat([[{ text: '🔙 Назад', callback_data: 'back_to_manage_objects' }]])
    };

    await ctx.reply('Выберите объект для удаления:', {
      reply_markup: keyboard
    });
  } else if (ctx.session.waitingFor === 'add_object_address') {
    // Handle adding new object
    const address = ctx.message.text;
    const newObject = new ObjectModel({
      address: address,
      name: address,
      description: address
    });

    await newObject.save();
    await ctx.reply(`Объект "${address}" успешно добавлен!`);

    // Return to manage objects menu
    ctx.session.waitingFor = null;
    const keyboard = Markup.keyboard([
      ['➕ Добавить объект', '📋 Список объектов'],
      ['🗑️ Удалить объект', '🔙 Назад']
    ]).resize();

    await ctx.reply('Управление объектами:', {
      reply_markup: keyboard
    });
  } else if (ctx.session.menuState === 'manage_objects' && ctx.message.text === '🔙 Назад') {
    // Handle back button from manage objects menu
    ctx.session.menuState = 'main';
    ctx.session.waitingFor = null;
    ctx.session.reportData = {};
    ctx.session.selectedObjectId = null;

    const userId = ctx.from.id;
    const ownerId = parseInt(process.env.OWNER_ID);

    let keyboard;
    if (userId === ownerId) {
      // Owner menu - full access
      keyboard = Markup.keyboard([
        ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
        ['📝 Отправить отчет', 'ℹ️ Помощь']
      ]).resize();
    } else {
      // Regular admin menu - limited access
      keyboard = Markup.keyboard([
        ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
        ['ℹ️ Помощь']
      ]).resize();
    }

    await ctx.reply('Выберите действие:', {
      reply_markup: keyboard
    });
  } else if (ctx.message.text === '🔙 Назад') {
    // Handle back button from other contexts
    ctx.session.menuState = 'main';
    ctx.session.waitingFor = null;
    ctx.session.reportData = {};
    ctx.session.selectedObjectId = null;

    const userId = ctx.from.id;
    const ownerId = parseInt(process.env.OWNER_ID);

    let keyboard;
    if (userId === ownerId) {
      // Owner menu - full access
      keyboard = Markup.keyboard([
        ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
        ['📝 Отправить отчет', 'ℹ️ Помощь']
      ]).resize();
    } else {
      // Regular admin menu - limited access
      keyboard = Markup.keyboard([
        ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
        ['ℹ️ Помощь']
      ]).resize();
    }

    await ctx.reply('Выберите действие:', {
      reply_markup: keyboard
    });
  }
});

// Handle ready for rent selection
bot.action(/^ready_for_rent_(.+)$/, async (ctx) => {
  try {
    const readyStatus = ctx.match[1] === 'yes';
    const admin = await Admin.findOne({ telegramId: ctx.from.id });

    if (!admin) {
      await ctx.answerCbQuery('Пожалуйста, сначала зарегистрируйтесь');
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
      objectId: ctx.session.selectedObjectId
    });

    await newReport.save();

    await ctx.editMessageText('✅ Отчет успешно отправлен!');

    // Reset session and return to main menu
    ctx.session.waitingFor = null;
    ctx.session.reportData = null;
    ctx.session.selectedObjectId = null;
    ctx.session.menuState = 'main';

    const userId = ctx.from.id;
    const ownerId = parseInt(process.env.OWNER_ID);

    let keyboard;
    if (userId === ownerId) {
      // Owner menu - full access
      keyboard = Markup.keyboard([
        ['📊 Сегодняшние отчеты', '🔧 Управление объектами'],
        ['📝 Отправить отчет', 'ℹ️ Помощь']
      ]).resize();
    } else {
      // Regular admin menu - limited access
      keyboard = Markup.keyboard([
        ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
        ['ℹ️ Помощь']
      ]).resize();
    }

    await ctx.reply('Выберите действие:', keyboard);
  } catch (error) {
    console.error('Error saving report:', error);
    await ctx.answerCbQuery('Ошибка при сохранении отчета');
  }
});

// Export bot for use in other files
module.exports = bot;