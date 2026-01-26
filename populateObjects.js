const connectDB = require('./db/connectDB');
const ObjectModel = require('./models/Object');

// Connect to DB
connectDB();

// List of objects from your requirements with admin names
const objectsList = [
  { address: 'Рябиновая 45', name: 'Ветви', description: 'Рябиновая 45 - Ветви' },
  { address: 'Рябиновая 57', name: 'Марина', description: 'Рябиновая 57 - Марина' },
  { address: 'Рябиновая 90', name: 'Тимур', description: 'Рябиновая 90 - Тимур' },
  { address: 'Рябиновая 49', name: 'Женя', description: 'Рябиновая 49 - Женя' },
  { address: 'Рябиновая 146/1', name: 'Гарик', description: 'Рябиновая 146/1 - Гарик' },
  { address: 'Славянская 1', name: 'Сергей и Максим', description: 'Славянская 1 - Сергей и Максим' },
  { address: 'Славянская 183', name: 'Алиса', description: 'Славянская 183 - Алиса' },
  { address: 'Славянская 86', name: 'Яна', description: 'Славянская 86 - Яна' },
  { address: 'Тайга скай', name: 'Тайга скай', description: 'Тайга скай' },
  { address: 'Шахтеров 26', name: 'Оля', description: 'Шахтеров 26 - Оля' },
  { address: 'Шахтеров 138', name: 'Екатерина', description: 'Шахтеров 138 - Екатерина' },
  { address: 'Ягодная 25', name: 'Радик', description: 'Ягодная 25 - Радик' },
  { address: 'Строителей, Грозовая', name: 'Елена', description: 'Строителей, Грозовая - Елена' },
  { address: 'Хвойная, 37', name: 'Алексей', description: 'Хвойная, 37 - Алексей' },
  { address: 'Рябиновая, 113', name: 'Владислав', description: 'Рябиновая, 113 - Владислав' }
];

const populateObjects = async () => {
  try {
    // Clear existing objects
    await ObjectModel.deleteMany({});
    
    // Insert new objects
    await ObjectModel.insertMany(objectsList);
    
    console.log('Objects populated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error populating objects:', error);
    process.exit(1);
  }
};

populateObjects();