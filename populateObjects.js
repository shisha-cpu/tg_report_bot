const connectDB = require('./db/connectDB');
const ObjectModel = require('./models/Object');

// Connect to DB
connectDB();

// List of objects from your requirements with admin names
const objectsList = [
  { address: 'Баня большая ', name: 'ВетБаняви', description: 'Баня большая ' },
  { address: 'Баня маленькая  ', name: 'Баня', description: 'Баня маленькая  ' },

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