require('dotenv').config();
const { Telegraf, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const connectDB = require('./db/connectDB');
const Admin = require('./models/Admin');
const Report = require('./models/Report');
const ObjectModel = require('./models/Object');
const moment = require('moment-timezone');

// Initialize bot with token
const bot = new Telegraf(process.env.BOT_TOKEN);
const splitMessage = (text, maxLength = 4000) => {
  const messages = [];
  let currentMessage = '';
  
  // Разбиваем текст по строкам
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Если добавление новой строки превысит лимит, сохраняем текущее сообщение
    if ((currentMessage + '\n' + line).length > maxLength) {
      if (currentMessage.length > 0) {
        messages.push(currentMessage);
        currentMessage = line;
      } else {
        // Если одна строка слишком длинная, разбиваем ее
        while (line.length > maxLength) {
          messages.push(line.substring(0, maxLength));
          line = line.substring(maxLength);
        }
        currentMessage = line;
      }
    } else {
      if (currentMessage.length === 0) {
        currentMessage = line;
      } else {
        currentMessage += '\n' + line;
      }
    }
  }
  
  // Добавляем последнее сообщение
  if (currentMessage.length > 0) {
    messages.push(currentMessage);
  }
  
  return messages;
};
// Подключаем middleware для сессии
bot.use(session({
  defaultSession: () => ({
    waitingFor: null,
    reportData: {},
    selectedObjectId: null,
    selectedObjectIds: [], // Для хранения нескольких выбранных объектов
    menuState: 'main', // Добавляем состояние меню
    dateRange: null // Для хранения диапазона дат
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
console.log('userId' , userId);

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
        ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
        ['ℹ️ Помощь']
      ]).resize();
      // ['📊 Сегодняшние отчеты', '🔧 Управление объектами'], //временно закоментировано
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
      ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
        ['ℹ️ Помощь']
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

  // Create inline keyboard for multiple object selection
  const keyboard = {
    inline_keyboard: objects.map(obj => [
      { text: `✅ ${obj.description || obj.address}`, callback_data: `select_multi_object_${obj._id}` }
    ]).concat([
      [{ text: '✅ Выбрать все', callback_data: 'select_all_objects' }],
      [{ text: '📥 Отправить отчеты', callback_data: 'submit_multiple_reports' }],
      [{ text: '🔙 Назад', callback_data: 'back_to_main' }]
    ])
  };

  // Show selected objects
  let selectedText = '';
  if (ctx.session.selectedObjectIds && ctx.session.selectedObjectIds.length > 0) {
    const selectedObjects = await ObjectModel.find({ _id: { $in: ctx.session.selectedObjectIds } });
    selectedText = `\n\nВыбранные объекты (${ctx.session.selectedObjectIds.length}): ${selectedObjects.map(obj => obj.description || obj.address).join(', ')}`;
  }

  await ctx.reply(`Выберите объекты, над которыми работали сегодня:${selectedText}`, {
    reply_markup: keyboard
  });
});

bot.hears('📊 Сегодняшние отчеты', async (ctx) => {
  ctx.session.menuState = 'view_reports';

  // Create inline keyboard for date range selection
  const keyboard = {
    inline_keyboard: [
      [{ text: '📅 Сегодня', callback_data: 'view_reports_today' }],
      [{ text: '📆 Выбрать период', callback_data: 'view_reports_date_range' }],
      [{ text: '🔙 Назад', callback_data: 'back_to_main' }]
    ]
  };

  await ctx.reply('Выберите период для просмотра отчетов:', {
    reply_markup: keyboard
  });
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  await ctx.reply('/help');
});

// bot.hears('🔧 Управление объектами', async (ctx) => {
//   const userId = ctx.from.id;
//   const ownerId = parseInt(process.env.OWNER_ID);

//   // Only allow owner to manage objects
//   if (userId !== ownerId) {
//     await ctx.reply('❌ У вас нет прав для управления объектами.');

//     // Return to main menu
//     ctx.session.menuState = 'main';

//     let keyboard = Markup.keyboard([
//       ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
//       ['ℹ️ Помощь']
//     ]).resize();
//     // ['📊 Сегодняшние отчеты', '🔧 Управление объектами'], //временно закоментировано

//     await ctx.reply('Выберите действие:', keyboard);
//     return;
//   }

//   ctx.session.menuState = 'manage_objects';

//   // Create inline keyboard for object management
//   const keyboard = {
//     inline_keyboard: [
//       [
//         { text: '➕ Добавить объект', callback_data: 'manage_add_object' },
//         { text: '📋 Список объектов', callback_data: 'manage_list_objects' }
//       ],
//       [
//         { text: '🗑️ Удалить объект', callback_data: 'manage_delete_object' },
//         { text: '🔙 Назад', callback_data: 'manage_back_to_main' }
//       ]
//     ]
//   };

//   await ctx.reply('Управление объектами:', { reply_markup: keyboard });
// });


// // Add callback handlers for object management buttons to handle cases where user clicks on buttons in the keyboard
// bot.action('manage_add_object', async (ctx) => {
//   ctx.session.waitingFor = 'add_object_address';
//   await ctx.editMessageText('Введите адрес нового объекта:');
// });

// bot.action('manage_list_objects', async (ctx) => {
//   const objects = await ObjectModel.find({});
//   if (objects.length === 0) {
//     await ctx.editMessageText('Нет добавленных объектов.');
//   } else {
//     let objectsList = 'Список объектов:\n';
//     objects.forEach((obj, index) => {
//       objectsList += `${index + 1}. ${obj.description || obj.address}\n`;
//     });

//     await ctx.editMessageText(objectsList);
//   }

//   // Return to manage objects menu
//   const keyboard = Markup.keyboard([
//     ['➕ Добавить объект', '📋 Список объектов'],
//     ['🗑️ Удалить объект', '🔙 Назад']
//   ]).resize();

//   await ctx.reply('Управление объектами:', {
//     reply_markup: keyboard
//   });
// });

// bot.action('manage_delete_object', async (ctx) => {
//   const objects = await ObjectModel.find({});
//   if (objects.length === 0) {
//     await ctx.editMessageText('Нет добавленных объектов для удаления.');

//     // Return to manage objects menu
//     const keyboard = Markup.keyboard([
//       ['➕ Добавить объект', '📋 Список объектов'],
//       ['🗑️ Удалить объект', '🔙 Назад']
//     ]).resize();

//     await ctx.reply('Управление объектами:', keyboard);
//     return;
//   }

//   // Create inline keyboard for object selection for deletion
//   const keyboard = {
//     inline_keyboard: objects.map(obj => [
//       { text: obj.description || obj.address, callback_data: `delete_object_${obj._id}` }
//     ]).concat([[{ text: '🔙 Назад', callback_data: 'back_to_manage_objects' }]])
//   };

//   await ctx.editMessageText('Выберите объект для удаления:', {
//     reply_markup: keyboard
//   });
// });

// bot.action('manage_back_to_main', async (ctx) => {
//   ctx.session.menuState = 'main';
//   ctx.session.waitingFor = null;
//   ctx.session.reportData = {};
//   ctx.session.selectedObjectId = null;

//   const userId = ctx.from.id;
//   const ownerId = parseInt(process.env.OWNER_ID);

//   let keyboard;
//   if (userId === ownerId) {
//     // Owner menu - full access
//     keyboard = Markup.keyboard([
//       ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
//       ['ℹ️ Помощь']
//     ]).resize();
//     // ['📊 Сегодняшние отчеты', '🔧 Управление объектами'], //временно закоментировано
//   } else {
//     // Regular admin menu - limited access
//     keyboard = Markup.keyboard([
//       ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
//       ['ℹ️ Помощь']
//     ]).resize();
//   }

//   await ctx.editMessageText('Выберите действие:', {
//     reply_markup: keyboard
//   });
// });

// Handle callback queries for single object selection (for backward compatibility)
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

// Handle callback queries for multiple object selection
bot.action(/^select_multi_object_(.+)$/, async (ctx) => {
  try {
    const objectId = ctx.match[1];

    // Toggle object selection
    if (ctx.session.selectedObjectIds.includes(objectId)) {
      // Remove from selection
      ctx.session.selectedObjectIds = ctx.session.selectedObjectIds.filter(id => id !== objectId);
      await ctx.answerCbQuery('Объект убран из выбора');
    } else {
      // Add to selection
      ctx.session.selectedObjectIds.push(objectId);
      await ctx.answerCbQuery('Объект добавлен к выбору');
    }

    // Refresh the message with updated selections
    const objects = await ObjectModel.find({});
    const keyboard = {
      inline_keyboard: objects.map(obj => [
        {
          text: `${ctx.session.selectedObjectIds.includes(obj._id.toString()) ? '✅' : '☑️'} ${obj.description || obj.address}`,
          callback_data: `select_multi_object_${obj._id}`
        }
      ]).concat([
        [{ text: '✅ Выбрать все', callback_data: 'select_all_objects' }],
        [{ text: '📥 Отправить отчеты', callback_data: 'submit_multiple_reports' }],
        [{ text: '🔙 Назад', callback_data: 'back_to_main' }]
      ])
    };

    // Show selected objects
    let selectedText = '';
    if (ctx.session.selectedObjectIds && ctx.session.selectedObjectIds.length > 0) {
      const selectedObjects = await ObjectModel.find({ _id: { $in: ctx.session.selectedObjectIds } });
      selectedText = `\n\nВыбранные объекты (${ctx.session.selectedObjectIds.length}): ${selectedObjects.map(obj => obj.description || obj.address).join(', ')}`;
    }

    await ctx.editMessageText(`Выберите объекты, над которыми работали сегодня:${selectedText}`, {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error in multiple object selection:', error);
    await ctx.answerCbQuery('Ошибка при выборе объекта');
  }
});

// Handle callback query for selecting all objects
bot.action('select_all_objects', async (ctx) => {
  try {
    const objects = await ObjectModel.find({});
    ctx.session.selectedObjectIds = objects.map(obj => obj._id.toString());

    await ctx.answerCbQuery('Все объекты выбраны');

    // Refresh the message with updated selections
    const keyboard = {
      inline_keyboard: objects.map(obj => [
        {
          text: `✅ ${obj.description || obj.address}`,
          callback_data: `select_multi_object_${obj._id}`
        }
      ]).concat([
        [{ text: '❌ Снять выделение', callback_data: 'deselect_all_objects' }],
        [{ text: '📥 Отправить отчеты', callback_data: 'submit_multiple_reports' }],
        [{ text: '🔙 Назад', callback_data: 'back_to_main' }]
      ])
    };

    // Show selected objects
    let selectedText = '';
    if (ctx.session.selectedObjectIds && ctx.session.selectedObjectIds.length > 0) {
      const selectedObjects = await ObjectModel.find({ _id: { $in: ctx.session.selectedObjectIds } });
      selectedText = `\n\nВыбранные объекты (${ctx.session.selectedObjectIds.length}): ${selectedObjects.map(obj => obj.description || obj.address).join(', ')}`;
    }

    await ctx.editMessageText(`Выберите объекты, над которыми работали сегодня:${selectedText}`, {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error in select all objects:', error);
    await ctx.answerCbQuery('Ошибка при выборе всех объектов');
  }
});

// Handle callback query for deselecting all objects
bot.action('deselect_all_objects', async (ctx) => {
  try {
    ctx.session.selectedObjectIds = [];

    await ctx.answerCbQuery('Выделение снято');

    // Refresh the message with updated selections
    const objects = await ObjectModel.find({});
    const keyboard = {
      inline_keyboard: objects.map(obj => [
        {
          text: `☑️ ${obj.description || obj.address}`,
          callback_data: `select_multi_object_${obj._id}`
        }
      ]).concat([
        [{ text: '✅ Выбрать все', callback_data: 'select_all_objects' }],
        [{ text: '📥 Отправить отчеты', callback_data: 'submit_multiple_reports' }],
        [{ text: '🔙 Назад', callback_data: 'back_to_main' }]
      ])
    };

    await ctx.editMessageText('Выберите объекты, над которыми работали сегодня:', {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error in deselect all objects:', error);
    await ctx.answerCbQuery('Ошибка при снятии выделения');
  }
});

// Handle callback query for submitting multiple reports
bot.action('submit_multiple_reports', async (ctx) => {
  try {
    if (!ctx.session.selectedObjectIds || ctx.session.selectedObjectIds.length === 0) {
      await ctx.answerCbQuery('Пожалуйста, выберите хотя бы один объект');
      return;
    }

    // Ask for cleaners
    await ctx.editMessageText('Введите список горничных, которые работали сегодня (для всех выбранных объектов):');
    ctx.session.waitingFor = 'cleaners';
    ctx.session.menuState = 'report_cleaners';
  } catch (error) {
    console.error('Error in submit multiple reports:', error);
    await ctx.answerCbQuery('Ошибка при отправке отчетов');
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
      ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
      ['ℹ️ Помощь']
    ]).resize();
    // ['📊 Сегодняшние отчеты', '🔧 Управление объектами'], //временно закоментировано
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
const sendReportsInParts = async (ctx, reports, isOwner = false) => {
  const batchSize = 5; // Количество отчетов в одном сообщении
  const totalReports = reports.length;
  const totalBatches = Math.ceil(totalReports / batchSize);
  
  console.log(`Sending ${totalReports} reports in ${totalBatches} batches`);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * batchSize;
    const endIdx = Math.min(startIdx + batchSize, totalReports);
    const batchReports = reports.slice(startIdx, endIdx);
    
    let batchText = '';
    
    if (batchIndex === 0) {
      // В первой части добавляем заголовок
      if (ctx.session.dateRange) {
        const startDate = moment(ctx.session.dateRange.startDate).format('DD.MM.YYYY');
        const endDate = moment(ctx.session.dateRange.endDate).format('DD.MM.YYYY');
        batchText = `📊 Отчеты с ${startDate} по ${endDate} (${totalReports}):\n\n`;
      } else {
        batchText = `📊 Отчеты (${totalReports}):\n\n`;
      }
    }
    
    // Добавляем номера отчетов в этой партии
    const reportNumbers = batchReports.map((_, idx) => startIdx + idx + 1).join(', ');
    batchText += `Отчеты ${reportNumbers} из ${totalReports}:\n\n`;
    
    // Формируем отчеты в этой партии
    for (let i = 0; i < batchReports.length; i++) {
      const report = batchReports[i];
      const reportNumber = startIdx + i + 1;
      
      batchText += `${reportNumber}. 📅 ${moment(report.date).tz('Europe/Moscow').format('DD.MM.YYYY HH:mm')}\n`;
      
      // Отображаем все объекты из массива objectIds
      if (report.objectIds && report.objectIds.length > 0) {
        const objectAddresses = report.objectIds.map(obj => 
          obj.description || obj.address || 'Не указан'
        ).join(', ');
        batchText += `   🏠 Объекты: ${objectAddresses}\n`;
      } else if (report.objectId) {
        batchText += `   🏠 Объект: ${report.objectId?.description || report.objectId?.address || 'Не указан'}\n`;
      } else {
        batchText += `   🏠 Объект: Не указан\n`;
      }
      
      if (isOwner) {
        batchText += `   👤 Администратор: ${report.adminId?.name || 'Не указан'}\n`;
      }
      
      batchText += `   🧹 Горничные: ${report.cleaners.substring(0, 100)}${report.cleaners.length > 100 ? '...' : ''}\n`;
      batchText += `   👷 Подсобные: ${report.helpers.substring(0, 100)}${report.helpers.length > 100 ? '...' : ''}\n`;
      batchText += `   💰 Доплаты: ${report.payments.substring(0, 100)}${report.payments.length > 100 ? '...' : ''}\n`;
      batchText += `   🔧 Поломки: ${report.malfunctions.substring(0, 100)}${report.malfunctions.length > 100 ? '...' : ''}\n`;
      batchText += `   ✅ Готов к сдаче: ${report.readyForRent ? 'Да' : 'Нет'}\n\n`;
    }
    
    // Добавляем информацию о прогрессе
    if (batchIndex < totalBatches - 1) {
      batchText += `--- Продолжение следует... ---\n`;
      batchText += `Часть ${batchIndex + 1} из ${totalBatches}`;
    } else {
      batchText += `--- Все отчеты загружены ---\n`;
      batchText += `Всего отчетов: ${totalReports}`;
    }
    
    // Разбиваем на части если слишком длинное
    const messages = splitMessage(batchText);
    
    // Отправляем все части этого батча
    for (let i = 0; i < messages.length; i++) {
      if (batchIndex === 0 && i === 0 && ctx.session.dateRange) {
        // Первое сообщение отправляем как ответ
        await ctx.reply(messages[i]);
      } else {
        await ctx.reply(messages[i]);
      }
      
      // Небольшая задержка между сообщениями
      if (i < messages.length - 1 || batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
};
// Handle callback queries for viewing today's reports
bot.action('view_reports_today', async (ctx) => {
  ctx.session.menuState = 'view_reports';

  const userId = ctx.from.id;
  const ownerId = parseInt(process.env.OWNER_ID);

  // Get today's date with timezone consideration
  const todayStart = moment().tz('Europe/Moscow').startOf('day').toDate();
  const todayEnd = moment().tz('Europe/Moscow').endOf('day').toDate();

  // Only allow owner to view all reports
  if (userId !== ownerId) {
    // Regular admin can only see their own reports
    const admin = await Admin.findOne({ telegramId: userId });
    if (!admin) {
      await ctx.answerCbQuery('Пожалуйста, сначала зарегистрируйтесь');
      return;
    }

    // Find today's reports for this admin only
    const reports = await Report.find({
      adminId: admin._id,
      date: {
        $gte: todayStart,
        $lte: todayEnd
      }
    }).populate('adminId').populate('objectId').populate('objectIds');

    if (reports.length === 0) {
      await ctx.editMessageText('У вас сегодня нет отчетов.');
      // Return to main menu
      ctx.session.menuState = 'main';

      let keyboard;
      if (userId === ownerId) {
        keyboard = Markup.keyboard([
          ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
          ['ℹ️ Помощь']
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

    // Отправляем отчеты частями
    await sendReportsInParts(ctx, reports, false);
    
    // Return to main menu
    ctx.session.menuState = 'main';

    let keyboard;
    if (userId === ownerId) {
      keyboard = Markup.keyboard([
        ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
        ['ℹ️ Помощь']
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

  // Owner can see all reports
  // Find today's reports
  const reports = await Report.find({
    date: {
      $gte: todayStart,
      $lte: todayEnd
    }
  }).populate('adminId').populate('objectId').populate('objectIds');

  if (reports.length === 0) {
    await ctx.editMessageText('Сегодня еще нет отчетов.');
  } else {
    // Отправляем отчеты частями
    await sendReportsInParts(ctx, reports, true);
  }

  // Return to main menu
  ctx.session.menuState = 'main';

  let keyboard;
  if (userId === ownerId) {
    keyboard = Markup.keyboard([
      ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
      ['ℹ️ Помощь']
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

// Handle callback queries for viewing reports with date range
bot.action('view_reports_date_range', async (ctx) => {
  ctx.session.waitingFor = 'date_range_start';
  ctx.session.dateRange = {}; // Initialize date range object

  await ctx.editMessageText(
    'Введите начальную дату в формате ДД.ММ.ГГГГ (например, 01.01.2024):'
  );
});

// Handle callback queries for viewing all reports (for owner)
bot.action('view_all_reports', async (ctx) => {
  const userId = ctx.from.id;
  const ownerId = parseInt(process.env.OWNER_ID);

  if (userId !== ownerId) {
    await ctx.answerCbQuery('❌ Только владелец может просматривать все отчеты');
    return;
  }

  // Find all reports (no date filter)
  const reports = await Report.find({})
    .populate('adminId')
    .populate('objectId')
    .sort({ date: -1 }); // Sort by date descending

  if (reports.length === 0) {
    await ctx.editMessageText('Нет доступных отчетов.');
  } else {
    let reportText = `📊 Все отчеты (${reports.length}):\n\n`;

    // Limit to first 50 reports to prevent message too long error
    const reportsToShow = reports.slice(0, 50);

    for (const report of reportsToShow) {
      reportText += `📅 ${moment(report.date).tz('Europe/Moscow').format('DD.MM.YYYY HH:mm')}\n`;
      reportText += `🏠 Объект: ${report.objectId?.address || 'Не указан'}\n`;
      reportText += `👤 Администратор: ${report.adminId.name}\n`;
      reportText += `🧹 Горничные: ${report.cleaners}\n`;
      reportText += `👷 Подсобные: ${report.helpers}\n`;
      reportText += `💰 Доплаты: ${report.payments}\n`;
      reportText += `🔧 Поломки: ${report.malfunctions}\n`;
      reportText += `✅ Готов к сдаче: ${report.readyForRent ? 'Да' : 'Нет'}\n\n`;
    }

    if (reports.length > 50) {
      reportText += `... и еще ${reports.length - 50} отчетов`;
    }

    await ctx.editMessageText(reportText);
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

  await ctx.reply('Выберите действие:', {
    reply_markup: keyboard
  });
});

// Handle text messages during report submission
bot.on('text', async (ctx) => {
  if (!ctx.session) {
    ctx.session = {};
  }

  // First, check if this is a menu command and we're in the right state
  // if (ctx.session.menuState === 'manage_objects') {
  //   if (ctx.message.text === '➕ Добавить объект') {
  //     // Handle add object
  //     ctx.session.waitingFor = 'add_object_address';
  //     await ctx.reply('Введите адрес нового объекта:');
  //     return;
  //   } else if (ctx.message.text === '📋 Список объектов') {
  //     // Handle list objects
  //     const objects = await ObjectModel.find({});
  //     if (objects.length === 0) {
  //       await ctx.reply('Нет добавленных объектов.');
  //     } else {
  //       let objectsList = 'Список объектов:\n';
  //       objects.forEach((obj, index) => {
  //         objectsList += `${index + 1}. ${obj.description || obj.address}\n`;
  //       });

  //       await ctx.reply(objectsList);
  //     }

  //     // Return to manage objects menu
  //     const keyboard = {
  //       inline_keyboard: [
  //         [
  //           { text: '➕ Добавить объект', callback_data: 'manage_add_object' },
  //           { text: '📋 Список объектов', callback_data: 'manage_list_objects' }
  //         ],
  //         [
  //           { text: '🗑️ Удалить объект', callback_data: 'manage_delete_object' },
  //           { text: '🔙 Назад', callback_data: 'manage_back_to_main' }
  //         ]
  //       ]
  //     };

  //     await ctx.reply('Управление объектами:', {
  //       reply_markup: keyboard
  //     });
  //     return;
  //   } else if (ctx.message.text === '🗑️ Удалить объект') {
  //     // Handle delete object
  //     const objects = await ObjectModel.find({});
  //     if (objects.length === 0) {
  //       await ctx.reply('Нет добавленных объектов для удаления.');

  //       // Return to manage objects menu
  //       const keyboard = {
  //         inline_keyboard: [
  //           [
  //             { text: '➕ Добавить объект', callback_data: 'manage_add_object' },
  //             { text: '📋 Список объектов', callback_data: 'manage_list_objects' }
  //           ],
  //           [
  //             { text: '🗑️ Удалить объект', callback_data: 'manage_delete_object' },
  //             { text: '🔙 Назад', callback_data: 'manage_back_to_main' }
  //           ]
  //         ]
  //       };

  //       await ctx.reply('Управление объектами:', { reply_markup: keyboard });
  //       return;
  //     }

  //     // Create inline keyboard for object selection for deletion
  //     const keyboard = {
  //       inline_keyboard: objects.map(obj => [
  //         { text: obj.description || obj.address, callback_data: `delete_object_${obj._id}` }
  //       ]).concat([[{ text: '🔙 Назад', callback_data: 'back_to_manage_objects' }]])
  //     };

  //     await ctx.reply('Выберите объект для удаления:', {
  //       reply_markup: keyboard
  //     });
  //     return;
  //   } else if (ctx.message.text === '🔙 Назад') {
  //     // Handle back button from manage objects menu
  //     ctx.session.menuState = 'main';
  //     ctx.session.waitingFor = null;
  //     ctx.session.reportData = {};
  //     ctx.session.selectedObjectId = null;

  //     const userId = ctx.from.id;
  //     const ownerId = parseInt(process.env.OWNER_ID);

  //     let keyboard;
  //     if (userId === ownerId) {
  //       // Owner menu - full access
  //       keyboard = Markup.keyboard([
  //         ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
  //         ['ℹ️ Помощь']
  //       ]).resize();
  //       // ['📊 Сегодняшние отчеты', '🔧 Управление объектами'], //временно закоментировано
  //     } else {
  //       // Regular admin menu - limited access
  //       keyboard = Markup.keyboard([
  //         ['📝 Отправить отчет', '📊 Сегодняшние отчеты'],
  //         ['ℹ️ Помощь']
  //       ]).resize();
  //     }

  //     await ctx.reply('Выберите действие:', {
  //       reply_markup: keyboard
  //     });
  //     return;
  //   }
  // }
// Функция для разбивки длинных сообщений на части
// Функция для отправки отчетов частями

  // Handle date range input
// В текстовом обработчике, найдите case для 'date_range_start':
if (ctx.session.waitingFor === 'date_range_start') {
  try {
    console.log('Processing start date:', ctx.message.text);
    
    // Parse the start date
    const startDate = moment(ctx.message.text, 'DD.MM.YYYY', true);

    if (!startDate.isValid()) {
      console.log('Invalid start date format');
      await ctx.reply('Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например, 01.01.2024):');
      return;
    }

    // Store the start date
    ctx.session.dateRange.startDate = startDate.toDate();
    console.log('Start date stored:', ctx.session.dateRange.startDate);

    // Ask for end date
    ctx.session.waitingFor = 'date_range_end';
    await ctx.reply('Введите конечную дату в формате ДД.ММ.ГГГГ (например, 31.01.2024):');
  } catch (error) {
    console.error('Error parsing start date:', error);
    console.error('Error stack:', error.stack);
    await ctx.reply('Произошла ошибка при обработке даты. Пожалуйста, попробуйте снова.');
    ctx.session.waitingFor = null;
  }
  return;
} else if (ctx.session.waitingFor === 'date_range_end') {
  try {
    console.log('Processing end date:', ctx.message.text);
    
    // Parse the end date
    const endDate = moment(ctx.message.text, 'DD.MM.YYYY', true);

    if (!endDate.isValid()) {
      console.log('Invalid end date format');
      await ctx.reply('Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например, 31.01.2024):');
      return;
    }

    // Store the end date
    ctx.session.dateRange.endDate = endDate.endOf('day').toDate(); // Include the whole end day
    console.log('End date stored:', ctx.session.dateRange.endDate);

    // Validate that end date is not before start date
    if (ctx.session.dateRange.endDate < ctx.session.dateRange.startDate) {
      await ctx.reply('Конечная дата не может быть раньше начальной даты. Пожалуйста, введите конечную дату снова:');
      return;
    }

    // Now get reports for the date range
    const userId = ctx.from.id;
    const ownerId = parseInt(process.env.OWNER_ID);

    // Only allow owner to view all reports in date range
    if (userId !== ownerId) {
      // Regular admin can only see their own reports
      const admin = await Admin.findOne({ telegramId: userId });
      if (!admin) {
        await ctx.reply('Пожалуйста, сначала зарегистрируйтесь, используя команду /start');
        return;
      }

      // Find reports for this admin in the date range
      const reports = await Report.find({
        adminId: admin._id,
        date: {
          $gte: ctx.session.dateRange.startDate,
          $lte: ctx.session.dateRange.endDate
        }
      }).populate('adminId').populate('objectId').populate('objectIds').sort({ date: -1 });

      console.log(`Found ${reports.length} reports for admin ${admin.name}`);

      if (reports.length === 0) {
        await ctx.reply(`У вас нет отчетов в периоде с ${moment(ctx.session.dateRange.startDate).format('DD.MM.YYYY')} по ${moment(ctx.session.dateRange.endDate).format('DD.MM.YYYY')}.`);
      } else {
        // Формируем отчеты частями
        await sendReportsInParts(ctx, reports, false);
      }
    } else {
      // Owner can see all reports in the date range
      const reports = await Report.find({
        date: {
          $gte: ctx.session.dateRange.startDate,
          $lte: ctx.session.dateRange.endDate
        }
      }).populate('adminId').populate('objectId').populate('objectIds').sort({ date: -1 });

      console.log(`Found ${reports.length} reports for date range`);

      if (reports.length === 0) {
        await ctx.reply(`Нет отчетов в периоде с ${moment(ctx.session.dateRange.startDate).format('DD.MM.YYYY')} по ${moment(ctx.session.dateRange.endDate).format('DD.MM.YYYY')}.`);
      } else {
        // Формируем отчеты частями
        await sendReportsInParts(ctx, reports, true);
      }
    }

    // Reset session and return to main menu
    ctx.session.waitingFor = null;
    ctx.session.dateRange = null;
    ctx.session.menuState = 'main';

    let keyboard;
    if (userId === ownerId) {
      // Owner menu - full access
      keyboard = Markup.keyboard([
        ['📊 Сегодняшние отчеты', '📝 Отправить отчет'],
        ['ℹ️ Помощь']
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
  } catch (error) {
    console.error('Error parsing end date:', error);
    console.error('Error stack:', error.stack);
    await ctx.reply('Произошла ошибка при обработке даты. Пожалуйста, попробуйте снова.');
    ctx.session.waitingFor = null;
  }
  return;
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
    const keyboard = {
      inline_keyboard: [
        [
          { text: '➕ Добавить объект', callback_data: 'manage_add_object' },
          { text: '📋 Список объектов', callback_data: 'manage_list_objects' }
        ],
        [
          { text: '🗑️ Удалить объект', callback_data: 'manage_delete_object' },
          { text: '🔙 Назад', callback_data: 'manage_back_to_main' }
        ]
      ]
    };

    await ctx.reply('Управление объектами:', {
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

    // Преобразуем строки в ObjectId перед сохранением
    const objectIdsToSave = ctx.session.selectedObjectIds.map(id => new mongoose.Types.ObjectId(id));

    // Создаем один отчет с массивом объектов
    const newReport = new Report({
      adminId: admin._id,
      cleaners: ctx.session.reportData.cleaners,
      helpers: ctx.session.reportData.helpers,
      payments: ctx.session.reportData.payments,
      malfunctions: ctx.session.reportData.malfunctions,
      readyForRent: readyStatus,
      objectId: objectIdsToSave.length > 0 ? objectIdsToSave[0] : ctx.session.selectedObjectId, // Оставляем первый объект как основной для совместимости
      objectIds: objectIdsToSave // Сохраняем все выбранные объекты
    });

    await newReport.save();

    // Determine how many objects were reported
    const objectCount = ctx.session.selectedObjectIds.length > 0 ? ctx.session.selectedObjectIds.length : (ctx.session.selectedObjectId ? 1 : 0);
    await ctx.editMessageText(`✅ Отчет успешно отправлен! Объектов в отчете: ${objectCount}`);

    // Reset session and return to main menu
    ctx.session.waitingFor = null;
    ctx.session.reportData = null;
    ctx.session.selectedObjectId = null;
    ctx.session.selectedObjectIds = []; // Clear multiple selection
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